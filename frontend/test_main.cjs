const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/sea-distance-web/frontend/index.html", "utf8");
const js = fs.readFileSync("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/sea-distance-web/frontend/main.js", "utf8");

const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on("error", (err) => { console.error("PAGE ERROR:", err.message); });
virtualConsole.on("warn", (warn) => { console.warn("PAGE WARN:", warn); });
virtualConsole.on("jsdomError", (err) => { console.error("JSDOM ERROR:", err.message); });

const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole });
const scriptEl = dom.window.document.createElement("script");
scriptEl.textContent = js;
dom.window.document.body.appendChild(scriptEl);
