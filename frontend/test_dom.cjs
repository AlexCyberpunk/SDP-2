const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/sea-distance-web/frontend/index.html", "utf8");
let js = fs.readFileSync("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/sea-distance-web/frontend/main.js", "utf8");

// Mock Leaflet 'L' by wrapping the js execution so it thinks L exists globally
const mockJS = `
const L = {
    map: () => ({ setView: () => ({}) }),
    tileLayer: () => ({ addTo: () => {} }),
    marker: () => ({ bindTooltip: () => ({ addTo: () => {} }), setLatLng: () => {}, addTo: () => {} }),
    polyline: () => ({ addTo: () => {} }),
    divIcon: () => ({}),
    layerGroup: () => ({ addTo: () => {}, clearLayers: () => {} }),
    geoJSON: () => ({ addTo: () => {}, getBounds: () => {} })
};
` + js;

const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on("error", (err) => { console.error("PAGE ERROR:", err.message); });
virtualConsole.on("jsdomError", (err) => { console.error("JSDOM ERROR:", err.message); });
virtualConsole.on("log", (msg) => { console.log("PAGE LOG:", msg); });

const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole });
const scriptEl = dom.window.document.createElement("script");
scriptEl.textContent = mockJS;
dom.window.document.body.appendChild(scriptEl);

// Fire the DOMContentLoaded event to trigger any startup logic
dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
