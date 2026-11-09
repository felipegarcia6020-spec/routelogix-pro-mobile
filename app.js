let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.classList.remove('hidden');
});

function triggerPWAInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                const installBtn = document.getElementById('pwa-install-btn');
                if (installBtn) installBtn.classList.add('hidden');
            }
            deferredPrompt = null;
        });
    } else {
        alert("Para instalar esta aplicacion:\n\n• En Google Chrome (PC/Android): Haz clic en el menu (tres puntos) superior derecho y selecciona 'Instalar aplicacion' o 'Agregar a la pantalla principal'.\n• En Safari (iOS): Toca el boton Compartir y selecciona 'Añadir a inicio'.");
    }
}

let state = {
    user: null,
    transportMode: 'car',
    currentTab: 'map',
    mapTileStyle: 'standard',
    paymentMode: 'cash',
    expandedRouteIds: {},
    expandedStopIds: {},
    routes: [
        {
            id: 'ruta-1',
            name: 'Ruta Principal TaT',
            active: true,
            transportMode: 'car',
            stops: [
                { id: 's1', name: 'Tienda El Progreso', address: 'Calle 10 # 5-20', lat: 4.6097, lng: -74.0817, status: 'pending', value: 125000, paymentMethod: 'cash', evidenceNotes: '', photoData: null, signatureData: null },
                { id: 's2', name: 'Granero Dona Rosa', address: 'Carrera 7 # 12-40', lat: 4.6150, lng: -74.0750, status: 'pending', value: 310000, paymentMethod: 'cash', evidenceNotes: '', photoData: null, signatureData: null },
                { id: 's3', name: 'Minimercado Central', address: 'Calle 19 # 3-15', lat: 4.6030, lng: -74.0700, status: 'pending', value: 180000, paymentMethod: 'cash', evidenceNotes: '', photoData: null, signatureData: null }
            ]
        }
    ],
    agenda: [
        { id: 'c1', name: 'Tienda El Progreso', address: 'Calle 10 # 5-20', phone: '3101234567', debt: 50000, creditLimit: 200000, obs: 'Cliente prioritario' },
        { id: 'c2', name: 'Granero Dona Rosa', address: 'Carrera 7 # 12-40', phone: '3209876543', debt: 0, creditLimit: 500000, obs: 'Pide factura electronica' },
        { id: 'c3', name: 'Supermercado El Vecino', address: 'Calle 22 # 10-50', phone: '3119876543', debt: 120000, creditLimit: 300000, obs: 'Pago puntual' }
    ],
    expenses: [],
    outboxQueue: [],
    cashDenominations: { 
        '100000': 0, '50000': 0, '20000': 0, '10000': 0, 
        '5000': 0, '2000': 0, '1000': 0, 
        'coin_1000': 0, 'coin_500': 0, 'coin_200': 0, 'coin_100': 0, 'coin_50': 0 
    },
    map: null,
    markerList: [],
    polylineLayer: null,
    gpsMarker: null,
    gpsWatchId: null,
    isLiveTracking: true
};

const TRANSPORT_ICONS = {
    walk: { emoji: '🚶', bg: '#06b6d4' },
    bike: { emoji: '🚲', bg: '#10b981' },
    moto: { emoji: '🏍️', bg: '#f59e0b' },
    car: { emoji: '🚗', bg: '#3b82f6' },
    truck: { emoji: '🚚', bg: '#f43f5e' }
};

let db = null;
let sigCanvas = null;
let sigCtx = null;
let isDrawing = false;
let currentPhotoBase64 = null;

function initIndexedDB() {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.open('RouteLogixEnterpriseDB_v22', 1);
            request.onerror = () => resolve(null);
            request.onsuccess = () => {
                db = request.result;
                updateOfflineTilesCountDisplay();
                processOutboxQueue();
                resolve(db);
            };
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains('tiles')) {
                    database.createObjectStore('tiles', { keyPath: 'url' });
                }
                if (!database.objectStoreNames.contains('outbox')) {
                    database.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
                }
            };
        } catch(e) { resolve(null); }
    });
}

function saveTileToDB(url, blob) {
    if (!db) return;
    try {
        const tx = db.transaction('tiles', 'readwrite');
        tx.objectStore('tiles').put({ url, blob, timestamp: Date.now() });
    } catch(err) {}
}

function getTileFromDB(url) {
    return new Promise((resolve) => {
        if (!db) { resolve(null); return; }
        try {
            const tx = db.transaction('tiles', 'readonly');
            const req = tx.objectStore('tiles').get(url);
            req.onsuccess = () => resolve(req.result ? req.result.blob : null);
            req.onerror = () => resolve(null);
        } catch(err) { resolve(null); }
    });
}

function countTilesInDB() {
    return new Promise((resolve) => {
        if (!db) { resolve(0); return; }
        try {
            const tx = db.transaction('tiles', 'readonly');
            const req = tx.objectStore('tiles').count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(0);
        } catch(err) { resolve(0); }
    });
}

async function updateOfflineTilesCountDisplay() {
    const count = await countTilesInDB();
    const statusText = document.getElementById('offline-map-status-text');
    const countText = document.getElementById('offline-tiles-count');
    if (countText) countText.innerText = count + ' tiles';
    if (statusText) {
        statusText.innerText = count > 0 ? `${count} tiles offline` : "Sin descargar";
        statusText.className = count > 0 ? "text-emerald-400 font-bold text-[11px]" : "text-amber-400 font-bold text-[11px]";
    }
}

function enqueueOutboxAction(actionType, payload) {
    if (!db) {
        state.outboxQueue.push({ actionType, payload, timestamp: Date.now() });
        return;
    }
    try {
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').add({ actionType, payload, timestamp: Date.now() });
        processOutboxQueue();
    } catch(e) {}
}

function processOutboxQueue() {
    if (!navigator.onLine || !db) return;
    const syncBadge = document.getElementById('outbox-sync-badge');
    if (syncBadge) syncBadge.classList.remove('hidden');

    try {
        const tx = db.transaction('outbox', 'readwrite');
        const store = tx.objectStore('outbox');
        const req = store.openCursor();
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                setTimeout(() => { store.delete(cursor.primaryKey); }, 500);
                cursor.continue();
            } else {
                setTimeout(() => { if (syncBadge) syncBadge.classList.add('hidden'); }, 1000);
            }
        };
    } catch(e) {
        if (syncBadge) syncBadge.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    loadStateFromStorage();
    initAuthScreen();
    try { lucide.createIcons(); } catch(e){}
    await initIndexedDB().catch(() => {});
    initMap();
    renderAll();
    initDenominationsUI();
    initSignatureCanvas();
    startLiveGPSWatcher();
    window.addEventListener('online', () => { updateNetworkStatus(); processOutboxQueue(); });
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();
});

function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    const badge = document.getElementById('network-status-badge');
    const dot = document.getElementById('network-dot');
    const text = document.getElementById('network-text');
    if (!badge || !dot || !text) return;
    if (isOnline) {
        badge.className = "px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1";
        dot.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse";
        text.innerText = "Online";
        processOutboxQueue();
    } else {
        badge.className = "px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1";
        dot.className = "w-1.5 h-1.5 rounded-full bg-amber-500";
        text.innerText = "Offline (Outbox Activo)";
    }
}

function loadStateFromStorage() {
    const saved = localStorage.getItem('routelogix_enterprise_state_v22');
    if (saved) {
        try { 
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed }; 
        } catch(e) {}
    }
}

function saveStateToStorage() {
    const persistData = {
        user: state.user,
        transportMode: state.transportMode,
        currentTab: state.currentTab,
        mapTileStyle: state.mapTileStyle,
        paymentMode: state.paymentMode,
        expandedRouteIds: state.expandedRouteIds,
        expandedStopIds: state.expandedStopIds,
        routes: state.routes,
        agenda: state.agenda,
        expenses: state.expenses,
        cashDenominations: state.cashDenominations,
        isLiveTracking: state.isLiveTracking
    };
    localStorage.setItem('routelogix_enterprise_state_v22', JSON.stringify(persistData));
}

function initAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (!authScreen) return;
    if (state.user) {
        authScreen.classList.add('hidden');
        updateDriverDisplay();
    } else {
        authScreen.classList.remove('hidden');
    }
}

function switchAuthTab(tab) {
    const btnLogin = document.getElementById('auth-tab-login');
    const btnReg = document.getElementById('auth-tab-register');
    const formLogin = document.getElementById('form-login');
    const formReg = document.getElementById('form-register');
    if (!btnLogin || !btnReg || !formLogin || !formReg) return;
    if (tab === 'login') {
        btnLogin.className = "flex-1 py-2.5 rounded-xl bg-cyan-500 text-neutral-950 shadow-md transition-all";
        btnReg.className = "flex-1 py-2.5 rounded-xl text-neutral-400 hover:text-white transition-all";
        formLogin.classList.remove('hidden'); 
        formReg.classList.add('hidden');
    } else {
        btnReg.className = "flex-1 py-2.5 rounded-xl bg-emerald-500 text-neutral-950 shadow-md transition-all";
        btnLogin.className = "flex-1 py-2.5 rounded-xl text-neutral-400 hover:text-white transition-all";
        formReg.classList.remove('hidden'); 
        formLogin.classList.add('hidden');
    }
}

function handleLoginDirect() {
    const emailInput = document.getElementById('login-email');
    const email = emailInput ? emailInput.value.trim() : "conductor@routelogix.com";
    if (!email) { alert("Ingrese su correo"); return; }
    state.user = { name: email.split('@')[0], email, photo: null };
    saveStateToStorage();
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.add('hidden');
    updateDriverDisplay();
    renderAll();
    if (state.map) setTimeout(() => state.map.invalidateSize(), 200);
}

function handleRegisterDirect() {
    const nameInput = document.getElementById('reg-name');
    const emailInput = document.getElementById('reg-email');
    const name = nameInput ? nameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    if (!name || !email) { alert("Ingrese nombre y correo"); return; }
    state.user = { name, email, photo: null };
    saveStateToStorage();
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.add('hidden');
    updateDriverDisplay();
    renderAll();
    if (state.map) setTimeout(() => state.map.invalidateSize(), 200);
}

function logoutSession() {
    state.user = null;
    saveStateToStorage();
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.remove('hidden');
}

function updateDriverDisplay() {
    if (!state.user) return;
    const nameDisplay = document.getElementById('driver-name-display');
    const initialsDisplay = document.getElementById('driver-initials');
    if (nameDisplay) nameDisplay.innerText = state.user.name;
    if (initialsDisplay) {
        const initials = state.user.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
        initialsDisplay.innerText = initials;
    }
}

function openDriverEditModal() {
    if (!state.user) return;
    const editName = document.getElementById('edit-driver-name');
    const modalDriver = document.getElementById('modal-driver');
    if (editName) editName.value = state.user.name;
    if (modalDriver) modalDriver.classList.remove('hidden');
}

function saveDriverProfile() {
    const editName = document.getElementById('edit-driver-name');
    const modalDriver = document.getElementById('modal-driver');
    if (editName && editName.value) state.user.name = editName.value;
    saveStateToStorage();
    if (modalDriver) modalDriver.classList.add('hidden');
    updateDriverDisplay();
}

function switchTab(tabId) {
    state.currentTab = tabId;
    ['map', 'routes', 'agenda', 'finances'].forEach(t => {
        const sec = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`nav-btn-${t}`);
        if (!sec || !btn) return;
        if (t === tabId) {
            sec.classList.remove('hidden');
            btn.className = "flex flex-col items-center justify-center text-cyan-400 transition";
        } else {
            sec.classList.add('hidden');
            btn.className = "flex flex-col items-center justify-center text-neutral-400 hover:text-white transition";
        }
    });
    if (tabId === 'map' && state.map) setTimeout(() => state.map.invalidateSize(), 200);
    try { lucide.createIcons(); } catch(e){}
}

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    state.map = L.map('map', { zoomControl: false }).setView([4.6097, -74.0817], 14);
    setMapTileStyle('standard');
    setTimeout(() => state.map.invalidateSize(), 300);
}

L.OfflineTileLayer = L.TileLayer.extend({
    createTile: function(coords, done) {
        const tile = document.createElement('img');
        tile.alt = "";
        L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
        L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));
        const url = this.getTileUrl(coords);
        getTileFromDB(url).then(blob => {
            if (blob) {
                tile.src = URL.createObjectURL(blob);
            } else if (navigator.onLine) {
                fetch(url).then(res => res.blob()).then(blobRes => {
                    saveTileToDB(url, blobRes);
                    tile.src = URL.createObjectURL(blobRes);
                    updateOfflineTilesCountDisplay();
                }).catch(() => { tile.src = url; });
            } else {
                tile.src = url;
            }
        });
        return tile;
    }
});

let currentTileLayerObj = null;
const tileUrls = {
    standard: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};

function setMapTileStyle(styleName) {
    state.mapTileStyle = styleName;
    ['standard', 'dark', 'satellite'].forEach(s => {
        const btn = document.getElementById(`style-${s}`);
        if (btn) btn.className = s === styleName ? "px-3 py-1.5 rounded-xl bg-cyan-500 text-neutral-950 font-bold transition" : "px-3 py-1.5 rounded-xl text-neutral-300 hover:text-white font-bold transition";
    });
    if (currentTileLayerObj && state.map) state.map.removeLayer(currentTileLayerObj);
    if (state.map) {
        currentTileLayerObj = new L.OfflineTileLayer(tileUrls[styleName], { maxZoom: 19, subdomains: 'abc' });
        currentTileLayerObj.addTo(state.map);
    }
}

function openOfflineDownloadModal() {
    updateOfflineTilesCountDisplay();
    const modal = document.getElementById('modal-offline-download');
    if (modal) modal.classList.remove('hidden');
}

async function startDownloadingRouteMapTiles() {
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute || activeRoute.stops.length === 0) {
        alert("No hay paradas en la ruta activa.");
        return;
    }
    const progContainer = document.getElementById('download-progress-container');
    const progressBar = document.getElementById('download-progress-bar');
    const syncStatus = document.getElementById('offline-sync-status');
    if (progContainer) progContainer.classList.remove('hidden');
    if (syncStatus) syncStatus.innerText = "Descargando tiles...";

    let lats = activeRoute.stops.map(s => s.lat);
    let lngs = activeRoute.stops.map(s => s.lng);
    let minLat = Math.min(...lats) - 0.02, maxLat = Math.max(...lats) + 0.02;
    let minLng = Math.min(...lngs) - 0.02, maxLng = Math.max(...lngs) + 0.02;

    let tilesToDownload = [];
    [13, 14, 15].forEach(z => {
        let p1 = latLngToTileCoord(minLat, minLng, z);
        let p2 = latLngToTileCoord(maxLat, maxLng, z);
        for (let x = Math.min(p1.x, p2.x); x <= Math.max(p1.x, p2.x); x++) {
            for (let y = Math.min(p1.y, p2.y); y <= Math.max(p1.y, p2.y); y++) {
                tilesToDownload.push(`https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);
            }
        }
    });

    let total = tilesToDownload.length, downloaded = 0;
    for (let url of tilesToDownload) {
        try {
            let res = await fetch(url);
            let blob = await res.blob();
            saveTileToDB(url, blob);
        } catch(e) {}
        downloaded++;
        let pct = Math.round((downloaded / total) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (syncStatus) syncStatus.innerText = `Descargados ${downloaded} / ${total} (${pct}%)`;
    }
    if (syncStatus) syncStatus.innerText = "¡Mapa guardado offline!";
    updateOfflineTilesCountDisplay();
    setTimeout(() => { if (progContainer) progContainer.classList.add('hidden'); }, 3000);
}

function latLngToTileCoord(lat, lng, zoom) {
    let x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
    let y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y };
}

async function clearOfflineMapStorage() {
    if (!confirm("¿Borrar mosaicos offline?")) return;
    if (!db) return;
    try {
        const tx = db.transaction('tiles', 'readwrite');
        tx.objectStore('tiles').clear();
        tx.oncomplete = () => { updateOfflineTilesCountDisplay(); alert("Borrado con exito."); };
    } catch(e) {}
}

function startLiveGPSWatcher() {
    if (!navigator.geolocation) return;
    state.gpsWatchId = navigator.geolocation.watchPosition(pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        const speedMps = pos.coords.speed;
        let speed = (speedMps !== null && speedMps >= 0) ? speedMps * 3.6 : 0;
        updateLiveGPSMarker(lat, lng, speed);
        if (state.isLiveTracking && state.map && state.currentTab === 'map') {
            state.map.setView([lat, lng], state.map.getZoom());
        }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });
}

function updateLiveGPSMarker(lat, lng, speed) {
    if (!state.map) return;
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    const mode = activeRoute ? (activeRoute.transportMode || 'car') : 'car';
    const cfg = TRANSPORT_ICONS[mode] || TRANSPORT_ICONS['car'];

    const speedDisplay = document.getElementById('live-speed-display');
    const iconIndicator = document.getElementById('transport-icon-indicator');
    if (speedDisplay) speedDisplay.innerText = speed.toFixed(1) + ' km/h';
    if (iconIndicator) iconIndicator.innerText = cfg.emoji;

    const markerHtml = `<div style="background-color: ${cfg.bg}; width: 40px; height: 40px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 3px solid #030712; box-shadow: 0 0 20px rgba(6,182,212,0.6);">${cfg.emoji}</div>`;
    const customIcon = L.divIcon({ html: markerHtml, className: 'gps-transport-marker', iconSize: [4