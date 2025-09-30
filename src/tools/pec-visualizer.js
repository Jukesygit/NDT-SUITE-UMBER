// PEC Visualizer Tool Module - Complete with all features

let container, dom = {}, heatmapData = null, customColorRange = { min: null, max: null };

const HTML = `
<div class="p-4 md:p-8 h-full flex flex-col bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
    <div class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 flex-grow flex flex-col">
        <header class="text-center mb-6">
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
                            <option value="Jet">Jet</option>
                            <option value="Hot">Hot</option>
                            <option value="Picnic">Picnic</option>
                            <option value="Portland">Portland</option>
                            <option value="Electric">Electric</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label for="smoothing-pec" class="label">Smoothing:</label>
                        <select id="smoothing-pec" class="input-field">
                            <option value="false">None</option>
                            <option value="best">Smooth</option>
                        </select>
                    </div>
                    <div class="flex items-center gap-2 pt-5">
                        <input type="checkbox" id="reverse-scale-pec" class="w-5 h-5 cursor-pointer">
                        <label for="reverse-scale-pec" class="label">Reverse</label>
                        <input type="checkbox" id="show-grid-pec" checked class="w-5 h-5 cursor-pointer ml-4">
                        <label for="show-grid-pec" class="label">Grid</label>
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
                    <button id="export-image-btn" class="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors">Export Image</button>
                    <button id="export-data-btn" class="bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-teal-700 transition-colors">Export Data</button>
                </div>
            </div>
        </div>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
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
        minValueInput: q('#min-value-pec'),
        maxValueInput: q('#max-value-pec'),
        applyRangeBtn: q('#apply-range-btn'),
        resetRangeBtn: q('#reset-range-btn'),
        statsContainer: q('#stats-pec'),
        exportImageBtn: q('#export-image-btn'),
        exportDataBtn: q('#export-data-btn')
    };
}

function showMessage(message, isError = false) {
    dom.messageArea.textContent = message;
    dom.messageArea.className = `mt-4 p-4 rounded-lg ${
        isError ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
        'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
    }`;
}

function parseCSVData(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) throw new Error('No data provided');

    const data = lines.map(line => {
        const values = line.split(/[,\t]/).map(v => parseFloat(v.trim()));
        return values.filter(v => !isNaN(v));
    }).filter(row => row.length > 0);

    if (data.length === 0) throw new Error('No valid numeric data found');
    return data;
}

function calculateStats(data) {
    const flatData = data.flat().filter(v => !isNaN(v) && isFinite(v));
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
        count: flatData.length
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
    const smoothing = dom.smoothingSelect.value === 'best' ? 'best' : false;
    const reverseScale = dom.reverseScaleCheckbox.checked;
    const showGrid = dom.showGridCheckbox.checked;

    const zmin = customColorRange.min !== null ? customColorRange.min : undefined;
    const zmax = customColorRange.max !== null ? customColorRange.max : undefined;

    const trace = {
        z: heatmapData,
        type: 'heatmap',
        colorscale: colorscale,
        reversescale: reverseScale,
        zsmooth: smoothing,
        zmin: zmin,
        zmax: zmax,
        colorbar: {
            title: 'Thickness (mm)',
            titleside: 'right'
        },
        hovertemplate: 'Row: %{y}<br>Col: %{x}<br>Value: %{z:.2f} mm<extra></extra>'
    };

    const layout = {
        title: 'PEC Wall Thickness Heatmap',
        xaxis: {
            title: 'Column',
            showgrid: showGrid
        },
        yaxis: {
            title: 'Row',
            showgrid: showGrid
        },
        autosize: true,
        margin: { l: 60, r: 60, t: 60, b: 60 }
    };

    if (document.documentElement.classList.contains('dark')) {
        layout.template = 'plotly_dark';
        layout.paper_bgcolor = 'rgb(31, 41, 55)';
        layout.plot_bgcolor = 'rgb(31, 41, 55)';
    }

    const config = { responsive: true, displaylogo: false };
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
    const sampleData = `6.2,6.3,6.5,6.4,6.3,6.2,6.1
6.3,5.8,5.5,5.6,5.7,6.0,6.2
6.4,5.5,4.8,4.9,5.2,5.8,6.3
6.5,5.6,5.0,5.1,5.3,5.9,6.4
6.3,5.9,5.4,5.5,5.6,6.0,6.2
6.2,6.1,6.0,6.1,6.0,6.1,6.2`;

    dom.csvInput.value = sampleData;
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

    const csv = heatmapData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pec-data.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function updateVisualization() {
    renderHeatmap();
}

function addEventListeners() {
    dom.processBtn.addEventListener('click', processData);
    dom.loadSampleBtn.addEventListener('click', loadSampleData);
    dom.colorscaleSelect.addEventListener('change', updateVisualization);
    dom.smoothingSelect.addEventListener('change', updateVisualization);
    dom.reverseScaleCheckbox.addEventListener('change', updateVisualization);
    dom.showGridCheckbox.addEventListener('change', updateVisualization);
    dom.applyRangeBtn.addEventListener('click', applyCustomRange);
    dom.resetRangeBtn.addEventListener('click', resetRange);
    dom.exportImageBtn.addEventListener('click', exportImage);
    dom.exportDataBtn.addEventListener('click', exportData);
    document.addEventListener('themeChanged', updateVisualization);
}

function removeEventListeners() {
    document.removeEventListener('themeChanged', updateVisualization);
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