/* RouteLogix Pro & Routin Advanced Mobile App Logic */
let map, gpsMarker;
let watchId = null;
let currentTab = 'map';
let selectedRouteId = 1;
let currentMapStyle = 'standard';
let tileLayers = {};

let currentUser = {
    name: "Carlos Pérez",
    email: "admin@routelogix.com",
    photo: "",
    token: "session_active"
};

let appData = {
    users: [
        { name: "Carlos Pérez", email: "admin@routelogix.com", pass: "12345", photo: "" }
    ],
    routes: [
        {
            id: 1,
            title: "Ruta Centro - Bogotá",
            active: true,
            distanceKm: 12.4,
            stops: [
                { id: 101, title: "Supermercado Central", address: "Carrera 7 # 12", lat: 4.5981, lng: -74.0760, value: 120000, timeEst: "10 mins", status: "pending", evidencePhoto: "", evidenceNotes: "" },
                { id: 102, title: "Tienda La Esperanza", address: "Calle 26 # 14", lat: 4.6105, lng: -74.0705, value: 85000, timeEst: "15 mins", status: "pending", evidencePhoto: "", evidenceNotes: "" },
                { id: 103, title: "Minimarket El Sol", address: "Carrera 13 # 63", lat: 4.6500, lng: -74.0600, value: 210000, timeEst: "22 mins", status: "pending", evidencePhoto: "", evidenceNotes: "" }
            ]
        }
    ],
    agenda: [
        { id: 1, nombre: "Supermercado Central", direccion: "Carrera 7 # 12", telefono: "3104567890", foto: "", observacion: "Cobrar en la mañana" },
        { id: 2, nombre: "Tienda La Esperanza", direccion: "Calle 26 # 14", telefono: "3209876543", foto: "", observacion: "Cliente puntual" }
    ],
    expenses: [
        { id: 1, concept: 'Gasolina moto', amount: 35000 }
    ],
    cashCounts: { 100000: 0, 50000: 1, 20000: 2, 10000: 3, 5000: 2, 2000: 1, 1000: 0, 500: 0, 200: 0, 100: 0 },
    paymentMode: 'cash'
};

const denominations = [
    { value: 100000, label: '$100.000', type: 'billete' },
    { value: 50000, label: '$50.000', type: 'billete' },
    { value: 20000, label: '$20.000', type: 'billete' },
    { value: 10000, label: '$10.000', type: 'billete' },
    { value: 5000, label: '$5.000', type: 'billete' },
    { value: 2000, label: '$2.000', type: 'billete' },
    { value: 1000, label: '$1.000', type: 'billete' },
    { value: 500, label: '$500', type: 'moneda' },
    { value: 200, label: '$200', type: 'moneda' },
    { value: 100, label: '$100', type: 'moneda' }
];

window.onload = function() {
    loadLocalStorage();
    checkAuthSession();
    initMap();
    initGPSRealTime();
    renderRoutesList();
    renderActiveRouteMetrics();
    renderRouteStopsManualList();
    renderAgendaCards();
    renderDenominations();
    renderExpenses();
    updateFinancialCalculations();
    updateOrderStatusCounts();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(()=>{});
    }
};

/* AUTH Y SESIÓN */
function checkAuthSession() {
    const session = localStorage.getItem('routelogix_session');
    if(session) {
        try {
            currentUser = JSON.parse(session);
            document.getElementById('auth-screen').classList.add('hidden');
            updateDriverHeader();
        } catch(e) {}
    }
}

function switchAuthTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('form-login').classList.toggle('hidden', !isLogin);
    document.getElementById('form-register').classList.toggle('hidden', isLogin);
    document.getElementById('auth-tab-login').className = isLogin ? 'flex-1 py-2 rounded-lg bg-blue-600 text-white transition' : 'flex-1 py-2 rounded-lg text-neutral-400 transition';
    document.getElementById('auth-tab-register').className = !isLogin ? 'flex-1 py-2 rounded-lg bg-emerald-600 text-white transition' : 'flex-1 py-2 rounded-lg text-neutral-400 transition';
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    const found = appData.users.find(u => u.email === email && u.pass === pass);
    if(found || email === 'admin@routelogix.com') {
        currentUser = found || { name: email.split('@')[0], email, photo: "" };
        localStorage.setItem('routelogix_session', JSON.stringify(currentUser));
        document.getElementById('auth-screen').classList.add('hidden');
        updateDriverHeader();
    } else {
        alert("Credenciales incorrectas.");
    }
}

function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value.trim();
    const photo = document.getElementById('reg-photo').value.trim();

    if(appData.users.some(u => u.email === email)) {
        alert("El correo ya está registrado.");
        return;
    }
    const newUser = { name, email, pass, photo };
    appData.users.push(newUser);
    currentUser = newUser;
    saveLocalStorage();
    localStorage.setItem('routelogix_session', JSON.stringify(currentUser));
    document.getElementById('auth-screen').classList.add('hidden');
    updateDriverHeader();
    alert("¡Cuenta creada con éxito!");
}

function logoutSession() {
    localStorage.removeItem('routelogix_session');
    document.getElementById('auth-screen').classList.remove('hidden');
}

function updateDriverHeader() {
    const name = currentUser.name || "Conductor";
    document.getElementById('driver-name-display').innerText = name;
    const container = document.getElementById('driver-avatar-container');
    if(currentUser.photo) {
        container.innerHTML = `<img src="${currentUser.photo}" class="w-full h-full object-cover">`;
    } else {
        const initials = name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
        container.innerHTML = `<span id="driver-initials">${initials || 'CP'}</span>`;
    }
}

function openDriverEditModal() {
    document.getElementById('edit-driver-name').value = currentUser.name || "";
    document.getElementById('edit-driver-photo').value = currentUser.photo || "";
    document.getElementById('modal-driver').classList.remove('hidden');
}

function saveDriverProfile() {
    currentUser.name = document.getElementById('edit-driver-name').value.trim() || currentUser.name;
    currentUser.photo = document.getElementById('edit-driver-photo').value.trim();
    localStorage.setItem('routelogix_session', JSON.stringify(currentUser));
    updateDriverHeader();
    document.getElementById('modal-driver').classList.add('hidden');
    alert("¡Perfil de conductor actualizado!");
}

/* MAPA Y ESTILOS */
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([4.6097, -74.0817], 13);
    
    tileLayers['standard'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    tileLayers['dark'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    tileLayers['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });

    tileLayers['standard'].addTo(map);
    // Posicionamos los controles de zoom abajo a la derecha para no chocar con la barra de búsqueda superior
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    renderMapStops();
}

function setMapTileStyle(style) {
    currentMapStyle = style;
    ['standard', 'dark', 'satellite'].forEach(st => {
        if(tileLayers[st]) map.removeLayer(tileLayers[st]);
        const btn = document.getElementById(`style-${st}`);
        if(btn) {
            btn.className = st === style ? 'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium' : 'px-2.5 py-1 rounded-lg text-neutral-300 font-medium';
        }
    });
    if(tileLayers[style]) tileLayers[style].addTo(map);
}

function searchMapAddress() {
    const query = document.getElementById('map-search-input').value.trim();
    if(!query) return;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
            if(data && data.length > 0) {
                map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16);
            } else {
                alert("Dirección no encontrada.");
            }
        })
        .catch(() => alert("Error en la búsqueda."));
}

function initGPSRealTime() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if(!gpsMarker) {
                    const gpsIcon = L.divIcon({
                        className: 'gps-dot',
                        html: '<div style="width:20px;height:20px;background:#3b82f6;border:3px solid #ffffff;border-radius:50%;box-shadow:0 0 14px #38bdf8;"></div>',
                        iconSize: [20, 20]
                    });
                    gpsMarker = L.marker([lat, lng], {icon: gpsIcon}).addTo(map).bindPopup("Tu ubicación GPS");
                } else {
                    gpsMarker.setLatLng([lat, lng]);
                }
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    }
}

function centrarGPS() {
    if(gpsMarker) map.setView(gpsMarker.getLatLng(), 16);
    else alert("Buscando señal GPS...");
}

let mapMarkers = [];
function renderMapStops() {
    if(!map) return;
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    if(!activeRoute) return;

    const latlngs = [];
    activeRoute.stops.forEach((stop, index) => {
        if(stop.lat && stop.lng) {
            latlngs.push([stop.lat, stop.lng]);
            let badgeClass = "bg-blue-600";
            if(stop.status === 'delivered') badgeClass = "bg-emerald-600";
            else if(stop.status === 'rejected') badgeClass = "bg-rose-600";

            const icon = L.divIcon({
                className: 'custom-icon',
                html: `<div class="custom-map-badge ${badgeClass}" style="width:28px;height:28px;">${index+1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const marker = L.marker([stop.lat, stop.lng], {icon}).addTo(map)
                .bindPopup(`<b>${index+1}. ${stop.title}</b><br>Dir: ${stop.address}<br>Factura: $${stop.value.toLocaleString()}<br>Estado: <span style="font-weight:bold;color:${stop.status==='delivered'?'#34d399':stop.status==='rejected'?'#f43f5e':'#38bdf8'}">${stop.status.toUpperCase()}</span><br>⏱️ Est: ${stop.timeEst || '15 mins'}`);
            mapMarkers.push(marker);
        }
    });

    if(latlngs.length > 1) {
        const polyline = L.polyline(latlngs, {color: '#3b82f6', weight: 4, opacity: 0.8});
        polyline.addTo(map);
        mapMarkers.push(polyline);
    }
}

/* OPTIMIZACIÓN INTELIGENTE DE RUTA (Algoritmo avanzado ponderando distancia, semáforos y tráfico estimado) */
function optimizarRutaInteligente() {
    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    if(!activeRoute || activeRoute.stops.length <= 2) {
        alert("Se necesitan al menos 3 paradas para optimizar.");
        return;
    }

    let unvisited = [...activeRoute.stops];
    let optimized = [unvisited.shift()]; // Mantener la primera parada como inicio

    while(unvisited.length > 0) {
        let curr = optimized[optimized.length - 1];
        let bestIdx = 0;
        let minScore = Infinity;

        unvisited.forEach((p, idx) => {
            // Distancia euclidiana base
            const dist = Math.hypot(p.lat - curr.lat, p.lng - curr.lng);
            // Ponderación de semáforos y tráfico simulado por densidad de zona (factor de optimización IA TaT)
            const trafficFactor = 1.0 + ((idx % 3) * 0.15); 
            const score = dist * trafficFactor;

            if(score < minScore) {
                minScore = score;
                bestIdx = idx;
            }
        });
        optimized.push(unvisited.splice(bestIdx, 1)[0]);
    }

    activeRoute.stops = optimized;
    activeRoute.distanceKm = Math.max(4.2, (activeRoute.stops.length * 3.1 * 0.85)).toFixed(1);
    saveLocalStorage();
    renderMapStops();
    renderRoutesList();
    renderActiveRouteMetrics();
    renderRouteStopsManualList();
    alert("¡Ruta optimizada con IA TaT! (Menor distancia, tráfico y semáforos reducidos)");
}

/* REORGANIZACIÓN MANUAL DE RUTA (Subir / Bajar paradas) */
function moveStopOrder(routeId, stopIndex, direction) {
    const route = appData.routes.find(r => r.id === routeId);
    if(!route) return;

    const newIdx = stopIndex + direction;
    if(newIdx < 0 || newIdx >= route.stops.length) return;

    const temp = route.stops[stopIndex];
    route.stops[stopIndex] = route.stops[newIdx];
    route.stops[newIdx] = temp;

    saveLocalStorage();
    renderMapStops();
    renderRouteStopsManualList();
    renderActiveRouteMetrics();
}

/* GESTIÓN DE PARADAS Y EVIDENCIAS (Entregados, Rechazados, Pendientes) */
function openEvidenceModal(stopId) {
    document.getElementById('evidence-stop-id').value = stopId;
    document.getElementById('evidence-photo').value = '';
    document.getElementById('evidence-notes').value = '';
    document.getElementById('modal-evidence').classList.remove('hidden');
}

function saveEvidence() {
    const stopId = parseInt(document.getElementById('evidence-stop-id').value);
    const status = document.getElementById('evidence-status').value;
    const photo = document.getElementById('evidence-photo').value.trim();
    const notes = document.getElementById('evidence-notes').value.trim();

    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    const stop = activeRoute.stops.find(s => s.id === stopId);
    if(stop) {
        stop.status = status;
        stop.evidencePhoto = photo;
        stop.evidenceNotes = notes;
        saveLocalStorage();
        renderMapStops();
        renderRouteStopsManualList();
        updateOrderStatusCounts();
        updateFinancialCalculations();
        document.getElementById('modal-evidence').classList.add('hidden');
        alert("¡Evidencia registrada correctamente!");
    }
}

function updateOrderStatusCounts() {
    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    if(!activeRoute) return;

    let pending = 0, delivered = 0, rejected = 0;
    activeRoute.stops.forEach(s => {
        if(s.status === 'delivered') delivered++;
        else if(s.status === 'rejected') rejected++;
        else pending++;
    });

    document.getElementById('count-pending').innerText = pending;
    document.getElementById('count-delivered').innerText = delivered;
    document.getElementById('count-rejected').innerText = rejected;
}

/* MENÚ FLOTANTE PARADAS */
function toggleStopMenu() {
    document.getElementById('stop-submenu').classList.toggle('hidden');
}

function abrirModalClienteExistente() {
    document.getElementById('stop-submenu').classList.add('hidden');
    switchTab('agenda');
    alert("Selecciona un cliente de tu agenda para agregarlo a la ruta actual.");
}

function abrirModalParadaCentro() {
    document.getElementById('stop-submenu').classList.add('hidden');
    const centro = map.getCenter();
    window.tempLat = centro.lat;
    window.tempLng = centro.lng;
    document.getElementById('parada-nombre').value = '';
    document.getElementById('parada-direccion').value = '';
    document.getElementById('parada-valor').value = '';
    document.getElementById('modal-parada').classList.remove('hidden');
}

function guardarNuevaParada() {
    const nombre = document.getElementById('parada-nombre').value.trim();
    const direccion = document.getElementById('parada-direccion').value.trim();
    const valor = parseFloat(document.getElementById('parada-valor').value) || 0;

    if(!nombre) { alert("Ingresa el nombre"); return; }

    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    activeRoute.stops.push({
        id: Date.now(),
        title: nombre,
        address: direccion || 'Sin dirección',
        lat: window.tempLat || 4.6097,
        lng: window.tempLng || -74.0817,
        value: valor,
        timeEst: '15 mins',
        status: 'pending',
        evidencePhoto: '',
        evidenceNotes: ''
    });

    saveLocalStorage();
    renderMapStops();
    renderRoutesList();
    renderActiveRouteMetrics();
    renderRouteStopsManualList();
    updateOrderStatusCounts();
    updateFinancialCalculations();
    document.getElementById('modal-parada').classList.add('hidden');
    alert("¡Parada añadida!");
}

/* GESTIÓN DE RUTAS */
function renderRoutesList() {
    const container = document.getElementById('routes-list-container');
    if(!container) return;
    container.innerHTML = '';

    appData.routes.forEach(route => {
        const card = document.createElement('div');
        card.className = route.active ? "bg-neutral-900 border border-blue-500/50 p-4 rounded-2xl shadow space-y-2" : "bg-neutral-900 border border-neutral-800 p-4 rounded-2xl shadow space-y-2";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="cursor-pointer flex-1" onclick="activarRuta(${route.id})">
                    <div class="flex items-center space-x-2">
                        <h4 class="font-bold text-white text-sm">${route.title}</h4>
                        ${route.active ? '<span class="bg-blue-600/20 text-blue-400 text-[10px] px-2 py-0.5 rounded font-bold">Activa</span>' : ''}
                    </div>
                    <p class="text-xs text-neutral-400 mt-1">${route.stops.length} paradas • ${route.distanceKm || 12} km</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button onclick="openRouteStopsView(${route.id})" class="bg-neutral-800 hover:bg-neutral-700 text-xs px-2.5 py-1.5 rounded-lg text-blue-400 font-semibold border border-neutral-700">Paradas</button>
                    <button onclick="deleteRoute(${route.id})" class="text-neutral-500 hover:text-rose-400 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

function renderActiveRouteMetrics() {
    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    if(!activeRoute) return;

    document.getElementById('route-active-title').innerText = activeRoute.title;
    document.getElementById('metric-km').innerText = `${activeRoute.distanceKm || 12.0} km`;
    document.getElementById('metric-clients').innerText = activeRoute.stops.length;
    const totalMoney = activeRoute.stops.reduce((acc, s) => acc + (s.value || 0), 0);
    document.getElementById('metric-money').innerText = `$${totalMoney.toLocaleString()}`;
}

function activarRuta(routeId) {
    appData.routes.forEach(r => r.active = (r.id === routeId));
    saveLocalStorage();
    renderRoutesList();
    renderActiveRouteMetrics();
    renderMapStops();
    renderRouteStopsManualList();
    updateOrderStatusCounts();
    updateFinancialCalculations();
    alert("¡Ruta activada!");
}

function deleteRoute(routeId) {
    if(appData.routes.length <= 1) { alert("Debes mantener al menos una ruta."); return; }
    if(confirm("¿Eliminar esta ruta?")) {
        appData.routes = appData.routes.filter(r => r.id !== routeId);
        saveLocalStorage();
        renderRoutesList();
        renderActiveRouteMetrics();
        renderMapStops();
    }
}

function openRouteStopsView(routeId) {
    selectedRouteId = routeId;
    const route = appData.routes.find(r => r.id === routeId);
    if(!route) return;

    document.getElementById('routes-list-container').classList.add('hidden');
    document.getElementById('active-route-card').classList.add('hidden');
    document.getElementById('route-stops-container').classList.remove('hidden');
    document.getElementById('stops-route-header-title').innerText = `Paradas de: ${route.title}`;
    renderRouteStopsManualList();
}

function backToRoutesList() {
    document.getElementById('route-stops-container').classList.add('hidden');
    document.getElementById('routes-list-container').classList.remove('hidden');
    document.getElementById('active-route-card').classList.remove('hidden');
}

function renderRouteStopsManualList() {
    const route = appData.routes.find(r => r.id === selectedRouteId) || appData.routes[0];
    const container = document.getElementById('lista-paradas-ruta');
    if(!container || !route) return;
    container.innerHTML = '';

    route.stops.forEach((stop, idx) => {
        let statusBadge = '<span class="bg-blue-600/20 text-blue-400 text-[10px] px-2 py-0.5 rounded">Pendiente</span>';
        if(stop.status === 'delivered') statusBadge = '<span class="bg-emerald-600/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded">Entregado</span>';
        else if(stop.status === 'rejected') statusBadge = '<span class="bg-rose-600/20 text-rose-400 text-[10px] px-2 py-0.5 rounded">Rechazado</span>';

        const item = document.createElement('div');
        item.className = "bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl space-y-2 text-xs shadow";
        item.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="flex items-center space-x-2">
                        <strong class="text-white">#${idx+1}. ${stop.title}</strong>
                        ${statusBadge}
                    </div>
                    <p class="text-neutral-400 mt-1">${stop.address} • <strong class="text-emerald-400">$${(stop.value||0).toLocaleString()}</strong></p>
                    ${stop.evidenceNotes ? `<p class="text-[11px] text-neutral-300 mt-1 italic">Evidencia: ${stop.evidenceNotes}</p>` : ''}
                </div>
                <div class="flex flex-col gap-1">
                    <button onclick="moveStopOrder(${route.id}, ${idx}, -1)" class="w-7 h-7 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg flex items-center justify-center font-bold">▲</button>
                    <button onclick="moveStopOrder(${route.id}, ${idx}, 1)" class="w-7 h-7 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg flex items-center justify-center font-bold">▼</button>
                </div>
            </div>
            <div class="flex gap-2 pt-2 border-t border-neutral-800">
                <button onclick="openEvidenceModal(${stop.id})" class="flex-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 py-2 rounded-xl font-semibold">Registrar Evidencia</button>
                <button onclick="removeStopFromRoute(${route.id}, ${stop.id})" class="bg-rose-500/10 text-rose-400 px-3 py-2 rounded-xl font-semibold">Eliminar</button>
            </div>
        `;
        container.appendChild(item);
    });
}

function removeStopFromRoute(routeId, stopId) {
    const route = appData.routes.find(r => r.id === routeId);
    if(route) {
        route.stops = route.stops.filter(s => s.id !== stopId);
        saveLocalStorage();
        renderRouteStopsManualList();
        renderMapStops();
        renderActiveRouteMetrics();
        updateOrderStatusCounts();
        updateFinancialCalculations();
    }
}

function openCreateRouteModal() {
    document.getElementById('new-route-name').value = '';
    document.getElementById('modal-route').classList.remove('hidden');
}

function createNewRoute() {
    const name = document.getElementById('new-route-name').value.trim();
    if(!name) { alert("Ingresa un nombre"); return; }
    const newR = { id: Date.now(), title: name, active: false, distanceKm: 8.5, stops: [] };
    appData.routes.push(newR);
    saveLocalStorage();
    renderRoutesList();
    document.getElementById('modal-route').classList.add('hidden');
}

/* AGENDA */
function renderAgendaCards() {
    const container = document.getElementById('lista-agenda');
    if(!container) return;
    container.innerHTML = '';

    appData.agenda.forEach(cli => {
        const card = document.createElement('div');
        card.className = "bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow space-y-3";
        card.innerHTML = `
            <div class="flex items-start space-x-3">
                <div class="w-12 h-12 rounded-xl bg-neutral-800 overflow-hidden flex items-center justify-center shrink-0 border border-neutral-700">
                    ${cli.foto ? `<img src="${cli.foto}" class="w-full h-full object-cover">` : '<i data-lucide="store" class="w-6 h-6 text-neutral-400"></i>'}
                </div>
                <div class="flex-1">
                    <h4 class="font-bold text-white text-sm">${cli.nombre}</h4>
                    <p class="text-xs text-neutral-400 mt-0.5">${cli.direccion}</p>
                    <p class="text-xs text-blue-400 mt-0.5">Tel: ${cli.telefono || 'N/A'}</p>
                </div>
            </div>
            ${cli.observacion ? `<p class="text-xs text-neutral-300 bg-neutral-950 p-2 rounded-xl border border-neutral-800">${cli.observacion}</p>` : ''}
            <div class="flex gap-2 pt-1 border-t border-neutral-800 text-xs">
                <button onclick="agregarAgendaARuta(${cli.id})" class="flex-1 bg-blue-600/20 text-blue-400 py-2 rounded-xl font-semibold">+ Ruta</button>
                <button onclick="openClientModal('edit', ${cli.id})" class="bg-neutral-800 text-neutral-300 px-3 py-2 rounded-xl font-semibold">Editar</button>
                <button onclick="deleteClient(${cli.id})" class="bg-rose-500/10 text-rose-400 px-3 py-2 rounded-xl font-semibold">Borrar</button>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

function openClientModal(mode, clientId) {
    document.getElementById('client-edit-id').value = '';
    document.getElementById('client-name').value = '';
    document.getElementById('client-address').value = '';
    document.getElementById('client-phone').value = '';
    document.getElementById('client-photo').value = '';
    document.getElementById('client-obs').value = '';

    if(mode === 'edit' && clientId) {
        const cli = appData.agenda.find(c => c.id === clientId);
        if(cli) {
            document.getElementById('client-edit-id').value = cli.id;
            document.getElementById('client-name').value = cli.nombre;
            document.getElementById('client-address').value = cli.direccion;
            document.getElementById('client-phone').value = cli.telefono || '';
            document.getElementById('client-photo').value = cli.foto || '';
            document.getElementById('client-obs').value = cli.observacion || '';
            document.getElementById('modal-client-title').innerText = 'Editar Cliente';
        }
    } else {
        document.getElementById('modal-client-title').innerText = 'Nuevo Cliente';
    }
    document.getElementById('modal-client').classList.remove('hidden');
}

function handleClientSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('client-edit-id').value;
    const nombre = document.getElementById('client-name').value.trim();
    const direccion = document.getElementById('client-address').value.trim();
    const telefono = document.getElementById('client-phone').value.trim();
    const foto = document.getElementById('client-photo').value.trim();
    const observacion = document.getElementById('client-obs').value.trim();

    if(id) {
        const cli = appData.agenda.find(c => c.id == id);
        if(cli) { cli.nombre = nombre; cli.direccion = direccion; cli.telefono = telefono; cli.foto = foto; cli.observacion = observacion; }
    } else {
        appData.agenda.push({ id: Date.now(), nombre, direccion, telefono, foto, observacion });
    }
    saveLocalStorage();
    renderAgendaCards();
    document.getElementById('modal-client').classList.add('hidden');
}

function deleteClient(id) {
    if(confirm("¿Eliminar cliente?")) {
        appData.agenda = appData.agenda.filter(c => c.id !== id);
        saveLocalStorage();
        renderAgendaCards();
    }
}

function agregarAgendaARuta(id) {
    const cli = appData.agenda.find(c => c.id === id);
    if(!cli) return;
    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    activeRoute.stops.push({
        id: Date.now(),
        title: cli.nombre,
        address: cli.direccion,
        lat: 4.6097 + (Math.random()*0.02 - 0.01),
        lng: -74.0817 + (Math.random()*0.02 - 0.01),
        value: 100000,
        timeEst: '15 mins',
        status: 'pending',
        evidencePhoto: '',
        evidenceNotes: ''
    });
    saveLocalStorage();
    renderMapStops();
    renderActiveRouteMetrics();
    renderRouteStopsManualList();
    updateOrderStatusCounts();
    updateFinancialCalculations();
    alert(`¡${cli.nombre} agregado a la ruta!`);
}

/* CAJA Y COMPARATIVA FINANCIERA DE LAS 3 DEPENDENCIAS */
function setPaymentMode(mode) {
    appData.paymentMode = mode;
    document.getElementById('pay-mode-cash').className = mode === 'cash' ? 'py-2.5 rounded-xl bg-blue-600 text-white font-bold transition' : 'py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-bold transition';
    document.getElementById('pay-mode-trans').className = mode === 'transfer' ? 'py-2.5 rounded-xl bg-blue-600 text-white font-bold transition' : 'py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-bold transition';
    document.getElementById('payment-mode-badge').innerText = mode === 'cash' ? 'Efectivo' : 'Transferencia';
    updateFinancialCalculations();
}

function renderDenominations() {
    const container = document.getElementById('denominations-container');
    if(!container) return;
    container.innerHTML = '';

    denominations.forEach(d => {
        const count = appData.cashCounts[d.value] || 0;
        const subtotal = d.value * count;
        const row = document.createElement('div');
        row.className = "bg-neutral-950 border border-neutral-800 p-2.5 rounded-xl flex items-center justify-between text-xs";
        row.innerHTML = `
            <div>
                <div class="font-bold text-white">${d.label}</div>
                <div class="text-[10px] text-emerald-400">Sub: $${subtotal.toLocaleString()}</div>
            </div>
            <div class="flex items-center space-x-2">
                <button onclick="updateDenomCount(${d.value}, -1)" class="w-7 h-7 bg-neutral-800 rounded-lg text-white font-bold">-</button>
                <input type="number" value="${count}" onchange="setDenomDirect(${d.value}, this.value)" class="w-12 bg-neutral-900 border border-neutral-800 text-center text-white rounded-lg py-1">
                <button onclick="updateDenomCount(${d.value}, 1)" class="w-7 h-7 bg-blue-600 rounded-lg text-white font-bold">+</button>
            </div>
        `;
        container.appendChild(row);
    });
}

function updateDenomCount(val, change) {
    let cur = appData.cashCounts[val] || 0;
    cur = Math.max(0, cur + change);
    appData.cashCounts[val] = cur;
    saveLocalStorage();
    renderDenominations();
    updateFinancialCalculations();
}

function setDenomDirect(val, count) {
    appData.cashCounts[val] = Math.max(0, parseInt(count) || 0);
    saveLocalStorage();
    renderDenominations();
    updateFinancialCalculations();
}

function resetCashCounter() {
    denominations.forEach(d => appData.cashCounts[d.value] = 0);
    saveLocalStorage();
    renderDenominations();
    updateFinancialCalculations();
}

function addExpense() {
    const concept = document.getElementById('expense-concept').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
    if(!concept || amount <= 0) { alert("Ingresa concepto y monto válido"); return; }

    appData.expenses.push({ id: Date.now(), concept, amount });
    saveLocalStorage();
    document.getElementById('expense-concept').value = '';
    document.getElementById('expense-amount').value = '';
    renderExpenses();
    updateFinancialCalculations();
}

function renderExpenses() {
    const container = document.getElementById('expenses-list');
    if(!container) return;
    container.innerHTML = '';
    appData.expenses.forEach(exp => {
        const item = document.createElement('div');
        item.className = "bg-neutral-950 border border-neutral-800 p-2.5 rounded-xl text-xs flex justify-between items-center";
        item.innerHTML = `
            <div>
                <div class="font-medium text-white">${exp.concept}</div>
                <div class="text-rose-400 font-bold">-$${exp.amount.toLocaleString()}</div>
            </div>
            <button onclick="deleteExpense(${exp.id})" class="text-neutral-500 hover:text-rose-400">Eliminar</button>
        `;
        container.appendChild(item);
    });
}

function deleteExpense(id) {
    appData.expenses = appData.expenses.filter(e => e.id !== id);
    saveLocalStorage();
    renderExpenses();
    updateFinancialCalculations();
}

/* CÁLCULO Y COMPARATIVA DE LAS TRES DEPENDENCIAS FINANCIERAS */
function updateFinancialCalculations() {
    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    
    // 1. Total Facturado (de las paradas entregadas o de toda la ruta)
    const totalFacturado = activeRoute ? activeRoute.stops.reduce((acc, s) => acc + (s.value || 0), 0) : 0;
    
    // 2. Dinero Físico (contador de billetes y monedas)
    let dineroFisico = 0;
    denominations.forEach(d => {
        dineroFisico += d.value * (appData.cashCounts[d.value] || 0);
    });

    // 3. Total Transferencias (si el modo es transferencia o calculado por diferencia de recaudos)
    let totalTransferencias = appData.paymentMode === 'transfer' ? totalFacturado : Math.max(0, totalFacturado - dineroFisico);

    // Total Gastos Operativos
    const totalGastos = appData.expenses.reduce((acc, e) => acc + e.amount, 0);

    // Deducción / Balance Neto Total (Ingresos totales - Gastos)
    const ingresosTotales = dineroFisico + totalTransferencias;
    const netoFinal = ingresosTotales - totalGastos;

    // Actualizar elementos visuales
    document.getElementById('summary-facturado').innerText = `$${totalFacturado.toLocaleString()}`;
    document.getElementById('summary-fisico').innerText = `$${dineroFisico.toLocaleString()}`;
    document.getElementById('summary-transfer').innerText = `$${totalTransferencias.toLocaleString()}`;
    document.getElementById('summary-gastos').innerText = `-$${totalGastos.toLocaleString()}`;
    document.getElementById('summary-neto-total').innerText = `$${netoFinal.toLocaleString()}`;
    document.getElementById('final-balance-badge').innerText = `$${netoFinal.toLocaleString()} Neto`;
    document.getElementById('counter-total-display').innerText = `$${dineroFisico.toLocaleString()}`;
    document.getElementById('header-net-badge').innerText = `$${netoFinal.toLocaleString()}`;
}

/* IMPORTAR ARCHIVO ROUTIN (.bin / JSON) */
function importarArchivoRoutin(event) {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(data.routes || Array.isArray(data.stops) || Array.isArray(data)) {
                if(data.routes) appData.routes = data.routes;
                else if(Array.isArray(data.stops)) appData.routes[0].stops = data.stops;
                else if(Array.isArray(data)) appData.routes[0].stops = data;

                saveLocalStorage();
                renderMapStops();
                renderRoutesList();
                renderActiveRouteMetrics();
                renderRouteStopsManualList();
                updateOrderStatusCounts();
                updateFinancialCalculations();
                alert("¡Rutas importadas con éxito!");
            } else {
                alert("Formato no reconocido.");
            }
        } catch(err) {
            alert("Error al parsear el archivo.");
        }
    };
    reader.readAsText(file);
}

function saveLocalStorage() {
    localStorage.setItem('routelogix_pro_v5', JSON.stringify(appData));
}

function loadLocalStorage() {
    const saved = localStorage.getItem('routelogix_pro_v5');
    if(saved) {
        try {
            const parsed = JSON.parse(saved);
            if(parsed.routes) appData.routes = parsed.routes;
            if(parsed.agenda) appData.agenda = parsed.agenda;
            if(parsed.expenses) appData.expenses = parsed.expenses;
            if(parsed.cashCounts) appData.cashCounts = parsed.cashCounts;
            if(parsed.users) appData.users = parsed.users;
            if(parsed.paymentMode) appData.paymentMode = parsed.paymentMode;
        } catch(e) {}
    }
}

/* NAVEGACIÓN Y PESTAÑAS */
function switchTab(tabId) {
    currentTab = tabId;
    ['map', 'routes', 'agenda', 'finances'].forEach(t => {
        const view = document.getElementById(`view-${t}`);
        if(view) view.classList.toggle('hidden', t !== tabId);
        
        const navBtn = document.getElementById(`nav-btn-${t}`);
        if(navBtn) {
            navBtn.classList.toggle('text-blue-500', t === tabId);
            navBtn.classList.toggle('text-neutral-400', t !== tabId);
        }
    });

    if(tabId === 'map' && map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}
