/**
 * app.js
 * Main UI Controller
 */

// Global State
const AppState = {
    eventsData: null,
    locationsData: null,
    prefsData: null,
    schedule: null,
    lastSeed: null
};

// DOM Elements
const UI = {
    dropZoneEvents: document.getElementById('drop-zone-events'),
    dropZoneLocations: document.getElementById('drop-zone-locations'),
    dropZonePrefs: document.getElementById('drop-zone-prefs'),
    fileEvents: document.getElementById('file-events'),
    fileLocations: document.getElementById('file-locations'),
    filePrefs: document.getElementById('file-prefs'),
    statusEvents: document.getElementById('events-status'),
    statusLocations: document.getElementById('locations-status'),
    statusPrefs: document.getElementById('prefs-status'),
    btnGenerate: document.getElementById('btn-generate'),
    btnExport: document.getElementById('btn-export-csv'),
    metricsDisplay: document.getElementById('metrics-display'),
    chartDiv: document.getElementById('schedule-graph'),
    inputs: {
        startTime: document.getElementById('time-start'),
        endTime: document.getElementById('time-end'),
        interval: document.getElementById('time-interval'),
        gap: document.getElementById('time-gap'),
    }
};

/**
 * Initialization
 */
function init() {
    setupDragAndDrop();
    setupButtons();
}

/**
 * Event Listeners
 */
function setupButtons() {
    // Generate Button
    UI.btnGenerate.addEventListener('click', () => {
        if (!AppState.eventsData || !AppState.locationsData) {
            alert("Please upload both Events and Locations CSV files first.");
            return;
        }
        generateSchedule();
    });

    // Export Button
    UI.btnExport.addEventListener('click', exportCSV);

    // Template Downloads
    document.getElementById('btn-dl-events').onclick = () => downloadTemplate('events');
    document.getElementById('btn-dl-locations').onclick = () => downloadTemplate('locations');
    document.getElementById('btn-dl-prefs').onclick = () => downloadTemplate('prefs');
}

function setupDragAndDrop() {
    const pairs = [
        { zone: UI.dropZoneEvents, input: UI.fileEvents, type: 'events' },
        { zone: UI.dropZoneLocations, input: UI.fileLocations, type: 'locations' },
        { zone: UI.dropZonePrefs, input: UI.filePrefs, type: 'prefs' }
    ];

    pairs.forEach(p => {
        // Input Change
        p.input.addEventListener('change', (e) => handleFile(e.target.files[0], p.type, p.zone));

        // Drag Events
        ['dragenter', 'dragover'].forEach(eventName => {
            p.zone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                p.zone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            p.zone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                p.zone.classList.remove('dragover');
            }, false);
        });

        // Drop
        p.zone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const file = dt.files[0];
            handleFile(file, p.type, p.zone);
        }, false);
    });
}

/**
 * File Handling
 */
function handleFile(file, type, zoneElement) {
    if (!file) return;

    if (type === 'prefs') {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                AppState.prefsData = JSON.parse(e.target.result);
                updateStatus(type, true, file.name);
                zoneElement.classList.add('has-file');
            } catch (err) {
                console.error(err);
                alert("Invalid JSON file");
                updateStatus(type, false);
            }
        };
        reader.readAsText(file);
        return;
    }

    // CSV Handling
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            if (results.errors.length > 0 && results.data.length === 0) {
                alert("Error parsing CSV");
                updateStatus(type, false);
                return;
            }

            if (type === 'events') {
                // Validate Header roughly
                const first = results.data[0];
                // Check unique key 'bldg_cde' or 'event_cde'
                if (!first.hasOwnProperty('crs_cde') && !first.hasOwnProperty('event_cde')) {
                    alert("Invalid Events CSV. Missing 'event_cde' or 'crs_cde'");
                    updateStatus(type, false);
                    return;
                }
                AppState.eventsData = results.data;
            } else if (type === 'locations') {
                const first = results.data[0];
                if (!first.hasOwnProperty('Location') || !first.hasOwnProperty('Capacity')) {
                    alert("Invalid Locations CSV. Missing 'Location' or 'Capacity'");
                    updateStatus(type, false);
                    return;
                }
                AppState.locationsData = results.data;
            }

            updateStatus(type, true, file.name);
            zoneElement.classList.add('has-file');
        }
    });
}

function updateStatus(type, success, filename) {
    const el = type === 'events' ? UI.statusEvents :
        type === 'locations' ? UI.statusLocations : UI.statusPrefs;

    if (success) {
        el.innerHTML = `🟢 Ready: ${filename}`;
        el.style.color = 'var(--success)';
    } else {
        el.innerHTML = `🔴 Error`;
        el.style.color = 'var(--danger)';
    }
}

/**
 * Schedule Generation
 */
function generateSchedule() {
    // 1. Gather Config
    const days = Array.from(document.querySelectorAll('.day-picker input:checked')).map(cb => cb.value);
    const startT = UI.inputs.startTime.value;
    const endT = UI.inputs.endTime.value;
    const interval = UI.inputs.interval.value;
    const gap = UI.inputs.gap.value;

    if (days.length === 0) {
        alert("Please select at least one day.");
        return;
    }

    // 2. Instantiate Models
    const events = AppState.eventsData.map(d => new Event(d));
    const locations = AppState.locationsData.map(d => new Location(d));

    // 3. Run Algorithm
    const schedule = new Schedule(locations, startT, endT, days, interval, gap);
    if (AppState.prefsData) schedule.setLocationPreferences(AppState.prefsData);

    // Seed based on time (like Python)
    const seed = Math.floor(Date.now() / 1000);
    AppState.lastSeed = seed;

    console.log("Generating with seed:", seed);
    const result = schedule.createSchedule(events, seed);

    // 4. Update UI
    AppState.schedule = schedule;
    updateMetrics(schedule.metrics);
    UI.btnExport.disabled = false;

    // 5. Render Chart
    renderChart(schedule);
}

function updateMetrics(m) {
    const total = m.reduce((a, b) => a + b, 0);
    const p = (val) => total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';

    UI.metricsDisplay.innerHTML = `
        <span class="metric-item"><span class="highlight">${p(m[0])}</span> Desired Location</span>
        <span class="metric-item"><span class="highlight">${p(m[1])}</span> Same Building</span>
        <span class="metric-item"><span class="highlight">${p(m[2])}</span> Preference Building</span>
        <span class="metric-item"><span class="highlight">${p(m[3])}</span> Unpreferred/Other</span>
    `;
}

/**
 * Visualization
 */
function renderChart(schedule) {
    const traces = schedule.getPlotlyData();

    // Prepare Layout
    // We need to construct custom tick text for the X axis to show Time + Day
    // Start = 0. End = weekIntervals * interval

    const tickVals = [];
    const tickText = [];

    const dayDurationMin = (schedule.schEndMin - schedule.schStartMin);
    const dayDurationUnits = dayDurationMin; // Since mapping 1 unit = 1 min in visual X

    // Create ticks every Hour?
    // StartHour
    const startH = parseInt(UI.inputs.startTime.value);
    const endH = parseInt(UI.inputs.endTime.value);

    schedule.shortDays.forEach((day, dIndex) => {
        const dayOffset = dIndex * dayDurationUnits;

        // Add Day Label (at the middle or start?)
        // Let's add hours
        for (let h = startH; h < endH; h++) {
            const minFromStart = (h - startH) * 60;
            const val = dayOffset + minFromStart;

            // Only add tick if it's the start of the day or every few hours to avoid clutter
            if (h === startH) {
                tickVals.push(val);
                tickText.push(`<b>${day}</b> ${h}:00`); // Bold Day
            } else if (h % 2 === 0) { // Every 2 hours
                tickVals.push(val);
                tickText.push(`${h}:00`);
            }
        }
    });

    // Add Vertical Lines for Days
    const shapes = [];
    for (let i = 1; i < schedule.shortDays.length; i++) {
        shapes.push({
            type: 'line',
            x0: i * dayDurationUnits,
            x1: i * dayDurationUnits,
            y0: 0,
            y1: 1,
            xref: 'x',
            yref: 'paper',
            line: {
                color: '#555',
                width: 2,
                dash: 'dot'
            }
        });
    }

    const layout = {
        title: 'Classroom Schedule',
        barmode: 'stack', // Not really stacking but good default
        paper_bgcolor: '#1e1e1e',
        plot_bgcolor: '#1e1e1e',
        font: {
            color: '#e0e0e0',
            family: 'Outfit, sans-serif'
        },
        yaxis: {
            autorange: 'reversed', // A-Z top to bottom
            gridcolor: '#333'
        },
        xaxis: {
            tickmode: 'array',
            tickvals: tickVals,
            ticktext: tickText,
            gridcolor: '#333'
        },
        shapes: shapes,
        margin: { l: 150, r: 20, t: 50, b: 50 },
        height: Math.max(600, schedule.locations.length * 30) // Dynamic height
    };

    Plotly.newPlot(UI.chartDiv, traces, layout, { responsive: true });
}

/**
 * Export Logic
 */
function exportCSV() {
    if (!AppState.schedule) return;

    // Reconstruct the logic from python exportToCSV
    // Needed: Code, Event, Days, Time, Event_Enrollment, Event_Capacity, Max, PastLocation, PlacedLocation, Metric

    // We need to find all events that were passed to createSchedule.
    // The schedule object returned {failures, events} in JS, but we didn't store returned events specifically,
    // we modified the input events array in place.
    // So we can re-use the `events` array we created in generateSchedule... but we need access to it.
    // Let's grab it from the grid or just store it in AppState.

    // Actually, AppState.schedule is the object. But events list?
    // We didn't save the modified event objects list to AppState.
    // Let's extract them from the grid + unscheduled?
    // Easier: Just look at the grid.

    const uniqueEvents = new Set();
    const grid = AppState.schedule.scheduleGrid;

    Object.values(grid).forEach(row => {
        row.forEach(cell => {
            if (cell !== 0) uniqueEvents.add(cell);
        });
    });

    const data = Array.from(uniqueEvents).map(e => ({
        Code: e.eventCode,
        Event: e.name,
        Days: e.timeObj.days.join(""),
        Time: e.timeObj.totalTime,
        Enrollment: e.seats,
        Capacity: e.capacity,
        Max: e.maxCapacity,
        PastLocation: e.pastLocationString,
        Location: e.placedLocation,
        Metric: e.metric
    }));

    const csv = Papa.unparse(data);
    downloadString(csv, "classroom_schedule.csv");
}

/**
 * Utilities
 */
function downloadTemplate(type) {
    let csv = "";
    if (type === 'events') {
        csv = "event_cde,event_title,event_enrollment,event_capacity,max_enrollment,begin_time,end_time,bldg_cde,room_cde,monday_cde,tuesday_cde,wednesday_cde,thursday_cde,friday_cde\nCS101,Intro CS,30,40,50,09:00,10:30,BLDG,101,M,,W,,F";
    } else if (type === 'locations') {
        csv = "Location,Capacity,Features\nBLDG 101,50,Projector/Whiteboard\nBLDG 102,30,TV";
    } else if (type === 'prefs') {
        const json = JSON.stringify({ "CS": ["BLDG"] }, null, 2);
        downloadString(json, "prefs_template.json");
        return;
    }
    downloadString(csv, `${type}_template.csv`);
}

function downloadString(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Start
window.addEventListener('DOMContentLoaded', init);
