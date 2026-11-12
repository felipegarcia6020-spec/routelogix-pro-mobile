// RouteLogix Pro Enterprise v29 - Arquitectura Offline-First + Tutorial + Crédito bajo demanda

const APP_STORAGE_KEY = 'routelogix_v29_state';
const TUTORIAL_DONE_KEY = 'routelogix_v29_tutorial_done';

let appState = {
    driver: { name: '', email: '', loggedIn: false },
    sheetsUrl: '',
    transportMode: 'car',
    mapStyle: 'standard',
    activeRouteId: 'route-1',
    routes: [
        {
            id: 'route-1',
            name: 'Ruta Principal TaT',
            stops: []
        }
    ],
    clients: [],
    expenses: [],
    cashCounts: {},
    paymentConfig: {
        bankName: 'Nequi / DaviPlata',
        bankAccount: '3100000000',
        qrDataUrl: ''
    }
};

let map = null;
let currentTileLayer = null;
let routePolyline = null;
let stopMarkers = [];
let userMarker = null;
let watchId = null;
let isTrackingLive = true;
let lastKnownCoords = [4.3365, -74.3638]; // Fusagasugá por defecto
let deferredPrompt = null;

// --- 1. ARRANQUE GARANTIZADO Y RESILIENTE ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        loadAppState();
        registerServiceWorkerSafe();
        setupNetworkListeners();
        initIconsSafe();
        initCashDenominations();
        initSignatureCanvas();
        
        // Si ya había sesión iniciada, entrar directo sin bloquear por red
        if (appState.driver && appState.driver.loggedIn) {
            document.getElementById('auth-screen').classList.add('hidden');
            updateDriverHeaderUI();
            bootMainApplication();
        } else {
            if (appState.driver.name) document.getElementById('login-name').value = appState.driver.name;
            if (appState.driver.email) document.getElementById('login-email').value = appState.driver.email;
        }
    } catch (err) {
        console.error('Error controlado en arranque:', err);
        // Garantizar que el usuario pueda entrar pase lo que pase
        document.getElementById('auth-screen').classList.add('hidden');
    }
});

function bootMainApplication() {
    setTimeout(() => {
        initMapSafe();
        renderAllViews();
        checkAndRunTutorial();
    }, 100);
}

function initIconsSafe() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) {}
    }
}

function registerServiceWorkerSafe() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('SW registro diferido:', err);
        });
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.classList.remove('hidden');
});

function triggerPWAInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
        document.getElementById('pwa-install-btn').classList.add('hidden');
    });
}

function setupNetworkListeners() {
    const updateBadge = () => {
        const isOnline = navigator.onLine;
        const badge = document.getElementById('network-status-badge');
        const dot = document.getElementById('network-dot');
        const text = document.getElementById('network-text');
        if (!badge) return;

        if (isOnline) {
            badge.className = 'px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1';
            dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
            text.textContent = 'Online';
        } else {
            badge.className = 'px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1';
            dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500';
            text.textContent = 'Offline Local';
        }
    };
    window.addEventListener('online', updateBadge);
    window.addEventListener('offline', updateBadge);
    updateBadge();
}

function loadAppState() {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (raw) {
        const parsed = JSON.parse(raw);
        appState = { ...appState, ...parsed };
    }
}

function saveAppState() {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
}

// --- LOGIN CON TIMEOUT DE RED (NUNCA SE CUELGA CON SEÑAL POBRE) ---
async function handleLoginWithSheetsValidation() {
    const name = document.getElementById('login-name').value.trim() || 'Conductor Operativo';
    const email = document.getElementById('login-email').value.trim();
    const errBox = document.getElementById('login-error-msg');
    const btn = document.getElementById('btn-login-submit');

    errBox.classList.add('hidden');
    btn.textContent = 'Iniciando...';
    btn.disabled = true;

    // Si hay URL de Sheets y hay red, intentamos validar con un límite estricto de 3.5 segundos
    if (appState.sheetsUrl && email && navigator.onLine) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`${appState.sheetsUrl}?email=${encodeURIComponent(email)}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await res.json();
            if (data && data.status === 'blocked') {
                errBox.textContent = 'Acceso restringido por administración.';
                errBox.classList.remove('hidden');
                btn.textContent = 'Iniciar Operación';
                btn.disabled = false;
                return;
            }
        } catch (e) {
            console.warn('Señal pobre o timeout en validación, procediendo en modo local seguro.');
        }
    }

    completeLogin(name, email);
}

function forceOfflineBypassLogin() {
    const name = document.getElementById('login-name').value.trim() || 'Conductor Offline';
    const email = document.getElementById('login-email').value.trim();
    completeLogin(name, email);
}

function completeLogin(name, email) {
    appState.driver = { name, email, loggedIn: true };
    saveAppState();
    document.getElementById('auth-screen').classList.add('hidden');
    const btn = document.getElementById('btn-login-submit');
    if (btn) { btn.textContent = 'Iniciar Operación'; btn.disabled = false; }
    updateDriverHeaderUI();
    bootMainApplication();
}

function logoutSession() {
    appState.driver.loggedIn = false;
    saveAppState();
    document.getElementById('auth-screen').classList.remove('hidden');
}

function updateDriverHeaderUI() {
    const name = appState.driver.name || 'Conductor';
    document.getElementById('driver-name-display').textContent = name;
    const parts = name.split(' ').filter(Boolean);
    const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
    document.getElementById('driver-initials').textContent = initials || 'RL';
}

// --- MAPA RESILIENTE OFFLINE / ONLINE ---
function initMapSafe() {
    if (map) {
        map.invalidateSize();
        return;
    }

    if (typeof L === 'undefined') {
        document.getElementById('map-fallback-banner').classList.remove('hidden');
        document.getElementById('map-fallback-banner').textContent = '⚠️ Librería de mapa cargando en modo de emergencia. Usa la pestaña Ruta y Agenda con normalidad.';
        return;
    }

    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView(lastKnownCoords, 15);

    setMapTileStyle(navigator.onLine ? (appState.mapStyle || 'standard') : 'offline');
    startGPSTracking();
    renderMapMarkersAndRoute();
}

// Capa táctil generada localmente por Canvas (100% sin internet, muestra coordenadas y cuadrícula)
function createOfflineGridLayer() {
    const GridLayer = L.GridLayer.extend({
        createTile: function (coords) {
            const tile = document.createElement('canvas');
            const size = this.getTileSize();
            tile.width = size.x;
            tile.height = size.y;
            const ctx = tile.getContext('2d');

            ctx.fillStyle = '#0b1120';
            ctx.fillRect(0, 0, size.x, size.y);

            ctx.strokeStyle = 'rgba(6, 182, 212, 0.14)';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, size.x, size.y);

            // Subcuadrícula
            ctx.beginPath();
            ctx.moveTo(size.x / 2, 0);
            ctx.lineTo(size.x / 2, size.y);
            ctx.moveTo(0, size.y / 2);
            ctx.lineTo(size.x, size.y / 2);
            ctx.stroke();

            ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
            ctx.font = '10px monospace';
            ctx.fillText(`Z${coords.z} [${coords.x},${coords.y}]`, 8, 16);

            return tile;
        }
    });
    return new GridLayer();
}

function setMapTileStyle(style) {
    appState.mapStyle = style;
    saveAppState();

    ['standard', 'dark', 'offline'].forEach(s => {
        const btn = document.getElementById(`style-${s}`);
        if (!btn) return;
        if (s === style) {
            btn.className = 'px-2.5 py-1.5 rounded-xl bg-cyan-500 text-neutral-950 transition';
        } else {
            btn.className = 'px-2.5 py-1.5 rounded-xl text-neutral-300 hover:text-white transition';
        }
    });

    if (!map || typeof L === 'undefined') return;
    if (currentTileLayer) map.removeLayer(currentTileLayer);

    const mapEl = document.getElementById('map');
    const banner = document.getElementById('map-fallback-banner');

    if (style === 'offline' || !navigator.onLine) {
        mapEl.classList.remove('dark-map-tiles');
        currentTileLayer = createOfflineGridLayer().addTo(map);
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
        if (style === 'dark') {
            mapEl.classList.add('dark-map-tiles');
        } else {
            mapEl.classList.remove('dark-map-tiles');
        }
        currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            crossOrigin: true
        });
        currentTileLayer.on('tileerror', () => {
            // Si falla la descarga de tiles por señal pobre, cambiar automáticamente a cuadrícula táctil sin bloquear
            if (appState.mapStyle !== 'offline') {
                setMapTileStyle('offline');
            }
        });
        currentTileLayer.addTo(map);
    }
}

function startGPSTracking() {
    if (!('geolocation' in navigator)) return;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const { latitude, longitude, speed } = pos.coords;
            lastKnownCoords = [latitude, longitude];
            const kmh = speed ? (speed * 3.6).toFixed(1) : '0.0';
            document.getElementById('live-speed-display').textContent = `${kmh} km/h`;

            if (map && typeof L !== 'undefined') {
                if (!userMarker) {
                    userMarker = L.circleMarker(lastKnownCoords, {
                        radius: 8,
                        fillColor: '#06b6d4',
                        color: '#ffffff',
                        weight: 2,
                        fillOpacity: 1
                    }).addTo(map);
                } else {
                    userMarker.setLatLng(lastKnownCoords);
                }
                if (isTrackingLive) map.panTo(lastKnownCoords);
            }
        },
        (err) => console.warn('GPS en espera:', err.message),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
}

function centrarGPS() {
    if (map) map.setView(lastKnownCoords, 16);
}

function toggleTrackingLive() {
    isTrackingLive = !isTrackingLive;
    const btn = document.getElementById('tracking-toggle-btn');
    btn.className = isTrackingLive
        ? 'w-11 h-11 bg-cyan-500 text-neutral-950 rounded-2xl shadow-2xl flex items-center justify-center transition'
        : 'w-11 h-11 bg-neutral-900 text-neutral-400 border border-neutral-700 rounded-2xl shadow-2xl flex items-center justify-center transition';
}

async function searchMapAddress() {
    const query = document.getElementById('map-search-input').value.trim();
    if (!query) return;
    if (!navigator.onLine) {
        alert('Sin conexión a internet: Mueve el mapa manualmente hasta el punto deseado y pulsa "Añadir Parada -> Ubicación central del mapa".');
        return;
    }
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        const results = await res.json();
        if (results && results.length > 0 && map) {
            const lat = parseFloat(results[0].lat);
            const lon = parseFloat(results[0].lon);
            isTrackingLive = false;
            map.setView([lat, lon], 17);
        } else {
            alert('Dirección no encontrada. Intenta con otro término o ubica el punto con la mira.');
        }
    } catch (e) {
        alert('Señal débil para búsqueda online. Usa la mira central del mapa para marcar la parada.');
    }
}

// --- 2. MODO TUTORIAL INTERACTIVO (TEXTOS FLOTANTES) ---
const TUTORIAL_STEPS = [
    {
        targetId: 'tour-header',
        title: 'Barra Superior y Estado de Red',
        desc: 'Aquí ves el nombre del conductor activo y si la app está trabajando Online u Offline. Toca tu avatar para editar tu nombre o el botón "?" para repetir esta guía.'
    },
    {
        targetId: 'tour-search',
        title: 'Buscador de Direcciones',
        desc: 'Escribe una dirección o barrio para centrar el mapa rápidamente. Si no tienes señal, puedes mover el mapa libremente con el dedo.'
    },
    {
        targetId: 'tour-map-styles',
        title: 'Estilos de Mapa y Modo Táctico Offline',
        desc: 'Alterna entre vista Clásica, Oscura o Táctico Offline (cuadrícula de alto rendimiento que funciona sin internet ni datos).'
    },
    {
        targetId: 'tour-gps-controls',
        title: 'Controles GPS y Descarga de Mapas',
        desc: 'Usa la nube verde para guardar mapas de tu zona antes de salir a ruta, la flecha para centrar tu GPS y el radar para activar o pausar el seguimiento automático.'
    },
    {
        targetId: 'tour-map-actions',
        title: 'Añadir Paradas y Optimizar Ruta IA',
        desc: 'Usa "Añadir Parada" para agendar entregas desde la mira del mapa o desde tu lista de clientes. "Optimizar IA" ordena tus paradas por cercanía.'
    },
    {
        targetId: 'tour-navbar',
        title: 'Navegación Principal',
        desc: 'Cambia entre Mapa, Ruta (lista de entregas y cobros), Agenda (clientes y saldos de crédito) y Caja (arqueo de dinero y cierre del turno).'
    }
];

let currentTutorialStep = 0;

function checkAndRunTutorial() {
    const done = localStorage.getItem(TUTORIAL_DONE_KEY);
    if (!done) {
        startInteractiveTutorial(false);
    }
}

function startInteractiveTutorial(force = true) {
    if (force) switchTab('map');
    currentTutorialStep = 0;
    document.getElementById('tutorial-overlay').classList.remove('hidden');
    renderTutorialStep();
}

function renderTutorialStep() {
    const step = TUTORIAL_STEPS[currentTutorialStep];
    const targetEl = document.getElementById(step.targetId);
    const spotlight = document.getElementById('tutorial-spotlight');
    const card = document.getElementById('tutorial-card');

    document.getElementById('tutorial-step-badge').textContent = `Paso ${currentTutorialStep + 1} de ${TUTORIAL_STEPS.length}`;
    document.getElementById('tutorial-title').textContent = step.title;
    document.getElementById('tutorial-desc').textContent = step.desc;

    const prevBtn = document.getElementById('tutorial-prev-btn');
    const nextBtn = document.getElementById('tutorial-next-btn');
    prevBtn.classList.toggle('hidden', currentTutorialStep === 0);
    nextBtn.textContent = currentTutorialStep === TUTORIAL_STEPS.length - 1 ? '¡Entendido! ✓' : 'Siguiente →';

    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        spotlight.style.top = `${Math.max(4, rect.top - 4)}px`;
        spotlight.style.left = `${Math.max(4, rect.left - 4)}px`;
        spotlight.style.width = `${Math.min(window.innerWidth - 8, rect.width + 8)}px`;
        spotlight.style.height = `${rect.height + 8}px`;

        // Posicionar tarjeta flotante arriba o abajo del elemento resaltado
        if (rect.top > window.innerHeight / 2) {
            card.style.top = `${Math.max(16, rect.top - 195)}px`;
        } else {
            card.style.top = `${Math.min(window.innerHeight - 210, rect.bottom + 14)}px`;
        }
        card.style.left = '50%';
        card.style.transform = 'translateX(-50%)';
    }
}

function nextTutorialStep() {
    if (currentTutorialStep < TUTORIAL_STEPS.length - 1) {
        currentTutorialStep++;
        renderTutorialStep();
    } else {
        endInteractiveTutorial();
    }
}

function prevTutorialStep() {
    if (currentTutorialStep > 0) {
        currentTutorialStep--;
        renderTutorialStep();
    }
}

function endInteractiveTutorial() {
    localStorage.setItem(TUTORIAL_DONE_KEY, 'true');
    document.getElementById('tutorial-overlay').classList.add('hidden');
}

// --- NAVEGACIÓN DE PESTAÑAS ---
function switchTab(tab) {
    ['map', 'routes', 'agenda', 'finances'].forEach(t => {
        document.getElementById(`view-${t}`).classList.toggle('hidden', t !== tab);
        const btn = document.getElementById(`nav-btn-${t}`);
        btn.className = t === tab
            ? 'flex flex-col items-center justify-center text-cyan-400 transition'
            : 'flex flex-col items-center justify-center text-neutral-400 hover:text-white transition';
    });

    if (tab === 'map' && map) {
        setTimeout(() => map.invalidateSize(), 120);
    }
    renderAllViews();
}

function getActiveRoute() {
    let route = appState.routes.find(r => r.id === appState.activeRouteId);
    if (!route) {
        route = appState.routes[0];
        appState.activeRouteId = route.id;
    }
    return route;
}

// --- PARADAS Y RUTAS ---
function toggleStopMenu() {
    document.getElementById('stop-submenu').classList.toggle('hidden');
}

function abrirModalParadaCentro() {
    document.getElementById('stop-submenu').classList.add('hidden');
    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };
    document.getElementById('parada-direccion').value = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
    document.getElementById('parada-nombre').value = '';
    document.getElementById('parada-valor').value = '';
    document.getElementById('modal-parada').classList.remove('hidden');
}

function guardarNuevaParada() {
    const name = document.getElementById('parada-nombre').value.trim();
    const address = document.getElementById('parada-direccion').value.trim();
    const value = parseFloat(document.getElementById('parada-valor').value) || 0;
    if (!name) return alert('Ingresa el nombre del negocio o cliente.');

    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };

    // Crear también en agenda si no existe
    let client = appState.clients.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!client) {
        client = {
            id: 'cli-' + Date.now(),
            name,
            address,
            phone: '',
            obs: '',
            debt: 0,
            creditHistory: []
        };
        appState.clients.push(client);
    }

    const route = getActiveRoute();
    route.stops.push({
        id: 'stop-' + Date.now(),
        clientId: client.id,
        name,
        address,
        lat: center.lat,
        lng: center.lng,
        value,
        status: 'pending',
        paymentMethod: 'cash',
        creditAmount: 0,
        notes: ''
    });

    saveAppState();
    document.getElementById('modal-parada').classList.add('hidden');
    renderAllViews();
}

function abrirModalClienteExistente() {
    document.getElementById('stop-submenu').classList.add('hidden');
    if (appState.clients.length === 0) {
        alert('Aún no tienes clientes en la Agenda. Crea uno primero en la pestaña Agenda.');
        switchTab('agenda');
        openClientModal();
        return;
    }
    const select = document.getElementById('select-agenda-client');
    select.innerHTML = appState.clients.map(c => `<option value="${c.id}">${c.name} - ${c.address}</option>`).join('');
    document.getElementById('agenda-stop-value').value = '';
    document.getElementById('modal-route-add-stop').classList.remove('hidden');
}

function confirmAddStopFromAgenda() {
    const clientId = document.getElementById('select-agenda-client').value;
    const value = parseFloat(document.getElementById('agenda-stop-value').value) || 0;
    const client = appState.clients.find(c => c.id === clientId);
    if (!client) return;

    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };
    const route = getActiveRoute();
    route.stops.push({
        id: 'stop-' + Date.now(),
        clientId: client.id,
        name: client.name,
        address: client.address,
        lat: center.lat + (Math.random() - 0.5) * 0.004,
        lng: center.lng + (Math.random() - 0.5) * 0.004,
        value,
        status: 'pending',
        paymentMethod: 'cash',
        creditAmount: 0,
        notes: ''
    });

    saveAppState();
    document.getElementById('modal-route-add-stop').classList.add('hidden');
    renderAllViews();
}

function optimizarRutaInteligente() {
    const route = getActiveRoute();
    if (route.stops.length < 2) return alert('Agrega al menos 2 paradas para optimizar la ruta.');

    const pending = route.stops.filter(s => s.status === 'pending');
    const done = route.stops.filter(s => s.status !== 'pending');

    // Algoritmo Nearest Neighbor desde la posición GPS actual
    let currentPos = { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };
    const sorted = [];
    const pool = [...pending];

    while (pool.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;
        pool.forEach((s, idx) => {
            const d = Math.hypot(s.lat - currentPos.lat, s.lng - currentPos.lng);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = idx;
            }
        });
        const nextStop = pool.splice(bestIdx, 1)[0];
        sorted.push(nextStop);
        currentPos = { lat: nextStop.lat, lng: nextStop.lng };
    }

    route.stops = [...done, ...sorted];
    saveAppState();
    renderAllViews();
    alert('✅ Ruta optimizada por cercanía geográfica.');
}

function renderMapMarkersAndRoute() {
    if (!map || typeof L === 'undefined') return;
    stopMarkers.forEach(m => map.removeLayer(m));
    stopMarkers = [];
    if (routePolyline) map.removeLayer(routePolyline);

    const route = getActiveRoute();
    const coords = [];

    route.stops.forEach((stop, index) => {
        coords.push([stop.lat, stop.lng]);
        const color = stop.status === 'delivered' ? '#10b981' : stop.status === 'rejected' ? '#f43f5e' : '#06b6d4';
        const marker = L.circleMarker([stop.lat, stop.lng], {
            radius: 10,
            fillColor: color,
            color: '#09090b',
            weight: 2,
            fillOpacity: 0.95
        }).addTo(map);
        marker.bindPopup(`<b>#${index + 1} ${stop.name}</b><br>${stop.address}<br>Valor: $${stop.value.toLocaleString()}`);
        stopMarkers.push(marker);
    });

    if (coords.length > 1) {
        routePolyline = L.polyline(coords, { color: '#06b6d4', weight: 3, dashArray: '6, 6' }).addTo(map);
    }
}

// --- 3. CLIENTES SIN CRÉDITO INICIAL + GESTIÓN DE CRÉDITO EN ENTREGA ---
function openClientModal() {
    document.getElementById('client-name').value = '';
    document.getElementById('client-address').value = '';
    document.getElementById('client-phone').value = '';
    document.getElementById('client-obs').value = '';
    document.getElementById('modal-client').classList.remove('hidden');
}

function handleClientSubmitDirect() {
    const name = document.getElementById('client-name').value.trim();
    const address = document.getElementById('client-address').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const obs = document.getElementById('client-obs').value.trim();

    if (!name || !address) return alert('Nombre y dirección son obligatorios.');

    appState.clients.push({
        id: 'cli-' + Date.now(),
        name,
        address,
        phone,
        obs,
        debt: 0,
        creditHistory: []
    });

    saveAppState();
    document.getElementById('modal-client').classList.add('hidden');
    renderAllViews();
}

function openClientDetailModal(clientId) {
    const client = appState.clients.find(c => c.id === clientId);
    if (!client) return;

    document.getElementById('detail-client-id').value = client.id;
    document.getElementById('detail-client-name').textContent = client.name;
    document.getElementById('detail-client-address').textContent = client.address;
    document.getElementById('detail-client-phone').textContent = client.phone || 'Sin teléfono';
    document.getElementById('detail-client-obs').textContent = client.obs || 'Sin notas adicionales';

    const creditSection = document.getElementById('detail-credit-section');
    const noCreditMsg = document.getElementById('detail-no-credit-msg');
    const debt = client.debt || 0;
    const history = client.creditHistory || [];

    // Solo mostrar la sección de crédito si el cliente tiene deuda activa o historial de créditos pedidos en entregas
    if (debt > 0 || history.length > 0) {
        creditSection.classList.remove('hidden');
        noCreditMsg.classList.add('hidden');
        document.getElementById('detail-client-debt').textContent = `$${debt.toLocaleString()}`;
        const histEl = document.getElementById('detail-credit-history');
        histEl.innerHTML = history.map(h => `<div>• ${h.date}: ${h.type === 'credit' ? 'Fiado +' : 'Abono -'}$${h.amount.toLocaleString()} (${h.note || ''})</div>`).join('');
    } else {
        creditSection.classList.add('hidden');
        noCreditMsg.classList.remove('hidden');
    }

    document.getElementById('modal-client-detail').classList.remove('hidden');
}

function registrarAbonoCliente() {
    const clientId = document.getElementById('detail-client-id').value;
    const amount = parseFloat(document.getElementById('abono-amount-input').value) || 0;
    if (amount <= 0) return alert('Ingresa un monto válido para abonar.');

    const client = appState.clients.find(c => c.id === clientId);
    if (!client) return;

    client.debt = Math.max(0, (client.debt || 0) - amount);
    client.creditHistory = client.creditHistory || [];
    client.creditHistory.push({
        date: new Date().toLocaleDateString(),
        type: 'payment',
        amount,
        note: 'Abono en ficha'
    });

    document.getElementById('abono-amount-input').value = '';
    saveAppState();
    openClientDetailModal(clientId);
    renderAllViews();
}

// --- ENTREGA Y SOLICITUD DE CRÉDITO ---
function openEvidenceModal(stopId) {
    const route = getActiveRoute();
    const stop = route.stops.find(s => s.id === stopId);
    if (!stop) return;

    document.getElementById('evidence-stop-id').value = stop.id;
    document.getElementById('evidence-status').value = stop.status === 'rejected' ? 'rejected' : 'delivered';
    document.getElementById('evidence-payment-method').value = stop.paymentMethod || 'cash';
    document.getElementById('evidence-credit-amount').value = stop.value || 0;
    document.getElementById('evidence-credit-note').value = '';
    document.getElementById('evidence-notes').value = stop.notes || '';

    togglePaymentDetails(stop.paymentMethod || 'cash');
    clearSignatureCanvas();
    document.getElementById('modal-evidence').classList.remove('hidden');
}

function togglePaymentDetails(method) {
    const detailsBox = document.getElementById('payment-details-box');
    const qrContainer = document.getElementById('payment-qr-container');
    const creditBox = document.getElementById('payment-credit-box');

    detailsBox.classList.add('hidden');
    qrContainer.classList.add('hidden');
    creditBox.classList.add('hidden');

    if (method === 'transfer') {
        detailsBox.classList.remove('hidden');
        document.getElementById('val-bank-name').textContent = appState.paymentConfig.bankName;
        document.getElementById('val-bank-account').textContent = appState.paymentConfig.bankAccount;
    } else if (method === 'qr') {
        detailsBox.classList.remove('hidden');
        qrContainer.classList.remove('hidden');
        document.getElementById('val-bank-name').textContent = appState.paymentConfig.bankName;
        document.getElementById('val-bank-account').textContent = appState.paymentConfig.bankAccount;
        if (appState.paymentConfig.qrDataUrl) {
            document.getElementById('render-qr-img').src = appState.paymentConfig.qrDataUrl;
            document.getElementById('render-qr-img').classList.remove('hidden');
            document.getElementById('render-qr-placeholder').classList.add('hidden');
        }
    } else if (method === 'credit') {
        creditBox.classList.remove('hidden');
    }
}

function saveEvidence() {
    const stopId = document.getElementById('evidence-stop-id').value;
    const status = document.getElementById('evidence-status').value;
    const method = document.getElementById('evidence-payment-method').value;
    const notes = document.getElementById('evidence-notes').value.trim();

    const route = getActiveRoute();
    const stop = route.stops.find(s => s.id === stopId);
    if (!stop) return;

    stop.status = status;
    stop.paymentMethod = method;
    stop.notes = notes;

    // Si es entregado a crédito, cargar la deuda directamente a la ficha del cliente
    if (status === 'delivered' && method === 'credit') {
        const creditVal = parseFloat(document.getElementById('evidence-credit-amount').value) || stop.value || 0;
        const creditNote = document.getElementById('evidence-credit-note').value.trim() || 'Crédito en entrega';
        stop.creditAmount = creditVal;

        const client = appState.clients.find(c => c.id === stop.clientId || c.name === stop.name);
        if (client) {
            client.debt = (client.debt || 0) + creditVal;
            client.creditHistory = client.creditHistory || [];
            client.creditHistory.push({
                date: new Date().toLocaleDateString(),
                type: 'credit',
                amount: creditVal,
                note: creditNote
            });
        }
    } else {
        stop.creditAmount = 0;
    }

    saveAppState();
    document.getElementById('modal-evidence').classList.add('hidden');
    renderAllViews();
}

// --- RENDERIZADO GENERAL ---
function renderAllViews() {
    renderRoutesView();
    renderAgendaView();
    renderFinancesView();
    renderMapMarkersAndRoute();
    initIconsSafe();
}

function renderRoutesView() {
    const route = getActiveRoute();
    document.getElementById('route-active-title').textContent = route.name;

    let totalValue = 0;
    let pending = 0, delivered = 0, rejected = 0;

    route.stops.forEach(s => {
        totalValue += s.value || 0;
        if (s.status === 'delivered') delivered++;
        else if (s.status === 'rejected') rejected++;
        else pending++;
    });

    const estKm = (route.stops.length * 1.4).toFixed(1);
    const estMin = route.stops.length * 8;

    document.getElementById('metric-km').textContent = `${estKm} km`;
    document.getElementById('metric-time').textContent = `${estMin} min`;
    document.getElementById('metric-clients').textContent = route.stops.length;
    document.getElementById('metric-money').textContent = `$${totalValue.toLocaleString()}`;

    document.getElementById('count-pending').textContent = pending;
    document.getElementById('count-delivered').textContent = delivered;
    document.getElementById('count-rejected').textContent = rejected;

    const container = document.getElementById('routes-list-container');
    if (route.stops.length === 0) {
        container.innerHTML = `<div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center text-neutral-500 text-xs">No hay paradas en esta ruta. Ve al Mapa y pulsa "Añadir Parada".</div>`;
        return;
    }

    container.innerHTML = route.stops.map((s, idx) => {
        const badge = s.status === 'delivered'
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">Entregado (${s.paymentMethod === 'credit' ? 'Crédito' : s.paymentMethod})</span>`
            : s.status === 'rejected'
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400">Rechazado</span>`
            : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">Pendiente</span>`;

        return `
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center">${idx + 1}</span>
                    <strong class="text-white text-xs">${s.name}</strong>
                    ${badge}
                </div>
                <div class="text-[11px] text-neutral-400">${s.address}</div>
                <div class="text-xs font-black text-emerald-400">$${(s.value || 0).toLocaleString()}</div>
            </div>
            <button onclick="openEvidenceModal('${s.id}')" class="bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-black px-3.5 py-2.5 rounded-xl text-xs shrink-0">
                Gestionar
            </button>
        </div>`;
    }).join('');
}

function renderAgendaView() {
    const container = document.getElementById('lista-agenda');
    if (appState.clients.length === 0) {
        container.innerHTML = `<div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center text-neutral-500 text-xs">No hay clientes registrados. Pulsa "+ Nuevo Cliente" para empezar.</div>`;
        return;
    }

    container.innerHTML = appState.clients.map(c => {
        const hasDebt = (c.debt || 0) > 0;
        return `
        <div onclick="openClientDetailModal('${c.id}')" class="bg-neutral-900 border ${hasDebt ? 'border-amber-500/40' : 'border-neutral-800'} rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-cyan-500/40 transition">
            <div class="space-y-1">
                <strong class="text-white text-xs block">${c.name}</strong>
                <span class="text-[11px] text-neutral-400 block">${c.address}</span>
                ${c.phone ? `<span class="text-[10px] text-cyan-400 block">📞 ${c.phone}</span>` : ''}
            </div>
            <div class="text-right">
                ${hasDebt
                    ? `<span class="text-[10px] text-amber-400 font-bold block uppercase">Crédito Pendiente</span><strong class="text-rose-400 text-sm font-black">$${c.debt.toLocaleString()}</strong>`
                    : `<span class="text-[10px] text-neutral-500 font-bold">Ver Ficha →</span>`
                }
            </div>
        </div>`;
    }).join('');
}

// --- CAJA Y ARQUEO ---
const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];

function initCashDenominations() {
    const container = document.getElementById('denominations-container');
    if (!container) return;
    container.innerHTML = DENOMINATIONS.map(d => {
        const count = appState.cashCounts[d] || 0;
        return `
        <div class="flex items-center justify-between bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-xs">
            <span class="font-bold text-neutral-300">$${d.toLocaleString()}</span>
            <input type="number" min="0" value="${count || ''}" placeholder="0" onchange="updateCashCount(${d}, this.value)" class="w-24 bg-neutral-900 border border-neutral-700 rounded-lg p-1.5 text-right text-white font-bold">
        </div>`;
    }).join('');
}

function updateCashCount(denom, val) {
    appState.cashCounts[denom] = parseInt(val) || 0;
    saveAppState();
    renderFinancesView();
}

function resetCashCounter() {
    appState.cashCounts = {};
    saveAppState();
    initCashDenominations();
    renderFinancesView();
}

function addExpense() {
    const concept = document.getElementById('expense-concept').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
    if (!concept || amount <= 0) return;
    appState.expenses.push({ id: Date.now(), concept, amount });
    document.getElementById('expense-concept').value = '';
    document.getElementById('expense-amount').value = '';
    saveAppState();
    renderFinancesView();
}

function renderFinancesView() {
    let physicalTotal = 0;
    DENOMINATIONS.forEach(d => {
        physicalTotal += d * (appState.cashCounts[d] || 0);
    });
    document.getElementById('counter-total-display').textContent = `$${physicalTotal.toLocaleString()}`;

    const route = getActiveRoute();
    let cashDelivered = 0;
    let transferDelivered = 0;
    let creditDelivered = 0;

    route.stops.forEach(s => {
        if (s.status === 'delivered') {
            if (s.paymentMethod === 'cash') cashDelivered += (s.value || 0);
            else if (s.paymentMethod === 'transfer' || s.paymentMethod === 'qr') transferDelivered += (s.value || 0);
            else if (s.paymentMethod === 'credit') creditDelivered += (s.creditAmount || s.value || 0);
        }
    });

    const totalExpenses = appState.expenses.reduce((acc, e) => acc + e.amount, 0);
    const diff = physicalTotal - (cashDelivered - totalExpenses);
    const netTotal = physicalTotal + transferDelivered;

    document.getElementById('summary-facturado').textContent = `$${cashDelivered.toLocaleString()}`;
    document.getElementById('summary-fisico').textContent = `$${physicalTotal.toLocaleString()}`;
    document.getElementById('summary-transfer').textContent = `$${transferDelivered.toLocaleString()}`;
    document.getElementById('summary-credit').textContent = `$${creditDelivered.toLocaleString()}`;
    document.getElementById('summary-diff').textContent = `${diff >= 0 ? '+' : ''}$${diff.toLocaleString()}`;
    document.getElementById('summary-neto-total').textContent = `$${netTotal.toLocaleString()}`;
    document.getElementById('final-balance-badge').textContent = `$${netTotal.toLocaleString()} Neto`;

    const expList = document.getElementById('expenses-list');
    expList.innerHTML = appState.expenses.map(e => `
        <div class="flex justify-between text-xs bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800">
            <span class="text-neutral-300">${e.concept}</span>
            <strong class="text-rose-400">-$${e.amount.toLocaleString()}</strong>
        </div>
    `).join('');
}

// --- UTILIDADES ADICIONALES ---
function openDriverEditModal() {
    document.getElementById('edit-driver-name').value = appState.driver.name;
    document.getElementById('modal-driver').classList.remove('hidden');
}

function saveDriverProfile() {
    const name = document.getElementById('edit-driver-name').value.trim();
    if (name) {
        appState.driver.name = name;
        saveAppState();
        updateDriverHeaderUI();
    }
    document.getElementById('modal-driver').classList.add('hidden');
}

function openCreateRouteModal() {
    document.getElementById('new-route-name').value = '';
    document.getElementById('modal-route').classList.remove('hidden');
}

function createNewRoute() {
    const name = document.getElementById('new-route-name').value.trim();
    if (!name) return;
    const newId = 'route-' + Date.now();
    appState.routes.push({ id: newId, name, stops: [] });
    appState.activeRouteId = newId;
    saveAppState();
    document.getElementById('modal-route').classList.add('hidden');
    renderAllViews();
}

function changeTransportMode(mode) {
    appState.transportMode = mode;
    const icons = { walk: '🚶', bike: '🚲', moto: '🏍️', car: '🚗', truck: '🚚' };
    document.getElementById('transport-icon-indicator').textContent = icons[mode] || '🚗';
    saveAppState();
}

function openSheetsConfigModal() {
    document.getElementById('cfg-sheets-url').value = appState.sheetsUrl || '';
    document.getElementById('modal-sheets-config').classList.remove('hidden');
}

function saveSheetsConfig() {
    appState.sheetsUrl = document.getElementById('cfg-sheets-url').value.trim();
    saveAppState();
    document.getElementById('modal-sheets-config').classList.add('hidden');
}

function openPaymentConfigModal() {
    document.getElementById('cfg-bank-name').value = appState.paymentConfig.bankName;
    document.getElementById('cfg-bank-account').value = appState.paymentConfig.bankAccount;
    document.getElementById('modal-payment-config').classList.remove('hidden');
}

function previewConfigQR(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        appState.paymentConfig.qrDataUrl = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function savePaymentConfig() {
    appState.paymentConfig.bankName = document.getElementById('cfg-bank-name').value.trim() || 'Nequi';
    appState.paymentConfig.bankAccount = document.getElementById('cfg-bank-account').value.trim() || '';
    saveAppState();
    document.getElementById('modal-payment-config').classList.add('hidden');
    togglePaymentDetails(document.getElementById('evidence-payment-method').value);
}

function openOfflineDownloadModal() {
    document.getElementById('modal-offline-download').classList.remove('hidden');
}

async function startDownloadingRouteMapTiles() {
    if (!navigator.onLine) return alert('Necesitas conexión a internet para descargar nuevos mosaicos de mapa.');
    if (!map) return;

    const statusEl = document.getElementById('offline-sync-status');
    const progContainer = document.getElementById('download-progress-container');
    const progBar = document.getElementById('download-progress-bar');

    progContainer.classList.remove('hidden');
    statusEl.textContent = 'Descargando área...';

    const center = map.getCenter();
    const zooms = [14, 15, 16];
    const urls = [];

    zooms.forEach(z => {
        const latRad = center.lat * Math.PI / 180;
        const n = Math.pow(2, z);
        const xtile = Math.floor((center.lng + 180) / 360 * n);
        const ytile = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                urls.push(`https://a.tile.openstreetmap.org/${z}/${xtile + dx}/${ytile + dy}.png`);
            }
        }
    });

    const cache = await caches.open('routelogix-enterprise-v29-offline');
    let done = 0;
    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (res.ok) await cache.put(url, res);
        } catch (e) {}
        done++;
        const pct = Math.round((done / urls.length) * 100);
        progBar.style.width = `${pct}%`;
    }

    document.getElementById('offline-tiles-count').textContent = `${urls.length} tiles`;
    statusEl.textContent = '¡Zona guardada offline!';
}

async function clearOfflineMapStorage() {
    const cache = await caches.open('routelogix-enterprise-v29-offline');
    const keys = await cache.keys();
    for (const req of keys) {
        if (req.url.includes('tile.openstreetmap.org')) await cache.delete(req);
    }
    document.getElementById('offline-tiles-count').textContent = '0 tiles';
    document.getElementById('offline-sync-status').textContent = 'Caché limpiada';
}

function initSignatureCanvas() {
    const canvas = document.getElementById('signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.5;
    let drawing = false;

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const start = (e) => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e) => { if (!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => { drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
}

function clearSignatureCanvas() {
    const canvas = document.getElementById('signature-canvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function exportarRespaldoJSON() {
    const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `routelogix-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
}

function importarArchivoRoutin(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            appState = { ...appState, ...data };
            saveAppState();
            renderAllViews();
            alert('✅ Respaldo restaurado correctamente.');
        } catch (err) {
            alert('Archivo de respaldo inválido.');
        }
    };
    reader.readAsText(file);
}
