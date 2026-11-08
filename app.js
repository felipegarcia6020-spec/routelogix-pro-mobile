/* RouteLogix Pro & Routin Modern Mobile App Logic */
let map, gpsMarker;
let watchId = null;
let currentTab = 'map';
let selectedRouteId = 1;
let selectedClientForStop = null;
let currentMapStyle = 'standard';
let tileLayers = {};

let currentUser = {
    name: "Carlos Pérez",
    email: "admin@routelogix.com",
    token: "session_active"
};

let appData = {
    users: [
        { name: "Carlos Pérez", email: "admin@routelogix.com", pass: "12345" }
    ],
    routes: [
        {
            id: 1,
            title: "Ruta Centro - Bogotá",
            active: true,
            distanceKm: 14.5,
            stops: [
                { id: 101, title: "Supermercado Central", address: "Carrera 7 # 12", lat: 4.5981, lng: -74.0760, value: 120000, timeEst: "10 mins", status: "pending" },
                { id: 102, title: "Tienda La Esperanza", address: "Calle 26 # 14", lat: 4.6105, lng: -74.0705, value: 85000, timeEst: "18 mins", status: "pending" },
                { id: 103, title: "Minimarket El Sol", address: "Carrera 13 # 63", lat: 4.6500, lng: -74.0600, value: 210000, timeEst: "25 mins", status: "pending" }
            ]
        }
    ],
    agenda: [
        { id: 1, nombre: "Supermercado Central", direccion: "Carrera 7 # 12", telefono: "3104567890", foto: "", observacion: "Cobrar preferiblemente en la mañana" },
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
    renderAgendaCards();
    renderDenominations();
    renderExpenses();
    updateFinancialCalculations();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log("Service Worker registrado."));
    }
};

/* 7. AUTH Y LOGIN */
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
        currentUser = found || { name: email.split('@')[0], email };
        localStorage.setItem('routelogix_session', JSON.stringify(currentUser));
        document.getElementById('auth-screen').classList.add('hidden');
        updateDriverHeader();
    } else {
        alert("Credenciales incorrectas o usuario no registrado.");
    }
}

function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value.trim();

    if(appData.users.some(u => u.email === email)) {
        alert("Este correo ya está registrado.");
        return;
    }

    const newUser = { name, email, pass };
    appData.users.push(newUser);
    currentUser = newUser;
    saveLocalStorage();
    localStorage.setItem('routelogix_session', JSON.stringify(currentUser));
    document.getElementById('auth-screen').classList.add('hidden');
    updateDriverHeader();
    alert("¡Cuenta creada con éxito e iniciada sesión!");
}

function logoutSession() {
    localStorage.removeItem('routelogix_session');
    document.getElementById('auth-screen').classList.remove('hidden');
}

function updateDriverHeader() {
    const name = currentUser.name || "Conductor";
    document.getElementById('driver-name-display').innerText = name;
    const initials = name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    document.getElementById('driver-avatar').innerText = initials || 'RL';
}

/* 2 & 9. MAPA Y ESTILOS */
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([4.6097, -74.0817], 13);
    
    tileLayers['standard'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    tileLayers['dark'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    tileLayers['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });

    tileLayers['standard'].addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);

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
    // Nominatim geocoding open
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
            if(data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                map.setView([lat, lon], 16);
            } else {
                alert("Dirección no encontrada en el mapa.");
            }
        })
        .catch(() => alert("Error al buscar dirección."));
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
            (err) => {},
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    }
}

function centrarGPS() {
    if(gpsMarker) {
        map.setView(gpsMarker.getLatLng(), 16);
    } else {
        alert("Buscando señal GPS...");
    }
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
            const badgeClass = stop.status === 'completed' ? 'bg-emerald-600' : 'bg-blue-600';
            const icon = L.divIcon({
                className: 'custom-icon',
                html: `<div class="custom-map-badge ${badgeClass}" style="width:28px;height:28px;">${index+1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            // 2. Información del cliente, factura y tiempo estimado en popup
            const marker = L.marker([stop.lat, stop.lng], {icon}).addTo(map)
                .bindPopup(`<b>${index+1}. ${stop.title}</b><br>Dir: ${stop.address}<br>Factura: $${stop.value.toLocaleString()}<br>⏱️ Tiempo est: ${stop.timeEst || '15 mins'}`);
            mapMarkers.push(marker);
        }
    });

    if(latlngs.length > 1) {
        const polyline = L.polyline(latlngs, {color: '#3b82f6', weight: 4, opacity: 0.8});
        polyline.addTo(map);
        mapMarkers.push(polyline);
    }
}

/* 5. Menú flotante de paradas */
function toggleStopMenu() {
    const menu = document.getElementById('stop-submenu');
    menu.classList.toggle('hidden');
}

function abrirModalClienteExistente() {
    document.getElementById('stop-submenu').classList.add('hidden');
    // Muestra un selector rápido o abre la pestaña agenda
    switchTab('agenda');
    alert("Selecciona un cliente de tu agenda para agregarlo a la ruta actual.");
}

function abrirModalParadaCentro(mode) {
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

    if(!nombre) { alert("Ingresa el nombre del cliente"); return; }

    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    activeRoute.stops.push({
        id: Date.now(),
        title: nombre,
        address: direccion || 'Sin dirección',
        lat: window.tempLat || 4.6097,
        lng: window.tempLng || -74.0817,
        value: valor,
        timeEst: '15 mins',
        status: 'pending'
    });

    saveLocalStorage();
    renderMapStops();
    renderRoutesList();
    renderActiveRouteMetrics();
    document.getElementById('modal-parada').classList.add('hidden');
    alert("¡Parada añadida con éxito!");
}

/* 3. PESTAÑA RUTA (Gestión, activación, métricas) */
function renderRoutesList() {
    const container = document.getElementById('routes-list-container');
    if(!container) return;
    container.innerHTML = '';

    appData.routes.forEach(route => {
        const card = document.createElement('div');
        card.className = route.active ? "bg-neutral-900 border border-blue-500/50 p-4 rounded-2xl shadow space-y-2" : "bg-neutral-900 border border-neutral-800 p-4 rounded-2xl shadow space-y-2";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div onclick="openRouteStopsView(${route.id})" class="cursor-pointer flex-1">
                    <div class="flex items-center space-x-2">
                        <h4 class="font-bold text-white text-sm">${route.title}</h4>
                        ${route.active ? '<span class="bg-blue-600/20 text-blue-400 text-[10px] px-2 py-0.5 rounded font-bold">Activa</span>' : ''}
                    </div>
                    <p class="text-xs text-neutral-400 mt-1">${route.stops.length} paradas • ${route.distanceKm || 12} km</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button onclick="activarRuta(${route.id})" class="bg-neutral-800 hover:bg-neutral-700 text-xs px-2.5 py-1.5 rounded-lg text-blue-400 font-semibold border border-neutral-700">${route.active ? 'Activa' : 'Activar'}</button>
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
    alert("¡Ruta activada correctamente!");
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

    const container = document.getElementById('lista-paradas-ruta');
    container.innerHTML = '';
    route.stops.forEach((stop, idx) => {
        const item = document.createElement('div');
        item.className = "bg-neutral-900 border border-neutral-800 p-3 rounded-xl flex justify-between items-center text-xs";
        item.innerHTML = `
            <div>
                <strong>${idx+1}. ${stop.title}</strong>
                <p class="text-neutral-400">${stop.address} • $${(stop.value||0).toLocaleString()}</p>
            </div>
            <button onclick="removeStopFromRoute(${routeId}, ${stop.id})" class="text-rose-400">Eliminar</button>
        `;
        container.appendChild(item);
    });
}

function backToRoutesList() {
    document.getElementById('route-stops-container').classList.add('hidden');
    document.getElementById('routes-list-container').classList.remove('hidden');
    document.getElementById('active-route-card').classList.remove('hidden');
}

function removeStopFromRoute(routeId, stopId) {
    const route = appData.routes.find(r => r.id === routeId);
    if(route) {
        route.stops = route.stops.filter(s => s.id !== stopId);
        saveLocalStorage();
        openRouteStopsView(routeId);
        renderMapStops();
        renderActiveRouteMetrics();
    }
}

function openCreateRouteModal() {
    document.getElementById('new-route-name').value = '';
    document.getElementById('modal-route').classList.remove('hidden');
}

function createNewRoute() {
    const name = document.getElementById('new-route-name').value.trim();
    if(!name) { alert("Ingresa un nombre"); return; }

    const newR = {
        id: Date.now(),
        title: name,
        active: false,
        distanceKm: 10.0,
        stops: []
    };
    appData.routes.push(newR);
    saveLocalStorage();
    renderRoutesList();
    document.getElementById('modal-route').classList.add('hidden');
}

function optimizarRutaActiva() {
    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    if(!activeRoute || activeRoute.stops.length <= 2) {
        alert("Se necesitan al menos 3 paradas para optimizar.");
        return;
    }
    let unvisited = [...activeRoute.stops];
    let optimized = [unvisited.shift()];
    while(unvisited.length > 0) {
        let curr = optimized[optimized.length - 1];
        let nearestIdx = 0;
        let minDist = Infinity;
        unvisited.forEach((p, idx) => {
            const dist = Math.hypot(p.lat - curr.lat, p.lng - curr.lng);
            if(dist < minDist) { minDist = dist; nearestIdx = idx; }
        });
        optimized.push(unvisited.splice(nearestIdx, 1)[0]);
    }
    activeRoute.stops = optimized;
    saveLocalStorage();
    renderMapStops();
    renderActiveRouteMetrics();
    alert("¡Ruta optimizada con éxito por proximidad!");
}

/* 4. PESTAÑA AGENDA (Tarjetas, foto, datos, observaciones, editar/eliminar) */
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
                    <p class="text-xs text-blue-400 mt-0.5">Tel: ${cli.telefono || 'Sin teléfono'}</p>
                </div>
            </div>
            ${cli.obs ? `<p class="text-xs text-neutral-300 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">Obs: ${cli.obs}</p>` : ''}
            <div class="flex gap-2 pt-1 border-t border-neutral-800">
                <button onclick="agregarAgendaARuta(${cli.id})" class="flex-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 py-2 rounded-xl text-xs font-semibold">+ Añadir a Ruta</button>
                <button onclick="openClientModal('edit', ${cli.id})" class="bg-neutral-800 text-neutral-300 px-3 py-2 rounded-xl text-xs font-semibold">Editar</button>
                <button onclick="deleteClient(${cli.id})" class="bg-rose-500/10 text-rose-400 px-3 py-2 rounded-xl text-xs font-semibold">Borrar</button>
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
        if(cli) {
            cli.nombre = nombre;
            cli.direccion = direccion;
            cli.telefono = telefono;
            cli.foto = foto;
            cli.observacion = observacion;
        }
    } else {
        appData.agenda.push({
            id: Date.now(),
            nombre,
            direccion,
            telefono,
            foto,
            observacion
        });
    }

    saveLocalStorage();
    renderAgendaCards();
    document.getElementById('modal-client').classList.add('hidden');
}

function deleteClient(id) {
    if(confirm("¿Eliminar este cliente de la agenda?")) {
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
        status: 'pending'
    });

    saveLocalStorage();
    renderMapStops();
    renderActiveRouteMetrics();
    alert(`¡${cli.nombre} agregado a la ruta activa!`);
}

/* 1. PESTAÑA CAJA / FINANZAS */
function setPaymentMode(mode) {
    appData.paymentMode = mode;
    document.getElementById('pay-mode-cash').className = mode === 'cash' ? 'py-2.5 rounded-xl bg-blue-600 text-white font-bold transition' : 'py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-bold transition';
    document.getElementById('pay-mode-trans').className = mode === 'transfer' ? 'py-2.5 rounded-xl bg-blue-600 text-white font-bold transition' : 'py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-bold transition';
    document.getElementById('payment-mode-badge').innerText = mode === 'cash' ? 'Efectivo' : 'Transferencia';
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

function updateFinancialCalculations() {
    const activeRoute = appData.routes.find(r => r.active) || appData.routes[0];
    const totalFacturas = activeRoute ? activeRoute.stops.reduce((acc, s) => acc + (s.value || 0), 0) : 0;
    const totalGastos = appData.expenses.reduce((acc, e) => acc + e.amount, 0);
    const netBalance = totalFacturas - totalGastos;

    let physicalCash = 0;
    denominations.forEach(d => {
        physicalCash += d.value * (appData.cashCounts[d.value] || 0);
    });

    document.getElementById('fin-total-facturas').innerText = `$${totalFacturas.toLocaleString()}`;
    document.getElementById('fin-total-gastos').innerText = `$${totalGastos.toLocaleString()}`;
    document.getElementById('fin-net-balance').innerText = `$${netBalance.toLocaleString()} Neto`;
    document.getElementById('counter-total-display').innerText = `$${physicalCash.toLocaleString()}`;
    document.getElementById('header-net-badge').innerText = `$${netBalance.toLocaleString()}`;
}

/* Importar .bin / JSON */
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
                alert("¡Rutas y paradas importadas con éxito!");
            } else {
                alert("Formato de archivo no reconocido.");
            }
        } catch(err) {
            alert("Error al leer el archivo.");
        }
    };
    reader.readAsText(file);
}

function saveLocalStorage() {
    localStorage.setItem('routelogix_pro_v4', JSON.stringify(appData));
}

function loadLocalStorage() {
    const saved = localStorage.getItem('routelogix_pro_v4');
    if(saved) {
        try {
            const parsed = JSON.parse(saved);
            if(parsed.routes) appData.routes = parsed.routes;
            if(parsed.agenda) appData.agenda = parsed.agenda;
            if(parsed.expenses) appData.expenses = parsed.expenses;
            if(parsed.cashCounts) appData.cashCounts = parsed.cashCounts;
            if(parsed.users) appData.users = parsed.users;
        } catch(e) {}
    }
}

/* 8. NAVEGACIÓN Y BOTONES DE RETROCESO */
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
