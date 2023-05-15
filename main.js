import './style.css';
import {Feature, Map, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {fromLonLat, Projection, toLonLat, getPointResolution} from 'ol/proj';
import {Circle, LineString, Point} from "ol/geom";
import {getLength} from "ol/sphere";
import VectorSource from "ol/source/Vector";
import VectorLayer from "ol/layer/Vector";

// Fetch the mutations from the public folder
let mutations = [];

(async () => {
    const resp = await fetch("/dvf-radius/mutations.json");
    mutations = await resp.json();
})();

// Create the map
const Geographic = new Projection("EPSG:4326");

const osm = new TileLayer({
    source: new OSM()
});

const map = new Map({
    target: 'map', layers: [osm], view: new View({
        center: [244963.08062701017, 6002960.474649239], zoom: 6
    })
});

map.on('click', function (e) {
    const value = document.querySelector("#radius input").value;
    const radius = parseFloat(value);

    // Create a circle feature
    const lonLat = toLonLat(e.coordinate)
    const resolution = getPointResolution(map.getView().getProjection(), 1, e.coordinate);
    const circle = new Circle(e.coordinate, radius / resolution);
    const feature = new Feature(circle);
    const features = [feature];

    // Filter the mutation if one of its parcels is within the circle
    const filteredMutations = [];
    for (const mutation of mutations) {
        for (const parcel of mutation[5]) {
            const parcelLonLat = [parcel[2], parcel[1]];
            const line = new LineString([lonLat, parcelLonLat]);
            const distance = getLength(line, {projection: Geographic});
            if (distance <= radius) {
                filteredMutations.push(mutation)
                break;
            }
        }
    }

    const table = document.querySelector("tbody");
    const rowCount = table.rows.length;
    for (let i = rowCount - 1; i >= 0; i--) {
        table.deleteRow(i);
    }

    const pricesPerSquareMeter = [];
    for (const mutation of filteredMutations) {
        // Populate the table
        const row = table.insertRow();
        row.insertCell(0).innerHTML = mutation[0];
        row.insertCell(1).innerHTML = mutation[2].toLocaleString();
        row.insertCell(2).innerHTML = mutation[4].toLocaleString();
        row.insertCell(3).innerHTML = mutation[3].toLocaleString();
        const pricePerSquareMeter = ~~(mutation[2] / mutation[4]);
        row.insertCell(4).innerHTML = pricePerSquareMeter.toLocaleString();

        pricesPerSquareMeter.push(pricePerSquareMeter);

        // Add points for each parcel to the features
        for (const parcel of mutation[5]) {
            const parcelLonLat = fromLonLat([parcel[2], parcel[1]]);
            const feature = new Feature(new Point(parcelLonLat));
            features.push(feature);
        }
    }

    // Update count, average and median
    document.querySelector("#count > span").innerHTML = filteredMutations.length.toLocaleString();
    if (pricesPerSquareMeter.length > 0) {
        pricesPerSquareMeter.sort((a, b) => a - b);
        const average = pricesPerSquareMeter.reduce((a, b) => a + b, 0) / pricesPerSquareMeter.length;
        const median = pricesPerSquareMeter[Math.floor(pricesPerSquareMeter.length / 2)];
        document.querySelector("#average > span").innerHTML = (~~average).toLocaleString();
        document.querySelector("#median > span").innerHTML = (~~median).toLocaleString();
    } else {
        document.querySelector("#average > span").innerHTML = "-";
        document.querySelector("#median > span").innerHTML = "-";
    }

    if (map.getAllLayers().length > 1) {
        map.removeLayer(map.getLayers().getArray()[1]);
    }

    const source = new VectorSource({features: features});
    const layer = new VectorLayer({source: source});
    map.addLayer(layer);

});

