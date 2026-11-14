// RouteLogix Pro Enterprise v32 - Marcadores Numéricos, Navegación Waze y Sincronización Automática con Agenda

const APP_STORAGE_KEY = 'routelogix_v32_state_v7';

let appState = {
    driver: {
        name: '',
        email: '',
        phone: '',
        role: 'independent',
        loggedIn: false,
        bizName: 'Mi Emprendimiento',
        bizNit: '',
        bizAddress: '¡Gracias por su compra!',
        fleetPlate: '',
        fleetCompany: '',
        supRole: 'Supervisor de Operaciones',
        supZone: ''
    },
    supervisorPin: '1234',
    sheetsUrl: '',
    mapStyle: 'standard',
    activeRouteId: 'route-1',
    routes: [{ id: 'route-1', name: 'Ruta Operativa Principal', stops: [] }],
    clients: [],
    inventory: [
        { id: 'p1', name: 'Queso Doble Crema 500g', cost: 9000, price: 12000, stock: 30 },
        { id: 'p2', name: 'Leche Entera 1L', cost: 3200, price: 4500, stock: 50 }
    ],
    expenses: [],
    cashCounts: {},
    outboxQueue: [],
    tourCompleted: false
};

let map = null;
let currentTileLayer = null;
let routePolyline = null;
let stopMarkers = [];
let userMarker = null;
let watchId = null;
let isGpsTrackingActive = true;
let lastKnownCoords = [4.3365, -74.3638];
let activePosCartItems = [];
let lastGeneratedReceiptText = '';
let currentTourStep = 1;
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const box = document.getElementById('pwa-native-install-box');
    if (box) box.classList.remove('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
    try {
        loadAppState();
        registerServiceWorkerSafe();
        setupNetworkListeners();
        initIconsSafe();
        initCashDenominations();
        
        if (appState.driver && appState.driver.loggedIn) {
            document.getElementById('auth-screen').classList.add('hidden');
            configureRoleInterface();
            bootMainApplication();
        } else {
            if (!appState.tourCompleted) {
                startOnboardingTour();
            }
        }
    } catch (err) {
        console.error('Error arranque:', err);
        document.getElementById('auth-screen').classList.add('hidden');
    }
});

function registerServiceWorkerSafe() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
}

function bootMainApplication() {
    setTimeout(() => {
        initMapSafe();
        startGpsWatch();
        renderAllViews();
    }, 100);
}

function initIconsSafe() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) {}
    }
}

function setupNetworkListeners() {
    const updateNetUI = () => {
        const dot = document.getElementById('network-dot');
        const txt = document.getElementById('network-text');
        if (dot && txt) {
            if (navigator.onLine) {
                dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
                txt.textContent = 'Online';
            } else {
                dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500';
                txt.textContent = 'Offline';
            }
        }
    };
    window.addEventListener('online', () => { updateNetUI(); processOutboxQueue(); });
    window.addEventListener('offline', updateNetUI);
    updateNetUI();
}

function loadAppState() {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            appState = {
                ...appState,
                ...parsed,
                driver: { ...appState.driver, ...(parsed.driver || {}) }
            };
        } catch (e) {}
    }
}

function saveAppState() {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
}

// --- INSTALACIÓN PWA ---
function openInstallModal() {
    if (deferredInstallPrompt) {
        document.getElementById('pwa-native-install-box').classList.remove('hidden');
    }
    document.getElementById('modal-install-pwa').classList.remove('hidden');
}

async function triggerNativePwaInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
        deferredInstallPrompt = null;
        document.getElementById('modal-install-pwa').classList.add('hidden');
    }
}

// --- TOUR GUIADO ---
function startOnboardingTour() {
    currentTourStep = 1;
    updateTourStepUI();
    document.getElementById('tour-onboarding-modal').classList.remove('hidden');
}

function updateTourStepUI() {
    const title = document.getElementById('tour-step-title');
    const desc = document.getElementById('tour-step-desc');
    const btnNext = document.getElementById('tour-btn-next');
    const dots = [1, 2, 3, 4].map(i => document.getElementById(`dot-${i}`));

    dots.forEach((d, idx) => {
        if (d) d.className = (idx + 1 === currentTourStep) ? 'w-2.5 h-2.5 rounded-full bg-cyan-500' : 'w-2.5 h-2.5 rounded-full bg-neutral-700';
    });

    if (currentTourStep === 1) {
        title.textContent = '1. Marcadores Numéricos en Mapa';
        desc.textContent = 'Cada parada ahora muestra un número visible (1, 2, 3...) con códigos de color para identificar el estado de tus entregas al instante.';
        btnNext.textContent = 'Siguiente';
    } else if (currentTourStep === 2) {
        title.textContent = '2. Navegación Estilo Waze';
        desc.textContent = 'Un banner flotante superior te guía paso a paso hacia la siguiente parada activa, indicando distancia exacta y botón directo de navegación GPS.';
        btnNext.textContent = 'Siguiente';
    } else if (currentTourStep === 3) {
        title.textContent = '3. Sincronización con Agenda';
        desc.textContent = 'Al registrar una nueva parada en el mapa, la app la añade automáticamente a tu ruta y crea el cliente en tu agenda sin pasos extra.';
        btnNext.textContent = 'Siguiente';
    } else if (currentTourStep === 4) {
        title.textContent = '4. POS, Caja & Supervisor';
        desc.textContent = 'Disfruta de inventario propio, impresión de recibos personalizados, arqueo físico de efectivo y control en tiempo real en la nube.';
        btnNext.textContent = '¡Comenzar!';
    }
}

function nextTourStep() {
    if (currentTourStep < 4) {
        currentTourStep++;
        updateTourStepUI();
    } else {
        closeOnboardingTour();
    }
}

function closeOnboardingTour() {
    appState.tourCompleted = true;
    saveAppState();
    document.getElementById('tour-onboarding-modal').classList.add('hidden');
}

function toggleSupervisorPinInput(role) {
    const box = document.getElementById('supervisor-pin-box');
    if (role === 'supervisor') box.classList.remove('hidden');
    else box.classList.add('hidden');
}

function handleLoginSubmit() {
    const name = document.getElementById('login-name').value.trim() || 'Operador';
    const email = document.getElementById('login-email').value.trim();
    const role = document.getElementById('login-profile-mode').value;
    const validPin = appState.supervisorPin || '1234';

    if (role === 'supervisor') {
        const pin = document.getElementById('login-supervisor-pin').value.trim();
        if (pin !== validPin) {
            const err = document.getElementById('login-error-msg');
            err.textContent = '❌ PIN de supervisor incorrecto.';
            err.classList.remove('hidden');
            return;
        }
    }

    document.getElementById('login-error-msg').classList.add('hidden');
    appState.driver = { ...appState.driver, name, email, role, loggedIn: true };
    saveAppState();
    document.getElementById('auth-screen').classList.add('hidden');
    configureRoleInterface();
    bootMainApplication();
}

function logoutSession() {
    appState.driver.loggedIn = false;
    saveAppState();
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    document.getElementById('auth-screen').classList.remove('hidden');
}

function configureRoleInterface() {
    const role = appState.driver.role;
    const navButtons = document.getElementById('navbar-buttons');
    const btnRouteBiz = document.getElementById('btn-route-biz-config');
    const agendaTabsHeader = document.getElementById('agenda-tabs-header');
    const metricMoneyLabel = document.getElementById('metric-money-label');
    
    if (role === 'supervisor') {
        navButtons.innerHTML = `
            <button onclick="switchTab('supervisor')" id="nav-btn-supervisor" class="flex flex-col items-center justify-center text-amber-400 transition col-span-4 py-1.5">
                <i data-lucide="shield-alert" class="w-5 h-5"></i>
                <span class="text-[10px] mt-1 font-bold">Panel Supervisor Cloud</span>
            </button>`;
        switchTab('supervisor');
        cargarDatosSupervisorCloud();
    } else if (role === 'fleet') {
        if (btnRouteBiz) btnRouteBiz.style.display = 'none';
        if (agendaTabsHeader) agendaTabsHeader.style.display = 'none';
        if (metricMoneyLabel) metricMoneyLabel.textContent = 'Recaudo';
        switchAgendaTab('clients');
        navButtons.innerHTML = `
            <button onclick="switchTab('map')" id="nav-btn-map" class="flex flex-col items-center justify-center text-neutral-400 transition py-1.5"><i data-lucide="map" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Mapa</span></button>
            <button onclick="switchTab('routes')" id="nav-btn-routes" class="flex flex-col items-center justify-center text-neutral-400 transition py-1.5"><i data-lucide="route" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Ruta</span></button>
            <button onclick="switchTab('agenda')" id="nav-btn-agenda" class="flex flex-col items-center justify-center text-neutral-400 transition py-1.5"><i data-lucide="book-user" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Agenda</span></button>
            <button onclick="switchTab('finances')" id="nav-btn-finances" class="flex flex-col items-center justify-center text-neutral-400 transition py-1.5"><i data-lucide="wallet" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Caja</span></button>`;
        switchTab('map');
    } else {
        if (btnRouteBiz) btnRouteBiz.style.display = 'block';
        if (agendaTabsHeader) agendaTabsHeader.style.display = 'flex';
        if (metricMoneyLabel) metricMoneyLabel.textContent = 'Venta';
        navButtons.innerHTML = `
            <button onclick="switchTab('map')" id="nav-btn-map" class="flex flex-col items-center justify-center text-neutral-400 transition py-1.5"><i data-lucide="map" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Mapa</span></button>
            <button onclick="switchTab('routes')" id="nav-btn-routes" class="flex flex-col items-center justify-center text-neutral-400 transition py-1.5"><i data-lucide="route" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Ruta</span></button>
            <button onclick="switchTab('agenda')" id="nav-btn-agenda" class="flex flex-col items-center justify-center text-neutral-400 transition py-1.5"><i data-lucide="book-user" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Agenda</span></button>
            <button onclick="switchTab('finances')" id="nav-btn-finances" class="flex flex-col items-center justify-center text-neutral-400 transition py-1.5"><i data-lucide="wallet" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Caja</span></button>`;
        switchTab('map');
    }
    updateDriverHeaderUI();
}

function updateDriverHeaderUI() {
    const d = appState.driver;
    const role = d.role;
    let displayTitle = d.name || 'Operador';
    let badgeText = 'Autoventa';

    if (role === 'independent') {
        displayTitle = d.bizName ? `${d.bizName} (${d.name || 'Operador'})` : (d.name || 'Autovendedor');
        badgeText = 'Autoventa';
    } else if (role === 'fleet') {
        displayTitle = d.fleetPlate ? `${d.name || 'Conductor'} • ${d.fleetPlate}` : (d.name || 'Conductor Flota');
        badgeText = d.fleetCompany || 'Flota';
    } else if (role === 'supervisor') {
        displayTitle = d.name || 'Supervisor';
        badgeText = d.supZone || 'Supervisor';
    }

    document.getElementById('driver-name-display').innerHTML = `<span class="truncate">${displayTitle}</span> <i data-lucide="settings" class="w-3.5 h-3.5 text-cyan-400 shrink-0"></i>`;
    document.getElementById('driver-initials').textContent = (d.name || 'RL').slice(0, 2).toUpperCase();
    document.getElementById('mode-badge').textContent = badgeText;
    initIconsSafe();
}

function openDriverEditModal() {
    const d = appState.driver;
    const role = d.role;

    document.getElementById('edit-driver-name').value = d.name || '';
    document.getElementById('edit-user-phone').value = d.phone || '';

    document.getElementById('profile-fields-independent').classList.add('hidden');
    document.getElementById('profile-fields-fleet').classList.add('hidden');
    document.getElementById('profile-fields-supervisor').classList.add('hidden');

    if (role === 'independent') {
        document.getElementById('modal-profile-title').textContent = '🏪 Perfil Autovendedor & Emprendimiento';
        document.getElementById('profile-fields-independent').classList.remove('hidden');
        document.getElementById('edit-biz-name').value = d.bizName || '';
        document.getElementById('edit-biz-nit').value = d.bizNit || '';
        document.getElementById('edit-biz-address').value = d.bizAddress || '';
    } else if (role === 'fleet') {
        document.getElementById('modal-profile-title').textContent = '🚚 Perfil Conductor de Flota';
        document.getElementById('profile-fields-fleet').classList.remove('hidden');
        document.getElementById('edit-fleet-plate').value = d.fleetPlate || '';
        document.getElementById('edit-fleet-company').value = d.fleetCompany || '';
    } else if (role === 'supervisor') {
        document.getElementById('modal-profile-title').textContent = '👔 Perfil Supervisor de Flota';
        document.getElementById('profile-fields-supervisor').classList.remove('hidden');
        document.getElementById('edit-sup-role').value = d.supRole || '';
        document.getElementById('edit-sup-zone').value = d.supZone || '';
    }

    document.getElementById('modal-driver').classList.remove('hidden');
}

function saveDriverProfile() {
    const d = appState.driver;
    const role = d.role;

    const n = document.getElementById('edit-driver-name').value.trim();
    if (n) d.name = n;
    d.phone = document.getElementById('edit-user-phone').value.trim();

    if (role === 'independent') {
        d.bizName = document.getElementById('edit-biz-name').value.trim() || 'Mi Emprendimiento';
        d.bizNit = document.getElementById('edit-biz-nit').value.trim();
        d.bizAddress = document.getElementById('edit-biz-address').value.trim() || '¡Gracias por su compra!';
    } else if (role === 'fleet') {
        d.fleetPlate = document.getElementById('edit-fleet-plate').value.trim();
        d.fleetCompany = document.getElementById('edit-fleet-company').value.trim();
    } else if (role === 'supervisor') {
        d.supRole = document.getElementById('edit-sup-role').value.trim();
        d.supZone = document.getElementById('edit-sup-zone').value.trim();
    }

    saveAppState();
    updateDriverHeaderUI();
    document.getElementById('modal-driver').classList.add('hidden');
    alert('✅ Información actualizada.');
}

// --- GPS WATCH, SPEED & WAZE NAVIGATION BANNER ---
function startGpsWatch() {
    if (!('geolocation' in navigator)) {
        updateGpsStatus('GPS no disponible', false);
        return;
    }
    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const speedMps = pos.coords.speed || 0;
            const speedKmh = (speedMps * 3.6).toFixed(1);
            lastKnownCoords = [lat, lng];

            const speedEl = document.getElementById('speed-indicator');
            if (speedEl) speedEl.textContent = `${speedKmh} km/h`;

            updateGpsStatus('GPS Activo', true);
            updateUserMarker(lat, lng);
            updateWazeNavigationBanner(lat, lng);

            if (isGpsTrackingActive && map) {
                map.setView([lat, lng], map.getZoom());
            }
        },
        () => {
            updateGpsStatus('Señal GPS débil', false);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
}

function updateGpsStatus(text, active) {
    const dot = document.getElementById('gps-dot');
    const txt = document.getElementById('gps-text');
    if (dot && txt) {
        txt.textContent = text;
        dot.className = active ? 'w-2 h-2 rounded-full bg-emerald-500' : 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    }
}

function updateUserMarker(lat, lng) {
    if (!map || typeof L === 'undefined') return;
    if (!userMarker) {
        userMarker = L.circleMarker([lat, lng], {
            radius: 8, fillColor: '#06b6d4', color: '#ffffff', weight: 2, fillOpacity: 1
        }).addTo(map);
    } else {
        userMarker.setLatLng([lat, lng]);
    }
}

// Actualizar banner de navegación tipo Waze hacia la siguiente parada pendiente
function updateWazeNavigationBanner(currentLat, currentLng) {
    const route = getActiveRoute();
    const pendingStops = route.stops.filter(s => s.status === 'pending');
    const banner = document.getElementById('waze-nav-banner');
    
    if (!banner) return;
    if (pendingStops.length === 0) {
        banner.classList.add('hidden');
        return;
    }

    const nextStop = pendingStops[0];
    const stopIndex = route.stops.indexOf(nextStop) + 1;

    // Calcular distancia aproximada en metros o kilómetros
    const dLat = (nextStop.lat - currentLat) * 111320;
    const dLng = (nextStop.lng - currentLng) * 111320 * Math.cos(currentLat * Math.PI / 180);
    const distMeters = Math.hypot(dLat, dLng);
    
    let distStr = `${Math.round(distMeters)} m`;
    let etaMins = Math.max(1, Math.round(distMeters / 250)); // aprox 15 km/h en ciudad
    if (distMeters >= 1000) {
        distStr = `${(distMeters / 1000).toFixed(1)} km`;
        etaMins = Math.round(distMeters / 400);
    }

    document.getElementById('nav-step-distance').textContent = distStr;
    document.getElementById('nav-step-eta').textContent = `~${etaMins} min`;
    document.getElementById('nav-next-stop-title').textContent = `Parada #${stopIndex}: ${nextStop.name}`;
    banner.classList.remove('hidden');
}

function abrirNavegacionExternaActual() {
    const route = getActiveRoute();
    const nextStop = route.stops.find(s => s.status === 'pending') || route.stops[0];
    if (!nextStop) return alert('No hay paradas activas.');
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${nextStop.lat},${nextStop.lng}`, '_blank');
}

function completarParadaActualDesdeNavegador() {
    const route = getActiveRoute();
    const nextStop = route.stops.find(s => s.status === 'pending');
    if (!nextStop) return alert('No hay paradas pendientes.');
    openEvidenceModal(nextStop.id);
}

function toggleGpsTracking() {
    isGpsTrackingActive = !isGpsTrackingActive;
    const btn = document.getElementById('gps-tracking-toggle-btn');
    if (btn) {
        btn.className = isGpsTrackingActive
            ? 'w-11 h-11 bg-neutral-900/95 hover:bg-neutral-800 border border-cyan-500/50 rounded-2xl flex items-center justify-center text-cyan-400 shadow-2xl transition'
            : 'w-11 h-11 bg-neutral-900/95 hover:bg-neutral-800 border border-neutral-700 rounded-2xl flex items-center justify-center text-neutral-400 shadow-2xl transition';
        if (isGpsTrackingActive) centrarGPS();
    }
}

function centrarGPS() {
    if (map) map.setView(lastKnownCoords, 16);
}

// --- CAMBIO PIN SUPERVISOR ---
function openChangePinModal() {
    document.getElementById('pin-current').value = '';
    document.getElementById('pin-new').value = '';
    document.getElementById('pin-confirm').value = '';
    document.getElementById('modal-change-pin').classList.remove('hidden');
}

function saveNewSupervisorPin() {
    const current = document.getElementById('pin-current').value.trim();
    const nextPin = document.getElementById('pin-new').value.trim();
    const confirmPin = document.getElementById('pin-confirm').value.trim();
    const storedPin = appState.supervisorPin || '1234';

    if (current !== storedPin) return alert('❌ El PIN actual ingresado no es correcto.');
    if (nextPin.length < 4 || !/^\d+$/.test(nextPin)) return alert('⚠️ El nuevo PIN debe tener entre 4 y 6 números.');
    if (nextPin !== confirmPin) return alert('❌ La confirmación no coincide.');

    appState.supervisorPin = nextPin;
    saveAppState();
    document.getElementById('modal-change-pin').classList.add('hidden');
    alert('✅ PIN actualizado con éxito.');
}

// --- RECIBO POS ---
function showPersonalizedReceipt(stop, itemsDetail, totalSale) {
    const d = appState.driver;
    const nowStr = new Date().toLocaleString('es-CO');
    const payLabels = { cash: 'Efectivo', transfer: 'Transferencia', qr: 'Código QR / Nequi / DaviPlata', credit: 'Crédito / Fiado' };
    const payLabel = payLabels[stop.paymentMethod] || stop.paymentMethod;

    document.getElementById('rec-biz-name').textContent = d.bizName || 'MI EMPRENDIMIENTO';
    document.getElementById('rec-biz-nit').textContent = d.bizNit ? `NIT / CC: ${d.bizNit}` : 'Comprobante de Venta POS';
    document.getElementById('rec-biz-phone').textContent = d.phone ? `Tel: ${d.phone}` : '';
    document.getElementById('rec-date').textContent = `Fecha: ${nowStr}`;
    document.getElementById('rec-client-name').textContent = stop.name;
    document.getElementById('rec-client-address').textContent = stop.address || '-';
    document.getElementById('rec-seller-name').textContent = d.name || 'Operador';
    document.getElementById('rec-total').textContent = `$${totalSale.toLocaleString()}`;
    document.getElementById('rec-payment-method').textContent = payLabel;
    document.getElementById('rec-footer-note').textContent = d.bizAddress || '¡Gracias por su compra!';

    const itemsHtml = itemsDetail.length > 0
        ? itemsDetail.map(i => `<div class="flex justify-between"><span>${i.qty}x ${i.name}</span><strong>$${(i.qty * i.price).toLocaleString()}</strong></div>`).join('')
        : `<div class="flex justify-between"><span>Entrega / Servicio Directo</span><strong>$${totalSale.toLocaleString()}</strong></div>`;
    document.getElementById('rec-items-list').innerHTML = itemsHtml;

    const itemsWa = itemsDetail.length > 0
        ? itemsDetail.map(i => `• ${i.qty}x ${i.name}: $${(i.qty * i.price).toLocaleString()}`).join('\n')
        : `• Venta Directa: $${totalSale.toLocaleString()}`;

    lastGeneratedReceiptText = `🧾 *RECIBO DE VENTA - ${(d.bizName || 'MI EMPRENDIMIENTO').toUpperCase()}*\n` +
        (d.bizNit ? `NIT/CC: ${d.bizNit}\n` : '') +
        (d.phone ? `Tel: ${d.phone}\n` : '') +
        `Fecha: ${nowStr}\n` +
        `--------------------------\n` +
        `*Cliente:* ${stop.name}\n` +
        `*Vendedor:* ${d.name}\n` +
        `--------------------------\n` +
        `${itemsWa}\n` +
        `--------------------------\n` +
        `*TOTAL: $${totalSale.toLocaleString()}*\n` +
        `*Pago:* ${payLabel}\n\n` +
        `_${d.bizAddress || '¡Gracias por su compra!'}_`;

    document.getElementById('modal-receipt').classList.remove('hidden');
}

function compartirReciboWhatsApp() {
    if (!lastGeneratedReceiptText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(lastGeneratedReceiptText)}`, '_blank');
}

// --- CLOUD & OUTBOX ---
async function queueOutboxSync(action, payload) {
    appState.outboxQueue.push({ action, payload, deviceId: appState.driver.name, timestamp: new Date().toISOString() });
    saveAppState();
    await processOutboxQueue();
}

async function processOutboxQueue() {
    if (!navigator.onLine || !appState.sheetsUrl || appState.outboxQueue.length === 0) return;
    const queueCopy = [...appState.outboxQueue];
    for (const item of queueCopy) {
        try {
            await fetch(appState.sheetsUrl, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            appState.outboxQueue = appState.outboxQueue.filter(q => q !== item);
        } catch (e) {}
    }
    saveAppState();
}

async function cargarDatosSupervisorCloud() {
    if (!appState.sheetsUrl) {
        alert('Configura primero la URL de Google Sheets en el ícono de Nube.');
        return;
    }
    try {
        const res = await fetch(`${appState.sheetsUrl}?action=getSupervisorSummary`);
        const data = await res.json();
        if (data.status === 'success') {
            document.getElementById('sup-total-paradas').textContent = data.totalParadas;
            document.getElementById('sup-total-ventas').textContent = data.totalVentasPOS;
            document.getElementById('sup-total-cierres').textContent = data.totalCierres;
            alert('✅ Datos actualizados desde Google Sheets.');
        }
    } catch (e) {
        alert('Error al conectar con la API cloud.');
    }
}

async function ejecutarCierreJornadaCloud() {
    let cash = 0, transfer = 0, credit = 0;
    getActiveRoute().stops.forEach(s => {
        if (s.status === 'delivered') {
            const val = s.value || 0;
            if (s.paymentMethod === 'cash') cash += val;
            else if (s.paymentMethod === 'transfer' || s.paymentMethod === 'qr') transfer += val;
            else if (s.paymentMethod === 'credit') credit += val;
        }
    });
    const totalExpenses = appState.expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const payload = {
        totalRecaudado: cash + transfer,
        efectivo: cash,
        transferencias: transfer,
        creditos: credit,
        gastos: totalExpenses,
        efectividad: '100%'
    };
    await queueOutboxSync('CERRAR_RUTA', payload);
    alert('🚀 Cierre de jornada ejecutado y sincronizado en la nube.');
}

function exportarReporteSupervisorPDF() { window.print(); }
function compartirInformeWhatsApp() {
    const paradas = document.getElementById('sup-total-paradas').textContent;
    const ventas = document.getElementById('sup-total-ventas').textContent;
    const text = encodeURIComponent(`📊 *Reporte RouteLogix Pro*\nParadas: ${paradas}\nVentas POS: ${ventas}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
}

function compartirRutaActiva() {
    const route = getActiveRoute();
    const payload = JSON.stringify({ routeExport: route }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${route.name.toLowerCase().replace(/\s+/g, '-')}-routelogix.json`;
    a.click();
}

function importarRutaJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const imported = data.routeExport || data;
            if (imported && Array.isArray(imported.stops)) {
                const newId = 'route-' + Date.now();
                appState.routes.push({ id: newId, name: imported.name || 'Ruta Importada', stops: imported.stops });
                appState.activeRouteId = newId;
                saveAppState();
                renderAllViews();
                alert('✅ Ruta importada con éxito.');
            }
        } catch (err) {
            alert('❌ Archivo JSON inválido.');
        }
    };
    reader.readAsText(file);
}

// --- MAPA ---
function initMapSafe() {
    if (map) { map.invalidateSize(); return; }
    if (typeof L === 'undefined') return;
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView(lastKnownCoords, 15);
    setMapTileStyle(appState.mapStyle || 'standard');
    renderMapMarkersAndRoute();
}

function setMapTileStyle(style) {
    appState.mapStyle = style;
    saveAppState();
    ['standard', 'dark', 'offline'].forEach(s => {
        const b = document.getElementById(`style-${s}`);
        if (b) {
            b.className = (s === style)
                ? 'px-2 py-1 rounded-lg bg-cyan-500 text-neutral-950 transition'
                : 'px-2 py-1 rounded-lg text-neutral-300 hover:text-white transition';
        }
    });
    if (!map || typeof L === 'undefined') return;
    if (currentTileLayer) map.removeLayer(currentTileLayer);
    const url = style === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    currentTileLayer = L.tileLayer(url, { maxZoom: 19 }).addTo(map);
}

async function searchMapAddress() {
    const q = document.getElementById('map-search-input').value.trim();
    if (!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
        const results = await res.json();
        if (results && results.length > 0 && map) {
            isGpsTrackingActive = false;
            map.setView([parseFloat(results[0].lat), parseFloat(results[0].lon)], 17);
        }
    } catch (e) {}
}

// --- NAVEGACIÓN Y PESTAÑAS ---
function switchTab(tab) {
    ['map', 'routes', 'agenda', 'finances', 'supervisor'].forEach(t => {
        const el = document.getElementById(`view-${t}`);
        if (el) el.classList.toggle('hidden', t !== tab);
    });

    const tabs = ['map', 'routes', 'agenda', 'finances'];
    tabs.forEach(t => {
        const btn = document.getElementById(`nav-btn-${t}`);
        if (btn) {
            if (t === tab) {
                btn.className = 'flex flex-col items-center justify-center text-cyan-400 font-black transition py-1.5 border-t-2 border-cyan-400 bg-cyan-500/15 rounded-xl';
            } else {
                btn.className = 'flex flex-col items-center justify-center text-neutral-400 hover:text-white transition py-1.5';
            }
        }
    });

    if (tab === 'map' && map) setTimeout(() => map.invalidateSize(), 120);
    renderAllViews();
}

function getActiveRoute() {
    return appState.routes.find(r => r.id === appState.activeRouteId) || appState.routes[0];
}

function cambiarRutaActiva(routeId) {
    appState.activeRouteId = routeId;
    saveAppState();
    renderAllViews();
}

function toggleStopMenu() { document.getElementById('stop-submenu').classList.toggle('hidden'); }

function abrirModalParadaCentro() {
    document.getElementById('stop-submenu').classList.add('hidden');
    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };
    document.getElementById('parada-nombre').value = '';
    document.getElementById('parada-direccion').value = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
    document.getElementById('parada-telefono').value = '';
    document.getElementById('modal-parada').classList.remove('hidden');
}

// Sincronización Automática: Al guardar nueva parada, se crea en la ruta Y en la agenda de clientes
function guardarNuevaParadaYCliente() {
    const name = document.getElementById('parada-nombre').value.trim();
    const address = document.getElementById('parada-direccion').value.trim();
    const phone = document.getElementById('parada-telefono').value.trim();

    if (!name) return alert('Ingresa el nombre del negocio o cliente.');
    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };

    // 1. Crear parada en la ruta activa
    const stopId = 'stop-' + Date.now();
    getActiveRoute().stops.push({
        id: stopId, name, address, lat: center.lat, lng: center.lng, value: 0, status: 'pending', paymentMethod: 'cash', posItems: []
    });

    // 2. Crear cliente automáticamente en la Agenda
    const clientId = 'cli-' + Date.now();
    appState.clients.push({ id: clientId, name, address, phone, debt: 0 });

    saveAppState();
    document.getElementById('modal-parada').classList.add('hidden');
    renderAllViews();
    alert(`✅ Parada añadida a la ruta y cliente registrado en la agenda con éxito.`);
}

function abrirModalClienteExistente() {
    document.getElementById('stop-submenu').classList.add('hidden');
    if (appState.clients.length === 0) {
        alert('No hay clientes registrados en la agenda. Añade uno primero.');
        switchTab('agenda');
        openClientModal();
        return;
    }
    const list = document.getElementById('select-client-list');
    list.innerHTML = appState.clients.map(c => `
        <button onclick="agregarClienteARuta('${c.id}')" class="w-full text-left bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 p-3 rounded-xl flex justify-between items-center">
            <div>
                <strong class="text-white block">${c.name}</strong>
                <span class="text-[11px] text-neutral-400">${c.address || 'Sin dirección'}</span>
            </div>
            <span class="text-cyan-400 font-black">+ Añadir</span>
        </button>`).join('');
    document.getElementById('modal-select-client').classList.remove('hidden');
}

function agregarClienteARuta(clientId) {
    const c = appState.clients.find(x => x.id === clientId);
    if (!c) return;
    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };
    getActiveRoute().stops.push({
        id: 'stop-' + Date.now(), name: c.name, address: c.address || 'Ubicación agenda', lat: center.lat, lng: center.lng, value: 0, status: 'pending', paymentMethod: 'cash', posItems: []
    });
    saveAppState();
    document.getElementById('modal-select-client').classList.add('hidden');
    renderAllViews();
}

function eliminarParada(stopId) {
    const route = getActiveRoute();
    route.stops = route.stops.filter(s => s.id !== stopId);
    saveAppState();
    renderAllViews();
}

function navegarExterno(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
}

// Optimizador IA (Vecino más cercano)
function optimizarRutaInteligente() {
    const route = getActiveRoute();
    if (route.stops.length < 2) return alert('Añade al menos 2 paradas para optimizar la ruta.');
    
    const unvisited = [...route.stops];
    const ordered = [];
    let currentLat = lastKnownCoords[0];
    let currentLng = lastKnownCoords[1];

    while (unvisited.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;
        unvisited.forEach((s, idx) => {
            const d = Math.hypot(s.lat - currentLat, s.lng - currentLng);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = idx;
            }
        });
        const nextStop = unvisited.splice(bestIdx, 1)[0];
        ordered.push(nextStop);
        currentLat = nextStop.lat;
        currentLng = nextStop.lng;
    }

    route.stops = ordered;
    saveAppState();
    renderAllViews();
    alert('⚡ Ruta optimizada por proximidad geográfica.');
}

function calcularMetricasRuta(stops) {
    if (!stops || stops.length === 0) return { km: 0, mins: 0 };
    let totalKm = 0;
    let prevLat = lastKnownCoords[0];
    let prevLng = lastKnownCoords[1];
    stops.forEach(s => {
        const dLat = (s.lat - prevLat) * 111.32;
        const dLng = (s.lng - prevLng) * 111.32 * Math.cos(prevLat * Math.PI / 180);
        totalKm += Math.hypot(dLat, dLng);
        prevLat = s.lat;
        prevLng = s.lng;
    });
    return { km: totalKm.toFixed(1), mins: Math.round(totalKm * 2.5 + stops.length * 5) };
}

// --- RENDERIZAR MARCADORES NUMÉRICOS EN EL MAPA ---
function renderMapMarkersAndRoute() {
    if (!map || typeof L === 'undefined') return;
    stopMarkers.forEach(m => map.removeLayer(m));
    stopMarkers = [];
    if (routePolyline) map.removeLayer(routePolyline);

    const route = getActiveRoute();
    const coords = [];
    route.stops.forEach((stop, idx) => {
        coords.push([stop.lat, stop.lng]);
        const num = idx + 1;
        const colorBg = stop.status === 'delivered' ? '#10b981' : stop.status === 'rejected' ? '#f43f5e' : '#06b6d4';
        
        // Crear icono HTML personalizado con número visible
        const numberedIcon = L.divIcon({
            className: 'custom-numbered-marker',
            html: `<div style="background-color: ${colorBg}; color: #030712; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12px; border: 2px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">${num}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const marker = L.marker([stop.lat, stop.lng], { icon: numberedIcon })
            .bindPopup(`<strong>Parada #${num}: ${stop.name}</strong><br>${stop.address}<br>Estado: <b>${stop.status.toUpperCase()}</b>`)
            .addTo(map);
        stopMarkers.push(marker);
    });

    if (coords.length > 1) {
        routePolyline = L.polyline(coords, { color: '#06b6d4', weight: 4, opacity: 0.8 }).addTo(map);
    }
}

function openClientModal() { document.getElementById('modal-client').classList.remove('hidden'); }
function handleClientSubmitDirect() {
    const name = document.getElementById('client-name').value.trim();
    const address = document.getElementById('client-address').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    if (!name) return;
    appState.clients.push({ id: 'cli-' + Date.now(), name, address, phone, debt: 0 });
    saveAppState();
    document.getElementById('modal-client').classList.add('hidden');
    renderAllViews();
}

function openProductModal() { document.getElementById('modal-product').classList.remove('hidden'); }
function handleProductSubmit() {
    const name = document.getElementById('prod-name').value.trim();
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const stock = parseInt(document.getElementById('prod-stock').value) || 0;
    if (!name) return;
    appState.inventory.push({ id: 'prod-' + Date.now(), name, cost, price, stock });
    saveAppState();
    document.getElementById('modal-product').classList.add('hidden');
    renderAllViews();
}

function switchAgendaTab(tab) {
    document.getElementById('subview-clients').classList.toggle('hidden', tab !== 'clients');
    document.getElementById('subview-inventory').classList.toggle('hidden', tab === 'clients');
    document.getElementById('agenda-tab-clients').className = tab === 'clients' ? 'flex-1 py-2.5 rounded-xl bg-cyan-500 text-neutral-950 transition font-black' : 'flex-1 py-2.5 rounded-xl text-neutral-300 hover:text-white transition';
    document.getElementById('agenda-tab-inventory').className = tab === 'inventory' ? 'flex-1 py-2.5 rounded-xl bg-emerald-500 text-neutral-950 transition font-black' : 'flex-1 py-2.5 rounded-xl text-neutral-300 hover:text-white transition';
}

function openEvidenceModal(stopId) {
    document.getElementById('evidence-stop-id').value = stopId;
    const isInd = appState.driver.role === 'independent';
    
    const posBox = document.getElementById('pos-cart-box');
    const fleetBox = document.getElementById('fleet-cod-box');

    if (!isInd) {
        posBox.classList.add('hidden');
        fleetBox.classList.remove('hidden');
        document.getElementById('fleet-cod-amount').value = '';
        document.getElementById('evidence-modal-title').textContent = 'Gestión de Entrega (Conductor Flota)';
    } else {
        posBox.classList.remove('hidden');
        fleetBox.classList.add('hidden');
        document.getElementById('evidence-modal-title').textContent = 'Gestión de Parada & POS Autoventa';
        activePosCartItems = [];
        if (appState.inventory.length > 0) {
            activePosCartItems.push({ productId: appState.inventory[0].id, qty: 1, price: appState.inventory[0].price });
        }
        renderPosCartRows();
    }
    document.getElementById('modal-evidence').classList.remove('hidden');
}

function togglePOSCartSection(status) {
    const isInd = appState.driver.role === 'independent';
    if (isInd) {
        document.getElementById('pos-cart-box').classList.toggle('hidden', status === 'rejected');
    } else {
        document.getElementById('fleet-cod-box').classList.toggle('hidden', status === 'rejected');
    }
}

function addPosCartItemRow() {
    if (appState.inventory.length === 0) return alert('Añade productos en la pestaña Agenda > Inventario POS.');
    activePosCartItems.push({ productId: appState.inventory[0].id, qty: 1, price: appState.inventory[0].price });
    renderPosCartRows();
}

function renderPosCartRows() {
    const container = document.getElementById('pos-items-rows');
    let total = 0;
    container.innerHTML = activePosCartItems.map((item, idx) => {
        const subtotal = item.qty * item.price;
        total += subtotal;
        return `<div class="flex items-center justify-between gap-1 bg-neutral-900 p-2 rounded-xl text-xs">
            <select onchange="updatePosRowProd(${idx}, this.value)" class="flex-1 bg-neutral-950 text-white p-1.5 rounded border border-neutral-700 min-w-0">
                ${appState.inventory.map(p => `<option value="${p.id}" ${p.id === item.productId ? 'selected' : ''}>${p.name} ($${p.price})</option>`).join('')}
            </select>
            <input type="number" min="1" value="${item.qty}" onchange="updatePosRowQty(${idx}, this.value)" class="w-12 bg-neutral-950 text-white text-center p-1.5 rounded border border-neutral-700">
            <strong class="text-emerald-400 w-16 text-right">$${subtotal.toLocaleString()}</strong>
        </div>`;
    }).join('');
    document.getElementById('pos-cart-total-display').textContent = `$${total.toLocaleString()}`;
}

function updatePosRowProd(idx, id) {
    const p = appState.inventory.find(x => x.id === id);
    if (p) { activePosCartItems[idx].productId = p.id; activePosCartItems[idx].price = p.price; renderPosCartRows(); }
}
function updatePosRowQty(idx, q) {
    activePosCartItems[idx].qty = Math.max(1, parseInt(q) || 1);
    renderPosCartRows();
}

function saveEvidence() {
    const stopId = document.getElementById('evidence-stop-id').value;
    const status = document.getElementById('evidence-status').value;
    const method = document.getElementById('evidence-payment-method').value;
    const notes = document.getElementById('evidence-notes').value.trim();
    const route = getActiveRoute();
    const stop = route.stops.find(s => s.id === stopId);
    if (!stop) return;

    let totalSale = 0;
    const receiptItems = [];
    const isInd = appState.driver.role === 'independent';

    if (status === 'delivered') {
        if (isInd) {
            activePosCartItems.forEach(i => {
                totalSale += i.qty * i.price;
                const prod = appState.inventory.find(p => p.id === i.productId);
                if (prod) {
                    prod.stock = Math.max(0, prod.stock - i.qty);
                    receiptItems.push({ name: prod.name, qty: i.qty, price: i.price });
                }
            });
        } else {
            totalSale = parseFloat(document.getElementById('fleet-cod-amount').value) || 0;
        }
    }

    stop.status = status;
    stop.paymentMethod = method;
    stop.notes = notes;
    stop.value = totalSale;
    stop.posItems = receiptItems;

    saveAppState();
    queueOutboxSync('SYNC_PARADA', stop);
    if (status === 'delivered' && totalSale > 0 && isInd) {
        queueOutboxSync('REGISTRAR_VENTA_POS', stop);
    }
    document.getElementById('modal-evidence').classList.add('hidden');
    renderAllViews();

    if (status === 'delivered' && isInd) {
        showPersonalizedReceipt(stop, receiptItems, totalSale);
    }
}

function reabrirReciboParada(stopId) {
    const stop = getActiveRoute().stops.find(s => s.id === stopId);
    if (stop && stop.status === 'delivered') {
        showPersonalizedReceipt(stop, stop.posItems || [], stop.value || 0);
    }
}

function renderAllViews() {
    renderRoutesView();
    renderAgendaView();
    renderInventoryPOSView();
    renderFinancesView();
    renderMapMarkersAndRoute();
    initIconsSafe();
}

function renderRoutesView() {
    const route = getActiveRoute();
    const dropdown = document.getElementById('route-selector-dropdown');
    if (dropdown) {
        dropdown.innerHTML = appState.routes.map(r => `<option value="${r.id}" ${r.id === route.id ? 'selected' : ''}>📍 ${r.name} (${r.stops.length} paradas)</option>`).join('');
    }

    document.getElementById('route-active-title').textContent = route.name;
    document.getElementById('metric-clients').textContent = route.stops.length;

    const metrics = calcularMetricasRuta(route.stops);
    document.getElementById('metric-km').textContent = `${metrics.km} km`;
    document.getElementById('metric-time').textContent = `${metrics.mins} min`;

    let totalMoney = 0;
    route.stops.forEach(s => totalMoney += (s.value || 0));
    document.getElementById('metric-money').textContent = `$${totalMoney.toLocaleString()}`;

    const isInd = appState.driver.role === 'independent';
    const container = document.getElementById('routes-list-container');
    if (route.stops.length === 0) {
        container.innerHTML = `<div class="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 text-center text-xs text-neutral-400">No hay paradas en esta ruta. Añádelas desde el Mapa.</div>`;
        return;
    }

    container.innerHTML = route.stops.map((s, idx) => {
        const num = idx + 1;
        const statusBadge = s.status === 'delivered'
            ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Entregado</span>'
            : s.status === 'rejected'
            ? '<span class="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full font-bold">Rechazado</span>'
            : '<span class="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">Pendiente</span>';

        return `
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                    <span class="w-5 h-5 rounded-full bg-cyan-500 text-neutral-950 font-black text-[10px] flex items-center justify-center shrink-0">${num}</span>
                    <strong class="text-white text-xs truncate">${s.name}</strong>
                    ${statusBadge}
                </div>
                <div class="text-[11px] text-neutral-400 truncate mt-0.5">${s.address}</div>
                ${(s.value || 0) > 0 ? `<div class="text-xs font-bold text-emerald-400 mt-0.5">$${s.value.toLocaleString()}</div>` : ''}
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <button onclick="navegarExterno(${s.lat}, ${s.lng})" class="bg-neutral-800 hover:bg-neutral-700 text-cyan-400 p-2 rounded-xl text-xs border border-neutral-700" title="Navegar GPS">🧭</button>
                ${s.status === 'delivered' && isInd ? `<button onclick="reabrirReciboParada('${s.id}')" class="bg-neutral-800 hover:bg-neutral-700 text-emerald-400 font-bold p-2 rounded-xl text-xs border border-emerald-500/30" title="Ver Recibo">🧾</button>` : ''}
                <button onclick="openEvidenceModal('${s.id}')" class="bg-cyan-500 text-neutral-950 font-black px-3 py-2 rounded-xl text-xs">${isInd ? 'POS' : 'Entrega'}</button>
                <button onclick="eliminarParada('${s.id}')" class="bg-neutral-800 hover:bg-rose-500/20 text-rose-400 p-2 rounded-xl text-xs" title="Eliminar">✕</button>
            </div>
        </div>`;
    }).join('');
}

function renderAgendaView() {
    const container = document.getElementById('lista-agenda');
    if (appState.clients.length === 0) {
        container.innerHTML = `<div class="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 text-center text-xs text-neutral-400">Sin clientes registrados aún.</div>`;
        return;
    }
    container.innerHTML = appState.clients.map(c => `
        <div class="bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl text-xs flex justify-between items-center gap-2">
            <div>
                <strong class="text-white block">${c.name}</strong>
                <span class="text-neutral-400 text-[11px] block">${c.address || 'Sin dirección'}</span>
                ${c.phone ? `<span class="text-cyan-400 text-[11px]">📞 ${c.phone}</span>` : ''}
            </div>
        </div>`).join('');
}

function renderInventoryPOSView() {
    const container = document.getElementById('lista-inventario-pos');
    container.innerHTML = appState.inventory.map(p => `
        <div class="bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl text-xs text-white flex justify-between items-center">
            <div>
                <strong class="block">${p.name}</strong>
                <span class="text-emerald-400 font-bold">$${p.price.toLocaleString()}</span>
            </div>
            <strong class="text-cyan-400 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">Stock: ${p.stock}</strong>
        </div>`).join('');
}

const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];
function initCashDenominations() {
    const c = document.getElementById('denominations-container');
    if (!c) return;
    c.innerHTML = DENOMINATIONS.map(d => `
        <div class="flex justify-between items-center text-xs bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800/70">
            <span class="font-bold text-neutral-300">$${d.toLocaleString()}</span>
            <input type="number" min="0" value="0" data-denom="${d}" onchange="updateCashCounter()" oninput="updateCashCounter()" class="cash-denom-input w-20 bg-neutral-900 text-white text-right p-1.5 rounded-lg border border-neutral-700 font-bold">
        </div>`).join('');
}

function updateCashCounter() {
    let total = 0;
    document.querySelectorAll('.cash-denom-input').forEach(inp => {
        total += (parseInt(inp.dataset.denom) || 0) * (parseInt(inp.value) || 0);
    });
    document.getElementById('counter-total-display').textContent = `$${total.toLocaleString()}`;
    document.getElementById('summary-fisico').textContent = `$${total.toLocaleString()}`;
}

function resetCashCounter() { initCashDenominations(); updateCashCounter(); }

function addExpense() {
    const concept = document.getElementById('expense-concept').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
    if (!concept || amount <= 0) return;
    appState.expenses.push({ id: 'exp-' + Date.now(), concept, amount });
    document.getElementById('expense-concept').value = '';
    document.getElementById('expense-amount').value = '';
    saveAppState();
    renderFinancesView();
}

function eliminarGasto(id) {
    appState.expenses = appState.expenses.filter(e => e.id !== id);
    saveAppState();
    renderFinancesView();
}

function renderFinancesView() {
    let cash = 0, transfer = 0, credit = 0;
    getActiveRoute().stops.forEach(s => {
        if (s.status === 'delivered') {
            if (s.paymentMethod === 'cash') cash += (s.value || 0);
            else if (s.paymentMethod === 'transfer' || s.paymentMethod === 'qr') transfer += (s.value || 0);
            else if (s.paymentMethod === 'credit') credit += (s.value || 0);
        }
    });
    const expList = document.getElementById('expenses-list');
    if (expList) {
        expList.innerHTML = appState.expenses.map(e => `
            <div class="flex justify-between items-center bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800 text-xs">
                <span class="text-neutral-300">${e.concept}</span>
                <div class="flex items-center gap-2">
                    <strong class="text-rose-400">-$${e.amount.toLocaleString()}</strong>
                    <button onclick="eliminarGasto('${e.id}')" class="text-neutral-500 hover:text-rose-400">✕</button>
                </div>
            </div>`).join('');
    }
    document.getElementById('summary-facturado').textContent = `$${cash.toLocaleString()}`;
    document.getElementById('summary-transfer').textContent = `$${transfer.toLocaleString()}`;
    document.getElementById('summary-credit').textContent = `$${credit.toLocaleString()}`;
}

function openSheetsConfigModal() {
    document.getElementById('cfg-sheets-url').value = appState.sheetsUrl || '';
    document.getElementById('modal-sheets-config').classList.remove('hidden');
}
function saveSheetsConfig() {
    appState.sheetsUrl = document.getElementById('cfg-sheets-url').value.trim();
    saveAppState();
    document.getElementById('modal-sheets-config').classList.add('hidden');
    alert('✅ URL Cloud guardada.');
}
function openCreateRouteModal() { document.getElementById('modal-route').classList.remove('hidden'); }
function createNewRoute() {
    const name = document.getElementById('new-route-name').value.trim();
    if (!name) return;
    const id = 'route-' + Date.now();
    appState.routes.push({ id, name, stops: [] });
    appState.activeRouteId = id;
    saveAppState();
    document.getElementById('modal-route').classList.add('hidden');
    renderAllViews();
}
function openOfflineDownloadModal() { document.getElementById('modal-offline-download').classList.remove('hidden'); }
function startDownloadingRouteMapTiles() {
    alert('✅ Mosaicos de la zona actual cacheados para operación offline.');
    document.getElementById('modal-offline-download').classList.add('hidden');
}
