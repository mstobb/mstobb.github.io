// Main Application Controller
import { parseCSV } from './parser.js';
import { render } from './view.js';
import { renderCorrelations } from './correlation.js'; // Import new module

// State
let appState = {
    data: [],
    attributes: [],
    selectedAttribute: null,
    layout: 'week', // 'week', 'month', 'neatocal'
    colors: {
        active: '#0ea5e9',
        bg: '#ffffff'
    },
    currentView: 'calendar', // 'calendar' or 'correlation'
    theme: 'dark' // Enforced
};

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadSection = document.getElementById('upload-section');
const controlsSection = document.getElementById('controls-section');
const attributeSelect = document.getElementById('attribute-select');
const fileInfo = document.getElementById('file-info');
const fileNameDisplay = document.getElementById('filename');
const removeFileBtn = document.getElementById('remove-file');
const canvasContainer = document.getElementById('canvas-container');
const layoutBtns = document.querySelectorAll('.layout-btn');
const colorActiveInput = document.getElementById('color-active');
const colorBgInput = document.getElementById('color-bg');

// New Elements
const viewsNav = document.getElementById('views-nav');
const viewTabs = document.querySelectorAll('.view-tab');
const mainScrollArea = document.getElementById('main-scroll-area');
const correlationScrollArea = document.getElementById('correlation-scroll-area');

// Initialize
function init() {
    // Enforce dark mode
    document.documentElement.classList.add('dark');
    setupEventListeners();
}

function setupEventListeners() {
    // Drop Zone
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-brand-500', 'bg-brand-50', 'dark:bg-brand-900/20');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-brand-500', 'bg-brand-50', 'dark:bg-brand-900/20');
    });
    dropZone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    // Remove File
    removeFileBtn.addEventListener('click', resetApp);

    // View Switching
    viewTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });

    // Controls
    attributeSelect.addEventListener('change', (e) => {
        appState.selectedAttribute = e.target.value;
        updateView();
    });

    layoutBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            layoutBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update state
            appState.layout = btn.dataset.layout;
            updateView();
        });
    });

    // Colors
    colorActiveInput.addEventListener('input', (e) => {
        appState.colors.active = e.target.value;
        document.getElementById('color-active-hex').textContent = e.target.value;
        updateView();
    });
    colorBgInput.addEventListener('input', (e) => {
        appState.colors.bg = e.target.value;
        document.getElementById('color-bg-hex').textContent = e.target.value;
        updateView();
    });
}

function switchView(viewName) {
    appState.currentView = viewName;

    // Update Tabs
    viewTabs.forEach(t => {
        if (t.dataset.view === viewName) t.classList.add('active', 'text-slate-900', 'bg-white', 'shadow-sm');
        else t.classList.remove('active', 'text-slate-900', 'bg-white', 'shadow-sm');
    });

    // Update Visibility
    if (viewName === 'calendar') {
        mainScrollArea.classList.remove('hidden');
        correlationScrollArea.classList.add('hidden');
        controlsSection.classList.remove('hidden'); // Show sidebar controls
        updateView(); // Ensure render
    } else {
        mainScrollArea.classList.add('hidden');
        correlationScrollArea.classList.remove('hidden');
        // Render Correlation
        const textColor = '#cbd5e1'; // Force dark mode text color
        renderCorrelations(appState.data, document.getElementById('matrix-container'), { textColor });
    }
}

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('border-brand-500', 'bg-brand-50', 'dark:bg-brand-900/20');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
}

async function handleFile(file) {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        alert('Please upload a CSV file.');
        return;
    }

    try {
        const result = await parseCSV(file);
        appState.data = result.data;
        appState.attributes = result.attributes;

        // Success UI
        showControls();
        fileNameDisplay.textContent = file.name;

        // Populate Select
        attributeSelect.innerHTML = appState.attributes
            .map(attr => `<option value="${attr}">${attr}</option>`)
            .join('');

        // Default selection
        if (appState.attributes.length > 0) {
            appState.selectedAttribute = appState.attributes[0];
        }

        updateView();

    } catch (err) {
        console.error(err);
        alert('Error parsing CSV. See console.');
    }
}

function showControls() {
    dropZone.classList.add('hidden');
    fileInfo.classList.remove('hidden');
    controlsSection.classList.remove('hidden');
    viewsNav.classList.remove('hidden'); // Show Tabs
    document.getElementById('placeholder-msg').classList.add('hidden');
    document.getElementById('stats-container').classList.remove('hidden');
}

function resetApp() {
    appState.data = [];
    appState.attributes = [];
    appState.selectedAttribute = null;

    dropZone.classList.remove('hidden');
    viewsNav.classList.add('hidden');
    fileInfo.classList.add('hidden');
    controlsSection.classList.add('hidden');
    document.getElementById('placeholder-msg').classList.remove('hidden');
    document.getElementById('stats-container').classList.add('hidden');

    // Switch back to calendar
    switchView('calendar');

    // Clear canvas
    canvasContainer.innerHTML = `
        <div id="placeholder-msg" class="text-slate-400 dark:text-slate-500 text-center">
            <p class="text-lg font-medium mb-1">No data loaded</p>
            <p class="text-sm">Upload a CSV file to get started</p>
        </div>
    `;
    fileInput.value = '';
}

function updateView() {
    if (!appState.data.length) return;

    if (appState.currentView === 'calendar') {
        // Clear existing
        canvasContainer.innerHTML = '';

        // Call Render
        const textColor = '#cbd5e1'; // Force dark mode text color
        render(appState.data, canvasContainer, {
            layout: appState.layout,
            attribute: appState.selectedAttribute,
            colors: appState.colors,
            textColor: textColor
        });
    } else {
        // Render Correlation
        const textColor = '#cbd5e1'; // Force dark mode text color
        renderCorrelations(appState.data, document.getElementById('matrix-container'), { textColor });
    }
}

// Start
init();
