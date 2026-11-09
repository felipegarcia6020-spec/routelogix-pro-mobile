
// Estado global de RouteLogix Pro TaT con GPS en vivo y marcador de transporte
let state = {
    user: null,
    transportMode: 'car', // 'walk', 'bike', 'moto', 'car', 'truck'
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
                { id: 's1', name: 'Tienda El Progreso', address: 'Calle 10 # 5-20', lat: 4.6097, lng: -74.0817, status: 'pending', value: 125000, paymentMethod: 'cash', evidencePhoto: null, evidenceNotes: '' },
                { id: 's2', name: 'Granero Doña Rosa', address: 'Carrera 7 # 12-40', lat: 4.6150, lng: -74.0750, status: 'pending', value: 310000, paymentMethod: 'cash', evidencePhoto: null, evidenceNotes: '' },
                { id: 's3', name: 'Minimercado Central', address: 'Calle 19 # 3-15', lat: 4.6030, lng: -74.0700, status: 'pending', value: 180000, paymentMethod: 'cash', evidencePhoto: null, evidenceNotes: '' }
            ]
        }
    ],
    agenda: [
        { id: 'c1', name: 'Tienda El Progreso', address: 'Calle 10 # 5-20', phone: '3101234567', photo: null, obs: 'Cliente prioritario' },
        { id: 'c2', name: 'Granero Doña Rosa', address: 'Carrera 7 # 12-40', phone: '3209876543', photo: null, obs: 'Pide factura electrónica' },
        { id: 'c3', name: 'Minimercado Central', address: 'Calle 19 # 3-15', phone: '3157891234', photo: null, obs: 'Recibe solo en efectivo' }
    ],
    expenses: [],
    cashDenominations: {
        '100000': 0, '50000': 0, '20000': 0, '10000': 0, '5000': 0, '2000': 0, '1000': 0, 'coins': 0
    },
    viewingRouteId: null,
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

// Velocidades promedio en km/h según medio de transporte
const TRANSPORT_SPEEDS = {
    walk: 5,
    bike: 15,
    moto: 35,
    car: 30,
    truck: 20
};

// Emojis e iconos para el marcador GPS en vivo según el transporte
const TRANSPORT_ICONS = {
    walk: { emoji: '🚶', bg: '#3b82f6', label: 'Caminando' },
    bike: { emoji: '🚲', bg: '#10b981', label: 'Bicicleta' },
    moto: { emoji: '🏍️', bg: '#f59e0b', label: 'Moto' },
    car: { emoji: '🚗', bg: '#6366f1', label: 'Carro' },
    truck: { emoji: '🚚', bg: '#f43f5e', label: 'Camión' }
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();
    initAuthScreen();
    lucide.createIcons();
    initMap();
    renderAll();
    initDenominationsUI();
    startLiveGPSWatcher();
});

function loadStateFromStorage() {
    const saved = localStorage.getItem('routelogix_tat_state_v4');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
        } catch(e) {}
    }
}

function saveStateToStorage() {
    localStorage.setItem('routelogix_tat_state_v4', JSON.stringify(state));
}

// Autenticación
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
        formLogin.classList.remove('hidden');
        formReg.classList.add('hidden');
    } else {
        btnReg.className = "flex-1 py-2 rounded-lg bg-emerald-600 text-white transition";
        btnLogin.className = "flex-1 py-2 rounded-lg text-neutral-400 transition";
        formReg.classList.remove('hidden');
        formLogin.classList.add('hidden');
    }
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    state.user = { name: email.split('@')[0], email: email, photo: null };
    saveStateToStorage();
    document.getElementById('auth-screen').classList.add('hidden');
    updateDriverDisplay();
    renderAll();
}

function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const photo = document.getElementById('reg-photo-base64').value || null;
    state.user = { name, email, photo };
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

function handleDriverPhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        document.getElementById('reg-photo-base64').value = evt.target.result;
    };
    reader.readAsDataURL(file);
}

function updateDriverDisplay() {
    if (!state.user) return;
    document.getElementById('driver-name-display').innerText = state.user.name;
    const initials = state.user.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    document.getElementById('driver-initials').innerText = initials;
    if (state.user.photo) {
        document.getElementById('driver-avatar-container').innerHTML = `<img src="${state.user.photo}" class="w-full h-full object-cover">`;
    }
}

function openDriverEditModal() {
    if (!state.user) return;
    document.getElementById('edit-driver-name').value = state.user.name;
    document.getElementById('edit-driver-photo-base64').value = state.user.photo || '';
    document.getElementById('modal-driver').classList.remove('hidden');
}

function handleEditDriverPhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        document.getElementById('edit-driver-photo-base64').value = evt.target.result;
    };
    reader.readAsDataURL(file);
}

function saveDriverProfile() {
    const name = document.getElementById('edit-driver-name').value;
    const photo = document.getElementById('edit-driver-photo-base64').value;
    if (name) state.user.name = name;
    if (photo) state.user.photo = photo;
    saveStateToStorage();
    document.getElementById('modal-driver').classList.add('hidden');
    updateDriverDisplay();
}

// Navegación de pestañas
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
    if (tabId === 'map' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 200);
    }
    lucide.createIcons();
}

// Mapa Leaflet
function initMap() {
    state.map = L.map('map', { zoomControl: false }).setView([4.6097, -74.0817], 14);
    setMapTileStyle('standard', false);
    setTimeout(() => state.map.invalidateSize(), 300);
}

const tileLayers = {
    standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
};

let currentTileLayerObj = null;
function setMapTileStyle(styleName, redraw = true) {
    state.mapTileStyle = styleName;
    ['standard', 'dark', 'satellite'].forEach(s => {
        const btn = document.getElementById(`style-${s}`);
        if (btn) {
            btn.className = s === styleName ? "px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium" : "px-2.5 py-1 rounded-lg text-neutral-300 font-medium";
        }
    });
    if (currentTileLayerObj) {
        state.map.removeLayer(currentTileLayerObj);
    }
    currentTileLayerObj = tileLayers[styleName];
    currentTileLayerObj.addTo(state.map);
}

// GPS Tracking y Marcador en Tiempo Real con Velocidad
function startLiveGPSWatcher() {
    if (!navigator.geolocation) return;
    
    state.gpsWatchId = navigator.geolocation.watchPosition(pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speedMps = pos.coords.speed; // metros por segundo si está disponible
        
        const now = Date.now();
        let calculatedSpeed = 0;

        if (speedMps !== null && speedMps >= 0) {
            calculatedSpeed = speedMps * 3.6; // Convertir m/s a km/h
        } else if (state.lastPosition && state.lastTimestamp) {
            // Calcular velocidad por distancia y tiempo transcurrido
            const R = 6371; // Radio tierra en km
            const dLat = (lat - state.lastPosition.lat) * Math.PI / 180;
            const dLon = (lng - state.lastPosition.lng) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(state.lastPosition.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distKm = R * c;
            const hours = (now - state.lastTimestamp) / 3600000;
            if (hours > 0) {
                calculatedSpeed = distKm / hours;
            }
        }

        state.lastPosition = { lat, lng };
        state.lastTimestamp = now;
        state.currentSpeedKmH = calculatedSpeed;

        updateLiveGPSMarker(lat, lng, calculatedSpeed);

        if (state.isLiveTracking && state.map && state.currentTab === 'map') {
            state.map.setView([lat, lng], state.map.getZoom());
        }
    }, err => {
        console.warn("GPS error o denegado:", err.message);
    }, {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000
    });
}

function updateLiveGPSMarker(lat, lng, speed) {
    if (!state.map) return;
    
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    const mode = activeRoute ? (activeRoute.transportMode || 'car') : 'car';
    const cfg = TRANSPORT_ICONS[mode] || TRANSPORT_ICONS['car'];

    // Actualizar widget de velocidad en pantalla
    const speedDisplay = document.getElementById('live-speed-display');
    const iconIndicator = document.getElementById('transport-icon-indicator');
    if (speedDisplay) speedDisplay.innerText = speed.toFixed(1) + ' km/h';
    if (iconIndicator) iconIndicator.innerText = cfg.emoji;

    // Crear o actualizar marcador Leaflet con el icono animado del medio de transporte
    const markerHtml = `
        <div style="background-color: ${cfg.bg}; width: 38px; height: 38px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.5); animation: pulse 2s infinite;">
            ${cfg.emoji}
        </div>
    `;
    const customIcon = L.divIcon({
        html: markerHtml,
        className: 'gps-transport-marker',
        iconSize: [38, 38],
        iconAnchor: [19, 19]
    });

    if (state.gpsMarker) {
        state.gpsMarker.setLatLng([lat, lng]);
        state.gpsMarker.setIcon(customIcon);
    } else {
        state.gpsMarker = L.marker([lat, lng], { icon: customIcon }).addTo(state.map);
        state.gpsMarker.bindPopup(`<b>Mi Posición GPS en Vivo</b><br>Transporte: ${cfg.label}<br>Velocidad: ${speed.toFixed(1)} km/h`);
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
    lucide.createIcons();
}

function centrarGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            state.map.setView([lat, lng], 16);
        }, () => alert("No se pudo obtener la ubicación GPS"));
    }
}

async function searchMapAddress() {
    const q = document.getElementById('map-search-input').value;
    if (!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            state.map.setView([lat, lng], 16);
        } else {
            alert("No se encontró la dirección");
        }
    } catch(e) {
        alert("Error al buscar dirección");
    }
}

function toggleStopMenu() {
    const sub = document.getElementById('stop-submenu');
    sub.classList.toggle('hidden');
}

function abrirModalParadaCentro() {
    document.getElementById('stop-submenu').classList.add('hidden');
    const center = state.map.getCenter();
    document.getElementById('modal-parada-title').innerText = "Añadir Parada en Ubicación Central";
    document.getElementById('parada-nombre').value = "";
    document.getElementById('parada-direccion').value = `Lat: ${center.lat.toFixed(4)}, Lng: ${center.lng.toFixed(4)}`;
    document.getElementById('parada-valor').value = "150000";
    document.getElementById('modal-parada').classList.remove('hidden');
}

function guardarNuevaParada() {
    const name = document.getElementById('parada-nombre').value;
    const address = document.getElementById('parada-direccion').value;
    const value = parseFloat(document.getElementById('parada-valor').value) || 0;
    if (!name) { alert("Ingrese el nombre de la parada"); return; }
    
    const center = state.map.getCenter();
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute) { alert("No hay ruta activa"); return; }

    const newStop = {
        id: 'stop-' + Date.now(),
        name,
        address: address || 'Ubicación Mapa',
        lat: center.lat,
        lng: center.lng,
        status: 'pending',
        value,
        paymentMethod: 'cash',
        evidencePhoto: null,
        evidenceNotes: ''
    };

    activeRoute.stops.push(newStop);
    saveStateToStorage();
    document.getElementById('modal-parada').classList.add('hidden');
    renderAll();
    alert("Parada añadida correctamente");
}

function abrirModalClienteExistente() {
    document.getElementById('stop-submenu').classList.add('hidden');
    if (state.agenda.length === 0) {
        alert("No hay clientes en la agenda. Añada clientes primero.");
        switchTab('agenda');
        return;
    }
    const clientName = prompt("Seleccione un cliente de la agenda escribiendo su nombre:\n" + state.agenda.map(c => "- " + c.name).join('\n'));
    if (!clientName) return;
    const client = state.agenda.find(c => c.name.toLowerCase().includes(clientName.toLowerCase()));
    if (!client) { alert("Cliente no encontrado"); return; }

    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    const newStop = {
        id: 'stop-' + Date.now(),
        name: client.name,
        address: client.address,
        lat: 4.6097 + (Math.random() - 0.5) * 0.02,
        lng: -74.0817 + (Math.random() - 0.5) * 0.02,
        status: 'pending',
        value: 200000,
        paymentMethod: 'cash',
        evidencePhoto: null,
        evidenceNotes: ''
    };
    activeRoute.stops.push(newStop);
    saveStateToStorage();
    renderAll();
    alert(`Cliente ${client.name} añadido a la ruta activa`);
}

// Cambio de Medio de Transporte y Cálculo de Tiempos
function changeTransportMode(mode) {
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (activeRoute) {
        activeRoute.transportMode = mode;
        state.transportMode = mode;
        saveStateToStorage();
        renderAll();
    }
}

// Algoritmo de Optimización Inteligente (factorizando Medio de Transporte)
function optimizarRutaInteligente() {
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute || activeRoute.stops.length <= 1) {
        alert("Se requieren al menos 2 paradas para optimizar la ruta.");
        return;
    }

    let pendingStops = activeRoute.stops.filter(s => s.status === 'pending');
    let completedStops = activeRoute.stops.filter(s => s.status !== 'pending');

    if (pendingStops.length <= 1) {
        alert("No hay suficientes paradas pendientes para reordenar.");
        return;
    }

    let optimized = [];
    let current = pendingStops[0];
    let unvisited = pendingStops.slice(1);
    optimized.push(current);

    while (unvisited.length > 0) {
        let nearestIndex = 0;
        let minDist = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
            let dist = Math.hypot(unvisited[i].lat - current.lat, unvisited[i].lng - current.lng);
            if (dist < minDist) {
                minDist = dist;
                nearestIndex = i;
            }
        }
        current = unvisited.splice(nearestIndex, 1)[0];
        optimized.push(current);
    }

    activeRoute.stops = [...optimized, ...completedStops];
    saveStateToStorage();
    renderAll();
    alert(`Ruta optimizada exitosamente para el medio de transporte seleccionado (${getTransportName(activeRoute.transportMode)}).`);
}

function getTransportName(mode) {
    const mapNames = { walk: 'A pie (Muñeco GPS)', bike: 'Bicicleta GPS', moto: 'Moto GPS', car: 'Carro GPS', truck: 'Camión GPS' };
    return mapNames[mode] || 'Carro GPS';
}

// Renderizado General
function renderAll() {
    renderMapMarkersAndPolyline();
    renderRoutesList();
    renderActiveRouteCard();
    renderAgendaList();
    renderExpenses();
    renderFinances();
    lucide.createIcons();
}

function renderMapMarkersAndPolyline() {
    if (!state.map) return;
    state.markerList.forEach(m => state.map.removeLayer(m));
    state.markerList = [];
    if (state.polylineLayer) state.map.removeLayer(state.polylineLayer);

    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute || activeRoute.stops.length === 0) return;

    let latlngs = [];
    activeRoute.stops.forEach((stop, index) => {
        latlngs.push([stop.lat, stop.lng]);

        let colorBg = '#3b82f6';
        if (stop.status === 'delivered') colorBg = '#10b981';
        if (stop.status === 'rejected') colorBg = '#f43f5e';

        const htmlIcon = `<div style="background-color: ${colorBg}; width: 26px; height: 26px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">${index + 1}</div>`;
        const customIcon = L.divIcon({ html: htmlIcon, className: 'custom-map-marker', iconSize: [26, 26], iconAnchor: [13, 13] });

        const marker = L.marker([stop.lat, stop.lng], { icon: customIcon }).addTo(state.map);
        marker.bindPopup(`
            <div class="p-1 text-xs space-y-1">
                <strong>#${index + 1} - ${stop.name}</strong><br>
                <span>${stop.address}</span><br>
                <span class="text-emerald-400 font-bold">$${stop.value.toLocaleString()}</span><br>
                <button onclick="openEvidenceModal('${stop.id}')" class="mt-1 bg-blue-600 text-white px-2 py-1 rounded">Gestionar Entrega</button>
            </div>
        `);
        state.markerList.push(marker);
    });

    if (latlngs.length > 0) {
        state.polylineLayer = L.polyline(latlngs, { color: '#3b82f6', weight: 4, opacity: 0.8, dashArray: '6, 6' }).addTo(state.map);
    }
}

function renderActiveRouteCard() {
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    if (!activeRoute) return;

    document.getElementById('route-active-title').innerText = activeRoute.name;
    const modeSelect = document.getElementById('transport-mode-select');
    if (modeSelect) modeSelect.value = activeRoute.transportMode || 'car';

    let totalDistKm = 0;
    for (let i = 0; i < activeRoute.stops.length - 1; i++) {
        let p1 = activeRoute.stops[i];
        let p2 = activeRoute.stops[i+1];
        let d = Math.hypot(p2.lat - p1.lat, p2.lng - p1.lng) * 111;
        totalDistKm += d;
    }

    const speed = TRANSPORT_SPEEDS[activeRoute.transportMode || 'car'] || 30;
    let travelHours = totalDistKm / speed;
    let stopMinutes = activeRoute.stops.length * 4;
    let totalMinutes = Math.round(travelHours * 60 + stopMinutes);

    let totalMoney = activeRoute.stops.reduce((acc, s) => acc + (s.status === 'delivered' ? s.value : 0), 0);
    let countPending = activeRoute.stops.filter(s => s.status === 'pending').length;
    let countDelivered = activeRoute.stops.filter(s => s.status === 'delivered').length;
    let countRejected = activeRoute.stops.filter(s => s.status === 'rejected').length;

    document.getElementById('metric-km').innerText = totalDistKm.toFixed(1) + ' km';
    document.getElementById('metric-time').innerText = totalMinutes + ' min';
    document.getElementById('metric-clients').innerText = activeRoute.stops.length;
    document.getElementById('metric-money').innerText = '$' + totalMoney.toLocaleString();

    document.getElementById('count-pending').innerText = countPending;
    document.getElementById('count-delivered').innerText = countDelivered;
    document.getElementById('count-rejected').innerText = countRejected;
}

function renderRoutesList() {
    const container = document.getElementById('routes-list-container');
    if (!container) return;
    container.innerHTML = state.routes.map(r => `
        <div class="bg-neutral-900 border ${r.active ? 'border-blue-500/60' : 'border-neutral-800'} rounded-xl p-3 flex justify-between items-center text-xs">
            <div>
                <strong class="text-white">${r.name}</strong>
                <p class="text-[10px] text-neutral-400">${r.stops.length} paradas • Transporte: ${getTransportName(r.transportMode || 'car')}</p>
            </div>
            <div class="flex gap-1.5">
                <button onclick="viewRouteStops('${r.id}')" class="bg-neutral-800 hover:bg-neutral-700 text-blue-400 px-2.5 py-1.5 rounded-lg font-semibold">Paradas</button>
                ${!r.active ? `<button onclick="makeRouteActive('${r.id}')" class="bg-blue-600 text-white px-2.5 py-1.5 rounded-lg font-semibold">Activar</button>` : ''}
            </div>
        </div>
    `).join('');
}

function makeRouteActive(id) {
    state.routes.forEach(r => r.active = (r.id === id));
    saveStateToStorage();
    renderAll();
}

function viewRouteStops(id) {
    state.viewingRouteId = id;
    const r = state.routes.find(x => x.id === id);
    if (!r) return;
    document.getElementById('routes-list-container').classList.add('hidden');
    document.getElementById('route-stops-container').classList.remove('hidden');
    document.getElementById('stops-route-header-title').innerText = `Paradas de: ${r.name}`;

    const container = document.getElementById('lista-paradas-ruta');
    container.innerHTML = r.stops.map((s, idx) => `
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex items-center justify-between text-xs">
            <div class="flex items-center space-x-2.5">
                <span class="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center">${idx + 1}</span>
                <div>
                    <strong class="text-white">${s.name}</strong>
                    <p class="text-[10px] text-neutral-400">${s.address} • $${s.value.toLocaleString()}</p>
                </div>
            </div>
            <div class="flex items-center gap-1">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'rejected' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}">${s.status.toUpperCase()}</span>
                <button onclick="openEvidenceModal('${s.id}')" class="bg-neutral-800 hover:bg-neutral-700 text-blue-400 p-1.5 rounded-lg"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function backToRoutesList() {
    document.getElementById('route-stops-container').classList.add('hidden');
    document.getElementById('routes-list-container').classList.remove('hidden');
}

function openCreateRouteModal() {
    document.getElementById('new-route-name').value = "";
    document.getElementById('modal-route').classList.remove('hidden');
}

function createNewRoute() {
    const name = document.getElementById('new-route-name').value;
    if (!name) { alert("Ingrese un nombre para la ruta"); return; }
    const newR = {
        id: 'route-' + Date.now(),
        name,
        active: false,
        transportMode: state.transportMode || 'car',
        stops: []
    };
    state.routes.push(newR);
    saveStateToStorage();
    document.getElementById('modal-route').classList.add('hidden');
    renderAll();
}

// Modal de Evidencia y Gestión de Entrega
function openEvidenceModal(stopId) {
    let stop = null;
    for (let r of state.routes) {
        let found = r.stops.find(s => s.id === stopId);
        if (found) { stop = found; break; }
    }
    if (!stop) return;

    document.getElementById('evidence-stop-id').value = stop.id;
    document.getElementById('evidence-status').value = stop.status === 'pending' ? 'delivered' : stop.status;
    document.getElementById('evidence-payment-method').value = stop.paymentMethod || 'cash';
    document.getElementById('evidence-notes').value = stop.evidenceNotes || '';
    document.getElementById('evidence-photo-base64').value = stop.evidencePhoto || '';
    
    const prev = document.getElementById('evidence-preview-img');
    const prevContainer = document.getElementById('evidence-preview-container');
    if (stop.evidencePhoto) {
        prev.src = stop.evidencePhoto;
        prevContainer.classList.remove('hidden');
    } else {
        prevContainer.classList.add('hidden');
    }

    toggleEvidenceFields();
    document.getElementById('modal-evidence').classList.remove('hidden');
}

function toggleEvidenceFields() {
    const st = document.getElementById('evidence-status').value;
    const payContainer = document.getElementById('container-payment-method');
    const notesLabel = document.getElementById('evidence-notes-label');
    if (st === 'rejected') {
        payContainer.classList.add('hidden');
        notesLabel.innerText = "Motivo del Rechazo / Novedad *";
    } else {
        payContainer.classList.remove('hidden');
        notesLabel.innerText = "Observaciones de la Entrega";
    }
}

function handleEvidencePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        document.getElementById('evidence-photo-base64').value = evt.target.result;
        const prev = document.getElementById('evidence-preview-img');
        prev.src = evt.target.result;
        document.getElementById('evidence-preview-container').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function saveEvidence() {
    const stopId = document.getElementById('evidence-stop-id').value;
    const status = document.getElementById('evidence-status').value;
    const paymentMethod = document.getElementById('evidence-payment-method').value;
    const notes = document.getElementById('evidence-notes').value;
    const photo = document.getElementById('evidence-photo-base64').value;

    for (let r of state.routes) {
        let stop = r.stops.find(s => s.id === stopId);
        if (stop) {
            stop.status = status;
            stop.paymentMethod = paymentMethod;
            stop.evidenceNotes = notes;
            stop.evidencePhoto = photo;
            break;
        }
    }
    saveStateToStorage();
    document.getElementById('modal-evidence').classList.add('hidden');
    renderAll();
}

// Agenda de Clientes
function renderAgendaList() {
    const container = document.getElementById('lista-agenda');
    if (!container) return;
    container.innerHTML = state.agenda.map(c => `
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex justify-between items-center text-xs">
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl bg-neutral-800 overflow-hidden flex items-center justify-center text-neutral-400 font-bold border border-neutral-700">
                    ${c.photo ? `<img src="${c.photo}" class="w-full h-full object-cover">` : '<i data-lucide="store" class="w-5 h-5">ID</i>'}
                </div>
                <div>
                    <strong class="text-white">${c.name}</strong>
                    <p class="text-[10px] text-neutral-400">${c.address} • Tel: ${c.phone || 'N/A'}</p>
                    ${c.obs ? `<p class="text-[10px] text-blue-400 mt-0.5">${c.obs}</p>` : ''}
                </div>
            </div>
            <div class="flex gap-1.5">
                <button onclick="addClientToActiveRoute('${c.id}')" class="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-xl font-semibold shadow" title="Añadir a ruta activa">+</button>
                <button onclick="editClient('${c.id}')" class="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 p-1.5 rounded-xl"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function openClientModal(mode) {
    document.getElementById('client-edit-id').value = "";
    document.getElementById('client-name').value = "";
    document.getElementById('client-address').value = "";
    document.getElementById('client-phone').value = "";
    document.getElementById('client-photo-base64').value = "";
    document.getElementById('client-obs').value = "";
    document.getElementById('modal-client-title').innerText = "Nuevo Cliente";
    document.getElementById('modal-client').classList.remove('hidden');
}

function handleClientPhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        document.getElementById('client-photo-base64').value = evt.target.result;
    };
    reader.readAsDataURL(file);
}

function handleClientSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('client-edit-id').value;
    const name = document.getElementById('client-name').value;
    const address = document.getElementById('client-address').value;
    const phone = document.getElementById('client-phone').value;
    const photo = document.getElementById('client-photo-base64').value;
    const obs = document.getElementById('client-obs').value;

    if (id) {
        const c = state.agenda.find(x => x.id === id);
        if (c) {
            c.name = name; c.address = address; c.phone = phone; if(photo) c.photo = photo; c.obs = obs;
        }
    } else {
        const nc = {
            id: 'client-' + Date.now(),
            name, address, phone, photo: photo || null, obs
        };
        state.agenda.push(nc);
    }
    saveStateToStorage();
    document.getElementById('modal-client').classList.add('hidden');
    renderAll();
}

function editClient(id) {
    const c = state.agenda.find(x => x.id === id);
    if (!c) return;
    document.getElementById('client-edit-id').value = c.id;
    document.getElementById('client-name').value = c.name;
    document.getElementById('client-address').value = c.address;
    document.getElementById('client-phone').value = c.phone;
    document.getElementById('client-photo-base64').value = c.photo || '';
    document.getElementById('client-obs').value = c.obs || '';
    document.getElementById('modal-client-title').innerText = "Editar Cliente";
    document.getElementById('modal-client').classList.remove('hidden');
}

function addClientToActiveRoute(clientId) {
    const c = state.agenda.find(x => x.id === clientId);
    if (!c) return;
    const activeRoute = state.routes.find(r => r.active) || state.routes[0];
    activeRoute.stops.push({
        id: 'stop-' + Date.now(),
        name: c.name,
        address: c.address,
        lat: 4.6097 + (Math.random() - 0.5) * 0.02,
        lng: -74.0817 + (Math.random() - 0.5) * 0.02,
        status: 'pending',
        value: 150000,
        paymentMethod: 'cash',
        evidencePhoto: null,
        evidenceNotes: ''
    });
    saveStateToStorage();
    renderAll();
    alert(`Cliente ${c.name} añadido a la ruta activa.`);
}

// Finanzas y Caja
function setPaymentMode(mode) {
    state.paymentMode = mode;
    document.getElementById('pay-mode-cash').className = mode === 'cash' ? "py-2.5 rounded-xl bg-blue-600 text-white font-bold transition" : "py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-bold transition";
    document.getElementById('pay-mode-trans').className = mode === 'transfer' ? "py-2.5 rounded-xl bg-blue-600 text-white font-bold transition" : "py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-bold transition";
    document.getElementById('payment-mode-badge').innerText = mode === 'cash' ? 'Efectivo Predominante' : 'Transferencia Predominante';
    saveStateToStorage();
    renderFinances();
}

function initDenominationsUI() {
    const container = document.getElementById('denominations-container');
    if (!container) return;
    const denoms = [
        { key: '100000', label: '$100.000' },
        { key: '50000', label: '$50.000' },
        { key: '20000', label: '$20.000' },
        { key: '10000', label: '$10.000' },
        { key: '5000', label: '$5.000' },
        { key: '2000', label: '$2.000' },
        { key: '1000', label: '$1.000' },
        { key: 'coins', label: 'Monedas / Otros' }
    ];

    container.innerHTML = denoms.map(d => `
        <div class="flex items-center justify-between bg-neutral-950 p-2 rounded-xl border border-neutral-800 text-xs">
            <span class="font-semibold text-neutral-300">${d.label}</span>
            <div class="flex items-center space-x-2">
                <button onclick="updateDenom('${d.key}', -1)" class="w-7 h-7 bg-neutral-800 text-white rounded-lg font-bold">-</button>
                <span id="denom-count-${d.key}" class="w-8 text-center font-bold text-white">${state.cashDenominations[d.key] || 0}</span>
                <button onclick="updateDenom('${d.key}', 1)" class="w-7 h-7 bg-neutral-800 text-white rounded-lg font-bold">+</button>
            </div>
        </div>
    `).join('');
}

function updateDenom(key, delta) {
    let curr = state.cashDenominations[key] || 0;
    curr = Math.max(0, curr + delta);
    state.cashDenominations[key] = curr;
    document.getElementById(`denom-count-${key}`).innerText = curr;
    saveStateToStorage();
    renderFinances();
}

function resetCashCounter() {
    Object.keys(state.cashDenominations).forEach(k => state.cashDenominations[k] = 0);
    saveStateToStorage();
    initDenominationsUI();
    renderFinances();
}

function addExpense() {
    const concept = document.getElementById('expense-concept').value;
    const amount = parseFloat(document.getElementById('expense-amount').value);
    if (!concept || isNaN(amount)) { alert("Ingrese concepto y monto válido"); return; }
    state.expenses.push({ id: 'exp-' + Date.now(), concept, amount });
    document.getElementById('expense-concept').value = "";
    document.getElementById('expense-amount').value = "";
    saveStateToStorage();
    renderExpenses();
    renderFinances();
}

function deleteExpense(id) {
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveStateToStorage();
    renderExpenses();
    renderFinances();
}

function renderExpenses() {
    const container = document.getElementById('expenses-list');
    if (!container) return;
    container.innerHTML = state.expenses.map(e => `
        <div class="flex justify-between items-center bg-neutral-950 p-2 rounded-xl border border-neutral-800 text-xs">
            <div>
                <strong class="text-white">${e.concept}</strong>
                <span class="text-rose-400 font-bold ml-2">-$${e.amount.toLocaleString()}</span>
            </div>
            <button onclick="deleteExpense('${e.id}')" class="text-rose-400 hover:text-rose-300 font-bold px-2 py-1">×</button>
        </div>
    `).join('');
}

function renderFinances() {
    let totalCashPhysical = (
        (state.cashDenominations['100000'] || 0) * 100000 +
        (state.cashDenominations['50000'] || 0) * 50000 +
        (state.cashDenominations['20000'] || 0) * 20000 +
        (state.cashDenominations['10000'] || 0) * 10000 +
        (state.cashDenominations['5000'] || 0) * 5000 +
        (state.cashDenominations['2000'] || 0) * 2000 +
        (state.cashDenominations['1000'] || 0) * 1000 +
        (state.cashDenominations['coins'] || 0) * 500
    );

    document.getElementById('counter-total-display').innerText = '$' + totalCashPhysical.toLocaleString();

    let totalFacturado = 0;
    let totalTransfer = 0;
    state.routes.forEach(r => {
        r.stops.forEach(s => {
            if (s.status === 'delivered') {
                totalFacturado += s.value;
                if (s.paymentMethod === 'transfer') {
                    totalTransfer += s.value;
                }
            }
        });
    });

    let totalGastos = state.expenses.reduce((acc, e) => acc + e.amount, 0);
    let netoTotal = totalFacturado - totalGastos;

    document.getElementById('summary-facturado').innerText = '$' + totalFacturado.toLocaleString();
    document.getElementById('summary-fisico').innerText = '$' + totalCashPhysical.toLocaleString();
    document.getElementById('summary-transfer').innerText = '$' + totalTransfer.toLocaleString();
    document.getElementById('summary-gastos').innerText = '$' + totalGastos.toLocaleString();
    document.getElementById('summary-neto-total').innerText = '$' + netoTotal.toLocaleString();
    document.getElementById('final-balance-badge').innerText = '$' + netoTotal.toLocaleString() + ' Neto';
}

function importarArchivoRoutin(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (data.routes && Array.isArray(data.routes)) {
                state = { ...state, ...data };
                saveStateToStorage();
                renderAll();
                alert("Rutas y datos importados exitosamente.");
            } else {
                alert("El archivo no tiene el formato válido de RouteLogix Pro.");
            }
        } catch(err) {
            alert("Error al parsear el archivo de ruta.");
        }
    };
    reader.readAsText(file);
}
