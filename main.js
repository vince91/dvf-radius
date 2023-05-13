import './style.css';
import {Feature, Map, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {fromLonLat, Projection, toLonLat} from 'ol/proj';
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
    const lonlat = toLonLat(e.coordinate)
    const circle = new Circle(e.coordinate, radius)
    const feature = new Feature(circle);
    const features = [feature];

    // Filter the mutation if one of its parcels is within the circle
    const filteredMutations = [];
    for (const mutation of mutations) {
        for (const parcel of mutation[5]) {
            const parcelLonLat = [parcel[2], parcel[1]];
            const line = new LineString([lonlat, parcelLonLat]);
            const distance = getLength(line, {projection: Geographic});
            if (distance <= radius) {
                filteredMutations.push(mutation)
                break;
            }
        }
    }

    // Add points for each parcel to the features
    for (const mutation of filteredMutations) {
        for (const parcel of mutation[5]) {
            const parcelLonLat = fromLonLat([parcel[2], parcel[1]]);
            const feature = new Feature(new Point(parcelLonLat));
            features.push(feature);
        }
    }

    if (map.getAllLayers().length > 1) {
        map.removeLayer(map.getLayers().getArray()[1]);
    }

    const source = new VectorSource({features: features});
    const layer = new VectorLayer({source: source});
    map.addLayer(layer);
});

