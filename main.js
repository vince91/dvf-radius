import './style.css';
import {Feature, Map, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {fromLonLat, getPointResolution, Projection, toLonLat} from 'ol/proj';
import {Circle, LineString, Point} from "ol/geom";
import {getLength} from "ol/sphere";
import VectorSource from "ol/source/Vector";
import VectorLayer from "ol/layer/Vector";
import {matrix, transpose, multiply, inv} from "mathjs";

// Fetch the mutations from the public folder
let mutations = [];
(async () => {
    const resp = await fetch("/dvf-radius/mutations.json");
    mutations = await resp.json();

    // For testing purposes
    // updateApp([-66578.58011010953, 5596552.261800042], 3000);
})();

let regressionParameters = null;

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

/**
 * Filter the mutations if one of its parcels is within the circle
 */
function filterMutations(center, radius) {
    const lonLat = toLonLat(center);
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
    return filteredMutations;
}

/**
 * Computes the linear regression parameters
 * @param x1 Land area
 * @param x2 Building area
 * @param y Price
 */
function linearRegression(x1, x2, y) {
    // Build X and Y
    const ones = Array(x1.length).fill(1);
    const x = matrix([ones, x1, x2]);

    // Compute (X^T * X)^-1 * X^T * Y
    const xT = transpose(x);
    const xTxInv = inv(multiply(x, xT));
    const b = multiply(y, multiply(xT, xTxInv));
    regressionParameters = b.toArray();
}

/**
 * Update the app with the new center and radius
 */
function updateApp(center, radius) {
    // Create a circle feature
    const resolution = getPointResolution(map.getView().getProjection(), 1, center);
    const circle = new Circle(center, radius / resolution);
    const feature = new Feature(circle);
    const features = [feature];

    const filteredMutations = filterMutations(center, radius);

    const table = document.querySelector("tbody");
    const rowCount = table.rows.length;
    for (let i = rowCount - 1; i >= 0; i--) {
        table.deleteRow(i);
    }

    const x1 = [];
    const x2 = [];
    const y = [];

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
        x1.push(mutation[4]);
        x2.push(mutation[3]);
        y.push(mutation[2]);

        // Add points for each parcel to the features
        for (const parcel of mutation[5]) {
            const parcelLonLat = fromLonLat([parcel[2], parcel[1]]);
            const feature = new Feature(new Point(parcelLonLat));
            features.push(feature);
        }
    }

    if (filteredMutations.length > 0) {
        linearRegression(x1, x2, y);
    }

    updatePrediction();

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
}

map.on('click', function (e) {
    const value = document.querySelector("#radius input").value;
    const radius = parseFloat(value);
    updateApp(e.coordinate, radius);
});


const landInput = document.querySelector("input[id=land]");
const buildingInput = document.querySelector("input[id=building]");
const predictionSpan = document.querySelector("#regression span");

landInput.addEventListener("input", function (e) {
    updatePrediction();
});


buildingInput.addEventListener("input", function (e) {
    updatePrediction();
});

function updatePrediction() {
    if (landInput.value === "" || buildingInput.value === "" || regressionParameters === null) {
        predictionSpan.innerHTML = "-";
        return;
    }
    const landArea = parseFloat(landInput.value);
    const buildingArea = parseFloat(buildingInput.value);

    const prediction = (regressionParameters[0] + regressionParameters[1] * buildingArea + regressionParameters[2] * landArea)

    predictionSpan.innerHTML = prediction.toLocaleString();
}
