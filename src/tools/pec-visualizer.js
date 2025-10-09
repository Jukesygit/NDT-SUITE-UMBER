// PEC Visualizer Tool Module - Complete with all features
import dataManager from '../data-manager.js';
import { createAnimatedHeader } from '../animated-background.js';

let container, dom = {}, heatmapData = null, customColorRange = { min: null, max: null };

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div id="pec-header-container" style="flex-shrink: 0;"></div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
    <div class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 flex-grow flex flex-col">
        <header class="text-center mb-6" style="display: none;">
            <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">PEC Data Visualizer</h1>
            <p class="mt-2 text-gray-600 dark:text-gray-400">Paste Pulsed Eddy Current data to generate a wall thickness heatmap.</p>
        </header>
        
        <div id="upload-section-pec" class="text-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 flex flex-col flex-grow">
            <div class="flex-shrink-0">
                <strong class="dark:text-white">Paste your data below or click Load Sample Data</strong>
            </div>
            <textarea id="csv-input-pec" placeholder="Paste your CSV or tab-separated data here..." 
                class="w-full flex-grow my-4 p-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg font-mono text-xs bg-gray-50 dark:bg-gray-700 dark:text-gray-200 resize-none"></textarea>
            <div class="flex-shrink-0 flex justify-center gap-4">
                <button id="process-data-btn" class="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">Process Data</button>
                <button id="load-sample-btn" class="bg-gray-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-gray-600 transition-colors">Load Sample Data</button>
            </div>
        </div>
        
        <div id="message-area-pec" class="mt-4"></div>
        
        <div id="visualization-section-pec" class="hidden flex-grow flex flex-col">
            <div id="heatmap-pec" class="flex-grow min-h-[300px]"></div>
            
            <div class="flex-shrink-0 mt-4 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="control-group">
                        <label for="colorscale-pec" class="label">Color Scale:</label>
                        <select id="colorscale-pec" class="input-field">
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
                        <label for="smoothing-pec" class="label">Smoothing:</label>
                        <select id="smoothing-pec" class="input-field">
                            <option value="false">None (Blocky)</option>
                            <option value="best">Smooth (Best)</option>
                            <option value="fast">Smooth (Fast)</option>
                        </select>
                    </div>
                    <div class="flex items-center gap-2 pt-5">
                        <input type="checkbox" id="reverse-scale-pec" class="w-5 h-5 cursor-pointer" checked>
                        <label for="reverse-scale-pec" class="label">Reverse</label>
                        <input type="checkbox" id="show-grid-pec" checked class="w-5 h-5 cursor-pointer ml-4">
                        <label for="show-grid-pec" class="label">Grid</label>
                    </div>
                    <div class="flex items-center gap-2 pt-5">
                        <input type="checkbox" id="flip-horizontal-pec" class="w-5 h-5 cursor-pointer">
                        <label for="flip-horizontal-pec" class="label">Flip Horizontal</label>
                        <input type="checkbox" id="flip-vertical-pec" class="w-5 h-5 cursor-pointer ml-4">
                        <label for="flip-vertical-pec" class="label">Flip Vertical</label>
                    </div>
                </div>
                
                <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-center">
                    <div class="control-group">
                        <label for="min-value-pec" class="label">Min (mm):</label>
                        <input type="number" id="min-value-pec" step="0.1" value="4.5" class="input-field">
                    </div>
                    <div class="control-group">
                        <label for="max-value-pec" class="label">Max (mm):</label>
                        <input type="number" id="max-value-pec" step="0.1" value="9.6" class="input-field">
                    </div>
                    <div class="flex gap-2 pt-5">
                        <button id="apply-range-btn" class="btn-primary">Apply</button>
                        <button id="reset-range-btn" class="btn-secondary">Auto</button>
                    </div>
                </div>

                <div id="stats-pec" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center"></div>

                <div class="flex flex-wrap justify-center gap-4 pt-4">
                    <button id="reset-view-btn" class="bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors">Reset View</button>
                    <button id="load-new-data-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors">Load New Data</button>
                    <button id="export-image-btn" class="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors">Export Image</button>
                    <button id="export-data-btn" class="bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-teal-700 transition-colors">Export Data</button>
                    <button id="export-to-hub-btn" class="bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors">Export to Hub</button>
                </div>
            </div>
        </div>
    </div>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#pec-header-container'),
        uploadSection: q('#upload-section-pec'),
        csvInput: q('#csv-input-pec'),
        processBtn: q('#process-data-btn'),
        loadSampleBtn: q('#load-sample-btn'),
        messageArea: q('#message-area-pec'),
        visualizationSection: q('#visualization-section-pec'),
        heatmapContainer: q('#heatmap-pec'),
        colorscaleSelect: q('#colorscale-pec'),
        smoothingSelect: q('#smoothing-pec'),
        reverseScaleCheckbox: q('#reverse-scale-pec'),
        showGridCheckbox: q('#show-grid-pec'),
        flipHorizontalCheckbox: q('#flip-horizontal-pec'),
        flipVerticalCheckbox: q('#flip-vertical-pec'),
        minValueInput: q('#min-value-pec'),
        maxValueInput: q('#max-value-pec'),
        applyRangeBtn: q('#apply-range-btn'),
        resetRangeBtn: q('#reset-range-btn'),
        statsContainer: q('#stats-pec'),
        resetViewBtn: q('#reset-view-btn'),
        loadNewDataBtn: q('#load-new-data-btn'),
        exportImageBtn: q('#export-image-btn'),
        exportDataBtn: q('#export-data-btn'),
        exportToHubBtn: q('#export-to-hub-btn')
    };

    // Initialize animated header
    const header = createAnimatedHeader(
        'PEC Data Visualizer',
        'Paste Pulsed Eddy Current data to generate a wall thickness heatmap',
        { height: '180px', particleCount: 15, waveIntensity: 0.4 }
    );
    dom.headerContainer.appendChild(header);
}

function showMessage(message, isError = false) {
    dom.messageArea.textContent = message;
    dom.messageArea.className = `mt-4 p-4 rounded-lg ${
        isError ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
        'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
    }`;
}

function parseCSVData(text) {
    const lines = text.trim().split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
        throw new Error('Not enough data rows found.');
    }

    const delimiter = lines[0].includes('\t') ? '\t' : ',';

    // Parse first row to get X labels (circumferential positions)
    const firstRow = lines[0].split(delimiter);
    const xLabels = [];

    for (let i = 1; i < firstRow.length; i++) {
        const val = parseFloat(firstRow[i]);
        if (!isNaN(val)) {
            xLabels.push(val);
        }
    }

    // Parse remaining rows to get Y labels and data matrix
    const yLabels = [];
    const dataMatrix = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(delimiter);
        const yValue = parseFloat(row[0]);
        if (!isNaN(yValue)) {
            yLabels.push(yValue);

            const rowData = [];
            for (let j = 1; j < row.length && j <= xLabels.length; j++) {
                const value = parseFloat(row[j]);
                rowData.push(isNaN(value) ? null : value);
            }

            // Pad row if needed
            while (rowData.length < xLabels.length) {
                rowData.push(null);
            }

            dataMatrix.push(rowData);
        }
    }

    if (dataMatrix.length === 0 || xLabels.length === 0) {
        throw new Error('No valid data found.');
    }

    return {
        x: xLabels,
        y: yLabels,
        z: dataMatrix
    };
}

function calculateStats(heatmapData) {
    if (!heatmapData || !heatmapData.z) return null;

    const flatData = [];
    for (let row of heatmapData.z) {
        for (let val of row) {
            if (val !== null && val !== undefined && !isNaN(val) && isFinite(val)) {
                flatData.push(val);
            }
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
        rows: heatmapData.y.length,
        cols: heatmapData.x.length
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

function renderHeatmap() {
    if (!heatmapData) return;

    const colorscale = dom.colorscaleSelect.value;
    const smoothingValue = dom.smoothingSelect.value;
    const smoothing = (smoothingValue === 'best' || smoothingValue === 'fast') ? smoothingValue : false;
    const reverseScale = dom.reverseScaleCheckbox.checked;
    const showGrid = dom.showGridCheckbox.checked;
    const flipHorizontal = dom.flipHorizontalCheckbox.checked;
    const flipVertical = dom.flipVerticalCheckbox.checked;

    const zmin = customColorRange.min !== null ? customColorRange.min : undefined;
    const zmax = customColorRange.max !== null ? customColorRange.max : undefined;

    // Apply flips to the data
    let xData = [...heatmapData.x];
    let yData = [...heatmapData.y];
    let zData = heatmapData.z.map(row => [...row]);

    // Flip horizontal (reverse columns)
    if (flipHorizontal) {
        xData = xData.reverse();
        zData = zData.map(row => [...row].reverse());
    }

    // Flip vertical (reverse rows)
    if (flipVertical) {
        yData = yData.reverse();
        zData = zData.reverse();
    }

    const trace = {
        x: xData,
        y: yData,
        z: zData,
        type: 'heatmap',
        colorscale: colorscale,
        reversescale: reverseScale,
        zsmooth: smoothing,
        zmin: zmin,
        zmax: zmax,
        colorbar: {
            title: 'Thickness<br>(mm)',
            titleside: 'right',
            thickness: 20
        },
        hoverongaps: false,
        hovertemplate: 'Circumferential: %{x:.1f} mm<br>' +
                      'Axial: %{y:.1f} mm<br>' +
                      'Thickness: %{z:.1f} mm<br>' +
                      '<extra></extra>'
    };

    const layout = {
        title: 'PEC Wall Thickness Heatmap',
        xaxis: {
            title: 'Circumferential Position (mm)',
            showgrid: showGrid,
            gridcolor: '#e0e0e0',
            scaleanchor: 'y',
            scaleratio: 1
        },
        yaxis: {
            title: 'Axial Position (mm)',
            showgrid: showGrid,
            gridcolor: '#e0e0e0',
            autorange: flipVertical ? true : 'reversed'
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

    Plotly.react(dom.heatmapContainer, [trace], layout, config);
}

function processData() {
    const text = dom.csvInput.value.trim();
    if (!text) {
        showMessage('Please paste some data first', true);
        return;
    }

    try {
        heatmapData = parseCSVData(text);
        const stats = calculateStats(heatmapData);

        if (stats) {
            dom.minValueInput.value = stats.min.toFixed(2);
            dom.maxValueInput.value = stats.max.toFixed(2);
            customColorRange = { min: null, max: null };
        }

        renderHeatmap();
        renderStats(stats);

        dom.visualizationSection.classList.remove('hidden');
        showMessage('Data processed successfully!');
    } catch (error) {
        showMessage(`Error: ${error.message}`, true);
        console.error('Processing error:', error);
    }
}

function loadSampleData() {
    // Generate realistic grid-based sample data similar to the reference HTML
    const sampleX = Array.from({length: 54}, (_, i) => (i * 47.4).toFixed(1));
    const sampleY = Array.from({length: 42}, (_, i) => (1076.2 - i * 23.8).toFixed(1));
    const sampleZ = [];

    for (let i = 0; i < sampleY.length; i++) {
        const row = [];
        for (let j = 0; j < sampleX.length; j++) {
            const baseThickness = 7.0;
            const variation = Math.sin(i * 0.15) * 1.5 + Math.cos(j * 0.2) * 1.2;
            const noise = (Math.random() - 0.5) * 0.5;
            let thickness = baseThickness + variation + noise;

            // Add a defect zone
            if (j > 30 && j < 40 && i > 10 && i < 25) {
                thickness -= 2.0;
            }

            row.push(Math.max(4.5, Math.min(9.6, thickness)).toFixed(1));
        }
        sampleZ.push(row);
    }

    // Build CSV with X labels in first row and Y labels in first column
    const csvLines = [];

    // First row: empty cell + X labels
    csvLines.push(',' + sampleX.join(','));

    // Data rows: Y label + data values
    for (let i = 0; i < sampleY.length; i++) {
        csvLines.push(sampleY[i] + ',' + sampleZ[i].join(','));
    }

    const csvData = csvLines.join('\n');
    dom.csvInput.value = csvData;
    showMessage('Sample data loaded. Click "Process Data" to visualize.');
}

function applyCustomRange() {
    const minVal = parseFloat(dom.minValueInput.value);
    const maxVal = parseFloat(dom.maxValueInput.value);

    if (isNaN(minVal) || isNaN(maxVal)) {
        showMessage('Please enter valid numbers for min and max', true);
        return;
    }

    if (minVal >= maxVal) {
        showMessage('Min value must be less than max value', true);
        return;
    }

    customColorRange = { min: minVal, max: maxVal };
    renderHeatmap();
    showMessage('Custom range applied');
}

function resetRange() {
    if (!heatmapData) return;

    const stats = calculateStats(heatmapData);
    if (stats) {
        dom.minValueInput.value = stats.min.toFixed(2);
        dom.maxValueInput.value = stats.max.toFixed(2);
        customColorRange = { min: null, max: null };
        renderHeatmap();
        showMessage('Range reset to auto');
    }
}

function exportImage() {
    if (!heatmapData) {
        showMessage('No data to export', true);
        return;
    }

    Plotly.downloadImage(dom.heatmapContainer, {
        format: 'png',
        width: 1920,
        height: 1080,
        scale: 2,
        filename: 'pec-heatmap'
    });
}

function exportData() {
    if (!heatmapData) {
        showMessage('No data to export', true);
        return;
    }

    // Build CSV with X labels in first row and Y labels in first column
    const csvLines = [];

    // First row: empty cell + X labels
    csvLines.push(',' + heatmapData.x.join(','));

    // Data rows: Y label + data values
    for (let i = 0; i < heatmapData.y.length; i++) {
        csvLines.push(heatmapData.y[i] + ',' + heatmapData.z[i].join(','));
    }

    const csv = csvLines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pec-data.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showMessage('Data exported successfully');
}

function resetView() {
    if (!heatmapData) return;

    Plotly.relayout(dom.heatmapContainer, {
        'xaxis.autorange': true,
        'yaxis.autorange': true
    });
    showMessage('View reset');
}

function loadNewData() {
    dom.visualizationSection.classList.add('hidden');
    dom.uploadSection.classList.remove('hidden');
    dom.csvInput.value = '';
    dom.messageArea.innerHTML = '';
    heatmapData = null;
    customColorRange = { min: null, max: null };
}

function exportToHub() {
    if (!heatmapData) {
        showMessage('No data to export', true);
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
    const stats = calculateStats(heatmapData);
    scanNameInput.value = `PEC Scan ${new Date().toLocaleDateString()}`;

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
            const fullThumbnail = await Plotly.toImage(dom.heatmapContainer, {
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
            const cleanData = JSON.parse(JSON.stringify(dom.heatmapContainer.data));
            if (cleanData[0]) cleanData[0].showscale = false;

            // Layout with no axes or margins
            const cleanLayout = {
                xaxis: { visible: false },
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
        const scanName = scanNameInput.value.trim();
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;

        if (!scanName) {
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

        const scanData = {
            name: scanName,
            toolType: 'pec',
            data: {
                heatmapData: heatmapData,
                customColorRange: customColorRange,
                stats: stats,
                settings: {
                    colorscale: dom.colorscaleSelect.value,
                    smoothing: dom.smoothingSelect.value,
                    reverseScale: dom.reverseScaleCheckbox.checked,
                    showGrid: dom.showGridCheckbox.checked,
                    flipHorizontal: dom.flipHorizontalCheckbox.checked,
                    flipVertical: dom.flipVerticalCheckbox.checked
                }
            },
            thumbnail: thumbnails ? thumbnails.full : null,
            heatmapOnly: thumbnails ? thumbnails.heatmapOnly : null
        };

        const scan = await dataManager.createScan(assetId, vesselId, scanData);

        if (scan) {
            document.body.removeChild(modal);
            showMessage('Scan exported to hub successfully!');
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

function updateVisualization() {
    renderHeatmap();
}

function loadScanData(event) {
    const { scanData } = event.detail;

    if (!scanData || scanData.toolType !== 'pec') return;

    // Load the saved scan data
    if (scanData.data && scanData.data.heatmapData) {
        heatmapData = scanData.data.heatmapData;
        customColorRange = scanData.data.customColorRange || { min: null, max: null };

        const stats = scanData.data.stats || calculateStats(heatmapData);

        if (stats) {
            dom.minValueInput.value = stats.min.toFixed(2);
            dom.maxValueInput.value = stats.max.toFixed(2);
        }

        // Apply custom range if it exists
        if (customColorRange.min !== null && customColorRange.max !== null) {
            dom.minValueInput.value = customColorRange.min.toFixed(2);
            dom.maxValueInput.value = customColorRange.max.toFixed(2);
        }

        // Restore saved UI settings
        if (scanData.data.settings) {
            const settings = scanData.data.settings;
            dom.colorscaleSelect.value = settings.colorscale || 'Jet';
            dom.smoothingSelect.value = settings.smoothing || 'false';
            dom.reverseScaleCheckbox.checked = settings.reverseScale !== undefined ? settings.reverseScale : true;
            dom.showGridCheckbox.checked = settings.showGrid !== undefined ? settings.showGrid : true;
            dom.flipHorizontalCheckbox.checked = settings.flipHorizontal || false;
            dom.flipVerticalCheckbox.checked = settings.flipVertical || false;
        }

        renderHeatmap();
        renderStats(stats);

        dom.visualizationSection.classList.remove('hidden');
        dom.uploadSection.classList.add('hidden');
        showMessage(`Loaded: ${scanData.name}`);
    }
}

function addEventListeners() {
    dom.processBtn.addEventListener('click', processData);
    dom.loadSampleBtn.addEventListener('click', loadSampleData);
    dom.colorscaleSelect.addEventListener('change', updateVisualization);
    dom.smoothingSelect.addEventListener('change', updateVisualization);
    dom.reverseScaleCheckbox.addEventListener('change', updateVisualization);
    dom.showGridCheckbox.addEventListener('change', updateVisualization);
    dom.flipHorizontalCheckbox.addEventListener('change', updateVisualization);
    dom.flipVerticalCheckbox.addEventListener('change', updateVisualization);
    dom.applyRangeBtn.addEventListener('click', applyCustomRange);
    dom.resetRangeBtn.addEventListener('click', resetRange);
    dom.resetViewBtn.addEventListener('click', resetView);
    dom.loadNewDataBtn.addEventListener('click', loadNewData);
    dom.exportImageBtn.addEventListener('click', exportImage);
    dom.exportDataBtn.addEventListener('click', exportData);
    dom.exportToHubBtn.addEventListener('click', exportToHub);
    document.addEventListener('themeChanged', updateVisualization);
    window.addEventListener('loadScanData', loadScanData);
}

function removeEventListeners() {
    document.removeEventListener('themeChanged', updateVisualization);
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
        const headerContainer = container?.querySelector('#pec-header-container');
        if (headerContainer) {
            const animContainer = headerContainer.querySelector('.animated-header-container');
            if (animContainer && animContainer._animationInstance) {
                animContainer._animationInstance.destroy();
            }
        }

        if (dom && dom.heatmapContainer) {
            Plotly.purge(dom.heatmapContainer);
        }
        removeEventListeners();
        if (container) {
            container.innerHTML = '';
            container.classList.remove('bg-gray-100', 'dark:bg-gray-900');
        }
        heatmapData = null;
        customColorRange = { min: null, max: null };
    }
};