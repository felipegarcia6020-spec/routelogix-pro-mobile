// Inicializar el mapa de Leaflet (ajusta las coordenadas de inicio según tu ciudad)
const map = L.map('map').setView([4.5709, -74.2973], 13);

// Cargar las teselas de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Forzar el redibujado para evitar el cuadro negro inicial al cargar la app
setTimeout(() => {
    map.invalidateSize();
}, 200);

// Configuración básica para los botones de la interfaz
document.getElementById('btn-add').addEventListener('click', () => {
    console.log('Botón Añadir Parada presionado');
    // Aquí puedes agregar la lógica para añadir paradas
});

document.getElementById('btn-import').addEventListener('click', () => {
    console.log('Botón Importar .bin presionado');
    // Aquí puedes agregar la lógica para leer archivos .bin de Routin
});