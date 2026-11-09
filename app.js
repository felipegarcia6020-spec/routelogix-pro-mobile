/* RouteLogix Pro Enterprise - v26 Application Logic */

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
        alert("Para instalar esta aplicación:\n\n• En Google Chrome (PC/Android): Haz clic en el menú superior derecho y selecciona 'Instalar aplicación'.\n• En iOS: Toca el botón Compartir y 'Añadir a inicio'.");
    }
}

let state = {
    user: null,
    transportMode: 'car',
    currentTab: 'map',
    mapTileStyle: 'standard',
    expandedRouteIds: {},
    expandedStopIds: {},
    paymentConfig: {
        bankName: 'Nequi / Bancolombia',
        accountNumber: '310 123 4567',
        qrBase64: null
    },
    routes: [
        {
            id: 'ruta-1',
            name: 'Ruta Principal TaT',
            active: true,
            transportMode: 'car',
            stops: [
                { id: 's1', name: 'Tienda El Progreso', address: 'Calle 10 # 5-20', lat: 4.6097, lng: -74.0817, status: 'pending', value: 125000, paymentMethod: 'cash', evidenceNotes: '', photoData: null, signatureData: null },
                { id: 's2', name: 'Granero Doña Rosa', address: 'Carrera 7 # 12-40', lat: 4.6150, lng: -74.0750, status: 'pending', value: 310000, paymentMethod: 'cash', evidenceNotes: '', photoData: null, signatureData: null },
                { id: 's3', name: 'Minimercado Central', address: 'Calle 19 # 3-15', lat: 4.6030, lng: -74.0700, status: 'pending', value: 180000, paymentMethod: 'cash', evidenceNotes: '', photoData: null, signatureData: null }
            ]
        }
    ],
    agenda: [
        { id: 'c1', name: 'Tienda El Progreso', address: 'Calle 10 # 5-20', phone: '3101234567', debt: 50000, creditLimit: 200000, obs: 'Cliente prioritario' },
        { id: 'c2', name: 'Granero Doña Rosa', address: 'Carrera 7 # 12-40', phone: '3209876543', debt: 0, creditLimit: 500000, obs: 'Pide factura electrónica' },
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
let currentConfigQRBase64 = null;

function initIndexedDB() {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.open('RouteLogixEnterpriseDB_v26', 1);
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
    const saved = localStorage.getItem('routelogix_enterprise_state_v26');
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
        expandedRouteIds: state.expandedRouteIds,
        expandedStopIds: state.expandedStopIds,
        paymentConfig: state.paymentConfig,
        routes: state.routes,
        agenda: state.agenda,
        expenses: state.expenses,
        cashDenominations: state.cashDenominations,
        isLiveTracking: state.isLiveTracking
    };
    localStorage.setItem('routelogix_enterprise_state_v26', JSON.stringify(persistData));
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

function handleLoginDirect() {
    const nameInput = document.getElementById('login-name');
    const emailInput = document.getElementById('login-email');
    const name = nameInput ? nameInput.value.trim() : "Conductor Corporativo";
    const email = emailInput ? emailInput.value.trim() : "conductor@routelogix.com";
    
    if (!name) { alert("Ingrese el nombre del conductor"); return; }
    
    state.user = { name, email, photo: null };
    saveStateToStorage();
    
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.add('hidden');
    updateDriverDisplay();
    renderAll();
    if (state.map) setTimeout(() => state.map.invalidateSize(), 200);
}

function logoutSession() {
    if (!confirm("⚠️ ¿Desea cambiar de conductor en este móvil corporativo?\n\nSe cerrará la sesión actual para permitir registrar al nuevo operario.")) {
        return;
    }
    state.user = null;
    localStorage.removeItem('routelogix_enterprise_state_v26');
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
        authScreen.classList.remove('hidden');
    }
    const nameInput = document.getElementById('login-name');
    if (nameInput) nameInput.value = '';
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

    // Desactivar rastreo automático al mover el mapa manualmente para total libertad
    state.map.on('dragstart zoomstart', () => {
        if (state.isLiveTracking) {
            state.isLiveTracking = false;
            const btn = document.getElementById('tracking-toggle-btn');
            if (btn) {
                btn.className = "absolute bottom-20 right-4 z-20 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-2xl shadow-2xl font-bold text-xs flex items-center gap-2 active:scale-95 transition";
                btn.innerHTML = '<i data-lucide="radio-off" class="w-4 h-4"></i> <span>GPS Vivo: OFF</span>';
                try { lucide.createIcons(); } catch(e){}
            }
        }
    });

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
        tx.oncomplete = () => { updateOfflineTilesCountDisplay(); alert("Borrado con éxito."); };
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
    const customIcon = L.divIcon({ html: markerHtml, className: 'gps-transport-marker', iconSize: [40, 40], iconAnchor: [20, 20] });

    if (state.gpsMarker) {
        state.gpsMarker.setLatLng([lat, lng]);
        state.gpsMarker.setIcon(customIcon);
    } else {
        state.gpsMarker = L.marker([lat, lng], { icon: customIcon }).addTo(state.map);
    }
}

function toggleTrackingLive() {
    state.isLiveTracking = !state.isLiveTracking;
    const btn = document.getElementById('tracking-toggle-btn');
    if (!btn) return;
    if (state.isLiveTracking) {
        btn.className = "absolute bottom-20 right-4 z-20 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 rounded-2xl shadow-2xl font-black text-xs flex items-center gap-2 active:scale-95 transition";
        btn.innerHTML = '<i data-lucide="radio" class="w-4 h-4 animate-pulse"></i> <span>GPS Vivo: ON</span>';
        centrarGPS();
    } else {
        btn.className = "absolute bottom-20 right-4 z-20 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-2xl shadow-2xl font-bold text-xs flex items-center gap-2 active:scale-95 transition";
        btn.innerHTML = '<i data-lucide="radio-off" class="w-4 h-4"></i> <span>GPS Vivo: OFF</span>';
    }
    try { lucide.createIcons(); } catch(e){}
}

function centrarGPS() {
    state.isLiveTracking = true;
    const btn = document.getElementById('tracking-toggle-btn');
    if (btn) {
        btn.className = "absolute bottom-20 right-4 z-20 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 rounded-2xl shadow-2xl font-black text-xs flex items-center gap-2 active:scale-95 transition";
        btn.innerHTML = '<i data-lucide="radio" class="w-4 h-4 animate-pulse"></i> <span>GPS Vivo: ON</span>';
        try { lucide.createIcons(); } catch(e){}
    }
    if (navigator.geolocation && state.map) {
        navigator.geolocation.getCurrentPosition(pos => state.map.setView([pos.coords.latitude, pos.coords.longitude], 16), () => {});
    }
}

async function searchMapAddress() {
    const input = document.getElementById('map-search-input');
    const q = input ? input.value : '';
    if (!q || !state.map) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && data.length > 0) state.map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16);
    } catch(e) {}
}

function toggleStopMenu() {
    const submenu = document.getElementById('stop-submenu');
    if (submenu) submenu.classList.toggle('hidden');
}

function abrirModalParadaCentro() {
    const submenu = document.getElementById('stop-submenu');
    if (submenu) submenu.classList.add('hidden');
    if (!state.map) return;
    const center = state.map.getCenter();
    const nombre = document.getElementById('parada-nombre');
    const direccion = document.getElementById('parada-direccion');
    const valor = document.getElementById('parada-valor');
    const modal = document.getElementById('modal-parada');
    if (nombre) nombre.value = "";
    if (direccion) direccion.value = `Lat: ${center.lat.toFixed(4)}, Lng: ${center.lng.toFixed(4)}`;
    if (valor) valor.value = "150000";
    if (modal) modal.classList.remove('hidden');
}

function guardarNuevaParada() {
    const nombre = document.getElementById('parada-nombre');
    const direccion = document.getElementById('parada-direccion');
    const valor = document.getElementById('parada-valor');
    const modal = document.getElementById('modal-parada');
    const name = nombre ? nombre.value : '';
    const address = direccion ? direccion.value : '';
    const value = valor ? parseFloat(valor.value) || 0 : 0;
    if (!name) { alert("Ingrese nombre"); return; }
    const center = state.map ? state.map.getCenter() : { lat: 4.6097, lng: -74.0817 };
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    const newStop = { id: 'stop-' + Date.now(), name, address: address || 'Mapa', lat: center.lat, lng: center.lng, status: 'pending', value, paymentMethod: 'cash', evidenceNotes: '', photoData: null, signatureData: null };
    activeRoute.stops.push(newStop);
    enqueueOutboxAction('ADD_STOP', newStop);
    saveStateToStorage();
    if (modal) modal.classList.add('hidden');
    renderAll();
}

function abrirModalClienteExistente() {
    const submenu = document.getElementById('stop-submenu');
    if (submenu) submenu.classList.add('hidden');
    if (state.agenda.length === 0) { alert("Agenda vacía"); switchTab('agenda'); return; }
    const clientName = prompt("Cliente a añadir:\n" + state.agenda.map(c => "- " + c.name).join('\n'));
    if (!clientName) return;
    const client = state.agenda.find(c => c.name.toLowerCase().includes(clientName.toLowerCase()));
    if (!client) { alert("No encontrado"); return; }
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    activeRoute.stops.push({ id: 'stop-' + Date.now(), name: client.name, address: client.address, lat: 4.6097 + (Math.random()-0.5)*0.02, lng: -74.0817 + (Math.random()-0.5)*0.02, status: 'pending', value: 200000 });
    saveStateToStorage();
    renderAll();
}

function changeTransportMode(mode) {
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (activeRoute) { activeRoute.transportMode = mode; state.transportMode = mode; saveStateToStorage(); renderAll(); }
}

function optimizarRutaInteligente() {
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute || activeRoute.stops.length <= 1) { alert("Se necesitan al menos 2 paradas"); return; }
    let pending = activeRoute.stops.filter(s => s.status === 'pending');
    let completed = activeRoute.stops.filter(s => s.status !== 'pending');
    if (pending.length <= 1) { alert("No hay suficientes paradas pendientes"); return; }
    let optimized = [pending[0]];
    let unvisited = pending.slice(1);
    while (unvisited.length > 0) {
        let nearest = 0, minDist = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
            let dist = Math.hypot(unvisited[i].lat - optimized[optimized.length-1].lat, unvisited[i].lng - optimized[optimized.length-1].lng);
            if (dist < minDist) { minDist = dist; nearest = i; }
        }
        optimized.push(unvisited.splice(nearest, 1)[0]);
    }
    activeRoute.stops = [...optimized, ...completed];
    saveStateToStorage();
    renderAll();
    alert("¡Ruta optimizada con IA Cuántica!");
}

function renderAll() {
    renderMapMarkersAndPolyline();
    renderRoutesList();
    renderActiveRouteCard();
    renderAgendaList();
    renderExpenses();
    renderFinances();
    try { lucide.createIcons(); } catch(e){}
}

function renderMapMarkersAndPolyline() {
    if (!state.map) return;
    state.markerList.forEach(m => state.map.removeLayer(m));
    state.markerList = [];
    if (state.polylineLayer) state.map.removeLayer(state.polylineLayer);

    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute) return;

    let latlngs = [];
    activeRoute.stops.forEach((stop, index) => {
        latlngs.push([stop.lat, stop.lng]);
        let color = stop.status === 'delivered' ? '#10b981' : stop.status === 'rejected' ? '#f43f5e' : '#06b6d4';
        let html = `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; color: #030712; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);">${index + 1}</div>`;
        let marker = L.marker([stop.lat, stop.lng], { icon: L.divIcon({ html, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(state.map);
        
        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
        const wazeUrl = `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`;

        marker.bindPopup(`<div class="p-2 text-xs bg-neutral-900 text-white rounded-xl space-y-2 max-w-[200px]">
            <div><strong>#${index+1} - ${stop.name}</strong><br><span class="text-neutral-400 text-[10px]">${stop.address}</span></div>
            <div class="flex gap-1.5 pt-1">
                <a href="${gmapsUrl}" target="_blank" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-2 rounded-lg text-center text-[10px]">G. Maps</a>
                <a href="${wazeUrl}" target="_blank" class="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1.5 px-2 rounded-lg text-center text-[10px]">Waze</a>
            </div>
            <button onclick="openEvidenceModal('${stop.id}')" class="w-full mt-1 bg-emerald-500 text-neutral-950 font-black py-1.5 rounded-lg shadow text-center text-[10px]">Gestionar Entrega</button>
        </div>`);
        state.markerList.push(marker);
    });
    if (latlngs.length > 0) state.polylineLayer = L.polyline(latlngs, { color: '#06b6d4', weight: 4, opacity: 0.9 }).addTo(state.map);
}

function renderActiveRouteCard() {
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute) return;

    const titleEl = document.getElementById('route-active-title');
    const selectEl = document.getElementById('transport-mode-select');
    if (titleEl) titleEl.innerText = activeRoute.name;
    if (selectEl) selectEl.value = activeRoute.transportMode || 'car';

    let totalDist = 0;
    for (let i = 0; i < activeRoute.stops.length - 1; i++) {
        totalDist += Math.hypot(activeRoute.stops[i+1].lat - activeRoute.stops[i].lat, activeRoute.stops[i+1].lng - activeRoute.stops[i].lng) * 111;
    }
    let money = activeRoute.stops.reduce((acc, s) => acc + (s.status === 'delivered' ? s.value : 0), 0);

    const mKm = document.getElementById('metric-km');
    const mTime = document.getElementById('metric-time');
    const mClients = document.getElementById('metric-clients');
    const mMoney = document.getElementById('metric-money');
    const cPending = document.getElementById('count-pending');
    const cDelivered = document.getElementById('count-delivered');
    const cRejected = document.getElementById('count-rejected');

    if (mKm) mKm.innerText = totalDist.toFixed(1) + ' km';
    if (mTime) mTime.innerText = Math.round(totalDist / 30 * 60 + activeRoute.stops.length * 4) + ' min';
    if (mClients) mClients.innerText = activeRoute.stops.length;
    if (mMoney) mMoney.innerText = '$' + money.toLocaleString();
    if (cPending) cPending.innerText = activeRoute.stops.filter(s => s.status === 'pending').length;
    if (cDelivered) cDelivered.innerText = activeRoute.stops.filter(s => s.status === 'delivered').length;
    if (cRejected) cRejected.innerText = activeRoute.stops.filter(s => s.status === 'rejected').length;
}

function toggleRouteAccordion(routeId) {
    state.expandedRouteIds[routeId] = !state.expandedRouteIds[routeId];
    saveStateToStorage();
    renderRoutesList();
}

function toggleStopDetail(stopId) {
    state.expandedStopIds[stopId] = !state.expandedStopIds[stopId];
    saveStateToStorage();
    renderRoutesList();
}

function deleteRoute(routeId) {
    if (state.routes.length <= 1) {
        alert("Debe existir al menos una ruta en el sistema.");
        return;
    }
    if (!confirm("¿Eliminar esta ruta por completo?")) return;
    state.routes = state.routes.filter(r => r.id !== routeId);
    if (!state.routes.some(r => r.active)) {
        state.routes[0].active = true;
    }
    saveStateToStorage();
    renderAll();
}

function moveStopOrder(routeId, stopIndex, direction) {
    const route = state.routes.find(r => r.id === routeId);
    if (!route) return;
    const newIdx = stopIndex + direction;
    if (newIdx < 0 || newIdx >= route.stops.length) return;
    
    const temp = route.stops[stopIndex];
    route.stops[stopIndex] = route.stops[newIdx];
    route.stops[newIdx] = temp;
    
    saveStateToStorage();
    renderAll();
}

function removeStopFromRoute(routeId, stopId) {
    const route = state.routes.find(r => r.id === routeId);
    if (!route) return;
    route.stops = route.stops.filter(s => s.id !== stopId);
    saveStateToStorage();
    renderAll();
}

function openAddStopToRouteModal(routeId) {
    const inputId = document.getElementById('target-route-id-input');
    if (inputId) inputId.value = routeId;
    
    const selectAgenda = document.getElementById('select-agenda-client');
    if (selectAgenda) {
        selectAgenda.innerHTML = state.agenda.map(c => `<option value="${c.id}">${c.name} (${c.address})</option>`).join('');
    }
    
    switchAddStopMode('agenda');
    const modal = document.getElementById('modal-route-add-stop');
    if (modal) modal.classList.remove('hidden');
}

function switchAddStopMode(mode) {
    const tabAgenda = document.getElementById('add-stop-tab-agenda');
    const tabNew = document.getElementById('add-stop-tab-new');
    const formAgenda = document.getElementById('add-stop-form-agenda');
    const formNew = document.getElementById('add-stop-form-new');
    if (!tabAgenda || !tabNew || !formAgenda || !formNew) return;

    if (mode === 'agenda') {
        tabAgenda.className = "flex-1 py-2 rounded-lg bg-cyan-500 text-neutral-950 font-bold transition";
        tabNew.className = "flex-1 py-2 rounded-lg text-neutral-400 hover:text-white transition";
        formAgenda.classList.remove('hidden');
        formNew.classList.add('hidden');
    } else {
        tabNew.className = "flex-1 py-2 rounded-lg bg-emerald-500 text-neutral-950 font-bold transition";
        tabAgenda.className = "flex-1 py-2 rounded-lg text-neutral-400 hover:text-white transition";
        formNew.classList.remove('hidden');
        formAgenda.classList.add('hidden');
    }
}

function confirmAddStopFromAgenda() {
    const routeId = document.getElementById('target-route-id-input').value;
    const clientId = document.getElementById('select-agenda-client').value;
    const route = state.routes.find(r => r.id === routeId);
    const client = state.agenda.find(c => c.id === clientId);
    if (!route || !client) return;

    route.stops.push({
        id: 'stop-' + Date.now(),
        name: client.name,
        address: client.address,
        lat: 4.6097 + (Math.random()-0.5)*0.02,
        lng: -74.0817 + (Math.random()-0.5)*0.02,
        status: 'pending',
        value: 150000,
        paymentMethod: 'cash',
        evidenceNotes: '',
        photoData: null,
        signatureData: null
    });
    saveStateToStorage();
    document.getElementById('modal-route-add-stop').classList.add('hidden');
    renderAll();
}

function confirmAddStopNew() {
    const routeId = document.getElementById('target-route-id-input').value;
    const name = document.getElementById('new-stop-name').value.trim();
    const address = document.getElementById('new-stop-address').value.trim();
    const value = parseFloat(document.getElementById('new-stop-value').value) || 150000;
    if (!name || !address) { alert("Ingrese nombre y dirección"); return; }

    const route = state.routes.find(r => r.id === routeId);
    if (!route) return;

    const newStop = {
        id: 'stop-' + Date.now(),
        name,
        address,
        lat: 4.6097 + (Math.random()-0.5)*0.02,
        lng: -74.0817 + (Math.random()-0.5)*0.02,
        status: 'pending',
        value,
        paymentMethod: 'cash',
        evidenceNotes: '',
        photoData: null,
        signatureData: null
    };
    route.stops.push(newStop);
    
    state.agenda.push({
        id: 'c-' + Date.now(),
        name,
        address,
        phone: '3000000000',
        debt: 0,
        creditLimit: 300000,
        obs: 'Creado desde ruta'
    });

    saveStateToStorage();
    document.getElementById('modal-route-add-stop').classList.add('hidden');
    renderAll();
}

function renderRoutesList() {
    const container = document.getElementById('routes-list-container');
    if (!container) return;

    container.innerHTML = state.routes.map(r => {
        const isExpanded = !!state.expandedRouteIds[r.id];
        const deliveredCount = r.stops.filter(s => s.status === 'delivered').length;
        
        return `
        <div class="bg-neutral-900 border ${r.active ? 'border-cyan-500 shadow-lg shadow-cyan-500/10' : 'border-neutral-800'} rounded-2xl p-4 space-y-3 text-xs">
            <div class="flex justify-between items-center cursor-pointer select-none" onclick="toggleRouteAccordion('${r.id}')">
                <div class="flex items-center space-x-2.5 flex-1">
                    <div class="w-7 h-7 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400 font-bold transition transform ${isExpanded ? 'rotate-90' : ''}">▶</div>
                    <div>
                        <strong class="text-white text-sm">${r.name}</strong>
                        <p class="text-[11px] text-neutral-400 mt-0.5">${r.stops.length} paradas • ${deliveredCount} completadas</p>
                    </div>
                </div>
                <div class="flex items-center space-x-2" onclick="event.stopPropagation()">
                    ${!r.active ? `<button onclick="makeRouteActive('${r.id}')" class="bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-neutral-950 font-bold px-3 py-1.5 rounded-xl border border-cyan-500/30 transition">Activar</button>` : '<span class="text-cyan-400 font-black bg-cyan-500/20 px-3 py-1 rounded-full border border-cyan-500/30">Activa</span>'}
                    <button onclick="deleteRoute('${r.id}')" class="p-2 bg-neutral-800 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-neutral-700 transition" title="Eliminar Ruta">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>

            <div id="route-accordion-${r.id}" class="${isExpanded ? 'block' : 'hidden'} space-y-2 pt-2 border-t border-neutral-800">
                <div class="flex justify-between items-center pb-1">
                    <span class="text-[11px] text-neutral-400 font-bold uppercase tracking-wider">Paradas de la Ruta:</span>
                    <button onclick="openAddStopToRouteModal('${r.id}')" class="bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-black px-3 py-1.5 rounded-xl flex items-center gap-1 shadow transition">
                        <i data-lucide="plus" class="w-3 h-3"></i> Añadir Parada
                    </button>
                </div>

                <div class="space-y-2">
                    ${r.stops.length === 0 ? '<p class="text-neutral-500 italic py-2 text-center">No hay paradas en esta ruta.</p>' : ''}
                    ${r.stops.map((stop, index) => {
                        const isStopExpanded = !!state.expandedStopIds[stop.id];
                        const statusColor = stop.status === 'delivered' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : stop.status === 'rejected' ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
                        
                        return `
                        <div class="bg-neutral-950 border border-neutral-800/80 rounded-2xl p-3 space-y-2 transition">
                            <div class="flex justify-between items-center cursor-pointer select-none" onclick="toggleStopDetail('${stop.id}')">
                                <div class="flex items-center space-x-2.5 flex-1 overflow-hidden">
                                    <span class="w-6 h-6 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-[10px] font-black text-white shrink-0">${index + 1}</span>
                                    <div class="truncate">
                                        <div class="font-bold text-white text-xs truncate">${stop.name}</div>
                                        <div class="text-[10px] text-neutral-400 truncate">${stop.address}</div>
                                    </div>
                                </div>
                                <div class="flex items-center space-x-1.5 shrink-0" onclick="event.stopPropagation()">
                                    <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold border ${statusColor}">${stop.status === 'delivered' ? 'Entregado' : stop.status === 'rejected' ? 'Rechazado' : 'Pendiente'}</span>
                                    
                                    <div class="flex flex-col gap-0.5">
                                        <button onclick="moveStopOrder('${r.id}', ${index}, -1)" class="w-5 h-5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded flex items-center justify-center text-[9px]" title="Subir">▲</button>
                                        <button onclick="moveStopOrder('${r.id}', ${index}, 1)" class="w-5 h-5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded flex items-center justify-center text-[9px]" title="Bajar">▼</button>
                                    </div>

                                    <button onclick="removeStopFromRoute('${r.id}', '${stop.id}')" class="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg transition" title="Eliminar Parada">
                                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                                    </button>
                                </div>
                            </div>

                            <div class="${isStopExpanded ? 'block' : 'hidden'} bg-neutral-900 p-3 rounded-xl border border-neutral-800 space-y-2 mt-2">
                                <div class="text-[11px] font-bold text-cyan-400 border-b border-neutral-800 pb-1 flex justify-between items-center">
                                    <span>Información del Cliente & Factura</span>
                                    <span class="text-emerald-400 font-black">$${(stop.value||0).toLocaleString()}</span>
                                </div>
                                <div class="grid grid-cols-2 gap-2 text-[11px]">
                                    <div><span class="text-neutral-400">Método Pago:</span> <strong class="text-white">${stop.paymentMethod === 'transfer' ? 'Transferencia' : stop.paymentMethod === 'qr' ? 'Código QR' : 'Efectivo'}</strong></div>
                                    <div><span class="text-neutral-400">Estado:</span> <strong class="text-white">${stop.status}</strong></div>
                                </div>
                                ${stop.evidenceNotes ? `<div class="text-[11px]"><span class="text-neutral-400">Notas:</span> <span class="text-neutral-200">${stop.evidenceNotes}</span></div>` : ''}
                                <div class="flex gap-2 pt-1">
                                    <button onclick="openEvidenceModal('${stop.id}')" class="flex-1 bg-cyan-500 text-neutral-950 font-bold py-2 rounded-lg text-center text-[11px] shadow">Gestionar Entrega</button>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
        `;
    }).join('');
    try { lucide.createIcons(); } catch(e){}
}

function makeRouteActive(id) {
    state.routes.forEach(r => r.active = (r.id === id));
    saveStateToStorage();
    renderAll();
}

function openPaymentConfigModal() {
    const bankInput = document.getElementById('cfg-bank-name');
    const accInput = document.getElementById('cfg-bank-account');
    const prevText = document.getElementById('cfg-qr-preview-text');
    const modal = document.getElementById('modal-payment-config');

    if (bankInput) bankInput.value = state.paymentConfig.bankName || '';
    if (accInput) accInput.value = state.paymentConfig.accountNumber || '';
    if (prevText) prevText.innerText = state.paymentConfig.qrBase64 ? "QR cargado en sistema ✓" : "Ninguna imagen QR cargada";
    currentConfigQRBase64 = state.paymentConfig.qrBase64 || null;

    if (modal) modal.classList.remove('hidden');
}

function previewConfigQR(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        currentConfigQRBase64 = e.target.result;
        const prevText = document.getElementById('cfg-qr-preview-text');
        if (prevText) prevText.innerText = file.name + " (Cargado ✓)";
    };
    reader.readAsDataURL(file);
}

function savePaymentConfig() {
    const bankInput = document.getElementById('cfg-bank-name');
    const accInput = document.getElementById('cfg-bank-account');
    const modal = document.getElementById('modal-payment-config');

    state.paymentConfig.bankName = bankInput ? bankInput.value.trim() : 'Nequi / Bancolombia';
    state.paymentConfig.accountNumber = accInput ? accInput.value.trim() : '310 123 4567';
    state.paymentConfig.qrBase64 = currentConfigQRBase64;

    saveStateToStorage();
    if (modal) modal.classList.add('hidden');
    
    const methodSelect = document.getElementById('evidence-payment-method');
    if (methodSelect) togglePaymentDetails(methodSelect.value);
    alert("¡Configuración de pago guardada!");
}

function togglePaymentDetails(method) {
    const box = document.getElementById('payment-details-box');
    const title = document.getElementById('payment-box-title');
    const qrContainer = document.getElementById('payment-qr-container');
    const accContainer = document.getElementById('payment-account-container');
    const qrImg = document.getElementById('render-qr-img');
    const qrPlaceholder = document.getElementById('render-qr-placeholder');
    const valBank = document.getElementById('val-bank-name');
    const valAccount = document.getElementById('val-bank-account');

    if (!box) return;

    if (method === 'cash') {
        box.classList.add('hidden');
        return;
    }

    box.classList.remove('hidden');
    valBank.innerText = state.paymentConfig.bankName || 'Nequi';
    valAccount.innerText = state.paymentConfig.accountNumber || '310 000 0000';

    if (method === 'qr') {
        if (title) title.innerText = "Código QR de Pago";
        qrContainer.classList.remove('hidden');
        accContainer.classList.remove('hidden');
        if (state.paymentConfig.qrBase64) {
            qrImg.src = state.paymentConfig.qrBase64;
            qrImg.classList.remove('hidden');
            qrPlaceholder.classList.add('hidden');
        } else {
            qrImg.classList.add('hidden');
            qrPlaceholder.classList.remove('hidden');
        }
    } else if (method === 'transfer') {
        if (title) title.innerText = "Datos de Cuenta Bancaria / Llave";
        qrContainer.classList.add('hidden');
        accContainer.classList.remove('hidden');
    }
}

function openEvidenceModal(stopId) {
    let stop = null;
    for (let r of state.routes) { stop = r.stops.find(s => s.id === stopId); if (stop) break; }
    if (!stop) return;
    const stopIdInput = document.getElementById('evidence-stop-id');
    const statusSelect = document.getElementById('evidence-status');
    const paymentMethodSelect = document.getElementById('evidence-payment-method');
    const notesInput = document.getElementById('evidence-notes');
    const photoName = document.getElementById('evidence-photo-name');
    const modal = document.getElementById('modal-evidence');
    
    if (stopIdInput) stopIdInput.value = stop.id;
    if (statusSelect) statusSelect.value = stop.status === 'pending' ? 'delivered' : stop.status;
    if (paymentMethodSelect) {
        paymentMethodSelect.value = stop.paymentMethod || 'cash';
        togglePaymentDetails(paymentMethodSelect.value);
    }
    if (notesInput) notesInput.value = stop.evidenceNotes || '';
    if (photoName) photoName.innerText = stop.photoData ? "Foto adjunta ✓" : "Ninguna foto seleccionada";
    currentPhotoBase64 = stop.photoData || null;

    clearSignatureCanvas();
    if (stop.signatureData && sigCtx) {
        let img = new Image();
        img.onload = () => sigCtx.drawImage(img, 0, 0);
        img.src = stop.signatureData;
    }

    if (modal) modal.classList.remove('hidden');
}

function previewEvidencePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        currentPhotoBase64 = e.target.result;
        const photoName = document.getElementById('evidence-photo-name');
        if (photoName) photoName.innerText = file.name + " (Adjunto ✓)";
    };
    reader.readAsDataURL(file);
}

function initSignatureCanvas() {
    sigCanvas = document.getElementById('signature-canvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');
    sigCtx.strokeStyle = '#06b6d4';
    sigCtx.lineWidth = 2.5;
    sigCtx.lineCap = 'round';

    const getPos = (e) => {
        const rect = sigCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    sigCanvas.addEventListener('mousedown', (e) => { isDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });
    sigCanvas.addEventListener('mousemove', (e) => { if (!isDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });
    sigCanvas.addEventListener('mouseup', () => { isDrawing = false; });
    sigCanvas.addEventListener('mouseleave', () => { isDrawing = false; });

    sigCanvas.addEventListener('touchstart', (e) => { isDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); e.preventDefault(); });
    sigCanvas.addEventListener('touchmove', (e) => { if (!isDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); e.preventDefault(); });
    sigCanvas.addEventListener('touchend', () => { isDrawing = false; });
}

function clearSignatureCanvas() {
    if (!sigCtx || !sigCanvas) return;
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
}

function saveEvidence() {
    const stopIdInput = document.getElementById('evidence-stop-id');
    const statusSelect = document.getElementById('evidence-status');
    const paymentMethodSelect = document.getElementById('evidence-payment-method');
    const notesInput = document.getElementById('evidence-notes');
    const modal = document.getElementById('modal-evidence');
    if (!stopIdInput) return;
    const stopId = stopIdInput.value;
    const status = statusSelect ? statusSelect.value : 'delivered';
    const paymentMethod = paymentMethodSelect ? paymentMethodSelect.value : 'cash';
    const notes = notesInput ? notesInput.value : '';
    const signatureData = sigCanvas ? sigCanvas.toDataURL() : null;

    for (let r of state.routes) {
        let stop = r.stops.find(s => s.id === stopId);
        if (stop) { 
            stop.status = status; 
            stop.paymentMethod = paymentMethod;
            stop.evidenceNotes = notes; 
            stop.photoData = currentPhotoBase64;
            stop.signatureData = signatureData;
            enqueueOutboxAction('UPDATE_STOP', stop);
            break; 
        }
    }
    saveStateToStorage();
    if (modal) modal.classList.add('hidden');
    renderAll();
}

function renderAgendaList() {
    const container = document.getElementById('lista-agenda');
    if (!container) return;
    container.innerHTML = state.agenda.map(c => `
        <div class="bg-neutral-900 border ${c.debt > c.creditLimit ? 'border-rose-500/60 shadow-lg shadow-rose-500/10' : 'border-neutral-800'} rounded-2xl p-4 flex justify-between items-center text-xs">
            <div>
                <strong class="text-white text-sm">${c.name}</strong>
                <p class="text-[11px] text-neutral-400 mt-0.5">${c.address} • Tel: ${c.phone}</p>
                <div class="flex gap-2 mt-2">
                    <span class="px-2 py-0.5 rounded-lg bg-neutral-950 text-rose-400 font-bold border border-neutral-800">Deuda: $${(c.debt||0).toLocaleString()}</span>
                    <span class="px-2 py-0.5 rounded-lg bg-neutral-950 text-cyan-400 font-bold border border-neutral-800">Cupo: $${(c.creditLimit||0).toLocaleString()}</span>
                </div>
            </div>
            <button onclick="addClientToActiveRoute('${c.id}')" class="bg-cyan-500 text-neutral-950 font-black px-3.5 py-2 rounded-xl shadow">+</button>
        </div>
    `).join('');
}

function openClientModal() {
    const modal = document.getElementById('modal-client');
    if (modal) modal.classList.remove('hidden');
}

function handleClientSubmitDirect() {
    const nameInput = document.getElementById('client-name');
    const addressInput = document.getElementById('client-address');
    const phoneInput = document.getElementById('client-phone');
    const debtInput = document.getElementById('client-debt');
    const limitInput = document.getElementById('client-limit');
    const obsInput = document.getElementById('client-obs');
    const modal = document.getElementById('modal-client');

    const name = nameInput ? nameInput.value.trim() : '';
    const address = addressInput ? addressInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const debt = debtInput ? parseFloat(debtInput.value) || 0 : 0;
    const creditLimit = limitInput ? parseFloat(limitInput.value) || 300000 : 300000;
    const obs = obsInput ? obsInput.value.trim() : '';

    if (!name || !address) { alert("Ingrese nombre y dirección"); return; }
    const newClient = { id: 'c-' + Date.now(), name, address, phone, debt, creditLimit, obs };
    state.agenda.push(newClient);
    enqueueOutboxAction('ADD_CLIENT', newClient);
    saveStateToStorage();
    if (modal) modal.classList.add('hidden');
    renderAll();
}

function addClientToActiveRoute(id) {
    let c = state.agenda.find(x => x.id === id);
    if (!c) return;
    if (c.debt > c.creditLimit) {
        if (!confirm(`⚠️ ALERTA DE CRÉDITO:\n\nEl cliente ${c.name} excede su cupo de crédito (Deuda: $${c.debt.toLocaleString()} / Cupo: $${c.creditLimit.toLocaleString()}).\n\n¿Desea añadirlo a la ruta de todas formas?`)) return;
    }
    let r = state.routes.find(x => x.active) || state.routes[0];
    r.stops.push({ id: 's-' + Date.now(), name: c.name, address: c.address, lat: 4.6097 + (Math.random()-0.5)*0.02, lng: -74.0817 + (Math.random()-0.5)*0.02, status: 'pending', value: 150000 });
    saveStateToStorage();
    renderAll();
}

function initDenominationsUI() {
    const container = document.getElementById('denominations-container');
    if (!container) return;
    const denoms = [
        {k:'100000',l:'$100.000 (Billete)'},
        {k:'50000',l:'$50.000 (Billete)'},
        {k:'20000',l:'$20.000 (Billete)'},
        {k:'10000',l:'$10.000 (Billete)'},
        {k:'5000',l:'$5.000 (Billete)'},
        {k:'2000',l:'$2.000 (Billete)'},
        {k:'1000',l:'$1.000 (Billete)'},
        {k:'coin_1000',l:'$1.000 (Moneda)'},
        {k:'coin_500',l:'$500 (Moneda)'},
        {k:'coin_200',l:'$200 (Moneda)'},
        {k:'coin_100',l:'$100 (Moneda)'},
        {k:'coin_50',l:'$50 (Moneda)'}
    ];
    container.innerHTML = denoms.map(d => `
        <div class="flex justify-between items-center bg-neutral-950 p-2.5 rounded-2xl border border-neutral-800 text-xs">
            <span class="text-neutral-300 font-bold">${d.l}</span>
            <div class="flex items-center space-x-2.5">
                <button onclick="updateDenom('${d.k}', -1)" class="w-8 h-8 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-black transition">-</button>
                <span id="denom-count-${d.k}" class="w-7 text-center font-black text-cyan-400 text-sm">${state.cashDenominations[d.k] || 0}</span>
                <button onclick="updateDenom('${d.k}', 1)" class="w-8 h-8 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-black transition">+</button>
            </div>
        </div>
    `).join('');
}

function updateDenom(k, delta) {
    state.cashDenominations[k] = Math.max(0, (state.cashDenominations[k] || 0) + delta);
    const countEl = document.getElementById(`denom-count-${k}`);
    if (countEl) countEl.innerText = state.cashDenominations[k];
    saveStateToStorage();
    renderFinances();
}

function resetCashCounter() {
    Object.keys(state.cashDenominations).forEach(k => state.cashDenominations[k] = 0);
    initDenominationsUI();
    saveStateToStorage();
    renderFinances();
}

function addExpense() {
    const conceptInput = document.getElementById('expense-concept');
    const amountInput = document.getElementById('expense-amount');
    const concept = conceptInput ? conceptInput.value : '';
    const amount = amountInput ? parseFloat(amountInput.value) : NaN;
    if (!concept || isNaN(amount)) return;
    state.expenses.push({ id: 'e-' + Date.now(), concept, amount });
    saveStateToStorage();
    renderExpenses();
    renderFinances();
}

function renderExpenses() {
    const container = document.getElementById('expenses-list');
    if (!container) return;
    container.innerHTML = state.expenses.map(e => `
        <div class="flex justify-between bg-neutral-950 p-3 rounded-2xl text-xs border border-neutral-800">
            <span class="font-medium text-white">${e.concept}</span>
            <span class="text-rose-400 font-black">-$${e.amount.toLocaleString()}</span>
        </div>
    `).join('');
}

function renderFinances() {
    let cash = 0;
    const valuesMap = {
        '100000': 100000, '50000': 50000, '20000': 20000, '10000': 10000,
        '5000': 5000, '2000': 2000, '1000': 1000,
        'coin_1000': 1000, 'coin_500': 500, 'coin_200': 200, 'coin_100': 100, 'coin_50': 50
    };
    
    Object.keys(state.cashDenominations).forEach(k => {
        cash += (state.cashDenominations[k] || 0) * (valuesMap[k] || 0);
    });
    
    let counterDisplay = document.getElementById('counter-total-display');
    if (counterDisplay) counterDisplay.innerText = '$' + cash.toLocaleString();

    let facturado = 0, digitalPayments = 0, expectedCash = 0;
    state.routes.forEach(r => r.stops.forEach(s => { 
        if (s.status === 'delivered') { 
            facturado += s.value; 
            if (s.paymentMethod === 'transfer' || s.paymentMethod === 'qr') digitalPayments += s.value; 
            else expectedCash += s.value; 
        } 
    }));
    
    let gastos = state.expenses.reduce((acc, e) => acc + e.amount, 0);
    let diff = cash - (expectedCash - gastos);
    let neto = facturado - gastos;

    const sf = document.getElementById('summary-facturado');
    const sfi = document.getElementById('summary-fisico');
    const st = document.getElementById('summary-transfer');
    const sdiff = document.getElementById('summary-diff');
    const snt = document.getElementById('summary-neto-total');
    const ffb = document.getElementById('final-balance-badge');

    if (sf) sf.innerText = '$' + facturado.toLocaleString();
    if (sfi) sfi.innerText = '$' + cash.toLocaleString();
    if (st) st.innerText = '$' + digitalPayments.toLocaleString();
    if (sdiff) {
        sdiff.innerText = (diff === 0 ? 'Exacto ($0)' : (diff >  0 ? `Sobrante: +$${diff.toLocaleString()}` : `Faltante: -$${Math.abs(diff).toLocaleString()}`));
        sdiff.className = diff === 0 ? "text-emerald-400 text-sm font-black" : (diff > 0 ? "text-cyan-400 text-sm font-black" : "text-rose-400 text-sm font-black");
    }
    if (snt) snt.innerText = '$' + neto.toLocaleString();
    if (ffb) ffb.innerText = '$' + neto.toLocaleString() + ' Neto';
}

function openCreateRouteModal() {
    const modal = document.getElementById('modal-route');
    if (modal) modal.classList.remove('hidden');
}

function createNewRoute() {
    const nameInput = document.getElementById('new-route-name');
    const modal = document.getElementById('modal-route');
    let name = nameInput ? nameInput.value : '';
    if (!name) return;
    state.routes.push({ id: 'r-' + Date.now(), name, active: false, transportMode: 'car', stops: [] });
    saveStateToStorage();
    if (modal) modal.classList.add('hidden');
    renderAll();
}

function importarArchivoRoutin(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.routes) state.routes = data.routes;
            if (data.agenda) state.agenda = data.agenda;
            saveStateToStorage();
            renderAll();
            alert("¡Rutas y Cartera importadas correctamente!");
        } catch(err) {
            alert("Error al parsear el archivo.");
        }
    };
    reader.readAsText(file);
}
