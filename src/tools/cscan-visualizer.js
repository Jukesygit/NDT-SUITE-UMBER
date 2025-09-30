// C-Scan Visualizer Tool Module - Complete with all features (Part 1)

let container, dom = {}, processedScans = [], currentScanData = null, compositeWorker = null, isShowingComposite = false;

const customColorscale = [
    [0.0, 'rgb(127, 0, 0)'], [0.125, 'rgb(255, 0, 0)'], [0.25, 'rgb(255, 127, 0)'],
    [0.375, 'rgb(255, 255, 0)'], [0.5, 'rgb(127, 255, 127)'], [0.625, 'rgb(0, 255, 255)'],
    [0.75, 'rgb(0, 0, 255)'], [0.875, 'rgb(0, 0, 191)'], [1.0, 'rgb(0, 0, 127)']
];

const HTML = `
<div class="container mx-auto p-4 md:p-8 h-full flex flex-col dark:bg-gray-900 text-gray-800 dark:text-gray-200">
    <header class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 mb-8 flex justify-between items-center flex-shrink-0">
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
                </div>
            </div>
            <div id="file-list" class="text-sm text-gray-700 dark:text-gray-300"></div>
        </div>
        
        <div id="controls-section" class="hidden mt-8 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow-inner">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label for="min-thickness" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Min Thickness (mm)</label>
                    <input type="number" id="min-thickness" step="0.1" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm dark:bg-gray-700 dark:text-white px-3 py-2">
                </div>
                <div>
                    <label for="max-thickness" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Max Thickness (mm)</label>
                    <input type="number" id="max-thickness" step="0.1" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm dark:bg-gray-700 dark:text-white px-3 py-2">
                </div>
                <button id="update-button" class="file-input-button bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 w-full md:w-auto transition-colors">
                    Update View
                </button>
            </div>
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
        metadataSection: q('#metadata-section'),
        metadataContent: q('#metadata-content'),
        controlsSection: q('#controls-section'),
        minThicknessInput: q('#min-thickness'),
        maxThicknessInput: q('#max-thickness'),
        updateButton: q('#update-button'),
        fileManagementSection: q('#file-management-section'),
        fileListContainer: q('#file-list'),
        compositeButton: q('#composite-button'),
        exportButton: q('#export-button'),
        exportCleanButton: q('#export-clean-button'),
        progressContainer: q('#progress-container'),
        progressBar: q('#progress-bar')
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
    [dom.visualizationSection, dom.metadataSection, dom.controlsSection, dom.fileManagementSection, dom.exportButton, dom.exportCleanButton].forEach(el => el.classList.add('hidden'));
    
    processedScans = [];
    isShowingComposite = false;
    
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

function renderPlot(data, isComposite = false) {
    let matrix = (isComposite && data.compositeMatrix) ? data.compositeMatrix : reconstructMatrix(data.thickness_values_flat, data.rows, data.cols);
    
    if (!isComposite) {
        const metaMin = data.metadata['Min Thickness (mm)'];
        const metaMax = data.metadata['Max Thickness (mm)'];
        if (metaMin !== undefined && metaMax !== undefined) {
            dom.minThicknessInput.value = parseFloat(metaMin).toFixed(2);
            dom.maxThicknessInput.value = parseFloat(metaMax).toFixed(2);
        } else {
            const { min, max } = findMinMax(data.thickness_values_flat);
            dom.minThicknessInput.value = min.toFixed(2);
            dom.maxThicknessInput.value = max.toFixed(2);
        }
    } else {
        const stdMinMax = getStandardizedMinMax();
        if (stdMinMax) {
            dom.minThicknessInput.value = stdMinMax.min.toFixed(2);
            dom.maxThicknessInput.value = stdMinMax.max.toFixed(2);
        } else {
            const { min, max } = findMinMax(data.thickness_values_flat || matrix.flat());
            dom.minThicknessInput.value = min.toFixed(2);
            dom.maxThicknessInput.value = max.toFixed(2);
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
    
    const zmin = parseFloat(dom.minThicknessInput.value) || null;
    const zmax = parseFloat(dom.maxThicknessInput.value) || null;
    
    const plotData = [{
        x: xCoords,
        y: yCoords,
        z: matrix,
        type: 'heatmap',
        colorscale: customColorscale,
        zsmooth: 'best',
        connectgaps: false,
        zmin,
        zmax,
        colorbar: { title: 'Thickness (mm)', titleside: 'right' },
        hovertemplate: 'X: %{x:.2f} mm<br>Y: %{y:.2f} mm<br>Thickness: %{z:.2f} mm<extra></extra>'
    }];
    
    const title = isShowingComposite ? 'Composite Corrosion Map' : 'Corrosion Heatmap';
    const layout = {
        title: { text: title, font: { size: 20 } },
        xaxis: { title: 'Scan Axis (mm)', scaleanchor: "y", scaleratio: 1.0 },
        yaxis: { title: 'Index Axis (mm)' },
        autosize: true,
        margin: { l: 60, r: 60, t: 60, b: 60 }
    };
    
    if (document.documentElement.classList.contains('dark')) {
        layout.template = 'plotly_dark';
        layout.paper_bgcolor = 'rgb(31, 41, 55)';
        layout.plot_bgcolor = 'rgb(31, 41, 55)';
    }
    
    const config = { responsive: true, displaylogo: false };
    Plotly.react(dom.plotContainer, plotData, layout, config);
    dom.visualizationSection.classList.remove('hidden');
    [dom.exportButton, dom.exportCleanButton].forEach(b => b.classList.remove('hidden'));
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
            xaxis: { visible: false },
            yaxis: { visible: false },
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

function addEventListeners() {
    dom.uploadButton.addEventListener('click', () => dom.fileInput.click());
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dom.uploadSection.addEventListener(ev, preventDefaults, false));
    dom.uploadSection.addEventListener('dragenter', () => dom.uploadSection.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/50'), false);
    dom.uploadSection.addEventListener('dragleave', () => dom.uploadSection.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/50'), false);
    dom.uploadSection.addEventListener('drop', handleDrop, false);
    dom.fileInput.addEventListener('change', fileInputHandler);
    dom.updateButton.addEventListener('click', () => updatePlot());
    dom.compositeButton.addEventListener('click', generateComposite);
    dom.exportButton.addEventListener('click', exportImage);
    dom.exportCleanButton.addEventListener('click', exportCleanImageAsPNG);
    document.addEventListener('themeChanged', updatePlot);
}

function removeEventListeners() {
    document.removeEventListener('themeChanged', updatePlot);
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
        removeEventListeners();
        container.innerHTML = '';
        container.classList.remove('bg-gray-100', 'dark:bg-gray-900');
    }
};
