
let state = {
    user: null,
    transportMode: 'car',
    currentTab: 'map',
    mapTileStyle: 'standard',
    paymentMode: 'cash',
    routes: [
        {
            id: 'ruta-1',
            name: 'Ruta Principal TaT',
            active: true,
            transportMode: 'car',
            stops: [
                { id: 's1', name: 'Tienda El Progreso', address: 'Calle 10 # 5-20', lat: 4.6097, lng: -74.0817, status: 'pending', value: 125000, paymentMethod: 'cash', evidenceNotes: '' },
                { id: 's2', name: 'Granero Doña Rosa', address: 'Carrera 7 # 12-40', lat: 4.6150, lng: -74.0750, status: 'pending', value: 310000, paymentMethod: 'cash', evidenceNotes: '' },
                { id: 's3', name: 'Minimercado Central', address: 'Calle 19 # 3-15', lat: 4.6030, lng: -74.0700, status: 'pending', value: 180000, paymentMethod: 'cash', evidenceNotes: '' }
            ]
        }
    ],
    agenda: [
        { id: 'c1', name: 'Tienda El Progreso', address: 'Calle 10 # 5-20', phone: '3101234567', obs: 'Cliente prioritario' },
        { id: 'c2', name: 'Granero Doña Rosa', address: 'Carrera 7 # 12-40', phone: '3209876543', obs: 'Pide factura electrónica' }
    ],
    expenses: [],
    cashDenominations: { '100000': 0, '50000': 0, '20000': 0, '10000': 0, '5000': 0, '2000': 0, '1000': 0, 'coins': 0 },
    map: null,
    markerList: [],
    polylineLayer: null,
    gpsMarker: null,
    gpsWatchId: null,
    isLiveTracking: true,
    lastPosition: null,
    lastTimestamp: null,
    currentSpeedKmH: 0
};

const TRANSPORT_ICONS = {
    walk: { emoji: '🚶', bg: '#3b82f6' },
    bike: { emoji: '🚲', bg: '#10b981' },
    moto: { emoji: '🏍️', bg: '#f59e0b' },
    car: { emoji: '🚗', bg: '#6366f1' },
    truck: { emoji: '🚚', bg: '#f43f5e' }
};

let db = null;
function initIndexedDB() {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.open('RouteLogixOfflineMapsDB', 1);
            request.onerror = () => resolve(null);
            request.onsuccess = () => {
                db = request.result;
                updateOfflineTilesCountDisplay();
                resolve(db);
            };
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains('tiles')) {
                    database.createObjectStore('tiles', { keyPath: 'url' });
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

document.addEventListener('DOMContentLoaded', async () => {
    loadStateFromStorage();
    initAuthScreen();
    try { lucide.createIcons(); } catch(e){}
    await initIndexedDB().catch(() => {});
    initMap();
    renderAll();
    initDenominationsUI();
    startLiveGPSWatcher();
    window.addEventListener('online', updateNetworkStatus);
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
        badge.className = "px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 flex items-center gap-1";
        dot.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse";
        text.innerText = "Online";
    } else {
        badge.className = "px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-400 flex items-center gap-1";
        dot.className = "w-1.5 h-1.5 rounded-full bg-amber-500";
        text.innerText = "Offline";
    }
}

function loadStateFromStorage() {
    const saved = localStorage.getItem('routelogix_tat_state_v8');
    if (saved) {
        try { state = { ...state, ...JSON.parse(saved) }; } catch(e) {}
    }
}
function saveStateToStorage() {
    localStorage.setItem('routelogix_tat_state_v8', JSON.stringify(state));
}

function initAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
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
    if (tab === 'login') {
        btnLogin.className = "flex-1 py-2 rounded-lg bg-blue-600 text-white transition";
        btnReg.className = "flex-1 py-2 rounded-lg text-neutral-400 transition";
        formLogin.classList.remove('hidden'); formReg.classList.add('hidden');
    } else {
        btnReg.className = "flex-1 py-2 rounded-lg bg-emerald-600 text-white transition";
        btnLogin.className = "flex-1 py-2 rounded-lg text-neutral-400 transition";
        formReg.classList.remove('hidden'); formLogin.classList.add('hidden');
    }
}

function handleLoginDirect() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
        alert("Por favor ingrese su correo electrónico");
        return;
    }
    state.user = { name: email.split('@')[0], email: email, photo: null };
    saveStateToStorage();
    document.getElementById('auth-screen').classList.add('hidden');
    updateDriverDisplay();
    renderAll();
}

function handleRegisterDirect() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    if (!name || !email) {
        alert("Por favor ingrese el nombre y correo electrónico");
        return;
    }
    state.user = { name, email, photo: null };
    saveStateToStorage();
    document.getElementById('auth-screen').classList.add('hidden');
    updateDriverDisplay();
    renderAll();
}

function logoutSession() {
    state.user = null;
    saveStateToStorage();
    document.getElementById('auth-screen').classList.remove('hidden');
}

function updateDriverDisplay() {
    if (!state.user) return;
    document.getElementById('driver-name-display').innerText = state.user.name;
    const initials = state.user.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    document.getElementById('driver-initials').innerText = initials;
}

function openDriverEditModal() {
    if (!state.user) return;
    document.getElementById('edit-driver-name').value = state.user.name;
    document.getElementById('modal-driver').classList.remove('hidden');
}

function saveDriverProfile() {
    const name = document.getElementById('edit-driver-name').value;
    if (name) state.user.name = name;
    saveStateToStorage();
    document.getElementById('modal-driver').classList.add('hidden');
    updateDriverDisplay();
}

function switchTab(tabId) {
    state.currentTab = tabId;
    ['map', 'routes', 'agenda', 'finances'].forEach(t => {
        const sec = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`nav-btn-${t}`);
        if (t === tabId) {
            sec.classList.remove('hidden');
            btn.className = "flex flex-col items-center justify-center text-blue-500 transition";
        } else {
            sec.classList.add('hidden');
            btn.className = "flex flex-col items-center justify-center text-neutral-400 hover:text-white transition";
        }
    });
    if (tabId === 'map' && state.map) setTimeout(() => state.map.invalidateSize(), 200);
    try { lucide.createIcons(); } catch(e){}
}

function initMap() {
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
        if (btn) btn.className = s === styleName ? "px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium" : "px-2.5 py-1 rounded-lg text-neutral-300 font-medium";
    });
    if (currentTileLayerObj) state.map.removeLayer(currentTileLayerObj);
    currentTileLayerObj = new L.OfflineTileLayer(tileUrls[styleName], { maxZoom: 19, subdomains: 'abc' });
    currentTileLayerObj.addTo(state.map);
}

function openOfflineDownloadModal() {
    updateOfflineTilesCountDisplay();
    document.getElementById('modal-offline-download').classList.remove('hidden');
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
    progContainer.classList.remove('hidden');
    syncStatus.innerText = "Descargando tiles...";

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
        progressBar.style.width = pct + '%';
        syncStatus.innerText = `Descargados ${downloaded} / ${total} (${pct}%)`;
    }
    syncStatus.innerText = "¡Mapa guardado offline!";
    updateOfflineTilesCountDisplay();
    setTimeout(() => progContainer.classList.add('hidden'), 3000);
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

    const markerHtml = `<div style="background-color: ${cfg.bg}; width: 38px; height: 38px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">${cfg.emoji}</div>`;
    const customIcon = L.divIcon({ html: markerHtml, className: 'gps-transport-marker', iconSize: [38, 38], iconAnchor: [19, 19] });

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
    if (state.isLiveTracking) {
        btn.className = "absolute bottom-20 right-4 z-20 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xl font-bold text-xs flex items-center gap-1.5 active:scale-95 transition";
        btn.innerHTML = '<i data-lucide="radio" class="w-4 h-4 animate-pulse"></i> <span>GPS Vivo: ON</span>';
        centrarGPS();
    } else {
        btn.className = "absolute bottom-20 right-4 z-20 px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl shadow-xl font-bold text-xs flex items-center gap-1.5 active:scale-95 transition";
        btn.innerHTML = '<i data-lucide="radio-off" class="w-4 h-4"></i> <span>GPS Vivo: OFF</span>';
    }
    try { lucide.createIcons(); } catch(e){}
}

function centrarGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => state.map.setView([pos.coords.latitude, pos.coords.longitude], 16), () => {});
    }
}

async function searchMapAddress() {
    const q = document.getElementById('map-search-input').value;
    if (!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && data.length > 0) state.map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16);
    } catch(e) {}
}

function toggleStopMenu() { document.getElementById('stop-submenu').classList.toggle('hidden'); }
function abrirModalParadaCentro() {
    document.getElementById('stop-submenu').classList.add('hidden');
    const center = state.map.getCenter();
    document.getElementById('parada-nombre').value = "";
    document.getElementById('parada-direccion').value = `Lat: ${center.lat.toFixed(4)}, Lng: ${center.lng.toFixed(4)}`;
    document.getElementById('parada-valor').value = "150000";
    document.getElementById('modal-parada').classList.remove('hidden');
}

function guardarNuevaParada() {
    const name = document.getElementById('parada-nombre').value;
    const address = document.getElementById('parada-direccion').value;
    const value = parseFloat(document.getElementById('parada-valor').value) || 0;
    if (!name) { alert("Ingrese nombre"); return; }
    const center = state.map.getCenter();
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    activeRoute.stops.push({ id: 'stop-' + Date.now(), name, address: address || 'Mapa', lat: center.lat, lng: center.lng, status: 'pending', value, paymentMethod: 'cash', evidenceNotes: '' });
    saveStateToStorage();
    document.getElementById('modal-parada').classList.add('hidden');
    renderAll();
}

function abrirModalClienteExistente() {
    document.getElementById('stop-submenu').classList.add('hidden');
    if (state.agenda.length === 0) { alert("Agenda vacía"); switchTab('agenda'); return; }
    const clientName = prompt("Cliente a añadir:
" + state.agenda.map(c => "- " + c.name).join('
'));
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
    alert("¡Ruta optimizada por IA!");
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
        let color = stop.status === 'delivered' ? '#10b981' : stop.status === 'rejected' ? '#f43f5e' : '#3b82f6';
        let html = `<div style="background-color: ${color}; width: 26px; height: 26px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2px solid white;">${index + 1}</div>`;
        let marker = L.marker([stop.lat, stop.lng], { icon: L.divIcon({ html, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(state.map);
        marker.bindPopup(`<div class="p-1 text-xs"><strong>#${index+1} - ${stop.name}</strong><br>${stop.address}<br><button onclick="openEvidenceModal('${stop.id}')" class="mt-1 bg-blue-600 text-white px-2 py-1 rounded">Gestionar</button></div>`);
        state.markerList.push(marker);
    });
    if (latlngs.length > 0) state.polylineLayer = L.polyline(latlngs, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(state.map);
}

function renderActiveRouteCard() {
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute) return;
    document.getElementById('route-active-title').innerText = activeRoute.name;
    document.getElementById('transport-mode-select').value = activeRoute.transportMode || 'car';
    let totalDist = 0;
    for (let i = 0; i < activeRoute.stops.length - 1; i++) {
        totalDist += Math.hypot(activeRoute.stops[i+1].lat - activeRoute.stops[i].lat, activeRoute.stops[i+1].lng - activeRoute.stops[i].lng) * 111;
    }
    let money = activeRoute.stops.reduce((acc, s) => acc + (s.status === 'delivered' ? s.value : 0), 0);
    document.getElementById('metric-km').innerText = totalDist.toFixed(1) + ' km';
    document.getElementById('metric-time').innerText = Math.round(totalDist / 30 * 60 + activeRoute.stops.length * 4) + ' min';
    document.getElementById('metric-clients').innerText = activeRoute.stops.length;
    document.getElementById('metric-money').innerText = '$' + money.toLocaleString();
    document.getElementById('count-pending').innerText = activeRoute.stops.filter(s => s.status === 'pending').length;
    document.getElementById('count-delivered').innerText = activeRoute.stops.filter(s => s.status === 'delivered').length;
    document.getElementById('count-rejected').innerText = activeRoute.stops.filter(s => s.status === 'rejected').length;
}

function renderRoutesList() {
    document.getElementById('routes-list-container').innerHTML = state.routes.map(r => `
        <div class="bg-neutral-900 border ${r.active ? 'border-blue-500' : 'border-neutral-800'} rounded-xl p-3 flex justify-between items-center text-xs">
            <div><strong class="text-white">${r.name}</strong><p class="text-[10px] text-neutral-400">${r.stops.length} paradas</p></div>
            ${!r.active ? `<button onclick="makeRouteActive('${r.id}')" class="bg-blue-600 text-white px-2.5 py-1.5 rounded-lg font-semibold">Activar</button>` : '<span class="text-emerald-400 font-bold">Activa</span>'}
        </div>
    `).join('');
}

function makeRouteActive(id) {
    state.routes.forEach(r => r.active = (r.id === id));
    saveStateToStorage();
    renderAll();
}

function openEvidenceModal(stopId) {
    let stop = null;
    for (let r of state.routes) { stop = r.stops.find(s => s.id === stopId); if (stop) break; }
    if (!stop) return;
    document.getElementById('evidence-stop-id').value = stop.id;
    document.getElementById('evidence-status').value = stop.status === 'pending' ? 'delivered' : stop.status;
    document.getElementById('evidence-notes').value = stop.evidenceNotes || '';
    document.getElementById('modal-evidence').classList.remove('hidden');
}

function saveEvidence() {
    const stopId = document.getElementById('evidence-stop-id').value;
    const status = document.getElementById('evidence-status').value;
    const notes = document.getElementById('evidence-notes').value;
    for (let r of state.routes) {
        let stop = r.stops.find(s => s.id === stopId);
        if (stop) { stop.status = status; stop.evidenceNotes = notes; break; }
    }
    saveStateToStorage();
    document.getElementById('modal-evidence').classList.add('hidden');
    renderAll();
}

function renderAgendaList() {
    document.getElementById('lista-agenda').innerHTML = state.agenda.map(c => `
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex justify-between items-center text-xs">
            <div><strong class="text-white">${c.name}</strong><p class="text-[10px] text-neutral-400">${c.address}</p></div>
            <button onclick="addClientToActiveRoute('${c.id}')" class="bg-blue-600 text-white px-2.5 py-1.5 rounded-xl">+</button>
        </div>
    `).join('');
}

function openClientModal() { document.getElementById('modal-client').classList.remove('hidden'); }
function handleClientSubmitDirect() {
    const name = document.getElementById('client-name').value.trim();
    const address = document.getElementById('client-address').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const obs = document.getElementById('client-obs').value.trim();
    if (!name || !address) { alert("Ingrese nombre y dirección"); return; }
    state.agenda.push({ id: 'c-' + Date.now(), name, address, phone, obs });
    saveStateToStorage();
    document.getElementById('modal-client').classList.add('hidden');
    renderAll();
}

function addClientToActiveRoute(id) {
    let c = state.agenda.find(x => x.id === id);
    if (!c) return;
    let r = state.routes.find(x => x.active) || state.routes[0];
    r.stops.push({ id: 's-' + Date.now(), name: c.name, address: c.address, lat: 4.6097 + (Math.random()-0.5)*0.02, lng: -74.0817 + (Math.random()-0.5)*0.02, status: 'pending', value: 150000 });
    saveStateToStorage();
    renderAll();
}

function setPaymentMode(mode) {
    state.paymentMode = mode;
    saveStateToStorage();
    renderFinances();
}

function initDenominationsUI() {
    const denoms = [{k:'100000',l:'$100.000'},{k:'50000',l:'$50.000'},{k:'20000',l:'$20.000'},{k:'10000',l:'$10.000'},{k:'5000',l:'$5.000'},{k:'2000',l:'$2.000'},{k:'1000',l:'$1.000'},{k:'coins',l:'Monedas'}];
    document.getElementById('denominations-container').innerHTML = denoms.map(d => `
        <div class="flex justify-between items-center bg-neutral-950 p-2 rounded-xl border border-neutral-800 text-xs">
            <span class="text-neutral-300">${d.l}</span>
            <div class="flex items-center space-x-2">
                <button onclick="updateDenom('${d.k}', -1)" class="w-7 h-7 bg-neutral-800 text-white rounded-lg font-bold">-</button>
                <span id="denom-count-${d.k}" class="w-6 text-center font-bold text-white">${state.cashDenominations[d.k] || 0}</span>
                <button onclick="updateDenom('${d.k}', 1)" class="w-7 h-7 bg-neutral-800 text-white rounded-lg font-bold">+</button>
            </div>
        </div>
    `).join('');
}

function updateDenom(k, delta) {
    state.cashDenominations[k] = Math.max(0, (state.cashDenominations[k] || 0) + delta);
    document.getElementById(`denom-count-${k}`).innerText = state.cashDenominations[k];
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
    let concept = document.getElementById('expense-concept').value;
    let amount = parseFloat(document.getElementById('expense-amount').value);
    if (!concept || isNaN(amount)) return;
    state.expenses.push({ id: 'e-' + Date.now(), concept, amount });
    saveStateToStorage();
    renderExpenses();
    renderFinances();
}

function renderExpenses() {
    document.getElementById('expenses-list').innerHTML = state.expenses.map(e => `
        <div class="flex justify-between bg-neutral-950 p-2 rounded-xl text-xs"><span>${e.concept}</span><span class="text-rose-400">-$${e.amount.toLocaleString()}</span></div>
    `).join('');
}

function renderFinances() {
    let cash = Object.keys(state.cashDenominations).reduce((acc, k) => acc + (state.cashDenominations[k] || 0) * (k === 'coins' ? 500 : parseInt(k)), 0);
    document.getElementById('counter-total-display').innerText = '$' + cash.toLocaleString();
    let facturado = 0, transfer = 0;
    state.routes.forEach(r => r.stops.forEach(s => { if (s.status === 'delivered') { facturado += s.value; if (s.paymentMethod === 'transfer') transfer += s.value; } }));
    let gastos = state.expenses.reduce((acc, e) => acc + e.amount, 0);
    let neto = facturado - gastos;
    document.getElementById('summary-facturado').innerText = '$' + facturado.toLocaleString();
    document.getElementById('summary-fisico').innerText = '$' + cash.toLocaleString();
    document.getElementById('summary-transfer').innerText = '$' + transfer.toLocaleString();
    document.getElementById('summary-gastos').innerText = '$' + gastos.toLocaleString();
    document.getElementById('summary-neto-total').innerText = '$' + neto.toLocaleString();
    document.getElementById('final-balance-badge').innerText = '$' + neto.toLocaleString() + ' Neto';
}

function openCreateRouteModal() { document.getElementById('modal-route').classList.add('flex'); document.getElementById('modal-route').classList.remove('hidden'); }
function createNewRoute() {
    let name = document.getElementById('new-route-name').value;
    if (!name) return;
    state.routes.push({ id: 'r-' + Date.now(), name, active: false, transportMode: 'car', stops: [] });
    saveStateToStorage();
    document.getElementById('modal-route').classList.add('hidden');
    renderAll();
}
