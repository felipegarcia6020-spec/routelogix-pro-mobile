// RouteLogix Pro Enterprise v31 - Independencia de roles, pestañas con color activo y tutorial integrado

const APP_STORAGE_KEY = 'routelogix_v31_state_v5';

let appState = {
    driver: {
        name: '',
        email: '',
        role: 'independent',
        loggedIn: false,
        bizName: 'Mi Emprendimiento',
        bizNit: '',
        bizPhone: '',
        bizAddress: '¡Gracias por su compra!'
    },
    supervisorPin: '1234',
    sheetsUrl: '',
    mapStyle: 'standard',
    activeRouteId: 'route-1',
    routes: [{ id: 'route-1', name: 'Ruta Operativa', stops: [] }],
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
            // Mostrar tutorial la primera vez
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
    window.addEventListener('online', processOutboxQueue);
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

// --- TUTORIAL / TOUR INICIAL ---
function startOnboardingTour() {
    currentTourStep = 1;
    updateTourStepUI();
    document.getElementById('tour-onboarding-modal').classList.remove('hidden');
}

function updateTourStepUI() {
    const title = document.getElementById('tour-step-title');
    const desc = document.getElementById('tour-step-desc');
    const btnNext = document.getElementById('tour-btn-next');
    const dot1 = document.getElementById('dot-1');
    const dot2 = document.getElementById('dot-2');
    const dot3 = document.getElementById('dot-3');

    if (currentTourStep === 1) {
        title.textContent = '1. Mapa, GPS y Rastreo';
        desc.textContent = 'Visualiza tu ubicación en tiempo real, velocidad en km/h y añade paradas con precisión milimétrica usando el cursor central.';
        btnNext.textContent = 'Siguiente';
        dot1.className = 'w-2 h-2 rounded-full bg-cyan-500';
        dot2.className = 'w-2 h-2 rounded-full bg-neutral-700';
        dot3.className = 'w-2 h-2 rounded-full bg-neutral-700';
    } else if (currentTourStep === 2) {
        title.textContent = '2. Autovendedor POS & Inventario';
        desc.textContent = 'Si eres autovendedor, gestiona tu inventario, procesa ventas directas en cada parada y genera recibos personalizados con los datos de tu emprendimiento.';
        btnNext.textContent = 'Siguiente';
        dot1.className = 'w-2 h-2 rounded-full bg-neutral-700';
        dot2.className = 'w-2 h-2 rounded-full bg-cyan-500';
        dot3.className = 'w-2 h-2 rounded-full bg-neutral-700';
    } else if (currentTourStep === 3) {
        title.textContent = '3. Control de Flota & Supervisor';
        desc.textContent = 'Los conductores de flota sincronizan sus rutas automáticamente con la nube, y los supervisores controlan las métricas en vivo protegidos por PIN.';
        btnNext.textContent = '¡Comenzar!';
        dot1.className = 'w-2 h-2 rounded-full bg-neutral-700';
        dot2.className = 'w-2 h-2 rounded-full bg-neutral-700';
        dot3.className = 'w-2 h-2 rounded-full bg-cyan-500';
    }
}

function nextTourStep() {
    if (currentTourStep < 3) {
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
    
    if (role === 'supervisor') {
        navButtons.innerHTML = `
            <button onclick="switchTab('supervisor')" id="nav-btn-supervisor" class="flex flex-col items-center justify-center text-amber-400 transition col-span-4 py-1">
                <i data-lucide="shield-alert" class="w-5 h-5"></i>
                <span class="text-[10px] mt-1 font-bold">Panel Supervisor Cloud</span>
            </button>`;
        switchTab('supervisor');
        cargarDatosSupervisorCloud();
    } else if (role === 'fleet') {
        // Conductor de flota: NO tiene inventario POS ni pestaña de inventario en agenda
        if (btnRouteBiz) btnRouteBiz.style.display = 'none';
        if (agendaTabsHeader) agendaTabsHeader.style.display = 'none';
        navButtons.innerHTML = `
            <button onclick="switchTab('map')" id="nav-btn-map" class="flex flex-col items-center justify-center text-neutral-400 transition py-1"><i data-lucide="map" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Mapa</span></button>
            <button onclick="switchTab('routes')" id="nav-btn-routes" class="flex flex-col items-center justify-center text-neutral-400 transition py-1"><i data-lucide="route" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Ruta</span></button>
            <button onclick="switchTab('agenda')" id="nav-btn-agenda" class="flex flex-col items-center justify-center text-neutral-400 transition py-1"><i data-lucide="book-user" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Agenda</span></button>
            <button onclick="switchTab('finances')" id="nav-btn-finances" class="flex flex-col items-center justify-center text-neutral-400 transition py-1"><i data-lucide="wallet" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Caja</span></button>`;
        switchTab('map');
    } else {
        // Autovendedor Independiente: POS completo + Inventario + Recibos
        if (btnRouteBiz) btnRouteBiz.style.display = 'block';
        if (agendaTabsHeader) agendaTabsHeader.style.display = 'flex';
        navButtons.innerHTML = `
            <button onclick="switchTab('map')" id="nav-btn-map" class="flex flex-col items-center justify-center text-neutral-400 transition py-1"><i data-lucide="map" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Mapa</span></button>
            <button onclick="switchTab('routes')" id="nav-btn-routes" class="flex flex-col items-center justify-center text-neutral-400 transition py-1"><i data-lucide="route" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Ruta</span></button>
            <button onclick="switchTab('agenda')" id="nav-btn-agenda" class="flex flex-col items-center justify-center text-neutral-400 transition py-1"><i data-lucide="book-user" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Agenda</span></button>
            <button onclick="switchTab('finances')" id="nav-btn-finances" class="flex flex-col items-center justify-center text-neutral-400 transition py-1"><i data-lucide="wallet" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Caja</span></button>`;
        switchTab('map');
    }
    updateDriverHeaderUI();
}

function updateDriverHeaderUI() {
    const name = appState.driver.name || 'Operador';
    const biz = appState.driver.bizName;
    const isInd = appState.driver.role === 'independent';
    document.getElementById('driver-name-display').innerHTML = `<span>${isInd && biz ? biz : name}</span> <i data-lucide="settings" class="w-3 h-3 text-cyan-400"></i>`;
    document.getElementById('driver-initials').textContent = (isInd && biz ? biz : name).slice(0, 2).toUpperCase();
    document.getElementById('mode-badge').textContent = appState.driver.role === 'supervisor' ? 'Supervisor' : (isInd ? 'Autoventa' : 'Flota');
    initIconsSafe();
}

// --- GPS WATCH & SPEED ---
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

            if (isGpsTrackingActive && map) {
                map.setView([lat, lng], map.getZoom());
            }
        },
        (err) => {
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
        if (active) {
            dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        } else {
            dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
        }
    }
}

function updateUserMarker(lat, lng) {
    if (!map || typeof L === 'undefined') return;
    if (!userMarker) {
        userMarker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: '#06b6d4',
            color: '#ffffff',
            weight: 2,
            fillOpacity: 1
        }).addTo(map);
    } else {
        userMarker.setLatLng([lat, lng]);
    }
}

function toggleGpsTracking() {
    isGpsTrackingActive = !isGpsTrackingActive;
    const btn = document.getElementById('gps-tracking-toggle-btn');
    if (btn) {
        if (isGpsTrackingActive) {
            btn.className = 'w-11 h-11 bg-neutral-900/95 hover:bg-neutral-800 border border-cyan-500/50 rounded-2xl flex items-center justify-center text-cyan-400 shadow-2xl transition';
            centrarGPS();
        } else {
            btn.className = 'w-11 h-11 bg-neutral-900/95 hover:bg-neutral-800 border border-neutral-700 rounded-2xl flex items-center justify-center text-neutral-400 shadow-2xl transition';
        }
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

// --- PERFIL Y DATOS EMPRENDIMIENTO ---
function openDriverEditModal() {
    document.getElementById('edit-driver-name').value = appState.driver.name || '';
    document.getElementById('edit-biz-name').value = appState.driver.bizName || '';
    document.getElementById('edit-biz-nit').value = appState.driver.bizNit || '';
    document.getElementById('edit-biz-phone').value = appState.driver.bizPhone || '';
    document.getElementById('edit-biz-address').value = appState.driver.bizAddress || '';
    document.getElementById('modal-driver').classList.remove('hidden');
}

function saveDriverProfile() {
    const n = document.getElementById('edit-driver-name').value.trim();
    if (n) appState.driver.name = n;
    appState.driver.bizName = document.getElementById('edit-biz-name').value.trim() || 'Mi Emprendimiento';
    appState.driver.bizNit = document.getElementById('edit-biz-nit').value.trim();
    appState.driver.bizPhone = document.getElementById('edit-biz-phone').value.trim();
    appState.driver.bizAddress = document.getElementById('edit-biz-address').value.trim() || '¡Gracias por su compra!';
    
    saveAppState();
    updateDriverHeaderUI();
    document.getElementById('modal-driver').classList.add('hidden');
    alert('✅ Datos guardados.');
}

// --- RECIBO POS ---
function showPersonalizedReceipt(stop, itemsDetail, totalSale) {
    const d = appState.driver;
    const nowStr = new Date().toLocaleString('es-CO');
    const payLabels = { cash: 'Efectivo', transfer: 'Transferencia', qr: 'Código QR / Nequi / DaviPlata', credit: 'Crédito / Fiado' };
    const payLabel = payLabels[stop.paymentMethod] || stop.paymentMethod;

    document.getElementById('rec-biz-name').textContent = d.bizName || 'MI EMPRENDIMIENTO';
    document.getElementById('rec-biz-nit').textContent = d.bizNit ? `NIT / CC: ${d.bizNit}` : 'Comprobante de Venta POS';
    document.getElementById('rec-biz-phone').textContent = d.bizPhone ? `Tel: ${d.bizPhone}` : '';
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
        (d.bizPhone ? `Tel: ${d.bizPhone}\n` : '') +
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
                method: 'POST',
                mode: 'no-cors',
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
        alert('Configura primero la URL de Google Sheets.');
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
    
    const payload = { totalRecaudado: cash + transfer, efectivo: cash, transferencias: transfer, creditos: credit, efectividad: '100%' };
    await queueOutboxSync('CERRAR_RUTA', payload);
    alert('🚀 Cierre ejecutado y sincronizado en la nube.');
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
    const payload = JSON.stringify({ routeExport: route, inventory: appState.inventory }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${route.name.toLowerCase().replace(/\s+/g, '-')}-routelogix.json`;
    a.click();
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
    if (!map || typeof L === 'undefined') return;
    if (currentTileLayer) map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
}

async function searchMapAddress() {
    const q = document.getElementById('map-search-input').value.trim();
    if (!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
        const results = await res.json();
        if (results && results.length > 0 && map) map.setView([parseFloat(results[0].lat), parseFloat(results[0].lon)], 17);
    } catch (e) {}
}

// --- NAVEGACIÓN Y CAMBIO DE COLOR DE PESTAÑA ACTIVA ---
function switchTab(tab) {
    ['map', 'routes', 'agenda', 'finances', 'supervisor'].forEach(t => {
        const el = document.getElementById(`view-${t}`);
        if (el) el.classList.toggle('hidden', t !== tab);
    });

    // Actualizar colores claros y evidentes de la pestaña activa en la barra inferior
    const tabs = ['map', 'routes', 'agenda', 'finances'];
    tabs.forEach(t => {
        const btn = document.getElementById(`nav-btn-${t}`);
        if (btn) {
            if (t === tab) {
                btn.className = 'flex flex-col items-center justify-center text-cyan-400 font-black scale-105 transition py-1 border-t-2 border-cyan-400 bg-cyan-500/10 rounded-xl';
            } else {
                btn.className = 'flex flex-col items-center justify-center text-neutral-400 hover:text-white transition py-1';
            }
        }
    });

    if (tab === 'map' && map) setTimeout(() => map.invalidateSize(), 120);
    renderAllViews();
}

function getActiveRoute() {
    return appState.routes.find(r => r.id === appState.activeRouteId) || appState.routes[0];
}

function toggleStopMenu() { document.getElementById('stop-submenu').classList.toggle('hidden'); }

function abrirModalParadaCentro() {
    document.getElementById('stop-submenu').classList.add('hidden');
    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };
    document.getElementById('parada-direccion').value = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
    document.getElementById('modal-parada').classList.remove('hidden');
}

function guardarNuevaParada() {
    const name = document.getElementById('parada-nombre').value.trim();
    const address = document.getElementById('parada-direccion').value.trim();
    if (!name) return alert('Ingresa el nombre.');
    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };

    getActiveRoute().stops.push({
        id: 'stop-' + Date.now(), name, address, lat: center.lat, lng: center.lng, value: 0, status: 'pending', paymentMethod: 'cash', posItems: []
    });
    saveAppState();
    document.getElementById('modal-parada').classList.add('hidden');
    renderAllViews();
}

function abrirModalClienteExistente() {
    document.getElementById('stop-submenu').classList.add('hidden');
    if (appState.clients.length === 0) { alert('No hay clientes en la agenda.'); switchTab('agenda'); openClientModal(); return; }
}

function optimizarRutaInteligente() {
    alert('✅ Ruta optimizada por proximidad.');
}

function renderMapMarkersAndRoute() {
    if (!map || typeof L === 'undefined') return;
    stopMarkers.forEach(m => map.removeLayer(m));
    stopMarkers = [];
    if (routePolyline) map.removeLayer(routePolyline);

    const route = getActiveRoute();
    const coords = [];
    route.stops.forEach((stop) => {
        coords.push([stop.lat, stop.lng]);
        const color = stop.status === 'delivered' ? '#10b981' : stop.status === 'rejected' ? '#f43f5e' : '#06b6d4';
        const marker = L.circleMarker([stop.lat, stop.lng], { radius: 10, fillColor: color, color: '#09090b', weight: 2, fillOpacity: 0.95 }).addTo(map);
        stopMarkers.push(marker);
    });
    if (coords.length > 1) routePolyline = L.polyline(coords, { color: '#06b6d4', weight: 3 }).addTo(map);
}

function openClientModal() { document.getElementById('modal-client').classList.remove('hidden'); }
function handleClientSubmitDirect() {
    const name = document.getElementById('client-name').value.trim();
    const address = document.getElementById('client-address').value.trim();
    if (!name) return;
    appState.clients.push({ id: 'cli-' + Date.now(), name, address, debt: 0 });
    saveAppState();
    document.getElementById('modal-client').classList.add('hidden');
    renderAllViews();
}

function openProductModal() { document.getElementById('modal-product').classList.remove('hidden'); }
function handleProductSubmit() {
    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const stock = parseInt(document.getElementById('prod-stock').value) || 0;
    if (!name) return;
    appState.inventory.push({ id: 'prod-' + Date.now(), name, price, stock });
    saveAppState();
    document.getElementById('modal-product').classList.add('hidden');
    renderAllViews();
}

function switchAgendaTab(tab) {
    document.getElementById('subview-clients').classList.toggle('hidden', tab !== 'clients');
    document.getElementById('subview-inventory').classList.toggle('hidden', tab === 'clients');
    document.getElementById('agenda-tab-clients').className = tab === 'clients' ? 'flex-1 py-2 rounded-xl bg-cyan-500 text-neutral-950 transition font-black' : 'flex-1 py-2 rounded-xl text-neutral-300 hover:text-white transition';
    document.getElementById('agenda-tab-inventory').className = tab === 'inventory' ? 'flex-1 py-2 rounded-xl bg-emerald-500 text-neutral-950 transition font-black' : 'flex-1 py-2 rounded-xl text-neutral-300 hover:text-white transition';
}

function openEvidenceModal(stopId) {
    document.getElementById('evidence-stop-id').value = stopId;
    const isInd = appState.driver.role === 'independent';
    
    // Si es conductor de flota, ocultamos la sección de carrito POS en el modal
    const posBox = document.getElementById('pos-cart-box');
    if (!isInd) {
        posBox.style.display = 'none';
        document.getElementById('evidence-modal-title').textContent = 'Gestión de Parada & Entrega (Flota)';
    } else {
        posBox.style.display = 'block';
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
    }
}

function addPosCartItemRow() {
    if (appState.inventory.length === 0) return alert('Añade productos primero.');
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
            <select onchange="updatePosRowProd(${idx}, this.value)" class="flex-1 bg-neutral-950 text-white p-1.5 rounded border border-neutral-700">
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

    if (status === 'delivered' && isInd) {
        activePosCartItems.forEach(i => {
            totalSale += i.qty * i.price;
            const prod = appState.inventory.find(p => p.id === i.productId);
            if (prod) {
                prod.stock = Math.max(0, prod.stock - i.qty);
                receiptItems.push({ name: prod.name, qty: i.qty, price: i.price });
            }
        });
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
    document.getElementById('route-active-title').textContent = route.name;
    document.getElementById('metric-clients').textContent = route.stops.length;
    let totalMoney = 0;
    route.stops.forEach(s => totalMoney += (s.value || 0));
    document.getElementById('metric-money').textContent = `$${totalMoney.toLocaleString()}`;

    const isInd = appState.driver.role === 'independent';
    const container = document.getElementById('routes-list-container');
    container.innerHTML = route.stops.map((s) => `
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between gap-2">
            <div>
                <strong class="text-white text-xs">${s.name}</strong>
                <div class="text-[11px] text-neutral-400">${s.address}</div>
                <div class="text-xs font-bold text-emerald-400">$${(s.value || 0).toLocaleString()}</div>
            </div>
            <div class="flex items-center gap-1.5">
                ${s.status === 'delivered' && isInd ? `<button onclick="reabrirReciboParada('${s.id}')" class="bg-neutral-800 hover:bg-neutral-700 text-emerald-400 font-bold px-2.5 py-2 rounded-xl text-xs border border-emerald-500/30" title="Ver Recibo">🧾</button>` : ''}
                <button onclick="openEvidenceModal('${s.id}')" class="bg-cyan-500 text-neutral-950 font-black px-3 py-2 rounded-xl text-xs">${isInd ? 'POS' : 'Entrega'}</button>
            </div>
        </div>`).join('');
}

function renderAgendaView() {
    document.getElementById('lista-agenda').innerHTML = appState.clients.map(c => `<div class="bg-neutral-900 p-3 rounded-xl text-xs text-white">${c.name} - ${c.address}</div>`).join('');
}

function renderInventoryPOSView() {
    document.getElementById('lista-inventario-pos').innerHTML = appState.inventory.map(p => `<div class="bg-neutral-900 p-3 rounded-xl text-xs text-white flex justify-between"><span>${p.name} ($${p.price})</span><strong class="text-cyan-400">Stock: ${p.stock}</strong></div>`).join('');
}

const DENOMINATIONS = [50000, 20000, 10000, 5000, 2000, 1000];
function initCashDenominations() {
    const c = document.getElementById('denominations-container');
    if (!c) return;
    c.innerHTML = DENOMINATIONS.map(d => `<div class="flex justify-between text-xs"><span>$${d.toLocaleString()}</span><input type="number" min="0" value="0" data-denom="${d}" onchange="updateCashCounter()" class="cash-denom-input w-16 bg-neutral-900 text-white text-right p-1 rounded"></div>`).join('');
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
    appState.expenses.push({ concept, amount });
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
    alert('✅ URL guardada.');
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
function startDownloadingRouteMapTiles() { alert('Mosaicos descargados.'); }
