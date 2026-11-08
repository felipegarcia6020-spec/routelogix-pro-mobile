/* RouteLogix Pro & Routin Unified App Logic */
let map, gpsMarker;
let watchId = null;
let currentTab = 'home';
let selectedRouteId = 1;
let selectedStopId = null;

let appData = {
    routes: [
        {
            id: 1,
            title: "Ruta Centro - Bogotá",
            date: "04.11.2026",
            badge: "HOY",
            badgeColor: "bg-blue-500",
            stops: [
                { id: 101, title: "Plaza de Bolívar", lat: 4.5981, lng: -74.0760, notes: "Punto de Inicio", status: "completed", pendingBalance: 150000, collectedAmount: 150000, address: "Carrera 7" },
                { id: 102, title: "Torre Colpatria", lat: 4.6105, lng: -74.0705, notes: "Cobrar factura #889", status: "waiting", pendingBalance: 280000, collectedAmount: 0, address: "Calle 26" },
                { id: 103, title: "Parque de la 93", lat: 4.6768, lng: -74.0482, notes: "Destino final", status: "waiting", pendingBalance: 90000, collectedAmount: 0, address: "Cra 13" }
            ]
        }
    ],
    agenda: [
        { id: 1, nombre: "Supermercado Central", direccion: "Carrera 7 # 12", telefono: "3104567890" },
        { id: 2, nombre: "Tienda La Esperanza", direccion: "Calle 26 # 14", telefono: "3209876543" }
    ],
    expenses: [
        { id: 1, concept: 'Combustible / Gasolina', amount: 45000 }
    ],
    cashCounts: { 100000: 0, 50000: 2, 20000: 3, 10000: 5, 5000: 4, 2000: 2, 1000: 0, 500: 0, 200: 0, 100: 0 },
    logs: []
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
    initMap();
    initGPSRealTime();
    renderRoutes();
    renderAgenda();
    renderDenominations();
    renderExpenses();
    updateFinancialCalculations();
    registrarLog("Aplicación iniciada en modo operativo unificado.");
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log("Service Worker registrado con éxito."));
    }
};

function registrarLog(texto) {
    const timestamp = new Date().toLocaleTimeString();
    appData.logs.unshift(`[${timestamp}] ${texto}`);
    if(appData.logs.length > 50) appData.logs.pop();
    saveLocalStorage();
    const regContainer = document.getElementById('lista-registro');
    if(regContainer) regContainer.innerHTML = appData.logs.join('<br>');
}

function saveLocalStorage() {
    localStorage.setItem('routelogix_pro_v3', JSON.stringify(appData));
}

function loadLocalStorage() {
    const saved = localStorage.getItem('routelogix_pro_v3');
    if(saved) {
        try {
            const parsed = JSON.parse(saved);
            if(parsed.routes) appData.routes = parsed.routes;
            if(parsed.agenda) appData.agenda = parsed.agenda;
            if(parsed.expenses) appData.expenses = parsed.expenses;
            if(parsed.cashCounts) appData.cashCounts = parsed.cashCounts;
            if(parsed.logs) appData.logs = parsed.logs;
        } catch(e) {
            console.error("Error al cargar localStorage", e);
        }
    }
}

/* 1. Inicialización de Mapa & Cursor de Precisión */
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([4.6097, -74.0817], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    renderMapStops();
}

/* 2 y 5. GPS en tiempo real e indicador de posición */
function initGPSRealTime() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if(!gpsMarker) {
                    const gpsIcon = L.divIcon({
                        className: 'gps-dot',
                        html: '<div style="width:18px;height:18px;background:#3b82f6;border:3px solid #ffffff;border-radius:50%;box-shadow:0 0 12px #38bdf8;"></div>',
                        iconSize: [18, 18]
                    });
                    gpsMarker = L.marker([lat, lng], {icon: gpsIcon}).addTo(map).bindPopup("Tu ubicación GPS actual");
                } else {
                    gpsMarker.setLatLng([lat, lng]);
                }
            },
            (err) => { console.warn("GPS Warning: ", err.message); },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    }
}

function centrarGPS() {
    if(gpsMarker) {
        map.setView(gpsMarker.getLatLng(), 16);
        registrarLog("Mapa centrado en posición GPS.");
    } else {
        alert("Buscando señal GPS...");
    }
}

/* Renderizar paradas en el mapa actual con numeración */
function renderMapStops() {
    const route = appData.routes.find(r => r.id === selectedRouteId) || appData.routes[0];
    if(!route) return;

    const latlngs = [];
    route.stops.forEach((stop, index) => {
        if(stop.lat && stop.lng) {
            latlngs.push([stop.lat, stop.lng]);
            let badgeClass = "bg-blue-600";
            if(index === 0) badgeClass = "bg-emerald-600 start";
            else if(index === route.stops.length - 1) badgeClass = "bg-rose-600 end";
            if(stop.status === 'completed') badgeClass = "bg-emerald-700";

            const icon = L.divIcon({
                className: 'custom-icon',
                html: `<div class="custom-map-badge ${badgeClass}" style="width:28px;height:28px;">${index+1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            L.marker([stop.lat, stop.lng], {icon}).addTo(map)
                .bindPopup(`<b>${index+1}. ${stop.title}</b><br>${stop.notes || ''}<br>Cobro: $${(stop.pendingBalance||0).toLocaleString()}`);
        }
    });

    if(latlngs.length > 1) {
        L.polyline(latlngs, {color: '#3b82f6', weight: 4, opacity: 0.8}).addTo(map);
    }
}

/* 3. Agenda de Clientes */
function renderAgenda() {
    const container = document.getElementById('lista-agenda');
    if(!container) return;
    container.innerHTML = '';
    
    appData.agenda.forEach(cli => {
        const card = document.createElement('div');
        card.className = "bg-neutral-900 border border-neutral-800 p-3 rounded-xl mb-2 text-xs flex justify-between items-center";
        card.innerHTML = `
            <div>
                <h4 class="font-bold text-white">${cli.nombre}</h4>
                <p class="text-neutral-400">${cli.direccion || 'Sin dirección'} | Tel: ${cli.telefono || 'N/A'}</p>
            </div>
            <button onclick="agregarClienteARuta('${cli.nombre}', '${cli.direccion}')" class="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded font-semibold">+ Ruta</button>
        `;
        container.appendChild(card);
    });
}

function agregarClienteARuta(nombre, direccion) {
    const centro = map.getCenter();
    const route = appData.routes.find(r => r.id === selectedRouteId) || appData.routes[0];
    route.stops.push({
        id: Date.now(),
        title: nombre,
        address: direccion,
        lat: centro.lat + (Math.random() * 0.002 - 0.001),
        lng: centro.lng + (Math.random() * 0.002 - 0.001),
        status: 'waiting',
        pendingBalance: 50000,
        collectedAmount: 0,
        notes: 'Añadido desde Agenda'
    });
    saveLocalStorage();
    renderMapStops();
    registrarLog(`Cliente ${nombre} añadido a la ruta.`);
    alert(`¡${nombre} agregado a la ruta actual!`);
}

/* 4. Borrar Paradas y Rutas */
function borrarParada(stopId) {
    const route = appData.routes.find(r => r.id === selectedRouteId);
    if(route) {
        route.stops = route.stops.filter(s => s.id !== stopId);
        saveLocalStorage();
        renderMapStops();
        registrarLog(`Parada ID ${stopId} eliminada.`);
    }
}

function borrarRutaActiva() {
    if(confirm("¿Estás seguro de vaciar toda la ruta actual?")) {
        const route = appData.routes.find(r => r.id === selectedRouteId);
        if(route) {
            route.stops = [];
            saveLocalStorage();
            renderMapStops();
            registrarLog("Ruta activa vaciada.");
        }
    }
}

/* 6. Optimizador de Rutas por Cercanía */
function optimizarRuta() {
    const route = appData.routes.find(r => r.id === selectedRouteId);
    if(!route || route.stops.length <= 2) {
        alert("Se necesitan al menos 3 paradas para optimizar.");
        return;
    }

    let unvisited = [...route.stops];
    let optimized = [unvisited.shift()];

    while(unvisited.length > 0) {
        let current = optimized[optimized.length - 1];
        let nearestIdx = 0;
        let minDist = Infinity;

        unvisited.forEach((p, idx) => {
            const dist = Math.hypot(p.lat - current.lat, p.lng - current.lng);
            if(dist < minDist) {
                minDist = dist;
                nearestIdx = idx;
            }
        });
        optimized.push(unvisited.splice(nearestIdx, 1)[0]);
    }

    route.stops = optimized;
    saveLocalStorage();
    renderMapStops();
    registrarLog("Ruta optimizada por proximidad.");
    alert("¡Ruta optimizada con éxito!");
}

/* 7. Registro de Actividad Activo */
function abrirModalParadaCentro() {
    const centro = map.getCenter();
    window.tempLat = centro.lat;
    window.tempLng = centro.lng;
    document.getElementById('parada-nombre').value = '';
    document.getElementById('parada-direccion').value = '';
    document.getElementById('parada-valor').value = '';
    document.getElementById('modal-parada').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modal-parada').style.display = 'none';
}

function guardarNuevaParada() {
    const nombre = document.getElementById('parada-nombre').value.trim();
    const direccion = document.getElementById('parada-direccion').value.trim();
    const valor = parseFloat(document.getElementById('parada-valor').value) || 0;

    if(!nombre) { alert("Ingresa un nombre"); return; }

    const route = appData.routes.find(r => r.id === selectedRouteId) || appData.routes[0];
    route.stops.push({
        id: Date.now(),
        lat: window.tempLat,
        lng: window.tempLng,
        title: nombre,
        address: direccion,
        pendingBalance: valor,
        collectedAmount: 0,
        status: 'waiting',
        notes: 'Añadido desde mira central'
    });

    // Añadir también a la agenda general si no existe
    if(!appData.agenda.some(a => a.nombre === nombre)) {
        appData.agenda.push({ id: Date.now(), nombre, direccion, telefono: 'N/A' });
    }

    saveLocalStorage();
    renderMapStops();
    renderAgenda();
    cerrarModal();
    registrarLog(`Nueva parada guardada: ${nombre}`);
}

/* 10. Importador de archivos .bin / JSON estilo Routin */
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
                registrarLog("Archivo Routin (.bin / JSON) importado con éxito.");
                alert("¡Ruta y paradas importadas correctamente!");
            } else {
                alert("Formato de archivo no reconocido.");
            }
        } catch(err) {
            alert("Error al parsear el archivo.");
        }
    };
    reader.readAsText(file);
}

function renderDenominations() {
    const container = document.getElementById('denominations-container');
    if(!container) return;
    container.innerHTML = '';

    denominations.forEach(d => {
        const count = appData.cashCounts[d.value] || 0;
        const subtotal = d.value * count;
        const row = document.createElement('div');
        row.className = "bg-neutral-900 border border-neutral-800 p-2.5 rounded-xl flex items-center justify-between mb-2 text-xs";
        row.innerHTML = `
            <div>
                <div class="font-bold text-white">${d.label}</div>
                <div class="text-[10px] text-emerald-400">Sub: $${subtotal.toLocaleString()}</div>
            </div>
            <div class="flex items-center space-x-2">
                <button onclick="updateDenomCount(${d.value}, -1)" class="w-7 h-7 bg-neutral-800 rounded text-white font-bold">-</button>
                <input type="number" id="denom-input-${d.value}" value="${count}" onchange="setDenomDirect(${d.value}, this.value)" class="w-12 bg-neutral-950 border border-neutral-800 text-center text-white rounded py-1">
                <button onclick="updateDenomCount(${d.value}, 1)" class="w-7 h-7 bg-blue-600 rounded text-white font-bold">+</button>
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
    registrarLog(`Gasto registrado: ${concept} ($${amount})`);
}

function renderExpenses() {
    const container = document.getElementById('expenses-list');
    if(!container) return;
    container.innerHTML = '';
    appData.expenses.forEach(exp => {
        const item = document.createElement('div');
        item.className = "bg-neutral-900 border border-neutral-800 p-2.5 rounded-xl mb-2 text-xs flex justify-between items-center";
        item.innerHTML = `
            <div>
                <div class="font-bold text-white">${exp.concept}</div>
                <div class="text-rose-400 font-semibold">-$${exp.amount.toLocaleString()}</div>
            </div>
            <button onclick="deleteExpense(${exp.id})" class="text-rose-400 text-xs">Eliminar</button>
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
    const route = appData.routes[0];
    let totalCollected = route.stops.reduce((acc, s) => acc + (s.collectedAmount || 0), 0);
    let totalExpenses = appData.expenses.reduce((acc, e) => acc + e.amount, 0);
    let netExpected = totalCollected - totalExpenses;

    let physicalCash = 0;
    denominations.forEach(d => {
        physicalCash += d.value * (appData.cashCounts[d.value] || 0);
    });

    const netBadge = document.getElementById('header-net-badge');
    if(netBadge) netBadge.innerText = `$${netExpected.toLocaleString()}`;
}

function cambiarPestana(pestana) {
    ['rutas', 'agenda', 'registro', 'finanzas'].forEach(p => {
        const el = document.getElementById(`sidebar-pane-${p}`);
        if(el) el.style.display = p === pestana ? 'block' : 'none';
        const btn = document.getElementById(`tab-btn-${p}`);
        if(btn) btn.classList.toggle('active', p === pestana);
    });
}
