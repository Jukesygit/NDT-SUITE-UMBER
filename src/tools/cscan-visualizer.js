// C-Scan Visualizer Tool Module - Complete with all features (Part 1)
import dataManager from '../data-manager.js';
import { createAnimatedHeader } from '../animated-background.js';

let container, dom = {}, processedScans = [], currentScanData = null, compositeWorker = null, isShowingComposite = false, customColorRange = { min: null, max: null };

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div id="cscan-header-container" style="flex-shrink: 0;"></div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
    <header class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 mb-8 flex justify-between items-center flex-shrink-0" style="display: none;">
        <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Phased Array C-Scan Visualizer</h1>
            <p class="mt-2 text-gray-600 dark:text-gray-400">Upload a C-Scan data file (.txt or .csv) to generate an interactive corrosion heatmap.</p>
        </div>
    </header>
    
    <main class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 flex-grow flex flex-col overflow-y-auto">
        <div id="upload-section" class="text-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 md:p-12">
            <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <h2 class="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Upload C-Scan file(s)</h2>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Drag and drop or click to select one or more files.</p>
            <input type="file" id="file-input" class="hidden" accept=".txt,.csv" multiple>
            <button id="upload-button" class="mt-6 file-input-button bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
                Select Files
            </button>
        </div>
        
        <div id="status-message" class="hidden mt-4 text-center p-4 rounded-lg"></div>
        <div id="progress-container" class="hidden mt-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div id="progress-bar" class="progress-bar-inner bg-blue-600 h-2.5 rounded-full" style="width: 0%"></div>
        </div>
        
        <div id="file-management-section" class="hidden mt-8 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner">
            <div class="flex flex-wrap justify-between items-center border-b border-gray-200 dark:border-gray-600 pb-2 mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Processed Files</h3>
                <div class="flex gap-2 mt-2 md:mt-0">
                    <button id="composite-button" class="file-input-button bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors">
                        Generate Composite
                    </button>
                    <button id="export-button" class="file-input-button bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 hidden transition-colors">
                        Export Image
                    </button>
                    <button id="export-clean-button" class="file-input-button bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-teal-700 hidden transition-colors">
                        Export Heatmap Only
                    </button>
                    <button id="export-to-hub-btn" class="file-input-button bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-700 hidden transition-colors">
                        Export to Hub
                    </button>
                </div>
            </div>
            <div id="file-list" class="text-sm text-gray-700 dark:text-gray-300"></div>
        </div>
        
        <div id="controls-section" class="hidden mt-8 space-y-4">
            <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="control-group">
                        <label for="colorscale-cscan" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Color Scale:</label>
                        <select id="colorscale-cscan" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm dark:bg-gray-700 dark:text-white px-3 py-2">
                            <option value="Viridis">Viridis</option>
                            <option value="RdBu">Red-Blue</option>
                            <option value="YlOrRd">Yl-Or-Rd</option>
                            <option value="Jet" selected>Jet</option>
                            <option value="Hot">Hot</option>
                            <option value="Picnic">Picnic</option>
                            <option value="Portland">Portland</option>
                            <option value="Electric">Electric</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label for="smoothing-cscan" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Smoothing:</label>
                        <select id="smoothing-cscan" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm dark:bg-gray-700 dark:text-white px-3 py-2">
                            <option value="false">None (Blocky)</option>
                            <option value="best" selected>Smooth (Best)</option>
                            <option value="fast">Smooth (Fast)</option>
                        </select>
                    </div>
                    <div class="flex items-center gap-2 pt-5">
                        <input type="checkbox" id="reverse-scale-cscan" class="w-5 h-5 cursor-pointer" checked>
                        <label for="reverse-scale-cscan" class="text-sm font-medium text-gray-700 dark:text-gray-300">Reverse</label>
                        <input type="checkbox" id="show-grid-cscan" checked class="w-5 h-5 cursor-pointer ml-4">
                        <label for="show-grid-cscan" class="text-sm font-medium text-gray-700 dark:text-gray-300">Grid</label>
                    </div>
                </div>
            </div>

            <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-center">
                <div>
                    <label for="min-thickness" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Min (mm):</label>
                    <input type="number" id="min-thickness" step="0.1" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm dark:bg-gray-700 dark:text-white px-3 py-2">
                </div>
                <div>
                    <label for="max-thickness" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Max (mm):</label>
                    <input type="number" id="max-thickness" step="0.1" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm dark:bg-gray-700 dark:text-white px-3 py-2">
                </div>
                <div class="flex gap-2 pt-5">
                    <button id="update-button" class="file-input-button bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">Apply</button>
                    <button id="reset-range-btn" class="file-input-button bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors">Auto</button>
                </div>
            </div>

            <div id="stats-cscan" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center"></div>
        </div>
        
        <div id="visualization-section" class="hidden mt-8 w-full flex-grow">
            <div id="plot-container" class="w-full h-full"></div>
        </div>
        
        <div id="metadata-section" class="hidden mt-8 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner">
            <h3 class="text-lg font-semibold border-b dark:border-gray-600 pb-2 mb-4 dark:text-white">Scan Metadata</h3>
            <div id="metadata-content" class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm"></div>
        </div>
    </main>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#cscan-header-container'),
        uploadButton: q('#upload-button'),
        fileInput: q('#file-input'),
        uploadSection: q('#upload-section'),
        statusMessage: q('#status-message'),
        visualizationSection: q('#visualization-section'),
        plotContainer: q('#plot-container'),
        metadataSection: q('#metadata-section'),
        metadataContent: q('#metadata-content'),
        controlsSection: q('#controls-section'),
        minThicknessInput: q('#min-thickness'),
        maxThicknessInput: q('#max-thickness'),
        updateButton: q('#update-button'),
        resetRangeBtn: q('#reset-range-btn'),
        fileManagementSection: q('#file-management-section'),
        fileListContainer: q('#file-list'),
        compositeButton: q('#composite-button'),
        exportButton: q('#export-button'),
        exportCleanButton: q('#export-clean-button'),
        exportToHubBtn: q('#export-to-hub-btn'),
        progressContainer: q('#progress-container'),
        progressBar: q('#progress-bar'),
        colorscaleSelect: q('#colorscale-cscan'),
        smoothingSelect: q('#smoothing-cscan'),
        reverseScaleCheckbox: q('#reverse-scale-cscan'),
        showGridCheckbox: q('#show-grid-cscan'),
        statsContainer: q('#stats-cscan')
    };

    // Initialize animated header
    const header = createAnimatedHeader(
        'Phased Array C-Scan Visualizer',
        'Upload C-Scan data files to generate interactive corrosion heatmaps',
        { height: '180px', particleCount: 15, waveIntensity: 0.4 }
    );
    dom.headerContainer.appendChild(header);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    dom.uploadSection.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/50');
    const dt = e.dataTransfer;
    if (dt.files.length > 0) handleFiles(dt.files);
}

function showStatus(message, isError = false) {
    dom.statusMessage.textContent = message;
    dom.statusMessage.className = `mt-4 text-center p-4 rounded-lg ${
        isError ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : 
        'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
    }`;
    dom.statusMessage.classList.remove('hidden');
}

async function handleFiles(files) {
    showStatus(`Processing ${files.length} file(s)...`);
    [dom.visualizationSection, dom.metadataSection, dom.controlsSection, dom.fileManagementSection, dom.exportButton, dom.exportCleanButton, dom.exportToHubBtn].forEach(el => el.classList.add('hidden'));

    processedScans = [];
    isShowingComposite = false;
    customColorRange = { min: null, max: null };

    for (const file of files) {
        try {
            const parsedData = parseCScanFile(await file.text());
            parsedData.fileName = file.name;
            processedScans.push(parsedData);
        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            showStatus(`Error processing ${file.name}: ${error.message}`, true);
            return;
        }
    }

    if (processedScans.length > 0) {
        currentScanData = processedScans[0];
        renderPlot(currentScanData);
        renderMetadata(currentScanData.metadata);
        renderFileList();
        showStatus(`${processedScans.length} file(s) processed.`);
        dom.uploadSection.classList.add('hidden');
        [dom.fileManagementSection, dom.controlsSection].forEach(el => el.classList.remove('hidden'));
    }
}

function parseCScanFile(content) {
    const lines = content.split(/\r?\n/);
    const metadata = {};
    let dataStartIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('mm')) {
            dataStartIndex = i;
            break;
        }
        const parts = line.split('=').map(p => p.trim());
        if (parts.length === 2) {
            metadata[parts[0]] = isNaN(parseFloat(parts[1])) ? parts[1] : parseFloat(parts[1]);
        }
    }
    
    if (dataStartIndex === -1) throw new Error('Could not find data matrix header.');
    
    const xCoords = lines[dataStartIndex].split(/[\t,]/).slice(1).map(parseFloat);
    const yCoords = [];
    const tempThicknessValues = [];
    
    for (let i = dataStartIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const rowValues = line.split(/[\t,]/);
        const yValue = parseFloat(rowValues[0]);
        if (isNaN(yValue)) continue;
        yCoords.push(yValue);
        tempThicknessValues.push(rowValues.slice(1).map(val => (val === 'ND' || val.trim() === '') ? NaN : parseFloat(val)));
    }
    
    if (xCoords.length === 0 || yCoords.length === 0 || tempThicknessValues.length === 0) {
        throw new Error('Failed to parse data matrix.');
    }
    
    const flatThicknessValues = new Float32Array(tempThicknessValues.length * xCoords.length);
    tempThicknessValues.forEach((row, i) => flatThicknessValues.set(row, i * xCoords.length));
    
    return {
        metadata,
        x_coords: xCoords,
        y_coords: yCoords,
        thickness_values_flat: flatThicknessValues,
        rows: yCoords.length,
        cols: xCoords.length
    };
}

function findMinMax(data) {
    let min = Infinity, max = -Infinity;
    for (const val of data) {
        if (!isNaN(val)) {
            if (val < min) min = val;
            if (val > max) max = val;
        }
    }
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
}

function reconstructMatrix(flatData, rows, cols) {
    const matrix = [];
    for (let i = 0; i < rows; i++) {
        const row = new Array(cols);
        for (let j = 0; j < cols; j++) {
            const val = flatData[i * cols + j];
            row[j] = isNaN(val) ? null : val;
        }
        matrix.push(row);
    }
    return matrix;
}

function getStandardizedMinMax() {
    const counts = new Map();
    processedScans.forEach(scan => {
        const key = `${scan.metadata['Min Thickness (mm)']}|${scan.metadata['Max Thickness (mm)']}`;
        if (key.includes('undefined')) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    if (counts.size === 0) return null;
    const mostCommonKey = [...counts.entries()].reduce((a, e) => e[1] > a[1] ? e : a)[0];
    const [min, max] = mostCommonKey.split('|').map(parseFloat);
    return { min, max };
}

function calculateStats(data) {
    if (!data) return null;

    const flatData = [];
    for (const val of data.thickness_values_flat) {
        if (!isNaN(val) && isFinite(val)) {
            flatData.push(val);
        }
    }

    if (flatData.length === 0) return null;

    const sorted = flatData.slice().sort((a, b) => a - b);
    const sum = flatData.reduce((a, b) => a + b, 0);
    const mean = sum / flatData.length;
    const variance = flatData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / flatData.length;

    return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: mean,
        median: sorted[Math.floor(sorted.length / 2)],
        stdDev: Math.sqrt(variance),
        count: flatData.length,
        rows: data.rows,
        cols: data.cols
    };
}

function renderStats(stats) {
    if (!stats) return;

    const statsHTML = [
        { label: 'Min', value: stats.min.toFixed(2), unit: 'mm' },
        { label: 'Max', value: stats.max.toFixed(2), unit: 'mm' },
        { label: 'Mean', value: stats.mean.toFixed(2), unit: 'mm' },
        { label: 'Median', value: stats.median.toFixed(2), unit: 'mm' },
        { label: 'Std Dev', value: stats.stdDev.toFixed(2), unit: 'mm' },
        { label: 'Points', value: stats.count, unit: '' }
    ].map(({ label, value, unit }) => `
        <div class="p-3 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
            <div class="text-xs text-gray-500 dark:text-gray-400">${label}</div>
            <div class="text-lg font-semibold text-gray-900 dark:text-white">${value} ${unit}</div>
        </div>
    `).join('');

    dom.statsContainer.innerHTML = statsHTML;
}

function renderPlot(data, isComposite = false) {
    let matrix = (isComposite && data.compositeMatrix) ? data.compositeMatrix : reconstructMatrix(data.thickness_values_flat, data.rows, data.cols);

    const stats = calculateStats(data);
    if (stats) {
        renderStats(stats);
    }

    if (!isComposite) {
        const metaMin = data.metadata['Min Thickness (mm)'];
        const metaMax = data.metadata['Max Thickness (mm)'];
        if (metaMin !== undefined && metaMax !== undefined) {
            dom.minThicknessInput.value = parseFloat(metaMin).toFixed(2);
            dom.maxThicknessInput.value = parseFloat(metaMax).toFixed(2);
        } else if (stats) {
            dom.minThicknessInput.value = stats.min.toFixed(2);
            dom.maxThicknessInput.value = stats.max.toFixed(2);
        }
    } else {
        const stdMinMax = getStandardizedMinMax();
        if (stdMinMax) {
            dom.minThicknessInput.value = stdMinMax.min.toFixed(2);
            dom.maxThicknessInput.value = stdMinMax.max.toFixed(2);
        } else if (stats) {
            dom.minThicknessInput.value = stats.min.toFixed(2);
            dom.maxThicknessInput.value = stats.max.toFixed(2);
        }
    }
    updatePlot();
}

function updatePlot() {
    if (!currentScanData) return;
    let matrix, xCoords, yCoords;

    if (isShowingComposite && currentScanData.compositeMatrix) {
        matrix = currentScanData.compositeMatrix;
        xCoords = currentScanData.x_coords;
        yCoords = currentScanData.y_coords;
    } else if (currentScanData.thickness_values_flat) {
        matrix = reconstructMatrix(currentScanData.thickness_values_flat, currentScanData.rows, currentScanData.cols);
        xCoords = currentScanData.x_coords;
        yCoords = currentScanData.y_coords;
    } else return;

    const colorscale = dom.colorscaleSelect.value;
    const smoothingValue = dom.smoothingSelect.value;
    const smoothing = (smoothingValue === 'best' || smoothingValue === 'fast') ? smoothingValue : false;
    const reverseScale = dom.reverseScaleCheckbox.checked;
    const showGrid = dom.showGridCheckbox.checked;

    const zmin = customColorRange.min !== null ? customColorRange.min : parseFloat(dom.minThicknessInput.value) || null;
    const zmax = customColorRange.max !== null ? customColorRange.max : parseFloat(dom.maxThicknessInput.value) || null;

    const plotData = [{
        x: xCoords,
        y: yCoords,
        z: matrix,
        type: 'heatmap',
        colorscale: colorscale,
        reversescale: reverseScale,
        zsmooth: smoothing,
        connectgaps: false,
        zmin,
        zmax,
        colorbar: { title: 'Thickness<br>(mm)', titleside: 'right', thickness: 20 },
        hovertemplate: 'Scan Axis: %{x:.2f} mm<br>Index Axis: %{y:.2f} mm<br>Thickness: %{z:.2f} mm<extra></extra>'
    }];

    const title = isShowingComposite ? 'Composite C-Scan Corrosion Map' : 'C-Scan Corrosion Heatmap';
    const layout = {
        title: { text: title, font: { size: 20 } },
        xaxis: {
            title: 'Scan Axis (mm)',
            scaleanchor: "y",
            scaleratio: 1.0,
            showgrid: showGrid,
            gridcolor: '#e0e0e0'
        },
        yaxis: {
            title: 'Index Axis (mm)',
            showgrid: showGrid,
            gridcolor: '#e0e0e0'
        },
        autosize: true,
        margin: { l: 80, r: 80, t: 60, b: 60 },
        hoverlabel: {
            bgcolor: 'white',
            bordercolor: '#333',
            font: {size: 12}
        }
    };

    if (document.documentElement.classList.contains('dark')) {
        layout.template = 'plotly_dark';
        layout.paper_bgcolor = 'rgb(31, 41, 55)';
        layout.plot_bgcolor = 'rgb(31, 41, 55)';
        layout.xaxis.gridcolor = '#4b5563';
        layout.yaxis.gridcolor = '#4b5563';
    }

    const config = {
        responsive: true,
        displaylogo: false,
        displayModeBar: true,
        modeBarButtonsToRemove: ['select2d', 'lasso2d']
    };
    Plotly.react(dom.plotContainer, plotData, layout, config);
    dom.visualizationSection.classList.remove('hidden');
    [dom.exportButton, dom.exportCleanButton, dom.exportToHubBtn].forEach(b => b.classList.remove('hidden'));
}

// C-Scan Visualizer Tool Module - Complete (Part 2 - continues from part 1)

function renderFileList() {
    dom.fileListContainer.innerHTML = '';
    processedScans.forEach((scan) => {
        const el = document.createElement('div');
        el.className = 'p-2 mt-2 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors';
        if (!isShowingComposite && scan === currentScanData) {
            el.classList.add('bg-blue-100', 'dark:bg-blue-900/50', 'font-semibold');
        }
        el.textContent = scan.fileName;
        el.onclick = () => {
            currentScanData = scan;
            isShowingComposite = false;
            renderPlot(currentScanData);
            renderMetadata(currentScanData.metadata);
            renderFileList();
        };
        dom.fileListContainer.appendChild(el);
    });
}

function getCompositeWorker() {
    const workerCode = `
        self.onmessage = function(e) {
            const scans = e.data;
            let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
            
            scans.forEach(s => {
                const minX = Math.min(...s.x_coords);
                const maxX = Math.max(...s.x_coords);
                const minY = Math.min(...s.y_coords);
                const maxY = Math.max(...s.y_coords);
                if (minX < gMinX) gMinX = minX;
                if (maxX > gMaxX) gMaxX = maxX;
                if (minY < gMinY) gMinY = minY;
                if (maxY > gMaxY) gMaxY = maxY;
            });
            
            let minSpacing = Infinity;
            scans.forEach(s => {
                if (s.x_coords.length > 1) {
                    const spacing = Math.abs(s.x_coords[1] - s.x_coords[0]);
                    if (spacing > 0 && spacing < minSpacing) minSpacing = spacing;
                }
                if (s.y_coords.length > 1) {
                    const spacing = Math.abs(s.y_coords[1] - s.y_coords[0]);
                    if (spacing > 0 && spacing < minSpacing) minSpacing = spacing;
                }
            });
            
            const resolution = minSpacing !== Infinity ? minSpacing : 1.0;
            const gridWidth = Math.ceil((gMaxX - gMinX) / resolution) + 1;
            const gridHeight = Math.ceil((gMaxY - gMinY) / resolution) + 1;
            
            const compositeGrid = new Float32Array(gridHeight * gridWidth).fill(0);
            const weightGrid = new Float32Array(gridHeight * gridWidth).fill(0);
            
            scans.forEach((s, scanIndex) => {
                for (let i = 0; i < s.rows; i++) {
                    for (let j = 0; j < s.cols; j++) {
                        const val = s.thickness_values_flat[i * s.cols + j];
                        if (!isNaN(val) && val > 0) {
                            const x = s.x_coords[j];
                            const y = s.y_coords[i];
                            const gridX = Math.round((x - gMinX) / resolution);
                            const gridY = Math.round((y - gMinY) / resolution);
                            
                            if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
                                const idx = gridY * gridWidth + gridX;
                                compositeGrid[idx] += val;
                                weightGrid[idx] += 1;
                            }
                        }
                    }
                }
                self.postMessage({ type: 'progress', current: scanIndex + 1, total: scans.length });
            });
            
            const matrix = [];
            const xCoords = Array.from({length: gridWidth}, (_, i) => gMinX + i * resolution);
            const yCoords = Array.from({length: gridHeight}, (_, i) => gMinY + i * resolution);
            const flatData = new Float32Array(gridHeight * gridWidth);
            
            for (let i = 0; i < gridHeight; i++) {
                const row = [];
                for (let j = 0; j < gridWidth; j++) {
                    const idx = i * gridWidth + j;
                    let val = null;
                    if (weightGrid[idx] > 0) val = compositeGrid[idx] / weightGrid[idx];
                    row.push(val);
                    flatData[idx] = isNaN(val) ? NaN : val;
                }
                matrix.push(row);
            }
            
            self.postMessage({ type: 'result', matrix: matrix, xCoords: xCoords, yCoords: yCoords, flatData: flatData });
        };
    `;
    
    return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
}

function generateComposite() {
    if (processedScans.length < 2) {
        showStatus("Please upload at least two files.", true);
        return;
    }
    
    showStatus("Generating composite...");
    dom.progressContainer.classList.remove('hidden');
    dom.progressBar.style.width = '0%';
    dom.compositeButton.disabled = true;
    dom.compositeButton.textContent = "Processing...";
    
    if (compositeWorker) compositeWorker.terminate();
    compositeWorker = getCompositeWorker();
    
    compositeWorker.onmessage = ({data}) => {
        if (data.type === 'progress') {
            dom.progressBar.style.width = `${(data.current / data.total) * 100}%`;
        } else if (data.type === 'result') {
            const { matrix, xCoords, yCoords, flatData } = data;
            currentScanData = {
                metadata: { 'Type': 'Composite', 'Source Files': processedScans.length },
                compositeMatrix: matrix,
                x_coords: xCoords,
                y_coords: yCoords,
                thickness_values_flat: flatData,
                rows: yCoords.length,
                cols: xCoords.length,
                isComposite: true
            };
            isShowingComposite = true;
            renderPlot(currentScanData, true);
            renderMetadata(currentScanData.metadata);
            renderFileList();
            showStatus("Composite generated.");
            dom.progressContainer.classList.add('hidden');
            dom.compositeButton.disabled = false;
            dom.compositeButton.textContent = "Generate Composite";
            compositeWorker.terminate();
            compositeWorker = null;
        }
    };
    
    compositeWorker.onerror = e => {
        showStatus(`Error during composite generation: ${e.message}`, true);
        dom.progressContainer.classList.add('hidden');
        dom.compositeButton.disabled = false;
        dom.compositeButton.textContent = "Generate Composite";
        if (compositeWorker) compositeWorker.terminate();
    };
    
    compositeWorker.postMessage(processedScans);
}

function exportImage() {
    if (!currentScanData) return;
    const filename = (isShowingComposite ? 'composite' : currentScanData.fileName.split('.')[0]) + `_cscan.png`;
    Plotly.downloadImage(dom.plotContainer, { format: 'png', width: 1920, height: 1080, scale: 2, filename });
}

async function exportCleanImageAsPNG() {
    if (!currentScanData) {
        showStatus("No data to export.", true);
        return;
    }
    showStatus("Preparing clean PNG export...");

    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = '1920px';
    tempDiv.style.height = '1080px';
    document.body.appendChild(tempDiv);

    try {
        const cleanData = JSON.parse(JSON.stringify(dom.plotContainer.data));
        if (cleanData[0]) cleanData[0].showscale = false;

        const cleanLayout = {
            xaxis: {
                visible: false,
                scaleanchor: "y",
                scaleratio: 1.0
            },
            yaxis: {
                visible: false
            },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 0, r: 0, t: 0, b: 0 },
            showlegend: false
        };

        await Plotly.newPlot(tempDiv, cleanData, cleanLayout, { displayModeBar: false });

        const svgDataUrl = await Plotly.toImage(tempDiv, { format: 'svg', width: 1920, height: 1080 });

        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        const img = new Image();

        await new Promise((resolve, reject) => {
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve();
            };
            img.onerror = reject;
            img.src = svgDataUrl;
        });

        const pngDataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const filename = (isShowingComposite ? 'composite' : currentScanData.fileName.split('.')[0]) + `_cscan-heatmap.png`;
        link.href = pngDataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showStatus("Clean heatmap exported as PNG with transparent background!");
    } catch (e) {
        showStatus("Failed to export clean PNG.", true);
        console.error("Clean PNG export failed:", e);
    } finally {
        if (tempDiv.parentNode) {
            Plotly.purge(tempDiv);
            document.body.removeChild(tempDiv);
        }
    }
}

function resetRange() {
    if (!currentScanData) return;

    const stats = calculateStats(currentScanData);
    if (stats) {
        dom.minThicknessInput.value = stats.min.toFixed(2);
        dom.maxThicknessInput.value = stats.max.toFixed(2);
        customColorRange = { min: null, max: null };
        updatePlot();
        showStatus('Range reset to auto');
    }
}

function applyCustomRange() {
    const minVal = parseFloat(dom.minThicknessInput.value);
    const maxVal = parseFloat(dom.maxThicknessInput.value);

    if (isNaN(minVal) || isNaN(maxVal)) {
        showStatus('Please enter valid numbers for min and max', true);
        return;
    }

    if (minVal >= maxVal) {
        showStatus('Min value must be less than max value', true);
        return;
    }

    customColorRange = { min: minVal, max: maxVal };
    updatePlot();
    showStatus('Custom range applied');
}

function exportToHub() {
    if (!currentScanData) {
        showStatus('No data to export', true);
        return;
    }

    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 class="text-xl font-bold mb-4 dark:text-white">Export Scan to Hub</h2>

            <div class="mb-4">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Scan Name</label>
                <input type="text" id="scan-name-input" placeholder="e.g., Tank A North Side"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Asset</label>
                <select id="asset-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Asset --</option>
                    ${dataManager.getAssets().map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
                <button id="new-asset-btn" class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Create New Asset</button>
            </div>

            <div class="mb-4" id="vessel-section" style="display:none;">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Vessel</label>
                <select id="vessel-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Vessel --</option>
                </select>
                <button id="new-vessel-btn" class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Create New Vessel</button>
            </div>

            <div class="flex gap-3 mt-6">
                <button id="export-confirm-btn" class="flex-1 bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 transition-colors">Export</button>
                <button id="export-cancel-btn" class="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const scanNameInput = modal.querySelector('#scan-name-input');
    const assetSelect = modal.querySelector('#asset-select');
    const vesselSelect = modal.querySelector('#vessel-select');
    const vesselSection = modal.querySelector('#vessel-section');
    const newAssetBtn = modal.querySelector('#new-asset-btn');
    const newVesselBtn = modal.querySelector('#new-vessel-btn');
    const confirmBtn = modal.querySelector('#export-confirm-btn');
    const cancelBtn = modal.querySelector('#export-cancel-btn');

    // Set default scan name
    const scanName = isShowingComposite ? 'Composite C-Scan' : currentScanData.fileName?.replace(/\.(txt|csv)$/i, '') || 'C-Scan';
    scanNameInput.value = `${scanName} ${new Date().toLocaleDateString()}`;

    // Asset selection handler
    assetSelect.addEventListener('change', () => {
        const assetId = assetSelect.value;
        if (assetId) {
            const asset = dataManager.getAsset(assetId);
            vesselSection.style.display = 'block';
            vesselSelect.innerHTML = '<option value="">-- Select Vessel --</option>' +
                asset.vessels.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        } else {
            vesselSection.style.display = 'none';
        }
    });

    // New asset handler
    newAssetBtn.addEventListener('click', () => {
        const name = prompt('Enter asset name:');
        if (name) {
            const asset = dataManager.createAsset(name);
            assetSelect.innerHTML += `<option value="${asset.id}" selected>${asset.name}</option>`;
            assetSelect.value = asset.id;
            assetSelect.dispatchEvent(new Event('change'));
        }
    });

    // New vessel handler
    newVesselBtn.addEventListener('click', () => {
        const assetId = assetSelect.value;
        if (!assetId) {
            alert('Please select an asset first');
            return;
        }
        const name = prompt('Enter vessel name:');
        if (name) {
            const vessel = dataManager.createVessel(assetId, name);
            vesselSelect.innerHTML += `<option value="${vessel.id}" selected>${vessel.name}</option>`;
            vesselSelect.value = vessel.id;
        }
    });

    // Generate thumbnails - both full plot and heatmap-only
    const generateThumbnails = async () => {
        try {
            // 1. Generate full plot with axes and colorbar for data hub display
            const fullThumbnail = await Plotly.toImage(dom.plotContainer, {
                format: 'png',
                width: 800,
                height: 600,
                scale: 2
            });

            // 2. Generate clean heatmap-only version for 3D texturing
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.width = '1920px';
            tempDiv.style.height = '1080px';
            document.body.appendChild(tempDiv);

            // Clone the current plot data without color bar
            const cleanData = JSON.parse(JSON.stringify(dom.plotContainer.data));
            if (cleanData[0]) cleanData[0].showscale = false;

            // Layout with no axes or margins but preserving aspect ratio
            const cleanLayout = {
                xaxis: {
                    visible: false,
                    scaleanchor: "y",
                    scaleratio: 1.0
                },
                yaxis: {
                    visible: false
                },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                margin: { l: 0, r: 0, t: 0, b: 0 },
                showlegend: false
            };

            await Plotly.newPlot(tempDiv, cleanData, cleanLayout, { displayModeBar: false });

            const heatmapOnly = await Plotly.toImage(tempDiv, {
                format: 'png',
                width: 1920,
                height: 1080,
                scale: 2
            });

            // Cleanup
            Plotly.purge(tempDiv);
            document.body.removeChild(tempDiv);

            return {
                full: fullThumbnail,
                heatmapOnly: heatmapOnly
            };
        } catch (error) {
            console.error('Error generating thumbnails:', error);
            return null;
        }
    };

    // Confirm export
    confirmBtn.addEventListener('click', async () => {
        const scanNameValue = scanNameInput.value.trim();
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;

        if (!scanNameValue) {
            alert('Please enter a scan name');
            return;
        }
        if (!assetId) {
            alert('Please select an asset');
            return;
        }
        if (!vesselId) {
            alert('Please select a vessel');
            return;
        }

        const thumbnails = await generateThumbnails();
        const stats = calculateStats(currentScanData);

        const scanData = {
            name: scanNameValue,
            toolType: 'cscan',
            data: {
                scanData: currentScanData,
                isComposite: isShowingComposite,
                customColorRange: customColorRange,
                stats: stats,
                fileName: currentScanData.fileName
            },
            thumbnail: thumbnails ? thumbnails.full : null,
            heatmapOnly: thumbnails ? thumbnails.heatmapOnly : null
        };

        const scan = await dataManager.createScan(assetId, vesselId, scanData);

        if (scan) {
            document.body.removeChild(modal);
            showStatus('Scan exported to hub successfully!');
        } else {
            alert('Failed to export scan');
        }
    });

    // Cancel handler
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function renderMetadata(metadata) {
    dom.metadataContent.innerHTML = '';
    for (const key in metadata) {
        const div = document.createElement('div');
        div.className = 'p-2 bg-white dark:bg-gray-800 rounded shadow-sm';
        div.innerHTML = `<span class="font-semibold text-gray-600 dark:text-gray-400">${key}:</span> <span class="text-gray-800 dark:text-gray-200">${metadata[key]}</span>`;
        dom.metadataContent.appendChild(div);
    }
    dom.metadataSection.classList.remove('hidden');
}

function fileInputHandler(event) {
    if (event.target.files.length > 0) handleFiles(event.target.files);
}

function loadScanData(event) {
    const { scanData } = event.detail;

    if (!scanData || scanData.toolType !== 'cscan') return;

    // Load the saved scan data
    if (scanData.data && scanData.data.scanData) {
        currentScanData = scanData.data.scanData;
        isShowingComposite = scanData.data.isComposite || false;
        customColorRange = scanData.data.customColorRange || { min: null, max: null };
        processedScans = [currentScanData];

        const stats = scanData.data.stats || calculateStats(currentScanData);

        if (stats) {
            dom.minThicknessInput.value = stats.min.toFixed(2);
            dom.maxThicknessInput.value = stats.max.toFixed(2);
        }

        // Apply custom range if it exists
        if (customColorRange.min !== null && customColorRange.max !== null) {
            dom.minThicknessInput.value = customColorRange.min.toFixed(2);
            dom.maxThicknessInput.value = customColorRange.max.toFixed(2);
        }

        renderPlot(currentScanData, isShowingComposite);
        renderMetadata(currentScanData.metadata || {});
        renderFileList();

        dom.uploadSection.classList.add('hidden');
        [dom.fileManagementSection, dom.controlsSection].forEach(el => el.classList.remove('hidden'));
        showStatus(`Loaded: ${scanData.name}`);
    }
}

function addEventListeners() {
    dom.uploadButton.addEventListener('click', () => dom.fileInput.click());
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dom.uploadSection.addEventListener(ev, preventDefaults, false));
    dom.uploadSection.addEventListener('dragenter', () => dom.uploadSection.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/50'), false);
    dom.uploadSection.addEventListener('dragleave', () => dom.uploadSection.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/50'), false);
    dom.uploadSection.addEventListener('drop', handleDrop, false);
    dom.fileInput.addEventListener('change', fileInputHandler);
    dom.updateButton.addEventListener('click', applyCustomRange);
    dom.resetRangeBtn.addEventListener('click', resetRange);
    dom.compositeButton.addEventListener('click', generateComposite);
    dom.exportButton.addEventListener('click', exportImage);
    dom.exportCleanButton.addEventListener('click', exportCleanImageAsPNG);
    dom.exportToHubBtn.addEventListener('click', exportToHub);
    dom.colorscaleSelect.addEventListener('change', updatePlot);
    dom.smoothingSelect.addEventListener('change', updatePlot);
    dom.reverseScaleCheckbox.addEventListener('change', updatePlot);
    dom.showGridCheckbox.addEventListener('change', updatePlot);
    document.addEventListener('themeChanged', updatePlot);
    window.addEventListener('loadScanData', loadScanData);
}

function removeEventListeners() {
    document.removeEventListener('themeChanged', updatePlot);
    window.removeEventListener('loadScanData', loadScanData);
}

export default {
    init: (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        container.classList.add('bg-gray-100', 'dark:bg-gray-900');
        cacheDom();
        addEventListeners();
    },
    
    destroy: () => {
        // Destroy animated background
        const headerContainer = container?.querySelector('#cscan-header-container');
        if (headerContainer) {
            const animContainer = headerContainer.querySelector('.animated-header-container');
            if (animContainer && animContainer._animationInstance) {
                animContainer._animationInstance.destroy();
            }
        }

        if (compositeWorker) compositeWorker.terminate();
        if (dom && dom.plotContainer) Plotly.purge(dom.plotContainer);
        removeEventListeners();
        container.innerHTML = '';
        container.classList.remove('bg-gray-100', 'dark:bg-gray-900');
        processedScans = [];
        currentScanData = null;
        customColorRange = { min: null, max: null };
        isShowingComposite = false;
    }
};
