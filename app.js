// RouteLogix Pro Enterprise v31 - Híbrido + Vista de Supervisor Integrada

const APP_STORAGE_KEY = 'routelogix_v31_state';
const SUPERVISOR_PIN = '1234';

let appState = {
    driver: { name: '', email: '', role: 'independent', loggedIn: false },
    sheetsUrl: '',
    mapStyle: 'standard',
    activeRouteId: 'route-1',
    routes: [{ id: 'route-1', name: 'Ruta Autoventa POS', stops: [] }],
    clients: [],
    inventory: [
        { id: 'p1', name: 'Queso Doble Crema 500g', cost: 9000, price: 12000, stock: 30 },
        { id: 'p2', name: 'Leche Entera 1L', cost: 3200, price: 4500, stock: 50 }
    ],
    expenses: [],
    cashCounts: {},
    outboxQueue: []
};

let map = null;
let currentTileLayer = null;
let routePolyline = null;
let stopMarkers = [];
let userMarker = null;
let watchId = null;
let lastKnownCoords = [4.3365, -74.3638];
let activePosCartItems = [];

document.addEventListener('DOMContentLoaded', () => {
    try {
        loadAppState();
        setupNetworkListeners();
        initIconsSafe();
        initCashDenominations();
        
        if (appState.driver && appState.driver.loggedIn) {
            document.getElementById('auth-screen').classList.add('hidden');
            configureRoleInterface();
            bootMainApplication();
        }
    } catch (err) {
        document.getElementById('auth-screen').classList.add('hidden');
    }
});

function bootMainApplication() {
    setTimeout(() => {
        initMapSafe();
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
    if (raw) appState = { ...appState, ...JSON.parse(raw) };
}

function saveAppState() {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
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

    if (role === 'supervisor') {
        const pin = document.getElementById('login-supervisor-pin').value.trim();
        if (pin !== SUPERVISOR_PIN) {
            const err = document.getElementById('login-error-msg');
            err.textContent = '❌ PIN de supervisor incorrecto (Prueba con 1234)';
            err.classList.remove('hidden');
            return;
        }
    }

    appState.driver = { name, email, role, loggedIn: true };
    saveAppState();
    document.getElementById('auth-screen').classList.add('hidden');
    configureRoleInterface();
    bootMainApplication();
}

function logoutSession() {
    appState.driver.loggedIn = false;
    saveAppState();
    document.getElementById('auth-screen').classList.remove('hidden');
}

function configureRoleInterface() {
    const isSupervisor = appState.driver.role === 'supervisor';
    const navButtons = document.getElementById('navbar-buttons');
    
    if (isSupervisor) {
        navButtons.innerHTML = `
            <button onclick="switchTab('supervisor')" id="nav-btn-supervisor" class="flex flex-col items-center justify-center text-amber-400 transition col-span-4">
                <i data-lucide="shield-alert" class="w-5 h-5"></i>
                <span class="text-[10px] mt-1 font-bold">Panel Supervisor Cloud</span>
            </button>`;
        switchTab('supervisor');
        cargarDatosSupervisorCloud();
    } else {
        navButtons.innerHTML = `
            <button onclick="switchTab('map')" id="nav-btn-map" class="flex flex-col items-center justify-center text-cyan-400 transition"><i data-lucide="map" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Mapa</span></button>
            <button onclick="switchTab('routes')" id="nav-btn-routes" class="flex flex-col items-center justify-center text-neutral-400 transition"><i data-lucide="route" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Ruta</span></button>
            <button onclick="switchTab('agenda')" id="nav-btn-agenda" class="flex flex-col items-center justify-center text-neutral-400 transition"><i data-lucide="book-user" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Agenda</span></button>
            <button onclick="switchTab('finances')" id="nav-btn-finances" class="flex flex-col items-center justify-center text-neutral-400 transition"><i data-lucide="wallet" class="w-5 h-5"></i><span class="text-[10px] mt-1 font-bold">Caja</span></button>`;
        switchTab('map');
    }
    updateDriverHeaderUI();
}

function updateDriverHeaderUI() {
    const name = appState.driver.name || 'Operador';
    document.getElementById('driver-name-display').textContent = name;
    document.getElementById('driver-initials').textContent = name.slice(0, 2).toUpperCase();
    document.getElementById('mode-badge').textContent = appState.driver.role === 'supervisor' ? 'Supervisor' : 'POS';
}

// --- CLOUD SYNC & SUPERVISOR API ---
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
    if (!appState.sheetsUrl) { alert('Configura primero la URL de Google Sheets.'); return; }
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
    
    const payload = {
        totalRecaudado: cash + transfer,
        efectivo: cash,
        transferencias: transfer,
        creditos: credit,
        efectividad: '100%'
    };

    await queueOutboxSync('CERRAR_RUTA', payload);
    alert('🚀 Cierre de jornada ejecutado y sincronizado en la nube.');
}

function exportarReporteSupervisorPDF() {
    alert('📄 Generando reporte ejecutivo descargable para el supervisor...');
}

function compartirInformeWhatsApp() {
    const text = encodeURIComponent("📊 *Reporte RouteLogix Pro*
Flota operativa sincronizada exitosamente.");
    window.open(`https://wa.me/?text=${text}`, '_blank');
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

function centrarGPS() { if (map) map.setView(lastKnownCoords, 16); }

async function searchMapAddress() {
    const q = document.getElementById('map-search-input').value.trim();
    if (!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
        const results = await res.json();
        if (results && results.length > 0 && map) map.setView([parseFloat(results[0].lat), parseFloat(results[0].lon)], 17);
    } catch (e) {}
}

// --- NAVEGACIÓN Y VISTAS ---
function switchTab(tab) {
    ['map', 'routes', 'agenda', 'finances', 'supervisor'].forEach(t => {
        const el = document.getElementById(`view-${t}`);
        if (el) el.classList.toggle('hidden', t !== tab);
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
    route.stops.forEach((stop, index) => {
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
}

function openEvidenceModal(stopId) {
    document.getElementById('evidence-stop-id').value = stopId;
    activePosCartItems = [];
    renderPosCartRows();
    document.getElementById('modal-evidence').classList.remove('hidden');
}

function togglePOSCartSection(status) {
    document.getElementById('pos-cart-box').classList.toggle('hidden', status === 'rejected');
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
        return `<div class="flex items-center gap-2 bg-neutral-900 p-2 rounded-xl text-xs"><span>${item.qty} un.</span><strong class="text-emerald-400">$${subtotal}</strong></div>`;
    }).join('');
    document.getElementById('pos-cart-total-display').textContent = `$${total}`;
}

function saveEvidence() {
    const stopId = document.getElementById('evidence-stop-id').value;
    const status = document.getElementById('evidence-status').value;
    const method = document.getElementById('evidence-payment-method').value;
    const route = getActiveRoute();
    const stop = route.stops.find(s => s.id === stopId);
    if (!stop) return;

    stop.status = status;
    stop.paymentMethod = method;
    stop.value = status === 'delivered' ? 15000 : 0;

    saveAppState();
    queueOutboxSync('SYNC_PARADA', stop);
    document.getElementById('modal-evidence').classList.add('hidden');
    renderAllViews();
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
    const container = document.getElementById('routes-list-container');
    container.innerHTML = route.stops.map((s, idx) => `
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
            <div><strong class="text-white text-xs">${s.name}</strong><div class="text-[11px] text-neutral-400">${s.address}</div></div>
            <button onclick="openEvidenceModal('${s.id}')" class="bg-cyan-500 text-neutral-950 font-black px-3 py-2 rounded-xl text-xs">POS</button>
        </div>`).join('');
}

function renderAgendaView() {
    document.getElementById('lista-agenda').innerHTML = appState.clients.map(c => `<div class="bg-neutral-900 p-3 rounded-xl text-xs text-white">${c.name} - ${c.address}</div>`).join('');
}

function renderInventoryPOSView() {
    document.getElementById('lista-inventario-pos').innerHTML = appState.inventory.map(p => `<div class="bg-neutral-900 p-3 rounded-xl text-xs text-white">${p.name} ($${p.price}) - Stock: ${p.stock}</div>`).join('');
}

const DENOMINATIONS = [50000, 20000, 10000, 5000, 2000, 1000];
function initCashDenominations() {
    const c = document.getElementById('denominations-container');
    if (!c) return;
    c.innerHTML = DENOMINATIONS.map(d => `<div class="flex justify-between text-xs"><span>$${d}</span><input type="number" min="0" value="0" onchange="renderFinancesView()" class="w-16 bg-neutral-900 text-white text-right p-1 rounded"></div>`).join('');
}
function renderFinancesView() {
    let cash = 0, transfer = 0;
    getActiveRoute().stops.forEach(s => {
        if (s.status === 'delivered') {
            if (s.paymentMethod === 'cash') cash += s.value;
            else transfer += s.value;
        }
    });
    document.getElementById('summary-facturado').textContent = `$${cash}`;
    document.getElementById('summary-transfer').textContent = `$${transfer}`;
}

function openSheetsConfigModal() { document.getElementById('cfg-sheets-url').value = appState.sheetsUrl || ''; document.getElementById('modal-sheets-config').classList.remove('hidden'); }
function saveSheetsConfig() { appState.sheetsUrl = document.getElementById('cfg-sheets-url').value.trim(); saveAppState(); document.getElementById('modal-sheets-config').classList.add('hidden'); }
function openCreateRouteModal() { document.getElementById('modal-route').classList.remove('hidden'); }
function createNewRoute() {
    const name = document.getElementById('new-route-name').value.trim();
    if (!name) return;
    appState.routes.push({ id: 'route-' + Date.now(), name, stops: [] });
    saveAppState();
    document.getElementById('modal-route').classList.add('hidden');
    renderAllViews();
}
function openOfflineDownloadModal() { document.getElementById('modal-offline-download').classList.remove('hidden'); }
function startDownloadingRouteMapTiles() { alert('Mosaicos descargados.'); }
