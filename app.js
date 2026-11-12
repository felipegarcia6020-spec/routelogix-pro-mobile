// RouteLogix Pro Enterprise v30 - Cámara Directa + Compartir Rutas + Offline-First

const APP_STORAGE_KEY = 'routelogix_v30_state';
const TUTORIAL_DONE_KEY = 'routelogix_v30_tutorial_done';

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
let lastKnownCoords = [4.3365, -74.3638];
let deferredPrompt = null;
let currentCapturedPhotoData = '';

// --- 1. ARRANQUE GARANTIZADO ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        loadAppState();
        registerServiceWorkerSafe();
        setupNetworkListeners();
        initIconsSafe();
        initCashDenominations();
        initSignatureCanvas();
        
        if (appState.driver && appState.driver.loggedIn) {
            document.getElementById('auth-screen').classList.add('hidden');
            updateDriverHeaderUI();
            bootMainApplication();
        } else {
            if (appState.driver.name) document.getElementById('login-name').value = appState.driver.name;
            if (appState.driver.email) document.getElementById('login-email').value = appState.driver.email;
        }
    } catch (err) {
        console.error('Error en arranque:', err);
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
        navigator.serviceWorker.register('./sw.js').catch(() => {});
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
    deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
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

async function handleLoginWithSheetsValidation() {
    const name = document.getElementById('login-name').value.trim() || 'Conductor Operativo';
    const email = document.getElementById('login-email').value.trim();
    const errBox = document.getElementById('login-error-msg');
    const btn = document.getElementById('btn-login-submit');

    errBox.classList.add('hidden');
    btn.textContent = 'Iniciando...';
    btn.disabled = true;

    if (appState.sheetsUrl && email && navigator.onLine) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`${appState.sheetsUrl}?email=${encodeURIComponent(email)}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            const data = await res.json();
            if (data && data.status === 'blocked') {
                errBox.textContent = 'Acceso restringido.';
                errBox.classList.remove('hidden');
                btn.textContent = 'Iniciar Operación';
                btn.disabled = false;
                return;
            }
        } catch (e) {}
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

// --- MAPA OFFLINE ---
function initMapSafe() {
    if (map) { map.invalidateSize(); return; }
    if (typeof L === 'undefined') return;

    map = L.map('map', { zoomControl: false, attributionControl: false }).setView(lastKnownCoords, 15);
    setMapTileStyle(navigator.onLine ? (appState.mapStyle || 'standard') : 'offline');
    startGPSTracking();
    renderMapMarkersAndRoute();
}

function createOfflineGridLayer() {
    const GridLayer = L.GridLayer.extend({
        createTile: function (coords) {
            const tile = document.createElement('canvas');
            const size = this.getTileSize();
            tile.width = size.x; tile.height = size.y;
            const ctx = tile.getContext('2d');
            ctx.fillStyle = '#0b1120';
            ctx.fillRect(0, 0, size.x, size.y);
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.14)';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, size.x, size.y);
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
        btn.className = s === style ? 'px-2.5 py-1.5 rounded-xl bg-cyan-500 text-neutral-950 transition' : 'px-2.5 py-1.5 rounded-xl text-neutral-300 hover:text-white transition';
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
        if (style === 'dark') mapEl.classList.add('dark-map-tiles');
        else mapEl.classList.remove('dark-map-tiles');

        currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true });
        currentTileLayer.on('tileerror', () => { if (appState.mapStyle !== 'offline') setMapTileStyle('offline'); });
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
                    userMarker = L.circleMarker(lastKnownCoords, { radius: 8, fillColor: '#06b6d4', color: '#ffffff', weight: 2, fillOpacity: 1 }).addTo(map);
                } else {
                    userMarker.setLatLng(lastKnownCoords);
                }
                if (isTrackingLive) map.panTo(lastKnownCoords);
            }
        },
        (err) => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
}

function centrarGPS() { if (map) map.setView(lastKnownCoords, 16); }

function toggleTrackingLive() {
    isTrackingLive = !isTrackingLive;
    const btn = document.getElementById('tracking-toggle-btn');
    btn.className = isTrackingLive ? 'w-11 h-11 bg-cyan-500 text-neutral-950 rounded-2xl shadow-2xl flex items-center justify-center transition' : 'w-11 h-11 bg-neutral-900 text-neutral-400 border border-neutral-700 rounded-2xl shadow-2xl flex items-center justify-center transition';
}

async function searchMapAddress() {
    const query = document.getElementById('map-search-input').value.trim();
    if (!query) return;
    if (!navigator.onLine) { alert('Sin internet: Mueve el mapa manualmente y usa "Añadir Parada -> Ubicación central".'); return; }
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        const results = await res.json();
        if (results && results.length > 0 && map) {
            isTrackingLive = false;
            map.setView([parseFloat(results[0].lat), parseFloat(results[0].lon)], 17);
        }
    } catch (e) {}
}

// --- 2. COMPARTIR RUTAS ENTRE DISPOSITIVOS ---
async function compartirRutaActiva() {
    const route = getActiveRoute();
    const payload = JSON.stringify({
        appName: "RouteLogix Pro Route",
        version: "30",
        routeExport: route,
        exportedAt: new Date().toISOString()
    }, null, 2);

    const blob = new Blob([payload], { type: 'application/json' });
    const file = new File([blob], `${route.name.toLowerCase().replace(/\s+/g, '-')}-routelogix.json`, { type: 'application/json' });

    // Intentar Web Share API nativa (Bluetooth, WhatsApp, AirDrop, etc.)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                title: `Ruta: ${route.name}`,
                text: `Ruta TaT de RouteLogix Pro (${route.stops.length} paradas). Importa este archivo en la app.`,
                files: [file]
            });
            return;
        } catch (e) {
            if (e.name !== 'AbortError') console.warn('Share API error:', e);
        }
    }

    // Fallback con portapapeles o descarga de archivo directo
    try {
        await navigator.clipboard.writeText(payload);
        alert('📋 ¡Datos de la ruta copiados al portapapeles! Puedes pegarlos en un mensaje de WhatsApp o exportar el archivo JSON.');
    } catch (e) {}

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${route.name.toLowerCase().replace(/\s+/g, '-')}-routelogix.json`;
    a.click();
}

// --- 3. CÁMARA DIRECTA EN EVIDENCIA ---
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

    currentCapturedPhotoData = stop.photoData || '';
    updatePhotoPreviewUI();

    togglePaymentDetails(stop.paymentMethod || 'cash');
    clearSignatureCanvas();
    document.getElementById('modal-evidence').classList.remove('hidden');
}

function handlePhotoCaptured(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        currentCapturedPhotoData = ev.target.result;
        updatePhotoPreviewUI();
    };
    reader.readAsDataURL(file);
}

function updatePhotoPreviewUI() {
    const box = document.getElementById('evidence-photo-preview-box');
    const img = document.getElementById('evidence-photo-preview-img');
    if (currentCapturedPhotoData) {
        img.src = currentCapturedPhotoData;
        box.classList.remove('hidden');
    } else {
        img.src = '';
        box.classList.add('hidden');
    }
}

function removeCapturedPhoto() {
    currentCapturedPhotoData = '';
    updatePhotoPreviewUI();
    document.getElementById('evidence-camera-input').value = '';
    document.getElementById('evidence-gallery-input').value = '';
}

// --- TUTORIAL ---
const TUTORIAL_STEPS = [
    { targetId: 'tour-header', title: 'Barra Superior y Compartir', desc: 'Aquí ves tu estado y el botón de Compartir Ruta (para enviar la ruta por WhatsApp, Bluetooth o archivo).' },
    { targetId: 'tour-search', title: 'Buscador de Direcciones', desc: 'Ubica direcciones rápidamente.' },
    { targetId: 'tour-map-styles', title: 'Modo Táctico Offline', desc: 'Mapas funcionales sin internet.' },
    { targetId: 'tour-gps-controls', title: 'GPS y Descarga Offline', desc: 'Guarda tus mosaicos antes de salir.' },
    { targetId: 'tour-map-actions', title: 'Añadir Paradas y IA', desc: 'Agrega puntos y optimiza rutas al instante.' },
    { targetId: 'tour-navbar', title: 'Navegación de Módulos', desc: 'Mapa, Ruta, Agenda y Caja.' }
];

let currentTutorialStep = 0;
function checkAndRunTutorial() {
    if (!localStorage.getItem(TUTORIAL_DONE_KEY)) startInteractiveTutorial(false);
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
    document.getElementById('tutorial-step-badge').textContent = `Paso ${currentTutorialStep + 1} de ${TUTORIAL_STEPS.length}`;
    document.getElementById('tutorial-title').textContent = step.title;
    document.getElementById('tutorial-desc').textContent = step.desc;
    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const spotlight = document.getElementById('tutorial-spotlight');
        const card = document.getElementById('tutorial-card');
        spotlight.style.top = `${Math.max(4, rect.top - 4)}px`;
        spotlight.style.left = `${Math.max(4, rect.left - 4)}px`;
        spotlight.style.width = `${Math.min(window.innerWidth - 8, rect.width + 8)}px`;
        spotlight.style.height = `${rect.height + 8}px`;
        card.style.top = rect.top > window.innerHeight / 2 ? `${Math.max(16, rect.top - 195)}px` : `${Math.min(window.innerHeight - 210, rect.bottom + 14)}px`;
        card.style.left = '50%'; card.style.transform = 'translateX(-50%)';
    }
}
function nextTutorialStep() {
    if (currentTutorialStep < TUTORIAL_STEPS.length - 1) { currentTutorialStep++; renderTutorialStep(); }
    else endInteractiveTutorial();
}
function prevTutorialStep() { if (currentTutorialStep > 0) { currentTutorialStep--; renderTutorialStep(); } }
function endInteractiveTutorial() {
    localStorage.setItem(TUTORIAL_DONE_KEY, 'true');
    document.getElementById('tutorial-overlay').classList.add('hidden');
}

// --- NAVEGACIÓN Y ACCIONES ---
function switchTab(tab) {
    ['map', 'routes', 'agenda', 'finances'].forEach(t => {
        document.getElementById(`view-${t}`).classList.toggle('hidden', t !== tab);
        document.getElementById(`nav-btn-${t}`).className = t === tab ? 'flex flex-col items-center justify-center text-cyan-400 transition' : 'flex flex-col items-center justify-center text-neutral-400 hover:text-white transition';
    });
    if (tab === 'map' && map) setTimeout(() => map.invalidateSize(), 120);
    renderAllViews();
}

function getActiveRoute() {
    let route = appState.routes.find(r => r.id === appState.activeRouteId);
    if (!route) { route = appState.routes[0]; appState.activeRouteId = route.id; }
    return route;
}

function toggleStopMenu() { document.getElementById('stop-submenu').classList.toggle('hidden'); }

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
    if (!name) return alert('Ingresa el nombre.');
    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };

    let client = appState.clients.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!client) {
        client = { id: 'cli-' + Date.now(), name, address, phone: '', obs: '', debt: 0, creditHistory: [] };
        appState.clients.push(client);
    }

    getActiveRoute().stops.push({
        id: 'stop-' + Date.now(), clientId: client.id, name, address, lat: center.lat, lng: center.lng, value, status: 'pending', paymentMethod: 'cash', creditAmount: 0, notes: '', photoData: ''
    });
    saveAppState();
    document.getElementById('modal-parada').classList.add('hidden');
    renderAllViews();
}

function abrirModalClienteExistente() {
    document.getElementById('stop-submenu').classList.add('hidden');
    if (appState.clients.length === 0) { alert('No hay clientes en la agenda.'); switchTab('agenda'); openClientModal(); return; }
    document.getElementById('select-agenda-client').innerHTML = appState.clients.map(c => `<option value="${c.id}">${c.name} - ${c.address}</option>`).join('');
    document.getElementById('agenda-stop-value').value = '';
    document.getElementById('modal-route-add-stop').classList.remove('hidden');
}

function confirmAddStopFromAgenda() {
    const clientId = document.getElementById('select-agenda-client').value;
    const value = parseFloat(document.getElementById('agenda-stop-value').value) || 0;
    const client = appState.clients.find(c => c.id === clientId);
    if (!client) return;
    const center = map ? map.getCenter() : { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };

    getActiveRoute().stops.push({
        id: 'stop-' + Date.now(), clientId: client.id, name: client.name, address: client.address, lat: center.lat + (Math.random()-0.5)*0.004, lng: center.lng + (Math.random()-0.5)*0.004, value, status: 'pending', paymentMethod: 'cash', creditAmount: 0, notes: '', photoData: ''
    });
    saveAppState();
    document.getElementById('modal-route-add-stop').classList.add('hidden');
    renderAllViews();
}

function optimizarRutaInteligente() {
    const route = getActiveRoute();
    if (route.stops.length < 2) return alert('Agrega al menos 2 paradas.');
    const pending = route.stops.filter(s => s.status === 'pending');
    const done = route.stops.filter(s => s.status !== 'pending');
    let currentPos = { lat: lastKnownCoords[0], lng: lastKnownCoords[1] };
    const sorted = [];
    const pool = [...pending];
    while (pool.length > 0) {
        let bestIdx = 0, bestDist = Infinity;
        pool.forEach((s, idx) => {
            const d = Math.hypot(s.lat - currentPos.lat, s.lng - currentPos.lng);
            if (d < bestDist) { bestDist = d; bestIdx = idx; }
        });
        const next = pool.splice(bestIdx, 1)[0];
        sorted.push(next);
        currentPos = { lat: next.lat, lng: next.lng };
    }
    route.stops = [...done, ...sorted];
    saveAppState();
    renderAllViews();
    alert('✅ Ruta optimizada.');
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
        const marker = L.circleMarker([stop.lat, stop.lng], { radius: 10, fillColor: color, color: '#09090b', weight: 2, fillOpacity: 0.95 }).addTo(map);
        marker.bindPopup(`<b>#${index + 1} ${stop.name}</b><br>${stop.address}<br>Valor: $${stop.value.toLocaleString()}`);
        stopMarkers.push(marker);
    });
    if (coords.length > 1) routePolyline = L.polyline(coords, { color: '#06b6d4', weight: 3, dashArray: '6, 6' }).addTo(map);
}

function openClientModal() {
    ['client-name', 'client-address', 'client-phone', 'client-obs'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('modal-client').classList.remove('hidden');
}

function handleClientSubmitDirect() {
    const name = document.getElementById('client-name').value.trim();
    const address = document.getElementById('client-address').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const obs = document.getElementById('client-obs').value.trim();
    if (!name || !address) return alert('Nombre y dirección requeridos.');

    appState.clients.push({ id: 'cli-' + Date.now(), name, address, phone, obs, debt: 0, creditHistory: [] });
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
    document.getElementById('detail-client-obs').textContent = client.obs || 'Sin notas';

    const creditSection = document.getElementById('detail-credit-section');
    const noCreditMsg = document.getElementById('detail-no-credit-msg');
    const debt = client.debt || 0;
    const history = client.creditHistory || [];

    if (debt > 0 || history.length > 0) {
        creditSection.classList.remove('hidden');
        noCreditMsg.classList.add('hidden');
        document.getElementById('detail-client-debt').textContent = `$${debt.toLocaleString()}`;
        document.getElementById('detail-credit-history').innerHTML = history.map(h => `<div>• ${h.date}: ${h.type === 'credit' ? 'Fiado +' : 'Abono -'}$${h.amount.toLocaleString()} (${h.note || ''})</div>`).join('');
    } else {
        creditSection.classList.add('hidden');
        noCreditMsg.classList.remove('hidden');
    }
    document.getElementById('modal-client-detail').classList.remove('hidden');
}

function registrarAbonoCliente() {
    const clientId = document.getElementById('detail-client-id').value;
    const amount = parseFloat(document.getElementById('abono-amount-input').value) || 0;
    if (amount <= 0) return alert('Monto inválido.');
    const client = appState.clients.find(c => c.id === clientId);
    if (!client) return;

    client.debt = Math.max(0, (client.debt || 0) - amount);
    client.creditHistory.push({ date: new Date().toLocaleDateString(), type: 'payment', amount, note: 'Abono' });
    document.getElementById('abono-amount-input').value = '';
    saveAppState();
    openClientDetailModal(clientId);
    renderAllViews();
}

function togglePaymentDetails(method) {
    const detailsBox = document.getElementById('payment-details-box');
    const qrContainer = document.getElementById('payment-qr-container');
    const creditBox = document.getElementById('payment-credit-box');
    detailsBox.classList.add('hidden'); qrContainer.classList.add('hidden'); creditBox.classList.add('hidden');

    if (method === 'transfer') {
        detailsBox.classList.remove('hidden');
        document.getElementById('val-bank-name').textContent = appState.paymentConfig.bankName;
        document.getElementById('val-bank-account').textContent = appState.paymentConfig.bankAccount;
    } else if (method === 'qr') {
        detailsBox.classList.remove('hidden'); qrContainer.classList.remove('hidden');
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
    stop.photoData = currentCapturedPhotoData;

    if (status === 'delivered' && method === 'credit') {
        const creditVal = parseFloat(document.getElementById('evidence-credit-amount').value) || stop.value || 0;
        const creditNote = document.getElementById('evidence-credit-note').value.trim() || 'Crédito';
        stop.creditAmount = creditVal;

        const client = appState.clients.find(c => c.id === stop.clientId || c.name === stop.name);
        if (client) {
            client.debt = (client.debt || 0) + creditVal;
            client.creditHistory.push({ date: new Date().toLocaleDateString(), type: 'credit', amount: creditVal, note: creditNote });
        }
    } else {
        stop.creditAmount = 0;
    }

    saveAppState();
    document.getElementById('modal-evidence').classList.add('hidden');
    renderAllViews();
}

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
    let totalValue = 0, pending = 0, delivered = 0, rejected = 0;
    route.stops.forEach(s => {
        totalValue += s.value || 0;
        if (s.status === 'delivered') delivered++;
        else if (s.status === 'rejected') rejected++;
        else pending++;
    });

    document.getElementById('metric-km').textContent = `${(route.stops.length * 1.4).toFixed(1)} km`;
    document.getElementById('metric-time').textContent = `${route.stops.length * 8} min`;
    document.getElementById('metric-clients').textContent = route.stops.length;
    document.getElementById('metric-money').textContent = `$${totalValue.toLocaleString()}`;
    document.getElementById('count-pending').textContent = pending;
    document.getElementById('count-delivered').textContent = delivered;
    document.getElementById('count-rejected').textContent = rejected;

    const container = document.getElementById('routes-list-container');
    if (route.stops.length === 0) {
        container.innerHTML = `<div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center text-neutral-500 text-xs">No hay paradas en esta ruta. Añádelas desde el mapa.</div>`;
        return;
    }

    container.innerHTML = route.stops.map((s, idx) => {
        const badge = s.status === 'delivered' ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">Entregado</span>` : s.status === 'rejected' ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400">Rechazado</span>` : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">Pendiente</span>`;
        return `
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center">${idx + 1}</span>
                    <strong class="text-white text-xs">${s.name}</strong>
                    ${badge}
                    ${s.photoData ? '📸' : ''}
                </div>
                <div class="text-[11px] text-neutral-400">${s.address}</div>
                <div class="text-xs font-black text-emerald-400">$${(s.value || 0).toLocaleString()}</div>
            </div>
            <button onclick="openEvidenceModal('${s.id}')" class="bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-black px-3.5 py-2.5 rounded-xl text-xs shrink-0">Gestionar</button>
        </div>`;
    }).join('');
}

function renderAgendaView() {
    const container = document.getElementById('lista-agenda');
    if (appState.clients.length === 0) {
        container.innerHTML = `<div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center text-neutral-500 text-xs">No hay clientes en la agenda.</div>`;
        return;
    }
    container.innerHTML = appState.clients.map(c => {
        const hasDebt = (c.debt || 0) > 0;
        return `
        <div onclick="openClientDetailModal('${c.id}')" class="bg-neutral-900 border ${hasDebt ? 'border-amber-500/40' : 'border-neutral-800'} rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-cyan-500/40 transition">
            <div class="space-y-1">
                <strong class="text-white text-xs block">${c.name}</strong>
                <span class="text-[11px] text-neutral-400 block">${c.address}</span>
            </div>
            <div class="text-right">
                ${hasDebt ? `<span class="text-[10px] text-amber-400 font-bold block">Deuda</span><strong class="text-rose-400 text-sm font-black">$${c.debt.toLocaleString()}</strong>` : `<span class="text-[10px] text-neutral-500">Ver Ficha →</span>`}
            </div>
        </div>`;
    }).join('');
}

const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];
function initCashDenominations() {
    const container = document.getElementById('denominations-container');
    if (!container) return;
    container.innerHTML = DENOMINATIONS.map(d => `
        <div class="flex items-center justify-between bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-xs">
            <span class="font-bold text-neutral-300">$${d.toLocaleString()}</span>
            <input type="number" min="0" value="${appState.cashCounts[d] || ''}" placeholder="0" onchange="updateCashCount(${d}, this.value)" class="w-24 bg-neutral-900 border border-neutral-700 rounded-lg p-1.5 text-right text-white font-bold">
        </div>`).join('');
}
function updateCashCount(d, val) { appState.cashCounts[d] = parseInt(val) || 0; saveAppState(); renderFinancesView(); }
function resetCashCounter() { appState.cashCounts = {}; saveAppState(); initCashDenominations(); renderFinancesView(); }
function addExpense() {
    const concept = document.getElementById('expense-concept').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
    if (!concept || amount <= 0) return;
    appState.expenses.push({ id: Date.now(), concept, amount });
    document.getElementById('expense-concept').value = ''; document.getElementById('expense-amount').value = '';
    saveAppState(); renderFinancesView();
}
function renderFinancesView() {
    let physicalTotal = 0;
    DENOMINATIONS.forEach(d => { physicalTotal += d * (appState.cashCounts[d] || 0); });
    document.getElementById('counter-total-display').textContent = `$${physicalTotal.toLocaleString()}`;

    let cash = 0, transfer = 0, credit = 0;
    getActiveRoute().stops.forEach(s => {
        if (s.status === 'delivered') {
            if (s.paymentMethod === 'cash') cash += (s.value || 0);
            else if (s.paymentMethod === 'transfer' || s.paymentMethod === 'qr') transfer += (s.value || 0);
            else if (s.paymentMethod === 'credit') credit += (s.creditAmount || s.value || 0);
        }
    });
    const exp = appState.expenses.reduce((a, b) => a + b.amount, 0);
    const diff = physicalTotal - (cash - exp);
    const net = physicalTotal + transfer;

    document.getElementById('summary-facturado').textContent = `$${cash.toLocaleString()}`;
    document.getElementById('summary-fisico').textContent = `$${physicalTotal.toLocaleString()}`;
    document.getElementById('summary-transfer').textContent = `$${transfer.toLocaleString()}`;
    document.getElementById('summary-credit').textContent = `$${credit.toLocaleString()}`;
    document.getElementById('summary-diff').textContent = `${diff >= 0 ? '+' : ''}$${diff.toLocaleString()}`;
    document.getElementById('summary-neto-total').textContent = `$${net.toLocaleString()}`;
    document.getElementById('final-balance-badge').textContent = `$${net.toLocaleString()} Neto`;

    document.getElementById('expenses-list').innerHTML = appState.expenses.map(e => `
        <div class="flex justify-between text-xs bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800">
            <span class="text-neutral-300">${e.concept}</span><strong class="text-rose-400">-$${e.amount.toLocaleString()}</strong>
        </div>`).join('');
}

function openDriverEditModal() { document.getElementById('edit-driver-name').value = appState.driver.name; document.getElementById('modal-driver').classList.remove('hidden'); }
function saveDriverProfile() {
    const name = document.getElementById('edit-driver-name').value.trim();
    if (name) { appState.driver.name = name; saveAppState(); updateDriverHeaderUI(); }
    document.getElementById('modal-driver').classList.add('hidden');
}
function openCreateRouteModal() { document.getElementById('new-route-name').value = ''; document.getElementById('modal-route').classList.remove('hidden'); }
function createNewRoute() {
    const name = document.getElementById('new-route-name').value.trim();
    if (!name) return;
    const newId = 'route-' + Date.now();
    appState.routes.push({ id: newId, name, stops: [] });
    appState.activeRouteId = newId;
    saveAppState(); document.getElementById('modal-route').classList.add('hidden'); renderAllViews();
}
function changeTransportMode(mode) {
    appState.transportMode = mode;
    document.getElementById('transport-icon-indicator').textContent = { walk: '🚶', bike: '🚲', moto: '🏍️', car: '🚗', truck: '🚚' }[mode] || '🚗';
    saveAppState();
}
function openSheetsConfigModal() { document.getElementById('cfg-sheets-url').value = appState.sheetsUrl || ''; document.getElementById('modal-sheets-config').classList.remove('hidden'); }
function saveSheetsConfig() { appState.sheetsUrl = document.getElementById('cfg-sheets-url').value.trim(); saveAppState(); document.getElementById('modal-sheets-config').classList.add('hidden'); }
function openPaymentConfigModal() {
    document.getElementById('cfg-bank-name').value = appState.paymentConfig.bankName;
    document.getElementById('cfg-bank-account').value = appState.paymentConfig.bankAccount;
    document.getElementById('modal-payment-config').classList.remove('hidden');
}
function previewConfigQR(e) {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => { appState.paymentConfig.qrDataUrl = ev.target.result; };
    r.readAsDataURL(file);
}
function savePaymentConfig() {
    appState.paymentConfig.bankName = document.getElementById('cfg-bank-name').value.trim() || 'Nequi';
    appState.paymentConfig.bankAccount = document.getElementById('cfg-bank-account').value.trim() || '';
    saveAppState(); document.getElementById('modal-payment-config').classList.add('hidden');
    togglePaymentDetails(document.getElementById('evidence-payment-method').value);
}
function openOfflineDownloadModal() { document.getElementById('modal-offline-download').classList.remove('hidden'); }

async function startDownloadingRouteMapTiles() {
    if (!navigator.onLine) return alert('Se requiere internet para descargar teselas.');
    if (!map) return;
    const statusEl = document.getElementById('offline-sync-status');
    const progBar = document.getElementById('download-progress-bar');
    document.getElementById('download-progress-container').classList.remove('hidden');
    statusEl.textContent = 'Descargando...';

    const center = map.getCenter();
    const urls = [];
    [14, 15, 16].forEach(z => {
        const n = Math.pow(2, z);
        const xtile = Math.floor((center.lng + 180) / 360 * n);
        const ytile = Math.floor((1 - Math.log(Math.tan(center.lat * Math.PI / 180) + 1 / Math.cos(center.lat * Math.PI / 180)) / Math.PI) / 2 * n);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                urls.push(`https://a.tile.openstreetmap.org/${z}/${xtile + dx}/${ytile + dy}.png`);
            }
        }
    });

    const cache = await caches.open('routelogix-enterprise-v30-offline');
    let done = 0;
    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (res.ok) await cache.put(url, res);
        } catch (e) {}
        done++;
        progBar.style.width = `${Math.round((done / urls.length) * 100)}%`;
    }
    document.getElementById('offline-tiles-count').textContent = `${urls.length} tiles`;
    statusEl.textContent = '¡Descargado!';
}

async function clearOfflineMapStorage() {
    const cache = await caches.open('routelogix-enterprise-v30-offline');
    const keys = await cache.keys();
    for (const req of keys) { if (req.url.includes('tile.openstreetmap.org')) await cache.delete(req); }
    document.getElementById('offline-tiles-count').textContent = '0 tiles';
}

function initSignatureCanvas() {
    const canvas = document.getElementById('signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2.5;
    let drawing = false;
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
    };
    const start = (e) => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e) => { if (!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => { drawing = false; };
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
}
function clearSignatureCanvas() {
    const canvas = document.getElementById('signature-canvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function importarArchivoRoutin(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (data.routeExport) {
                appState.routes.push(data.routeExport);
                appState.activeRouteId = data.routeExport.id;
            } else {
                appState = { ...appState, ...data };
            }
            saveAppState(); renderAllViews();
            alert('✅ Ruta importada correctamente.');
        } catch (err) {
            alert('Archivo incompatible.');
        }
    };
    reader.readAsText(file);
}
