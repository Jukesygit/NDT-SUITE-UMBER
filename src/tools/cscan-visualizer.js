// C-Scan Visualizer Tool Module - Complete with all features (Part 1)
import dataManager from '../data-manager.js';
import Plotly from '../utils/plotly.js';

let container, dom = {}, processedScans = [], currentScanData = null, compositeWorker = null, isShowingComposite = false, customColorRange = { min: null, max: null }, currentHoverPosition = { x: null, y: null }, selectedScans = new Set();

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div class="glass-panel" style="padding: 8px 16px; flex-shrink: 0; border-radius: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
        <div class="flex justify-between items-center">
            <div>
                <h1 class="text-lg font-bold text-white">Phased Array C-Scan Visualizer</h1>
                <p class="text-xs text-white text-opacity-70">Upload C-Scan data files to generate interactive corrosion heatmaps</p>
            </div>
        </div>
    </div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 12px;">
    <header class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 mb-8 flex justify-between items-center flex-shrink-0" style="display: none;">
        <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Phased Array C-Scan Visualizer</h1>
            <p class="mt-2 text-gray-600 dark:text-gray-400">Upload a C-Scan data file (.txt or .csv) to generate an interactive corrosion heatmap.</p>
        </div>
    </header>
    
    <main class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-4 flex-grow flex flex-col overflow-y-auto">
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
        
        <div id="file-management-section" class="hidden mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner">
            <div class="flex flex-wrap justify-between items-center border-b border-gray-200 dark:border-gray-600 pb-2 mb-2">
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">Processed Files</h3>
                <div class="flex gap-1.5 mt-2 md:mt-0 flex-wrap">
                    <button id="composite-button" class="file-input-button bg-green-600 text-white font-semibold py-1.5 px-3 text-sm rounded-lg hover:bg-green-700 transition-colors">
                        Generate Composite
                    </button>
                    <button id="export-button" class="file-input-button bg-purple-600 text-white font-semibold py-1.5 px-3 text-sm rounded-lg hover:bg-purple-700 hidden transition-colors">
                        Export Image
                    </button>
                    <button id="export-clean-button" class="file-input-button bg-teal-600 text-white font-semibold py-1.5 px-3 text-sm rounded-lg hover:bg-teal-700 hidden transition-colors">
                        Export Heatmap
                    </button>
                    <button id="export-to-hub-btn" class="file-input-button bg-orange-600 text-white font-semibold py-1.5 px-3 text-sm rounded-lg hover:bg-orange-700 hidden transition-colors">
                        To Hub
                    </button>
                    <button id="batch-export-to-hub-btn" class="file-input-button bg-blue-600 text-white font-semibold py-1.5 px-3 text-sm rounded-lg hover:bg-blue-700 hidden transition-colors">
                        Batch (<span id="selected-count">0</span>)
                    </button>
                    <button id="batch-assign-strake-btn" class="file-input-button bg-indigo-600 text-white font-semibold py-1.5 px-3 text-sm rounded-lg hover:bg-indigo-700 hidden transition-colors">
                        Assign
                    </button>
                </div>
            </div>
            <div class="mb-3 flex items-center gap-2">
                <input type="checkbox" id="select-all-checkbox" class="w-4 h-4 cursor-pointer">
                <label for="select-all-checkbox" class="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">Select All</label>
            </div>
            <div id="file-list" class="text-sm text-gray-700 dark:text-gray-300"></div>
        </div>
        
        <div id="controls-section" class="hidden mt-3 space-y-2">
            <div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner">
                <button id="toggle-controls-btn" class="w-full flex justify-between items-center text-left font-semibold text-gray-900 dark:text-white mb-2">
                    <span class="text-base">Display Controls</span>
                    <svg id="controls-chevron" class="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>
                <div id="controls-content" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
                        <input type="checkbox" id="show-profiles-cscan" checked class="w-5 h-5 cursor-pointer ml-4">
                        <label for="show-profiles-cscan" class="text-sm font-medium text-gray-700 dark:text-gray-300">Profiles</label>
                    </div>
                </div>
            </div>

            <div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
                <div>
                    <label for="min-thickness" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Min (mm):</label>
                    <input type="number" id="min-thickness" step="0.1" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm dark:bg-gray-700 dark:text-white px-3 py-2">
                </div>
                <div>
                    <label for="max-thickness" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Max (mm):</label>
                    <input type="number" id="max-thickness" step="0.1" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm dark:bg-gray-700 dark:text-white px-3 py-2">
                </div>
                <div class="flex gap-2 pt-5">
                    <button id="update-button" class="file-input-button bg-blue-600 text-white font-semibold py-1.5 px-3 text-sm rounded-lg hover:bg-blue-700 transition-colors">Apply</button>
                    <button id="reset-range-btn" class="file-input-button bg-gray-500 text-white font-semibold py-1.5 px-3 text-sm rounded-lg hover:bg-gray-600 transition-colors">Auto</button>
                </div>
            </div>
        </div>

        <div id="visualization-section" class="hidden mt-3 w-full flex-grow">
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-3 w-full h-full" style="min-height: 600px;">
                <!-- Main heatmap (spans 3 columns) -->
                <div class="lg:col-span-3 flex flex-col gap-2">
                    <div id="plot-container" class="w-full bg-white dark:bg-gray-800 rounded-lg shadow-md" style="height: calc(100% - 180px); min-height: 400px;"></div>
                    <!-- Bottom profile (Index/Y-axis) -->
                    <div id="profile-bottom" class="w-full bg-white dark:bg-gray-800 rounded-lg shadow-md" style="height: 160px;"></div>
                </div>
                <!-- Right column with profile and stats -->
                <div class="lg:col-span-1 flex flex-col gap-2">
                    <!-- Right profile (Scan/X-axis) -->
                    <div id="profile-right" class="w-full bg-white dark:bg-gray-800 rounded-lg shadow-md" style="flex: 1 1 auto; min-height: 300px;"></div>
                    <!-- Stats display -->
                    <div id="stats-cscan" class="grid grid-cols-1 gap-1 p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner"></div>
                </div>
            </div>
        </div>
        
        <div id="metadata-section" class="hidden mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner">
            <button id="toggle-metadata-btn" class="w-full flex justify-between items-center text-left font-semibold text-gray-900 dark:text-white mb-2">
                <span class="text-base">Scan Metadata</span>
                <svg id="metadata-chevron" class="w-5 h-5 transition-transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
            <div id="metadata-content" class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm hidden"></div>
        </div>
    </main>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        uploadButton: q('#upload-button'),
        fileInput: q('#file-input'),
        uploadSection: q('#upload-section'),
        statusMessage: q('#status-message'),
        visualizationSection: q('#visualization-section'),
        plotContainer: q('#plot-container'),
        profileBottom: q('#profile-bottom'),
        profileRight: q('#profile-right'),
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
        batchExportToHubBtn: q('#batch-export-to-hub-btn'),
        batchAssignStrakeBtn: q('#batch-assign-strake-btn'),
        selectAllCheckbox: q('#select-all-checkbox'),
        selectedCountSpan: q('#selected-count'),
        progressContainer: q('#progress-container'),
        progressBar: q('#progress-bar'),
        colorscaleSelect: q('#colorscale-cscan'),
        smoothingSelect: q('#smoothing-cscan'),
        reverseScaleCheckbox: q('#reverse-scale-cscan'),
        showGridCheckbox: q('#show-grid-cscan'),
        showProfilesCheckbox: q('#show-profiles-cscan'),
        statsContainer: q('#stats-cscan'),
        toggleControlsBtn: q('#toggle-controls-btn'),
        controlsContent: q('#controls-content'),
        controlsChevron: q('#controls-chevron'),
        toggleMetadataBtn: q('#toggle-metadata-btn'),
        metadataChevron: q('#metadata-chevron')
    };
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
    let ndCount = 0;
    let totalPoints = 0;

    for (const val of data.thickness_values_flat) {
        totalPoints++;
        if (!isNaN(val) && isFinite(val)) {
            flatData.push(val);
        } else {
            ndCount++;
        }
    }

    if (flatData.length === 0) return null;

    const sorted = flatData.slice().sort((a, b) => a - b);
    const sum = flatData.reduce((a, b) => a + b, 0);
    const mean = sum / flatData.length;
    const variance = flatData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / flatData.length;

    // Calculate area metrics
    // Get spacing between points
    const xSpacing = data.x_coords.length > 1 ? Math.abs(data.x_coords[1] - data.x_coords[0]) : 1.0;
    const ySpacing = data.y_coords.length > 1 ? Math.abs(data.y_coords[1] - data.y_coords[0]) : 1.0;
    const pointArea = xSpacing * ySpacing; // Area per data point in mm²

    const totalArea = totalPoints * pointArea; // Total scanned area in mm²
    const ndArea = ndCount * pointArea; // ND area in mm²
    const validArea = totalArea - ndArea; // Valid area after ND deduction in mm²
    const ndPercentage = (ndCount / totalPoints) * 100; // ND percentage

    return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: mean,
        median: sorted[Math.floor(sorted.length / 2)],
        stdDev: Math.sqrt(variance),
        count: flatData.length,
        rows: data.rows,
        cols: data.cols,
        // Area statistics
        totalArea: totalArea,
        ndArea: ndArea,
        validArea: validArea,
        ndPercentage: ndPercentage,
        totalPoints: totalPoints,
        ndCount: ndCount
    };
}

function renderStats(stats) {
    if (!stats) return;

    // Convert mm² to m² (1 m² = 1,000,000 mm²)
    const totalAreaM2 = stats.totalArea / 1000000;
    const validAreaM2 = stats.validArea / 1000000;

    const statsHTML = [
        { label: 'Min', value: stats.min.toFixed(2), unit: 'mm', highlight: false },
        { label: 'Max', value: stats.max.toFixed(2), unit: 'mm', highlight: false },
        { label: 'Mean', value: stats.mean.toFixed(2), unit: 'mm', highlight: false },
        { label: 'Median', value: stats.median.toFixed(2), unit: 'mm', highlight: false },
        { label: 'Std Dev', value: stats.stdDev.toFixed(2), unit: 'mm', highlight: false },
        { label: 'Total Area', value: totalAreaM2.toFixed(4), unit: 'm²', highlight: false },
        { label: 'ND %', value: stats.ndPercentage.toFixed(1), unit: '%', highlight: false },
        { label: 'Valid Area', value: validAreaM2.toFixed(4), unit: 'm²', highlight: true },
        { label: 'Valid Points', value: stats.count, unit: '', highlight: false }
    ].map(({ label, value, unit, highlight }) => `
        <div class="flex justify-between items-center px-2 py-1 ${highlight ? 'bg-blue-500/20 border border-blue-500/40' : 'bg-white dark:bg-gray-700'} rounded shadow-sm">
            <span class="text-xs ${highlight ? 'text-blue-300 font-medium' : 'text-gray-500 dark:text-gray-400'}">${label}</span>
            <span class="text-xs font-semibold ${highlight ? 'text-blue-200' : 'text-gray-900 dark:text-white'}">${value} ${unit}</span>
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

function extractAxisProfiles(matrix, xCoords, yCoords, xIndex = null, yIndex = null) {
    // Extract scan axis profile (vertical slice at given X position) - for right graph
    let scanAxisProfile = { coords: [], values: [] };

    // If xIndex is provided, extract vertical slice; otherwise use middle
    const xSliceIndex = xIndex !== null ? xIndex : Math.floor(xCoords.length / 2);

    if (xSliceIndex >= 0 && xSliceIndex < xCoords.length) {
        yCoords.forEach((yCoord, i) => {
            const value = matrix[i][xSliceIndex];
            if (value !== null && !isNaN(value)) {
                scanAxisProfile.coords.push(yCoord);
                scanAxisProfile.values.push(value);
            }
        });
    }

    // Extract index axis profile (horizontal slice at given Y position) - for bottom graph
    let indexAxisProfile = { coords: [], values: [] };

    // If yIndex is provided, extract horizontal slice; otherwise use middle
    const ySliceIndex = yIndex !== null ? yIndex : Math.floor(yCoords.length / 2);

    if (ySliceIndex >= 0 && ySliceIndex < yCoords.length) {
        xCoords.forEach((xCoord, j) => {
            const value = matrix[ySliceIndex][j];
            if (value !== null && !isNaN(value)) {
                indexAxisProfile.coords.push(xCoord);
                indexAxisProfile.values.push(value);
            }
        });
    }

    return {
        scanAxis: scanAxisProfile,      // Vertical profile (Y-axis values at specific X)
        indexAxis: indexAxisProfile,    // Horizontal profile (X-axis values at specific Y)
        slicePositions: {
            x: xCoords[xSliceIndex],
            y: yCoords[ySliceIndex]
        }
    };
}

function renderProfileGraphs(profiles, isDarkMode) {
    if (!profiles) return;

    const { scanAxis, indexAxis, slicePositions } = profiles;

    // Common layout settings
    const commonLayout = {
        margin: { l: 40, r: 10, t: 20, b: 30 },
        showlegend: false,
        hovermode: 'closest'
    };

    if (isDarkMode) {
        commonLayout.template = 'plotly_dark';
        commonLayout.paper_bgcolor = 'rgb(31, 41, 55)';
        commonLayout.plot_bgcolor = 'rgb(31, 41, 55)';
    }

    // Right profile (Scan Axis / Y-axis) - rotated 90 degrees
    if (scanAxis.coords.length > 0) {
        const rightData = [{
            y: scanAxis.coords,
            x: scanAxis.values,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#ef4444', width: 2 },
            fill: 'tozerox',
            fillcolor: 'rgba(239, 68, 68, 0.2)',
            hovertemplate: 'Index Axis: %{y:.2f} mm<br>Thickness: %{x:.2f} mm<extra></extra>'
        }];

        const rightLayout = {
            ...commonLayout,
            title: { text: `Scan Axis Profile<br>(at ${slicePositions.x?.toFixed(1)} mm)`, font: { size: 10 } },
            xaxis: {
                title: { text: 'Thickness (mm)', font: { size: 10 } },
                autorange: 'reversed'
            },
            yaxis: {
                title: { text: 'Index Axis (mm)', font: { size: 10 } },
                autorange: 'reversed'
            }
        };

        Plotly.react(dom.profileRight, rightData, rightLayout, { displayModeBar: false, responsive: true }).then(() => {
            setTimeout(() => Plotly.Plots.resize(dom.profileRight), 100);
        });
    }

    // Bottom profile (Index Axis / X-axis)
    if (indexAxis.coords.length > 0) {
        const bottomData = [{
            x: indexAxis.coords,
            y: indexAxis.values,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#3b82f6', width: 2 },
            fill: 'tozeroy',
            fillcolor: 'rgba(59, 130, 246, 0.2)',
            hovertemplate: 'Scan Axis: %{x:.2f} mm<br>Thickness: %{y:.2f} mm<extra></extra>'
        }];

        const bottomLayout = {
            ...commonLayout,
            title: { text: `Index Axis Profile (at ${slicePositions.y?.toFixed(1)} mm)`, font: { size: 10 } },
            xaxis: {
                title: { text: 'Scan Axis (mm)', font: { size: 10 } }
            },
            yaxis: {
                title: { text: 'Thickness (mm)', font: { size: 10 } }
            }
        };

        Plotly.react(dom.profileBottom, bottomData, bottomLayout, { displayModeBar: false, responsive: true }).then(() => {
            setTimeout(() => Plotly.Plots.resize(dom.profileBottom), 100);
        });
    }
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
        colorbar: {
            title: 'Thickness<br>(mm)',
            titleside: 'right',
            thickness: 15,
            len: 0.9,
            x: 1.01
        },
        hovertemplate: 'Scan Axis: %{x:.2f} mm<br>Index Axis: %{y:.2f} mm<br>Thickness: %{z:.2f} mm<extra></extra>'
    }];

    const title = isShowingComposite ? 'Composite C-Scan Corrosion Map' : 'C-Scan Corrosion Heatmap';
    const layout = {
        title: { text: title, font: { size: 14 }, y: 0.98 },
        xaxis: {
            title: { text: 'Scan Axis (mm)', font: { size: 12 } },
            scaleanchor: "y",
            scaleratio: 1.0,
            showgrid: showGrid,
            gridcolor: '#e0e0e0'
        },
        yaxis: {
            title: { text: 'Index Axis (mm)', font: { size: 12 } },
            showgrid: showGrid,
            gridcolor: '#e0e0e0'
        },
        autosize: true,
        margin: { l: 50, r: 10, t: 30, b: 40 },
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
    Plotly.react(dom.plotContainer, plotData, layout, config).then(() => {
        // Force resize to fill container
        setTimeout(() => {
            Plotly.Plots.resize(dom.plotContainer);
        }, 100);

        // Add hover event listener for interactive profile updates
        dom.plotContainer.on('plotly_hover', (data) => {
            if (data.points && data.points[0]) {
                const point = data.points[0];
                const xValue = point.x;
                const yValue = point.y;

                // Find the closest indices
                const xIndex = xCoords.findIndex(x => Math.abs(x - xValue) < 0.01) ||
                              xCoords.reduce((prev, curr, idx) =>
                                  Math.abs(curr - xValue) < Math.abs(xCoords[prev] - xValue) ? idx : prev, 0);
                const yIndex = yCoords.findIndex(y => Math.abs(y - yValue) < 0.01) ||
                              yCoords.reduce((prev, curr, idx) =>
                                  Math.abs(curr - yValue) < Math.abs(yCoords[prev] - yValue) ? idx : prev, 0);

                // Update profiles based on hover position
                const profiles = extractAxisProfiles(matrix, xCoords, yCoords, xIndex, yIndex);
                const isDarkMode = document.documentElement.classList.contains('dark');
                renderProfileGraphs(profiles, isDarkMode);

                currentHoverPosition = { x: xIndex, y: yIndex };
            }
        });

        // Initialize with center profiles
        if (dom.showProfilesCheckbox.checked) {
            const profiles = extractAxisProfiles(matrix, xCoords, yCoords);
            const isDarkMode = document.documentElement.classList.contains('dark');
            renderProfileGraphs(profiles, isDarkMode);
        }
    });

    // Show/hide profile containers based on checkbox
    updateProfileVisibility();

    dom.visualizationSection.classList.remove('hidden');
    [dom.exportButton, dom.exportCleanButton, dom.exportToHubBtn].forEach(b => b.classList.remove('hidden'));
}

function updateProfileVisibility() {
    const showProfiles = dom.showProfilesCheckbox?.checked;
    const rightColumn = dom.profileRight?.parentElement;

    if (showProfiles) {
        dom.profileBottom?.classList.remove('hidden');
        dom.profileRight?.classList.remove('hidden');
        dom.statsContainer?.classList.remove('hidden');

        // Update layout to grid with profiles
        const vizGrid = dom.visualizationSection.querySelector('.grid');
        if (vizGrid) {
            vizGrid.className = 'grid grid-cols-1 lg:grid-cols-4 gap-3 w-full h-full';
            vizGrid.style.minHeight = '600px';
        }

        // Show right column with both profile and stats
        if (rightColumn) {
            rightColumn.style.display = 'flex';
        }
    } else {
        dom.profileBottom?.classList.add('hidden');
        dom.profileRight?.classList.add('hidden');

        // Keep stats visible but move them to fill the right column area
        dom.statsContainer?.classList.remove('hidden');

        // Update layout - stats stay in right column
        const vizGrid = dom.visualizationSection.querySelector('.grid');
        if (vizGrid) {
            vizGrid.className = 'grid grid-cols-1 lg:grid-cols-4 gap-3 w-full h-full';
            vizGrid.style.minHeight = '500px';
        }

        // Make plot container take more vertical space when no bottom profile
        const mainCol = dom.plotContainer.parentElement;
        if (mainCol) {
            dom.plotContainer.style.height = '100%';
            dom.plotContainer.style.minHeight = '500px';
        }
    }
}

// C-Scan Visualizer Tool Module - Complete (Part 2 - continues from part 1)

function updateBatchButtons() {
    const selectedCount = selectedScans.size;
    dom.selectedCountSpan.textContent = selectedCount;

    if (selectedCount > 0) {
        dom.batchExportToHubBtn.classList.remove('hidden');
        dom.batchAssignStrakeBtn.classList.remove('hidden');
    } else {
        dom.batchExportToHubBtn.classList.add('hidden');
        dom.batchAssignStrakeBtn.classList.add('hidden');
    }

    // Update select all checkbox state
    if (selectedCount === 0) {
        dom.selectAllCheckbox.checked = false;
        dom.selectAllCheckbox.indeterminate = false;
    } else if (selectedCount === processedScans.length) {
        dom.selectAllCheckbox.checked = true;
        dom.selectAllCheckbox.indeterminate = false;
    } else {
        dom.selectAllCheckbox.checked = false;
        dom.selectAllCheckbox.indeterminate = true;
    }
}

function toggleSelectAll() {
    if (selectedScans.size === processedScans.length) {
        // Deselect all
        selectedScans.clear();
    } else {
        // Select all
        selectedScans.clear();
        processedScans.forEach((_, index) => selectedScans.add(index));
    }
    renderFileList();
}

function renderFileList() {
    dom.fileListContainer.innerHTML = '';
    processedScans.forEach((scan, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-center gap-2 p-2 mt-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors';
        if (!isShowingComposite && scan === currentScanData) {
            wrapper.classList.add('bg-blue-100', 'dark:bg-blue-900/50');
        }

        // Checkbox for batch selection
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'w-4 h-4 cursor-pointer';
        checkbox.checked = selectedScans.has(index);
        checkbox.onclick = (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                selectedScans.add(index);
            } else {
                selectedScans.delete(index);
            }
            updateBatchButtons();
        };

        // File name label
        const label = document.createElement('div');
        label.className = 'flex-1 cursor-pointer';
        if (!isShowingComposite && scan === currentScanData) {
            label.classList.add('font-semibold');
        }
        label.textContent = scan.fileName;
        label.onclick = () => {
            currentScanData = scan;
            isShowingComposite = false;
            renderPlot(currentScanData);
            renderMetadata(currentScanData.metadata);
            renderFileList();
        };

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        dom.fileListContainer.appendChild(wrapper);
    });

    updateBatchButtons();
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

async function exportToHub() {
    if (!currentScanData) {
        showStatus('No data to export', true);
        return;
    }

    // Ensure data manager is initialized
    await dataManager.ensureInitialized();

    // Get assets
    const assets = dataManager.getAssets();

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
                    ${assets.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
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
    newAssetBtn.addEventListener('click', async () => {
        const name = prompt('Enter asset name:');
        if (name) {
            const asset = await dataManager.createAsset(name);
            assetSelect.innerHTML += `<option value="${asset.id}" selected>${asset.name}</option>`;
            assetSelect.value = asset.id;
            assetSelect.dispatchEvent(new Event('change'));
        }
    });

    // New vessel handler
    newVesselBtn.addEventListener('click', async () => {
        const assetId = assetSelect.value;
        if (!assetId) {
            alert('Please select an asset first');
            return;
        }
        const name = prompt('Enter vessel name:');
        if (name) {
            const vessel = await dataManager.createVessel(assetId, name);
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

async function batchExportToHub() {
    if (selectedScans.size === 0) {
        showStatus('No scans selected', true);
        return;
    }

    // Ensure data manager is initialized
    await dataManager.ensureInitialized();

    // Get assets
    const assets = dataManager.getAssets();

    const selectedScansList = Array.from(selectedScans).map(index => processedScans[index]);

    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-4 dark:text-white">Batch Export ${selectedScansList.length} Scans to Hub</h2>

            <div class="mb-4">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Asset</label>
                <select id="batch-asset-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Asset --</option>
                    ${assets.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
                <button id="batch-new-asset-btn" class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Create New Asset</button>
            </div>

            <div class="mb-4" id="batch-vessel-section" style="display:none;">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Vessel</label>
                <select id="batch-vessel-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Vessel --</option>
                </select>
                <button id="batch-new-vessel-btn" class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Create New Vessel</button>
            </div>

            <div class="mb-4" id="batch-strake-section" style="display:none;">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Strake (Optional)</label>
                <select id="batch-strake-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- None (Don't assign to strake) --</option>
                </select>
                <button id="batch-new-strake-btn" class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Create New Strake</button>
            </div>

            <div class="mb-4 max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-700/50 p-3 rounded">
                <p class="text-sm font-medium mb-2 dark:text-gray-300">Files to export:</p>
                ${selectedScansList.map(scan => `<div class="text-sm dark:text-gray-400">• ${scan.fileName}</div>`).join('')}
            </div>

            <div class="mb-4">
                <div class="flex items-center gap-2">
                    <input type="checkbox" id="batch-use-filename-checkbox" class="w-4 h-4 cursor-pointer" checked>
                    <label for="batch-use-filename-checkbox" class="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">Use file names as scan names</label>
                </div>
            </div>

            <div id="batch-progress-section" class="hidden mb-4">
                <div class="text-sm dark:text-gray-300 mb-2">Exporting: <span id="batch-progress-text">0/${selectedScansList.length}</span></div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div id="batch-progress-bar-inner" class="bg-blue-600 h-2 rounded-full transition-all" style="width: 0%"></div>
                </div>
            </div>

            <div class="flex gap-3 mt-6">
                <button id="batch-export-confirm-btn" class="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">Export All</button>
                <button id="batch-export-cancel-btn" class="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const assetSelect = modal.querySelector('#batch-asset-select');
    const vesselSelect = modal.querySelector('#batch-vessel-select');
    const strakeSelect = modal.querySelector('#batch-strake-select');
    const vesselSection = modal.querySelector('#batch-vessel-section');
    const strakeSection = modal.querySelector('#batch-strake-section');
    const newAssetBtn = modal.querySelector('#batch-new-asset-btn');
    const newVesselBtn = modal.querySelector('#batch-new-vessel-btn');
    const newStrakeBtn = modal.querySelector('#batch-new-strake-btn');
    const confirmBtn = modal.querySelector('#batch-export-confirm-btn');
    const cancelBtn = modal.querySelector('#batch-export-cancel-btn');
    const useFilenameCheckbox = modal.querySelector('#batch-use-filename-checkbox');
    const progressSection = modal.querySelector('#batch-progress-section');
    const progressText = modal.querySelector('#batch-progress-text');
    const progressBar = modal.querySelector('#batch-progress-bar-inner');

    // Asset selection handler
    assetSelect.addEventListener('change', () => {
        const assetId = assetSelect.value;
        if (assetId) {
            const asset = dataManager.getAsset(assetId);
            vesselSection.style.display = 'block';
            vesselSelect.innerHTML = '<option value="">-- Select Vessel --</option>' +
                asset.vessels.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
            strakeSection.style.display = 'none';
        } else {
            vesselSection.style.display = 'none';
            strakeSection.style.display = 'none';
        }
    });

    // Vessel selection handler
    vesselSelect.addEventListener('change', () => {
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;
        if (assetId && vesselId) {
            const vessel = dataManager.getVessel(assetId, vesselId);
            strakeSection.style.display = 'block';
            const strakes = vessel.strakes || [];
            strakeSelect.innerHTML = '<option value="">-- None (Don\'t assign to strake) --</option>' +
                strakes.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        } else {
            strakeSection.style.display = 'none';
        }
    });

    // New asset handler
    newAssetBtn.addEventListener('click', async () => {
        const name = prompt('Enter asset name:');
        if (name) {
            const asset = await dataManager.createAsset(name);
            assetSelect.innerHTML += `<option value="${asset.id}" selected>${asset.name}</option>`;
            assetSelect.value = asset.id;
            assetSelect.dispatchEvent(new Event('change'));
        }
    });

    // New vessel handler
    newVesselBtn.addEventListener('click', async () => {
        const assetId = assetSelect.value;
        if (!assetId) {
            alert('Please select an asset first');
            return;
        }
        const name = prompt('Enter vessel name:');
        if (name) {
            const vessel = await dataManager.createVessel(assetId, name);
            vesselSelect.innerHTML += `<option value="${vessel.id}" selected>${vessel.name}</option>`;
            vesselSelect.value = vessel.id;
            vesselSelect.dispatchEvent(new Event('change'));
        }
    });

    // New strake handler
    newStrakeBtn.addEventListener('click', async () => {
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;
        if (!assetId || !vesselId) {
            alert('Please select an asset and vessel first');
            return;
        }
        const name = prompt('Enter strake name:');
        if (name) {
            const totalArea = parseFloat(prompt('Enter total area (m²):', '0') || '0');
            const requiredCoverage = parseFloat(prompt('Enter required coverage (%):', '100') || '100');

            const strake = await dataManager.createStrake(assetId, vesselId, {
                name: name,
                totalArea: totalArea,
                requiredCoverage: requiredCoverage
            });

            if (strake) {
                strakeSelect.innerHTML += `<option value="${strake.id}" selected>${strake.name}</option>`;
                strakeSelect.value = strake.id;
            }
        }
    });

    // Generate thumbnails for a single scan
    const generateThumbnailsForScan = async (scanData) => {
        try {
            // Temporarily set this scan as current to generate its plot
            const previousScan = currentScanData;
            const previousComposite = isShowingComposite;

            currentScanData = scanData;
            isShowingComposite = false;

            // Render the plot (hidden)
            await renderPlot(scanData);

            // Generate full thumbnail
            const fullThumbnail = await Plotly.toImage(dom.plotContainer, {
                format: 'png',
                width: 800,
                height: 600,
                scale: 2
            });

            // Generate clean heatmap
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.width = '1920px';
            tempDiv.style.height = '1080px';
            document.body.appendChild(tempDiv);

            const cleanData = JSON.parse(JSON.stringify(dom.plotContainer.data));
            if (cleanData[0]) cleanData[0].showscale = false;

            const cleanLayout = {
                xaxis: { visible: false, scaleanchor: "y", scaleratio: 1.0 },
                yaxis: { visible: false },
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

            Plotly.purge(tempDiv);
            document.body.removeChild(tempDiv);

            // Restore previous scan
            currentScanData = previousScan;
            isShowingComposite = previousComposite;

            return {
                full: fullThumbnail,
                heatmapOnly: heatmapOnly
            };
        } catch (error) {
            console.error('Error generating thumbnails for scan:', error);
            return null;
        }
    };

    // Confirm batch export
    confirmBtn.addEventListener('click', async () => {
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;
        const strakeId = strakeSelect.value;
        const useFilename = useFilenameCheckbox.checked;

        if (!assetId) {
            alert('Please select an asset');
            return;
        }
        if (!vesselId) {
            alert('Please select a vessel');
            return;
        }

        // Disable buttons and show progress
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        progressSection.classList.remove('hidden');

        let successCount = 0;
        let failCount = 0;
        const createdScanIds = [];

        for (let i = 0; i < selectedScansList.length; i++) {
            const scan = selectedScansList[i];

            try {
                progressText.textContent = `${i + 1}/${selectedScansList.length}`;
                progressBar.style.width = `${((i + 1) / selectedScansList.length) * 100}%`;

                const thumbnails = await generateThumbnailsForScan(scan);
                const stats = calculateStats(scan);

                const scanName = useFilename
                    ? scan.fileName?.replace(/\.(txt|csv)$/i, '') || `C-Scan ${i + 1}`
                    : `C-Scan ${new Date().toLocaleDateString()} - ${i + 1}`;

                const scanData = {
                    name: scanName,
                    toolType: 'cscan',
                    data: {
                        scanData: scan,
                        isComposite: false,
                        customColorRange: { min: null, max: null },
                        stats: stats,
                        fileName: scan.fileName
                    },
                    thumbnail: thumbnails ? thumbnails.full : null,
                    heatmapOnly: thumbnails ? thumbnails.heatmapOnly : null
                };

                const createdScan = await dataManager.createScan(assetId, vesselId, scanData);

                if (createdScan) {
                    successCount++;
                    createdScanIds.push(createdScan.id);
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error(`Error exporting scan ${scan.fileName}:`, error);
                failCount++;
            }
        }

        // Assign all created scans to strake if one was selected
        if (strakeId && createdScanIds.length > 0) {
            try {
                for (const scanId of createdScanIds) {
                    await dataManager.assignScanToStrake(assetId, vesselId, scanId, strakeId);
                }
            } catch (error) {
                console.error('Error assigning scans to strake:', error);
            }
        }

        document.body.removeChild(modal);

        if (failCount === 0) {
            const strakeMsg = strakeId ? ' and assigned to strake' : '';
            showStatus(`Successfully exported ${successCount} scans to hub${strakeMsg}!`);
        } else {
            showStatus(`Exported ${successCount} scans. ${failCount} failed.`, failCount > 0);
        }

        // Clear selection
        selectedScans.clear();
        renderFileList();
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

async function batchAssignToStrake() {
    if (selectedScans.size === 0) {
        showStatus('No scans selected', true);
        return;
    }

    // Ensure data manager is initialized
    await dataManager.ensureInitialized();

    // Get assets
    const assets = dataManager.getAssets();

    const selectedScansList = Array.from(selectedScans).map(index => processedScans[index]);

    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 class="text-xl font-bold mb-4 dark:text-white">Assign ${selectedScansList.length} Scans to Strake</h2>

            <div class="mb-4">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Asset</label>
                <select id="strake-asset-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Asset --</option>
                    ${assets.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
            </div>

            <div class="mb-4" id="strake-vessel-section" style="display:none;">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Vessel</label>
                <select id="strake-vessel-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Vessel --</option>
                </select>
            </div>

            <div class="mb-4" id="strake-select-section" style="display:none;">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Strake</label>
                <select id="strake-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Strake --</option>
                </select>
                <button id="new-strake-btn" class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Create New Strake</button>
            </div>

            <div class="mb-4 max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-700/50 p-3 rounded">
                <p class="text-sm font-medium mb-2 dark:text-gray-300">Selected scans:</p>
                ${selectedScansList.map(scan => `<div class="text-sm dark:text-gray-400">• ${scan.fileName}</div>`).join('')}
            </div>

            <div class="flex gap-3 mt-6">
                <button id="strake-assign-confirm-btn" class="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors">Assign</button>
                <button id="strake-assign-cancel-btn" class="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const assetSelect = modal.querySelector('#strake-asset-select');
    const vesselSelect = modal.querySelector('#strake-vessel-select');
    const strakeSelect = modal.querySelector('#strake-select');
    const vesselSection = modal.querySelector('#strake-vessel-section');
    const strakeSection = modal.querySelector('#strake-select-section');
    const newStrakeBtn = modal.querySelector('#new-strake-btn');
    const confirmBtn = modal.querySelector('#strake-assign-confirm-btn');
    const cancelBtn = modal.querySelector('#strake-assign-cancel-btn');

    // Asset selection handler
    assetSelect.addEventListener('change', () => {
        const assetId = assetSelect.value;
        if (assetId) {
            const asset = dataManager.getAsset(assetId);
            vesselSection.style.display = 'block';
            vesselSelect.innerHTML = '<option value="">-- Select Vessel --</option>' +
                asset.vessels.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
            strakeSection.style.display = 'none';
        } else {
            vesselSection.style.display = 'none';
            strakeSection.style.display = 'none';
        }
    });

    // Vessel selection handler
    vesselSelect.addEventListener('change', () => {
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;
        if (assetId && vesselId) {
            const vessel = dataManager.getVessel(assetId, vesselId);
            strakeSection.style.display = 'block';
            const strakes = vessel.strakes || [];
            strakeSelect.innerHTML = '<option value="">-- Select Strake --</option>' +
                strakes.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        } else {
            strakeSection.style.display = 'none';
        }
    });

    // New strake handler
    newStrakeBtn.addEventListener('click', async () => {
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;
        if (!assetId || !vesselId) {
            alert('Please select an asset and vessel first');
            return;
        }
        const name = prompt('Enter strake name:');
        if (name) {
            const totalArea = parseFloat(prompt('Enter total area (m²):', '0') || '0');
            const requiredCoverage = parseFloat(prompt('Enter required coverage (%):', '100') || '100');

            const strake = await dataManager.createStrake(assetId, vesselId, {
                name: name,
                totalArea: totalArea,
                requiredCoverage: requiredCoverage
            });

            if (strake) {
                strakeSelect.innerHTML += `<option value="${strake.id}" selected>${strake.name}</option>`;
                strakeSelect.value = strake.id;
            }
        }
    });

    // Confirm assignment
    confirmBtn.addEventListener('click', async () => {
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;
        const strakeId = strakeSelect.value;

        if (!assetId) {
            alert('Please select an asset');
            return;
        }
        if (!vesselId) {
            alert('Please select a vessel');
            return;
        }
        if (!strakeId) {
            alert('Please select a strake');
            return;
        }

        // Find the scans in the hub that match the selected files by filename
        const vessel = dataManager.getVessel(assetId, vesselId);
        if (!vessel) {
            alert('Vessel not found');
            return;
        }

        let assignedCount = 0;
        let notFoundCount = 0;

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Assigning...';

        for (const scan of selectedScansList) {
            // Try to find the scan in the hub by comparing filenames
            const scanFileName = scan.fileName?.replace(/\.(txt|csv)$/i, '');
            const hubScan = vessel.scans.find(s => {
                // Match by filename stored in the scan data
                const hubFileName = s.data?.fileName?.replace(/\.(txt|csv)$/i, '');
                return hubFileName === scan.fileName || s.name.includes(scanFileName);
            });

            if (hubScan) {
                try {
                    await dataManager.assignScanToStrake(assetId, vesselId, hubScan.id, strakeId);
                    assignedCount++;
                } catch (error) {
                    console.error(`Error assigning scan ${scan.fileName}:`, error);
                }
            } else {
                notFoundCount++;
                console.warn(`Scan not found in hub: ${scan.fileName}`);
            }
        }

        document.body.removeChild(modal);

        if (notFoundCount === 0) {
            showStatus(`Successfully assigned ${assignedCount} scans to strake!`);
        } else {
            showStatus(`Assigned ${assignedCount} scans. ${notFoundCount} not found in hub (export them first).`, notFoundCount > 0);
        }

        // Clear selection
        selectedScans.clear();
        renderFileList();
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
    // Keep metadata collapsed by default
    dom.metadataContent.classList.add('hidden');
    dom.metadataChevron.style.transform = 'rotate(0deg)';
    dom.metadataSection.classList.remove('hidden');
}

function fileInputHandler(event) {
    if (event.target.files.length > 0) handleFiles(event.target.files);
}

function loadScanData(event) {
    console.log('[C-SCAN] loadScanData called:', event.detail);
    const { scanData } = event.detail;

    if (!scanData || scanData.toolType !== 'cscan') {
        console.log('[C-SCAN] Ignoring event - not a cscan:', scanData?.toolType);
        return;
    }

    console.log('[C-SCAN] Loading scan:', scanData.name);

    // Ensure DOM elements are initialized
    if (!dom || !dom.minThicknessInput) {
        console.warn('[C-SCAN] DOM not ready, retrying in 200ms...');
        setTimeout(() => loadScanData(event), 200);
        return;
    }

    console.log('[C-SCAN] DOM is ready, processing scan data');

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
    dom.batchExportToHubBtn.addEventListener('click', batchExportToHub);
    dom.batchAssignStrakeBtn.addEventListener('click', batchAssignToStrake);
    dom.selectAllCheckbox.addEventListener('change', toggleSelectAll);
    dom.colorscaleSelect.addEventListener('change', updatePlot);
    dom.smoothingSelect.addEventListener('change', updatePlot);
    dom.reverseScaleCheckbox.addEventListener('change', updatePlot);
    dom.showGridCheckbox.addEventListener('change', updatePlot);
    dom.showProfilesCheckbox.addEventListener('change', () => {
        updateProfileVisibility();
        if (dom.showProfilesCheckbox.checked && currentScanData) {
            // Re-render profiles when enabled
            updatePlot();
        }
    });

    // Collapsible controls toggle
    dom.toggleControlsBtn.addEventListener('click', () => {
        const isHidden = dom.controlsContent.classList.contains('hidden');
        if (isHidden) {
            dom.controlsContent.classList.remove('hidden');
            dom.controlsChevron.style.transform = 'rotate(180deg)';
        } else {
            dom.controlsContent.classList.add('hidden');
            dom.controlsChevron.style.transform = 'rotate(0deg)';
        }
    });

    // Collapsible metadata toggle
    dom.toggleMetadataBtn.addEventListener('click', () => {
        const isHidden = dom.metadataContent.classList.contains('hidden');
        if (isHidden) {
            dom.metadataContent.classList.remove('hidden');
            dom.metadataChevron.style.transform = 'rotate(180deg)';
        } else {
            dom.metadataContent.classList.add('hidden');
            dom.metadataChevron.style.transform = 'rotate(0deg)';
        }
    });

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
        if (compositeWorker) compositeWorker.terminate();
        if (dom && dom.plotContainer) Plotly.purge(dom.plotContainer);
        if (dom && dom.profileBottom) Plotly.purge(dom.profileBottom);
        if (dom && dom.profileRight) Plotly.purge(dom.profileRight);
        removeEventListeners();
        container.innerHTML = '';
        container.classList.remove('bg-gray-100', 'dark:bg-gray-900');
        processedScans = [];
        currentScanData = null;
        customColorRange = { min: null, max: null };
        isShowingComposite = false;
        currentHoverPosition = { x: null, y: null };
        selectedScans.clear();
    }
};
