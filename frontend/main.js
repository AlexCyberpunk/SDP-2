// Map Initialization
const map = L.map('map', { renderer: L.canvas() }).setView([20, 0], 3);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OSM & CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// --- STATE ---
let waypoints = { origin: null, mid: null, dest: null };
let markers = { origin: null, mid: null, dest: null };
let routeLayer = null;
let currentRouteCoords = null;
let currentBaseTime = 0; // days
let currentBaseFuel = 0; // mt
let currentDistanceNm = 0;
let activeInputContext = 'origin';
let currentMode = 'route'; // 'route' | 'reach'

// --- VESSEL PARAMETERS ---
const VESSEL_CLASSES = [
    { range: "2,000 - 4,000", cls: "Mini-Bulker", speed: 10.0, cons: 3.5 },
    { range: "4,000 - 6,000", cls: "Mini-Bulker", speed: 10.5, cons: 5.0 },
    { range: "6,000 - 8,000", cls: "Mini-Bulker", speed: 10.5, cons: 7.0 },
    { range: "8,000 - 10,000", cls: "Mini-Bulker", speed: 11.0, cons: 9.0 },
    { range: "10,000 - 12,000", cls: "Handysize", speed: 11.5, cons: 10.5 },
    { range: "12,000 - 14,000", cls: "Handysize", speed: 12.0, cons: 11.5 },
    { range: "14,000 - 16,000", cls: "Handysize", speed: 12.5, cons: 12.5 },
    { range: "16,000 - 18,000", cls: "Handysize", speed: 12.5, cons: 13.5 },
    { range: "18,000 - 20,000", cls: "Handysize", speed: 13.0, cons: 14.5 },
    { range: "20,000 - 22,000", cls: "Handysize", speed: 13.0, cons: 15.5 },
    { range: "22,000 - 24,000", cls: "Handysize", speed: 13.5, cons: 16.75 },
    { range: "24,000 - 26,000", cls: "Handysize", speed: 13.5, cons: 18.25 },
    { range: "26,000 - 28,000", cls: "Handysize", speed: 14.0, cons: 19.5 },
    { range: "28,000 - 30,000", cls: "Handysize", speed: 14.0, cons: 20.5 },
    { range: "30,000 - 32,000", cls: "Handysize", speed: 14.0, cons: 21.5 },
    { range: "32,000 - 34,000", cls: "Handysize", speed: 14.0, cons: 22.5 },
    { range: "34,000 - 36,000", cls: "Handysize", speed: 14.0, cons: 23.5 },
    { range: "36,000 - 38,000", cls: "Handysize", speed: 14.0, cons: 24.5 },
    { range: "38,000 - 40,000", cls: "Handysize", speed: 14.0, cons: 25.5 },
    { range: "40,000 - 42,000", cls: "Supramax", speed: 14.0, cons: 26.5 },
    { range: "42,000 - 44,000", cls: "Supramax", speed: 14.0, cons: 27.5 },
    { range: "44,000 - 46,000", cls: "Supramax", speed: 14.5, cons: 28.5 },
    { range: "46,000 - 48,000", cls: "Supramax", speed: 14.5, cons: 29.5 },
    { range: "48,000 - 50,000", cls: "Supramax", speed: 14.5, cons: 30.5 },
    { range: "50,000 - 52,000", cls: "Supramax", speed: 14.5, cons: 31.5 },
    { range: "52,000 - 54,000", cls: "Supramax", speed: 14.5, cons: 32.5 },
    { range: "54,000 - 56,000", cls: "Supramax", speed: 14.5, cons: 33.5 },
    { range: "56,000 - 58,000", cls: "Supramax", speed: 14.5, cons: 34.5 },
    { range: "58,000 - 60,000", cls: "Supramax", speed: 14.5, cons: 35.5 }
];

let currentVesselIndex = 0; // Default to 2,000-4,000 DWT
const vesselSelect = document.getElementById('vessel-class-select');
const vesselSpeedInput = document.getElementById('vessel-speed-input');
const vesselFuelInput = document.getElementById('vessel-fuel-input');

// Populate select
window.addEventListener('DOMContentLoaded', () => {
    VESSEL_CLASSES.forEach((v, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${v.range} DWT (${v.cls})`;
        if (idx === currentVesselIndex) opt.selected = true;
        vesselSelect.appendChild(opt);
    });
    updateVesselDisplay();
});

const updateVesselDisplay = () => {
    const v = VESSEL_CLASSES[currentVesselIndex];
    vesselSpeedInput.value = v.speed.toFixed(1);
    vesselFuelInput.value = v.cons.toFixed(1);
};

// Handle Change
vesselSelect.addEventListener('change', (e) => {
    currentVesselIndex = parseInt(e.target.value);
    updateVesselDisplay();
    recalculateRouteStats();
});

const autoSelectVesselByDwt = (dwt) => {
    if (!dwt || dwt <= 0) return;

    let closestIdx = 0;
    let minDiff = Infinity;

    VESSEL_CLASSES.forEach((v, idx) => {
        const parts = v.range.split('-');
        if (parts.length === 2) {
            const low = parseInt(parts[0].replace(/,/g, ''));
            const high = parseInt(parts[1].replace(/,/g, ''));
            const mid = (low + high) / 2;
            const diff = Math.abs(dwt - mid);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = idx;
            }
        }
    });

    currentVesselIndex = closestIdx;
    if (vesselSelect) vesselSelect.value = closestIdx;
    updateVesselDisplay();
    recalculateRouteStats();
};


// --- MODE TOGGLE LOGIC ---
const modeRouteBtn = document.getElementById('mode-route');
const modeReachBtn = document.getElementById('mode-reach');
const modeSavedBtn = document.getElementById('mode-saved');
const midCard = document.getElementById('card-mid');
const destCard = document.getElementById('card-dest');
const originCard = document.getElementById('card-origin');
const reachParams = document.getElementById('reachability-params');
const savedCard = document.getElementById('card-saved');
const savedPortSelect = document.getElementById('saved-port-select');
const savedSpeedSelect = document.getElementById('saved-speed-select');
const instructionText = document.getElementById('instruction-text');
const vesselParamsPanel = document.getElementById('vessel-params-panel');

if (modeRouteBtn && modeReachBtn) {
    modeRouteBtn.addEventListener('click', () => {
        currentMode = 'route';
        modeRouteBtn.classList.add('active');
        modeReachBtn.classList.remove('active');
        if (modeSavedBtn) modeSavedBtn.classList.remove('active');

        originCard.classList.remove('hidden');
        midCard.classList.remove('hidden');
        destCard.classList.remove('hidden');
        vesselParamsPanel.classList.remove('hidden');
        reachParams.classList.add('hidden');
        if (savedCard) savedCard.classList.add('hidden');

        instructionText.textContent = 'Search for a Port/Vessel (e.g. "Rotterdam", "Sea Voyager") or click the map to set waypoints.';
        calcBtn.textContent = 'Calculate Route';
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = null;
        wrapperPanel.classList.add('hidden');
        if (saveSearchBtn) saveSearchBtn.classList.add('hidden');
        checkCalcBtn();
    });

    modeReachBtn.addEventListener('click', () => {
        currentMode = 'reach';
        modeReachBtn.classList.add('active');
        modeRouteBtn.classList.remove('active');
        if (modeSavedBtn) modeSavedBtn.classList.remove('active');

        originCard.classList.remove('hidden');
        midCard.classList.add('hidden');
        destCard.classList.add('hidden');
        vesselParamsPanel.classList.add('hidden');
        reachParams.classList.remove('hidden');
        if (savedCard) savedCard.classList.add('hidden');

        instructionText.textContent = 'Select an origin and specify navigation parameters to calculate maximum reach boundaries.';
        calcBtn.textContent = 'Generate Reachability';
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = null;
        wrapperPanel.classList.add('hidden');
        if (saveSearchBtn) saveSearchBtn.classList.add('hidden');
        checkCalcBtn();
    });

    if (modeSavedBtn) {
        modeSavedBtn.addEventListener('click', async () => {
            currentMode = 'saved';
            modeSavedBtn.classList.add('active');
            modeRouteBtn.classList.remove('active');
            modeReachBtn.classList.remove('active');

            originCard.classList.add('hidden');
            midCard.classList.add('hidden');
            destCard.classList.add('hidden');
            vesselParamsPanel.classList.add('hidden');
            reachParams.classList.add('hidden');
            savedCard.classList.remove('hidden');

            instructionText.textContent = 'Select a precalculated port and speed to instantly view maximum navigation reach (up to 5 days).';
            calcBtn.textContent = 'Load Distance';
            if (routeLayer) map.removeLayer(routeLayer);
            routeLayer = null;
            wrapperPanel.classList.add('hidden');
            weatherPanel.classList.add('hidden');
            weatherBtn.classList.add('hidden');
            if (saveSearchBtn) saveSearchBtn.classList.add('hidden');
            checkCalcBtn();

            // Load index if not loaded
            if (savedPortSelect.options.length <= 1) {
                try {
                    const res = await fetch('/api/precalc/index.json');
                    const data = await res.json();

                    savedPortSelect.innerHTML = '<option value="">-- Select Port --</option>';
                    data.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.name;
                        opt.textContent = p.name;
                        opt.dataset.speeds = JSON.stringify(p.speeds);
                        opt.dataset.lat = p.lat;
                        opt.dataset.lng = p.lng;
                        savedPortSelect.appendChild(opt);
                    });
                } catch (e) {
                    savedPortSelect.innerHTML = '<option value="">Failed to load list</option>';
                }
            }
        });
    }
}

savedPortSelect.addEventListener('change', (e) => {
    const selected = e.target.options[e.target.selectedIndex];
    if (!selected || !selected.value) {
        savedSpeedSelect.disabled = true;
        savedSpeedSelect.innerHTML = '<option value="">Select a port first</option>';
        return;
    }

    savedSpeedSelect.disabled = false;
    const speeds = JSON.parse(selected.dataset.speeds || '[]');
    savedSpeedSelect.innerHTML = '<option value="">-- Select Speed --</option>';
    speeds.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `${s.toFixed(1)} Knots`;
        savedSpeedSelect.appendChild(opt);
    });

    // Auto center map on port
    const lat = parseFloat(selected.dataset.lat);
    const lng = parseFloat(selected.dataset.lng);
    map.flyTo([lat, lng], 6);
    checkCalcBtn();
});

savedSpeedSelect.addEventListener('change', () => {
    checkCalcBtn();
});

vesselSpeedInput.addEventListener('input', () => {
    recalculateRouteStats();
});

vesselFuelInput.addEventListener('input', () => {
    recalculateRouteStats();
});

const recalculateRouteStats = () => {
    if (currentDistanceNm <= 0) return;

    // Pull from the physical input fields to allow manual overrides
    const speed = parseFloat(vesselSpeedInput.value) || 12.0;
    const cons = parseFloat(vesselFuelInput.value) || 20.0;

    currentBaseTime = currentDistanceNm / (speed * 24);
    currentBaseFuel = currentBaseTime * cons;

    document.getElementById('res-time').textContent = `${Math.floor(currentBaseTime)}d ${Math.round((currentBaseTime % 1) * 24)}h`;
    document.getElementById('res-fuel').textContent = `${currentBaseFuel.toFixed(1)} MT`;

    // Note: We no longer auto-update weather modifiers here based on base speed/fuel changes.
    // The weather simulation is a complex day-by-day backend simulation.
    // If the user changes base speed/fuel, they must click "Check Weather" again to re-run the simulation.
};

// Custom Port State
let isCustomPortMode = false;
let cpTempMarker = null;
let cpSelectedCoords = null;

const coordsEl = {
    origin: document.getElementById('origin-coords'),
    mid: document.getElementById('mid-coords'),
    dest: document.getElementById('dest-coords')
};
const inputs = {
    origin: document.getElementById('search-origin'),
    mid: document.getElementById('search-mid'),
    dest: document.getElementById('search-dest')
};
const resultsBox = {
    origin: document.getElementById('results-origin'),
    mid: document.getElementById('results-mid'),
    dest: document.getElementById('results-dest')
};
const containers = {
    origin: document.getElementById('container-origin'),
    mid: document.getElementById('container-mid'),
    dest: document.getElementById('container-dest')
};
const historyLists = {
    origin: document.getElementById('history-origin'),
    mid: document.getElementById('history-mid'),
    dest: document.getElementById('history-dest')
};

const calcBtn = document.getElementById('calculate-btn');
const clearBtn = document.getElementById('clear-btn');
const weatherBtn = document.getElementById('weather-btn');
const saveSearchBtn = document.getElementById('save-search-btn');
const resultsPanel = document.getElementById('results-panel');
const weatherPanel = document.getElementById('weather-panel');
const wrapperPanel = document.getElementById('centered-results-wrapper');

// Custom Icons
const createIcon = (color) => L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8]
});
const icons = {
    origin: createIcon('#4ade80'),
    mid: createIcon('#facc15'),
    dest: createIcon('#f87171')
};

const formatCoord = (lat, lng) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;

// --- HISTORY STATE ---
const loadHistory = (type) => JSON.parse(localStorage.getItem(`history_${type}`)) || [];
const saveHistory = (type, item) => {
    let history = loadHistory(type);
    history = history.filter(h => h.name !== item.name); // remove duplicates
    history.unshift(item);
    if (history.length > 10) history.pop();
    localStorage.setItem(`history_${type}`, JSON.stringify(history));
};

const loadSavedSearches = () => JSON.parse(localStorage.getItem('history_saved_searches')) || [];
const saveSearchItem = (item) => {
    let history = loadSavedSearches();
    history = history.filter(h => h.id !== item.id);
    history.unshift(item);
    if (history.length > 20) history.pop(); // keep last 20 hybrid searches
    localStorage.setItem('history_saved_searches', JSON.stringify(history));
};

const renderSavedSearches = () => {
    const history = loadSavedSearches();
    const listEl = document.getElementById('recent-saved-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (history.length === 0) {
        listEl.innerHTML = '<span style="color:var(--text-secondary); font-size: 0.8rem; padding-left: 5px;">No saved searches yet.</span>';
        return;
    }

    history.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.marginBottom = '5px';
        div.style.padding = '8px';
        div.style.background = 'rgba(255,255,255,0.05)';
        div.style.borderRadius = '4px';
        div.style.cursor = 'pointer';

        if (item.type === 'reach') {
            div.innerHTML = `
                <strong>${item.name}</strong>
                <span style="font-size: 0.8rem; color: var(--text-secondary);">Reachability: ${item.days} days @ ${item.speed.toFixed(1)} kn</span>
            `;
            div.onclick = () => {
                modeReachBtn.click();
                document.getElementById('reach-days').value = item.days;
                document.getElementById('reach-speed').value = item.speed;
                vesselSpeedInput.value = item.speed;

                document.querySelector(`input[name="type-origin"][value="map"]`).checked = true;
                document.getElementById('container-origin').classList.add('hidden');

                setWaypoint('origin', item.lat, item.lng, item.name);
                setTimeout(() => calcBtn.click(), 100);
            };
        } else if (item.type === 'route') {
            div.innerHTML = `
                <strong>${item.name}</strong>
                <span style="font-size: 0.8rem; color: var(--text-secondary);">Route: ${item.distance} NM</span>
            `;
            div.onclick = () => {
                modeRouteBtn.click();
                document.querySelector(`input[name="type-origin"][value="map"]`).checked = true;
                document.getElementById('container-origin').classList.add('hidden');
                setWaypoint('origin', item.origin.lat, item.origin.lng, item.origin.name);

                if (item.dest) {
                    document.querySelector(`input[name="type-dest"][value="map"]`).checked = true;
                    document.getElementById('container-dest').classList.add('hidden');
                    setWaypoint('dest', item.dest.lat, item.dest.lng, item.dest.name);
                }

                if (item.mid) {
                    document.querySelector(`input[name="type-mid"][value="map"]`).checked = true;
                    document.getElementById('container-mid').classList.add('hidden');
                    setWaypoint('mid', item.mid.lat, item.mid.lng, item.mid.name);
                } else {
                    waypoints.mid = null;
                    document.getElementById('mid-coords').textContent = "Not set";
                }

                setTimeout(() => calcBtn.click(), 100);
            };
        }

        listEl.appendChild(div);
    });
};

const renderHistory = (wpType, searchType) => {
    const history = loadHistory(searchType);
    historyLists[wpType].innerHTML = '';
    history.forEach(item => {
        const span = document.createElement('span');
        span.className = 'history-item';
        span.textContent = item.name;
        span.onclick = () => {
            setWaypoint(wpType, item.lat, item.lng, item.name);
            saveHistory(searchType, item); // move to top
        };
        historyLists[wpType].appendChild(span);
    });
};

const getSearchType = (wpType) => document.querySelector(`input[name="type-${wpType}"]:checked`).value;

const checkCalcBtn = () => {
    if (currentMode === 'route') {
        calcBtn.disabled = !(waypoints.origin && waypoints.dest);
    } else if (currentMode === 'reach') {
        calcBtn.disabled = !waypoints.origin;
    } else if (currentMode === 'saved') {
        calcBtn.disabled = !(savedPortSelect.value && savedSpeedSelect.value);
    }
};

const setWaypoint = (type, lat, lng, title) => {
    waypoints[type] = [lat, lng];
    if (markers[type]) map.removeLayer(markers[type]);

    let markerText = title ? title : "Map Point";
    markers[type] = L.marker([lat, lng], { icon: icons[type] }).bindTooltip(markerText).addTo(map);
    inputs[type].value = markerText;
    coordsEl[type].textContent = formatCoord(lat, lng);

    checkCalcBtn();
    resultsBox[type].classList.add('hidden');
    weatherBtn.classList.add('hidden');
    weatherPanel.classList.add('hidden');

    // Hide search/coords panel and switch to Map radio locally if clicked on map
    if (title === "Map Point") {
        document.querySelector(`input[name="type-${type}"][value="map"]`).checked = true;
        containers[type].classList.add('hidden');
        const coordsContainer = document.getElementById(`coords-${type}`);
        if (coordsContainer) coordsContainer.classList.add('hidden');
    }
};

// Map Click Logic
map.on('click', (e) => {
    const { lat, lng } = e.latlng;

    // Custom Port Mode override
    if (isCustomPortMode) {
        cpSelectedCoords = [lat, lng];
        if (cpTempMarker) map.removeLayer(cpTempMarker);
        cpTempMarker = L.marker([lat, lng], { icon: createIcon('#3b82f6') }).addTo(map);
        document.getElementById('cp-coords-display').textContent = formatCoord(lat, lng);
        checkCpForm();
        return;
    }

    // Persistent Midpoint logic
    const midRadio = document.querySelector(`input[name="type-mid"]:checked`);
    const isMidMapLocked = activeInputContext === 'mid' && midRadio && midRadio.value === 'map';

    if (isMidMapLocked) {
        setWaypoint('mid', lat, lng, "Map Point");
        return;
    }

    // Default sequential map click logic
    if (activeInputContext === 'mid' || (!waypoints.origin && !waypoints.dest && !waypoints.mid)) {
        if (activeInputContext === 'mid') setWaypoint('mid', lat, lng, "Map Point");
        else setWaypoint('origin', lat, lng, "Map Point");
    } else if (!waypoints.origin) {
        setWaypoint('origin', lat, lng, "Map Point");
    } else if (!waypoints.dest) {
        setWaypoint('dest', lat, lng, "Map Point");
    } else {
        setWaypoint(activeInputContext, lat, lng, "Map Point");
    }
});

// Setup Radio Buttons
['origin', 'mid', 'dest'].forEach(wpType => {
    const radios = document.querySelectorAll(`input[name="type-${wpType}"]`);
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            activeInputContext = wpType;
            const sType = e.target.value;
            const searchContainer = containers[wpType];
            const coordsContainer = document.getElementById(`coords-${wpType}`);

            if (sType === 'map') {
                searchContainer.classList.add('hidden');
                if (coordsContainer) coordsContainer.classList.add('hidden');
            } else if (sType === 'coords') {
                searchContainer.classList.add('hidden');
                if (coordsContainer) coordsContainer.classList.remove('hidden');
            } else {
                if (coordsContainer) coordsContainer.classList.add('hidden');
                searchContainer.classList.remove('hidden');
                renderHistory(wpType, sType);
                inputs[wpType].focus();
            }
        });
    });
});

// Setup Coords Apply Buttons
['origin', 'mid', 'dest'].forEach(wpType => {
    const applyBtn = document.getElementById(`apply-coords-${wpType}`);
    const latInput = document.getElementById(`lat-${wpType}`);
    const lngInput = document.getElementById(`lng-${wpType}`);

    if (applyBtn && latInput && lngInput) {
        applyBtn.addEventListener('click', () => {
            const lat = parseFloat(latInput.value);
            const lng = parseFloat(lngInput.value);

            if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                alert("Please enter valid coordinates (Lat: -90 to 90, Lng: -180 to 180).");
                return;
            }

            activeInputContext = wpType;
            setWaypoint(wpType, lat, lng, `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
        });
    }
});

// Input focus tracking
inputs.origin.addEventListener('focus', () => activeInputContext = 'origin');
inputs.mid.addEventListener('focus', () => activeInputContext = 'mid');
inputs.dest.addEventListener('focus', () => activeInputContext = 'dest');

// Search autocomplete logic
const setupSearch = (wpType) => {
    let timeout = null;
    inputs[wpType].addEventListener('input', (e) => {
        const q = e.target.value;
        if (q.length < 2) {
            resultsBox[wpType].classList.add('hidden');
            return;
        }
        const sType = getSearchType(wpType);

        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            const res = await fetch(`/api/search?q=${q}&filter_type=${sType}`);
            const data = await res.json();
            resultsBox[wpType].innerHTML = '';
            if (data.length > 0) {
                data.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.innerHTML = `<strong>${item.name}</strong> <span>${item.type === 'vessel' ? 'IMO: ' + item.imo : item.country || 'Port'}</span>`;

                    if (item.type === 'vessel' && item.dwt > 0) {
                        div.innerHTML += `<br><span style="font-size: 0.75rem; color: var(--text-secondary);">EST DWT: ~${item.dwt.toLocaleString()} t | L: ${item.length}m, B: ${item.beam}m</span>`;
                    }

                    div.onclick = () => {
                        setWaypoint(wpType, item.lat, item.lng, item.name);
                        if (item.type === 'vessel' && item.dwt > 0) {
                            autoSelectVesselByDwt(item.dwt);
                        }
                        saveHistory(sType, item);
                        renderHistory(wpType, sType);
                    };
                    resultsBox[wpType].appendChild(div);
                });
                resultsBox[wpType].classList.remove('hidden');
            } else {
                resultsBox[wpType].classList.add('hidden');
            }
        }, 300);
    });
};
setupSearch('origin'); setupSearch('mid'); setupSearch('dest');

// Clear
clearBtn.addEventListener('click', () => {
    ['origin', 'mid', 'dest'].forEach(k => {
        if (markers[k]) map.removeLayer(markers[k]);
        waypoints[k] = null;
        markers[k] = null;
        inputs[k].value = '';
        coordsEl[k].textContent = 'Not set (Click Map)';
        resultsBox[k].classList.add('hidden');
        document.querySelector(`input[name="type-${k}"][value="map"]`).checked = true;
        containers[k].classList.add('hidden');
        const coordsContainer = document.getElementById(`coords-${k}`);
        if (coordsContainer) coordsContainer.classList.add('hidden');
    });
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = null;
    calcBtn.disabled = true;
    wrapperPanel.classList.add('hidden');
    weatherPanel.classList.add('hidden');
    weatherBtn.classList.add('hidden');
    if (saveSearchBtn) saveSearchBtn.classList.add('hidden');
    activeInputContext = 'origin';
    currentDistanceNm = 0; // Reset distance
});

// Helper: Haversine distance in Nautical Miles
function haversineDistance(coord1, coord2) {
    const lon1 = coord1[0] * Math.PI / 180;
    const lat1 = coord1[1] * Math.PI / 180;
    const lon2 = coord2[0] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const dlon = lon2 - lon1;
    const dlat = lat2 - lat1;
    const a = Math.pow(Math.sin(dlat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dlon / 2), 2);
    const c = 2 * Math.asin(Math.sqrt(a));
    return c * 3440.065;
}

// Calculate Route
calcBtn.addEventListener('click', async () => {
    if (currentMode === 'route') {
        if (!waypoints.origin || !waypoints.dest) return;
        calcBtn.textContent = 'Calculating...'; calcBtn.disabled = true;
        if (routeLayer) map.removeLayer(routeLayer);

        try {
            const reqBody = {
                origin: [waypoints.origin[1], waypoints.origin[0]],
                destination: [waypoints.dest[1], waypoints.dest[0]],
                midpoint: waypoints.mid ? [waypoints.mid[1], waypoints.mid[0]] : null
            };
            const response = await fetch('/api/route', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
            });
            if (!response.ok) throw new Error('API Error');

            const geojson = await response.json();
            currentRouteCoords = geojson.geometry.coordinates; // save for weather

            // Segment the route into Day segments based on base speed
            const speed = parseFloat(vesselSpeedInput.value) || 12.0;
            const distPerDay = speed * 24.0;
            const colors = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];
            const featureCollection = { type: "FeatureCollection", features: [] };

            let dayColorIndex = 0;
            let currentLine = [currentRouteCoords[0]];
            let accumulatedDist = 0;

            for (let i = 0; i < currentRouteCoords.length - 1; i++) {
                let p1 = currentRouteCoords[i];
                let p2 = currentRouteCoords[i + 1];
                let legDist = haversineDistance(p1, p2);

                while (accumulatedDist + legDist >= distPerDay) {
                    const needed = distPerDay - accumulatedDist;
                    const ratio = legDist > 0 ? needed / legDist : 0;
                    const midPt = [
                        p1[0] + (p2[0] - p1[0]) * ratio,
                        p1[1] + (p2[1] - p1[1]) * ratio
                    ];

                    currentLine.push(midPt);
                    featureCollection.features.push({
                        type: "Feature",
                        properties: { color: colors[dayColorIndex % colors.length] },
                        geometry: { type: "LineString", coordinates: currentLine }
                    });

                    dayColorIndex++;
                    currentLine = [midPt];
                    p1 = midPt;
                    legDist -= needed;
                    accumulatedDist = 0;
                }

                currentLine.push(p2);
                accumulatedDist += legDist;
            }

            if (currentLine.length > 1) {
                featureCollection.features.push({
                    type: "Feature",
                    properties: { color: colors[dayColorIndex % colors.length] },
                    geometry: { type: "LineString", coordinates: currentLine }
                });
            }

            routeLayer = L.geoJSON(featureCollection, {
                style: function (f) { return { color: f.properties.color, weight: 4, dashArray: '5, 5' }; }
            }).addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

            currentDistanceNm = geojson.properties.length;

            document.getElementById('res-distance').textContent = `${currentDistanceNm.toFixed(0)} NM`;
            recalculateRouteStats(); // Calculate and display time/fuel based on selected vessel

            document.querySelector('#results-panel h3').textContent = 'Voyage Estimation';
            document.querySelectorAll('#results-panel .result-row').forEach(el => el.style.display = 'flex');

            wrapperPanel.classList.remove('hidden');
            weatherPanel.classList.add('hidden');
            weatherBtn.classList.remove('hidden'); // allow weather checking
            if (saveSearchBtn) saveSearchBtn.classList.remove('hidden'); // allow saving route searches

            // Auto-close sidebar after calculation
            document.getElementById('main-sidebar').classList.remove('panel-open');

        } catch (e) {
            alert("Routing failed: " + e.message);
        } finally {
            calcBtn.textContent = 'Calculate Route'; calcBtn.disabled = false;
        }
    } else if (currentMode === 'reach') {
        // Reachability Mode
        if (!waypoints.origin) return;
        calcBtn.textContent = 'Generating...'; calcBtn.disabled = true;
        if (routeLayer) map.removeLayer(routeLayer);

        try {
            const days = parseInt(document.getElementById('reach-days').value) || 3;
            const speed = parseFloat(document.getElementById('reach-speed').value) || 10.0;

            const reqBody = {
                lat: waypoints.origin[0],
                lng: waypoints.origin[1],
                speed: speed,
                days: days
            };

            const response = await fetch('/api/reachability', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
            });
            if (!response.ok) throw new Error('API Error');

            const geojson = await response.json();
            currentRouteCoords = null; // Can't check weather on isochrone

            routeLayer = L.geoJSON(geojson, {
                style: function (feature) {
                    const day = feature.properties.day;
                    const colors = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];
                    const weights = [4, 3, 2, 2, 1];
                    const opacities = [1.0, 0.8, 0.6, 0.5, 0.4];

                    const idx = Math.min(day - 1, colors.length - 1);
                    return {
                        color: colors[idx],
                        weight: weights[idx] || 1,
                        opacity: opacities[idx] || 0.3
                    };
                }
            }).bindTooltip(function (layer) {
                return `Day ${layer.feature.properties.day} Reach < br > ${layer.feature.properties.distance_nm.toFixed(0)} NM`;
            }).addTo(map);

            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

            document.querySelector('#results-panel h3').textContent = 'Reachability Area';
            document.querySelectorAll('#results-panel .result-row').forEach(el => el.style.display = 'none');

            wrapperPanel.classList.remove('hidden');
            weatherPanel.classList.add('hidden');
            weatherBtn.classList.add('hidden');
            if (saveSearchBtn) saveSearchBtn.classList.remove('hidden'); // allow saving reach searches

            document.getElementById('main-sidebar').classList.remove('panel-open');
        } catch (e) {
            alert("Reachability failed: " + e.message);
        } finally {
            calcBtn.textContent = 'Generate Reachability'; calcBtn.disabled = false;
        }
    } else if (currentMode === 'saved') {
        const port = savedPortSelect.value;
        const speed = parseFloat(savedSpeedSelect.value);
        if (!port || !speed) return;

        calcBtn.textContent = 'Loading...'; calcBtn.disabled = true;
        if (routeLayer) map.removeLayer(routeLayer);

        try {
            const filename = `${port.replace(/ /g, '_').replace(/\//g, '_')}_${speed.toFixed(1)}.json`;
            const response = await fetch(`/api/precalc/${filename}`);
            if (!response.ok) throw new Error('Could not find precalculated file for this configuration. Ensure the background processing has finished.');

            const geojson = await response.json();
            currentRouteCoords = null;

            routeLayer = L.geoJSON(geojson, {
                style: function (feature) {
                    const day = feature.properties.day;
                    const colors = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];
                    const weights = [4, 3, 2, 2, 1];
                    const opacities = [1.0, 0.8, 0.6, 0.5, 0.4];

                    const idx = Math.min(day - 1, colors.length - 1);
                    return {
                        color: colors[idx],
                        weight: weights[idx] || 1,
                        opacity: opacities[idx] || 0.3
                    };
                }
            }).bindTooltip(function (layer) {
                return `Day ${layer.feature.properties.day} Reach < br > ${layer.feature.properties.distance_nm.toFixed(0)} NM`;
            }).addTo(map);

            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

            wrapperPanel.classList.add('hidden');
            weatherPanel.classList.add('hidden');
            weatherBtn.classList.add('hidden');

            document.getElementById('main-sidebar').classList.remove('panel-open');
        } catch (e) {
            alert("Failed to load precalculated data: " + e.message);
        } finally {
            calcBtn.textContent = 'Load Distance'; calcBtn.disabled = false;
        }
    }
});

// Get Weather Impact
weatherBtn.addEventListener('click', async () => {
    if (!currentRouteCoords) return;
    weatherBtn.textContent = 'Checking...'; weatherBtn.disabled = true;

    try {
        const speedKts = parseFloat(vesselSpeedInput.value) || 12.0;
        const fuelMt = parseFloat(vesselFuelInput.value) || 20.0;

        const reqBody = {
            route_coords: currentRouteCoords,
            speed: speedKts,
            base_fuel: fuelMt,
            total_distance: currentDistanceNm
        };
        const response = await fetch('/api/weather', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });
        if (!response.ok) throw new Error('API Error');

        const data = await response.json();

        document.getElementById('weather-status').innerHTML = data.weather_html;
        document.getElementById('weather-wave').textContent = `${data.avg_wave_meters} m`;

        let pct = 0;
        if (data.impact_level === 3) pct = 15;
        if (data.impact_level === 2) pct = 5;

        if (pct > 0) {
            document.getElementById('weather-adj').textContent = `Dynamic Routing (${pct}% Max Penalty)`;
            document.getElementById('weather-adj').style.color = 'var(--accent-red)';
        } else {
            document.getElementById('weather-adj').textContent = "Calm seas expected";
            document.getElementById('weather-adj').style.color = 'var(--text-primary)';
        }

        // Apply dynamically computed exact totals from the server
        document.getElementById('weather-time').textContent = `${Math.floor(data.total_days)}d ${Math.round((data.total_days % 1) * 24)}h`;
        document.getElementById('weather-fuel').textContent = `${data.total_fuel.toFixed(1)} MT`;

        weatherPanel.classList.remove('hidden');

    } catch (e) {
        alert("Failed to fetch weather: " + e.message);
    } finally {
        weatherBtn.textContent = 'Check Weather'; weatherBtn.disabled = false;
    }
});

// --- CUSTOM PORT ADDITION LOGIC ---
const cpNameInput = document.getElementById('cp-name');
const cpCountryInput = document.getElementById('cp-country');
const cpSelectBtn = document.getElementById('cp-select-map-btn');
const cpAddBtn = document.getElementById('cp-add-btn');
const cpMsg = document.getElementById('cp-message');
const cpToggleBtn = document.getElementById('cp-toggle-panel-btn');
const cpPanel = document.getElementById('custom-port-panel');

cpToggleBtn.addEventListener('click', () => {
    cpPanel.classList.toggle('hidden');
});

const checkCpForm = () => {
    cpAddBtn.disabled = !(cpNameInput.value.trim() && cpCountryInput.value.trim() && cpSelectedCoords);
};

cpNameInput.addEventListener('input', checkCpForm);
cpCountryInput.addEventListener('input', checkCpForm);

cpSelectBtn.addEventListener('click', () => {
    isCustomPortMode = !isCustomPortMode;
    if (isCustomPortMode) {
        cpSelectBtn.classList.add('active');
        cpSelectBtn.textContent = 'Cancel Selection';
    } else {
        cpSelectBtn.classList.remove('active');
        cpSelectBtn.textContent = 'Select on Map';
        if (cpTempMarker) {
            map.removeLayer(cpTempMarker);
            cpTempMarker = null;
        }
        cpSelectedCoords = null;
        document.getElementById('cp-coords-display').textContent = 'None';
        checkCpForm();
    }
});

cpAddBtn.addEventListener('click', async () => {
    if (!cpSelectedCoords) return;

    cpAddBtn.disabled = true;
    cpAddBtn.textContent = 'Adding...';

    const newPort = {
        name: cpNameInput.value.trim(),
        country: cpCountryInput.value.trim(),
        lat: cpSelectedCoords[0],
        lng: cpSelectedCoords[1]
    };

    try {
        const response = await fetch('/api/add_port', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newPort)
        });

        if (!response.ok) throw new Error('Failed to add port');

        cpMsg.textContent = 'Port added successfully!';
        cpMsg.classList.remove('hidden');

        // Reset form
        cpNameInput.value = '';
        cpCountryInput.value = '';
        cpSelectBtn.click(); // Cancels selection mode and clears marker

        setTimeout(() => {
            cpMsg.classList.add('hidden');
        }, 3000);

    } catch (e) {
        alert("Error adding port: " + e.message);
    } finally {
        cpAddBtn.disabled = false;
        cpAddBtn.textContent = 'Confirm Add';
    }
});

// --- MAP LAYERS LOGIC ---
const layerPortsBtn = document.getElementById('layer-ports-btn');
const layerVesselsBtn = document.getElementById('layer-vessels-btn');

let portsLayerGroup = L.layerGroup();
let vesselsLayerGroup = L.layerGroup();

layerPortsBtn.addEventListener('change', async (e) => {
    if (e.target.checked) {
        try {
            const res = await fetch('/api/all_ports');
            const data = await res.json();
            portsLayerGroup.clearLayers();
            data.forEach(p => {
                L.circleMarker([p.lat, p.lng], {
                    radius: 4, fillColor: '#3b82f6', color: '#1e3a8a', weight: 1, opacity: 1, fillOpacity: 0.8
                }).bindTooltip(`${p.name} (${p.country})`).addTo(portsLayerGroup);
            });
            portsLayerGroup.addTo(map);
        } catch (err) {
            console.error(err);
            layerPortsBtn.checked = false;
        }
    } else {
        map.removeLayer(portsLayerGroup);
    }
});

layerVesselsBtn.addEventListener('change', async (e) => {
    if (e.target.checked) {
        try {
            const res = await fetch('/api/all_vessels');
            const data = await res.json();
            vesselsLayerGroup.clearLayers();
            data.forEach(v => {
                L.circleMarker([v.lat, v.lng], {
                    radius: 5, fillColor: '#facc15', color: '#b45309', weight: 1, opacity: 1, fillOpacity: 0.9
                }).bindTooltip(`M / V ${v.name} <br>IMO: ${v.imo || 'N/A'}`).addTo(vesselsLayerGroup);
            });
            vesselsLayerGroup.addTo(map);
        } catch (err) {
            console.error(err);
            layerVesselsBtn.checked = false;
        }
    } else {
        map.removeLayer(vesselsLayerGroup);
    }
});

// --- RESPONSIVE PANEL LOGIC ---
const newCalcBtn = document.getElementById('new-calc-btn');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const sidebarContent = document.getElementById('main-sidebar');

if (newCalcBtn && sidebarCloseBtn && sidebarContent) {
    newCalcBtn.addEventListener('click', () => {
        sidebarContent.classList.add('panel-open');
    });

    sidebarCloseBtn.addEventListener('click', () => {
        sidebarContent.classList.remove('panel-open');
    });
}

const toggleRecentSavedBtn = document.getElementById('toggle-recent-saved-btn');
const recentSavedList = document.getElementById('recent-saved-list');
const recentSavedChevron = document.getElementById('recent-saved-chevron');

if (toggleRecentSavedBtn && recentSavedList && recentSavedChevron) {
    toggleRecentSavedBtn.addEventListener('click', () => {
        recentSavedList.classList.toggle('hidden');
        recentSavedChevron.textContent = recentSavedList.classList.contains('hidden') ? '▼' : '▲';
    });
}

if (saveSearchBtn) {
    saveSearchBtn.addEventListener('click', () => {
        if (currentMode === 'reach') {
            if (!waypoints.origin) return;
            const days = parseInt(document.getElementById('reach-days').value) || 3;
            const speed = parseFloat(document.getElementById('reach-speed').value) || 10.0;

            let locName = inputs.origin.value || "Custom Location";
            if (locName === '' || locName === 'Map Point' || locName === 'Not set (Click Map)') {
                locName = `Map Point (${waypoints.origin[0].toFixed(2)}, ${waypoints.origin[1].toFixed(2)})`;
            }

            saveSearchItem({
                id: Date.now() + Math.random(),
                type: 'reach',
                name: locName,
                lat: waypoints.origin[0],
                lng: waypoints.origin[1],
                speed: speed,
                days: days
            });
        } else if (currentMode === 'route') {
            if (!waypoints.origin || !waypoints.dest) return;
            let oName = inputs.origin.value || "Origin";
            let dName = inputs.dest.value || "Dest";
            if (oName === '' || oName === 'Map Point' || oName === 'Not set (Click Map)') oName = "Map Origin";
            if (dName === '' || dName === 'Map Point' || dName === 'Not set (Click Map)') dName = "Map Dest";

            let mData = null;
            if (waypoints.mid) {
                let mName = inputs.mid.value || "Midpoint";
                if (mName === '' || mName === 'Map Point' || mName === 'Not set (Click Map)') mName = "Midpoint";
                mData = { lat: waypoints.mid[0], lng: waypoints.mid[1], name: mName };
            }

            saveSearchItem({
                id: Date.now() + Math.random(),
                type: 'route',
                name: `${oName} ➔ ${dName}`,
                distance: currentDistanceNm.toFixed(0),
                origin: { lat: waypoints.origin[0], lng: waypoints.origin[1], name: oName },
                dest: { lat: waypoints.dest[0], lng: waypoints.dest[1], name: dName },
                mid: mData
            });
        }

        const oldText = saveSearchBtn.textContent;
        saveSearchBtn.textContent = 'Saved!';
        renderSavedSearches();

        // Open the saved list if it's hidden
        if (recentSavedList && recentSavedList.classList.contains('hidden')) {
            toggleRecentSavedBtn.click();
        }

        setTimeout(() => saveSearchBtn.textContent = oldText, 2000);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    if (typeof renderSavedSearches === 'function') renderSavedSearches();
});

// --- DISCLAIMER MODAL LOGIC ---
const discBtn = document.getElementById('disclaimer-btn');
const closeDiscBtn = document.getElementById('close-disclaimer-btn');
const discModal = document.getElementById('disclaimer-modal');

if (discBtn && closeDiscBtn && discModal) {
    discBtn.addEventListener('click', () => {
        discModal.classList.remove('hidden');
    });

    closeDiscBtn.addEventListener('click', () => {
        discModal.classList.add('hidden');
    });

    // Close on click outside content
    discModal.addEventListener('click', (e) => {
        if (e.target === discModal) {
            discModal.classList.add('hidden');
        }
    });
}

// --- SAVE AS IMAGE LOGIC ---
const saveImgBtn1 = document.getElementById('save-img-btn-1');
const saveImgBtn2 = document.getElementById('save-img-btn-2');

const downloadScreenshot = () => {
    const targetEl = document.querySelector('.map-container');
    if (!targetEl) return;

    if (typeof html2canvas === 'undefined') {
        alert("Screenshot library not loaded yet.");
        return;
    }

    const oldText1 = saveImgBtn1 ? saveImgBtn1.textContent : '';
    const oldText2 = saveImgBtn2 ? saveImgBtn2.textContent : '';

    if (saveImgBtn1) saveImgBtn1.textContent = 'Saving...';
    if (saveImgBtn2) saveImgBtn2.textContent = 'Saving...';

    // html2canvas requires useCORS to capture map tiles correctly
    html2canvas(targetEl, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null
    }).then(canvas => {
        if (saveImgBtn1) saveImgBtn1.textContent = oldText1;
        if (saveImgBtn2) saveImgBtn2.textContent = oldText2;

        const link = document.createElement('a');
        link.download = `SeaDistance_Export_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(err => {
        console.error("Screenshot failed:", err);
        alert("Failed to capture screenshot. (Map tiles might block CORS depending on provider)");
        if (saveImgBtn1) saveImgBtn1.textContent = oldText1;
        if (saveImgBtn2) saveImgBtn2.textContent = oldText2;
    });
};

if (saveImgBtn1) saveImgBtn1.addEventListener('click', downloadScreenshot);
if (saveImgBtn2) saveImgBtn2.addEventListener('click', downloadScreenshot);
