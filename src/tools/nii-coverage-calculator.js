// NII Coverage Calculator Tool Module
// Matrix Vessel NII Coverage Calculator - MAI-F-NDT-036
import { createAnimatedHeader } from '../animated-background.js';

let container, dom = {};

// Clock position mapping to degrees
const CLOCK_POSITIONS = {
    "12 o'clock": 0, "1 o'clock": 30, "2 o'clock": 60, "3 o'clock": 90,
    "4 o'clock": 120, "5 o'clock": 150, "6 o'clock": 180, "7 o'clock": 210,
    "8 o'clock": 240, "9 o'clock": 270, "10 o'clock": 300, "11 o'clock": 330
};

// Default empty task templates
const defaultPautTasks = [
    { task: 'A', axis1: '', axis2: '', desc: '', accessFactor: 0.7 },
    { task: 'B', axis1: '', axis2: '', desc: '', accessFactor: 0.7 },
    { task: 'C', axis1: '', axis2: '', desc: '', accessFactor: 0.7 },
    { task: 'D', axis1: '', axis2: '', desc: '', accessFactor: 0.7 }
];

const defaultPecTasks = [
    { task: 'A', axis1: '', axis2: '', desc: '', accessFactor: 0.33 },
    { task: 'B', axis1: '', axis2: '', desc: '', accessFactor: 0.33 },
    { task: 'C', axis1: '', axis2: '', desc: '', accessFactor: 0.33 },
    { task: 'D', axis1: '', axis2: '', desc: '', accessFactor: 0.33 }
];

const defaultTofdTasks = [
    { task: 'A', length: '', groups: '', desc: '', accessFactor: 0.5 },
    { task: 'B', length: '', groups: '', desc: '', accessFactor: 0.5 },
    { task: 'C', length: '', groups: '', desc: '', accessFactor: 0.5 },
    { task: 'D', length: '', groups: '', desc: '', accessFactor: 0.5 }
];

let pautTasks = JSON.parse(JSON.stringify(defaultPautTasks));
let pecTasks = JSON.parse(JSON.stringify(defaultPecTasks));
let tofdTasks = JSON.parse(JSON.stringify(defaultTofdTasks));

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div id="nii-header-container" style="flex-shrink: 0;"></div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
    <div class="container mx-auto max-w-7xl">
        <header class="mb-8" style="display: none;">
            <h1 class="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">NII Coverage Calculator</h1>
            <p class="text-slate-600 dark:text-slate-400 mt-2">Matrix Vessel NII Coverage Calculator - MAI-F-NDT-036 REV 0</p>
        </header>

        <!-- Vessel Parameters -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
            <h2 class="text-lg font-semibold dark:text-white pb-4 border-b dark:border-slate-700">Input Parameters</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Project Name</label>
                    <input type="text" id="projectName" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-2 text-sm dark:text-white" placeholder="Enter project name">
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Vessel ID</label>
                    <input type="text" id="vesselId" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-2 text-sm dark:text-white" placeholder="Enter vessel ID">
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tan-Tan Length (mm)</label>
                    <input type="number" id="tanTan" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-2 text-sm dark:text-white" placeholder="0">
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Inside Diameter - ID (mm)</label>
                    <input type="number" id="insideDiameter" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-2 text-sm dark:text-white" placeholder="0">
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Wall Thickness - WT (mm)</label>
                    <input type="number" id="wallThickness" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-2 text-sm dark:text-white" placeholder="0">
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Circ Start</label>
                    <select id="circStart" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-2 text-sm dark:text-white">
                        <option value="">Select position</option>
                        ${Object.keys(CLOCK_POSITIONS).map(pos => `<option value="${pos}">${pos}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Circ End</label>
                    <select id="circEnd" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-2 text-sm dark:text-white">
                        <option value="">Select position</option>
                        ${Object.keys(CLOCK_POSITIONS).map(pos => `<option value="${pos}">${pos}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>

        <!-- Vessel Geometry Results -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
            <h2 class="text-lg font-semibold dark:text-white pb-4 border-b dark:border-slate-700">Output</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
                    <p class="text-xs text-slate-600 dark:text-slate-400">Circ</p>
                    <p class="text-lg font-bold dark:text-white"><span id="outputCirc">0.00</span> mm</p>
                </div>
                <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
                    <p class="text-xs text-slate-600 dark:text-slate-400">Shell Area</p>
                    <p class="text-lg font-bold dark:text-white"><span id="outputShellArea">0.00</span> m²</p>
                </div>
                <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
                    <p class="text-xs text-slate-600 dark:text-slate-400">Dome Ends Projected Area</p>
                    <p class="text-lg font-bold dark:text-white"><span id="outputDomeArea">0.00</span> m²</p>
                </div>
                <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
                    <p class="text-xs text-slate-600 dark:text-slate-400">Total Surface Area</p>
                    <p class="text-lg font-bold dark:text-white"><span id="outputTotalArea">0.00</span> m²</p>
                </div>
                <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
                    <p class="text-xs text-slate-600 dark:text-slate-400">Segment Based on Clock Position</p>
                    <p class="text-lg font-bold dark:text-white"><span id="outputSegment">0.00</span> mm</p>
                </div>
                <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
                    <p class="text-xs text-slate-600 dark:text-slate-400">Shell Grids</p>
                    <p class="text-lg font-bold dark:text-white"><span id="outputShellGrids">0</span> grids</p>
                </div>
                <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
                    <p class="text-xs text-slate-600 dark:text-slate-400">Shell Hours</p>
                    <p class="text-lg font-bold dark:text-white"><span id="outputShellHours">0.0</span> hrs</p>
                </div>
                <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
                    <p class="text-xs text-slate-600 dark:text-slate-400">Dome Grids</p>
                    <p class="text-lg font-bold dark:text-white"><span id="outputDomeGrids">0</span> grids</p>
                </div>
            </div>
        </div>

        <!-- PAUT Time Calculations -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
            <div class="flex justify-between items-center pb-4 border-b dark:border-slate-700">
                <h2 class="text-lg font-semibold dark:text-white">PAUT Time Calculations</h2>
                <button id="addPautTaskBtn" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-md transition-colors">+ Add Task</button>
            </div>
            <div class="overflow-x-auto mt-4">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b dark:border-slate-700 bg-slate-100 dark:bg-slate-700">
                            <th class="text-left p-2 font-semibold dark:text-white">Task</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Axis 1 (mm)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Axis 2 (mm)</th>
                            <th class="text-left p-2 font-semibold dark:text-white">Description</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Area (m²)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">No of Grids</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Access</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Scan Time (hrs)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Analysis (hrs)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Report (hrs)</th>
                            <th class="text-center p-2 font-semibold dark:text-white">Delete</th>
                        </tr>
                    </thead>
                    <tbody id="pautTableBody"></tbody>
                    <tfoot id="pautTableFoot"></tfoot>
                </table>
            </div>
            <div class="mt-4 p-3 bg-blue-50 dark:bg-slate-700 rounded-md">
                <p class="text-sm font-medium dark:text-white">30% NII Assessment Recommended Area: <span id="pautNII" class="font-bold">0.00 m²</span></p>
            </div>
        </div>

        <!-- PEC Time Calculations -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
            <div class="flex justify-between items-center pb-4 border-b dark:border-slate-700">
                <h2 class="text-lg font-semibold dark:text-white">PEC Time Calculations</h2>
                <button id="addPecTaskBtn" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-md transition-colors">+ Add Task</button>
            </div>
            <div class="overflow-x-auto mt-4">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b dark:border-slate-700 bg-slate-100 dark:bg-slate-700">
                            <th class="text-left p-2 font-semibold dark:text-white">Task</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Axis 1 (mm)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Axis 2 (mm)</th>
                            <th class="text-left p-2 font-semibold dark:text-white">Description</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Area (m²)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">No of Grids</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Access</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Scan Time (hrs)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Analysis (hrs)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Report (hrs)</th>
                            <th class="text-center p-2 font-semibold dark:text-white">Delete</th>
                        </tr>
                    </thead>
                    <tbody id="pecTableBody"></tbody>
                    <tfoot id="pecTableFoot"></tfoot>
                </table>
            </div>
            <div class="mt-4 p-3 bg-blue-50 dark:bg-slate-700 rounded-md">
                <p class="text-sm font-medium dark:text-white">80% NII Assessment Recommended Area: <span id="pecNII" class="font-bold">0.00 m²</span></p>
            </div>
        </div>

        <!-- TOFD Time Calculations -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
            <div class="flex justify-between items-center pb-4 border-b dark:border-slate-700">
                <h2 class="text-lg font-semibold dark:text-white">TOFD Time Calculations</h2>
                <button id="addTofdTaskBtn" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-md transition-colors">+ Add Task</button>
            </div>
            <div class="overflow-x-auto mt-4">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b dark:border-slate-700 bg-slate-100 dark:bg-slate-700">
                            <th class="text-left p-2 font-semibold dark:text-white">Task</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Length (mm)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">No Groups / Scans</th>
                            <th class="text-left p-2 font-semibold dark:text-white">Description</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Access Factor</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Scan Time (hrs)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Analysis (hrs)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Report (hrs)</th>
                            <th class="text-center p-2 font-semibold dark:text-white">Delete</th>
                        </tr>
                    </thead>
                    <tbody id="tofdTableBody"></tbody>
                    <tfoot id="tofdTableFoot"></tfoot>
                </table>
            </div>
            <div class="mt-4 p-3 bg-blue-50 dark:bg-slate-700 rounded-md">
                <p class="text-sm font-medium dark:text-white">Total Length to Scan: <span id="tofdLength" class="font-bold">0.0 m</span></p>
            </div>
        </div>

        <!-- Summary -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
            <h2 class="text-lg font-semibold dark:text-white pb-4 border-b dark:border-slate-700">Total Times (based on 9 hour shifts)</h2>
            <div class="overflow-x-auto mt-4">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b dark:border-slate-700 bg-slate-100 dark:bg-slate-700">
                            <th class="text-left p-2 font-semibold dark:text-white"></th>
                            <th class="text-right p-2 font-semibold dark:text-white">Scan Time (hrs)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Analysis (hrs)</th>
                            <th class="text-right p-2 font-semibold dark:text-white">Report (hrs)</th>
                        </tr>
                    </thead>
                    <tbody id="summaryTableBody"></tbody>
                </table>
            </div>
        </div>
    </div>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#nii-header-container'),
        projectName: q('#projectName'),
        vesselId: q('#vesselId'),
        tanTan: q('#tanTan'),
        insideDiameter: q('#insideDiameter'),
        wallThickness: q('#wallThickness'),
        circStart: q('#circStart'),
        circEnd: q('#circEnd'),

        outputCirc: q('#outputCirc'),
        outputShellArea: q('#outputShellArea'),
        outputDomeArea: q('#outputDomeArea'),
        outputTotalArea: q('#outputTotalArea'),
        outputSegment: q('#outputSegment'),
        outputShellGrids: q('#outputShellGrids'),
        outputShellHours: q('#outputShellHours'),
        outputDomeGrids: q('#outputDomeGrids'),

        pautTableBody: q('#pautTableBody'),
        pautTableFoot: q('#pautTableFoot'),
        pautNII: q('#pautNII'),
        addPautTaskBtn: q('#addPautTaskBtn'),

        pecTableBody: q('#pecTableBody'),
        pecTableFoot: q('#pecTableFoot'),
        pecNII: q('#pecNII'),
        addPecTaskBtn: q('#addPecTaskBtn'),

        tofdTableBody: q('#tofdTableBody'),
        tofdTableFoot: q('#tofdTableFoot'),
        tofdLength: q('#tofdLength'),
        addTofdTaskBtn: q('#addTofdTaskBtn'),

        summaryTableBody: q('#summaryTableBody')
    };

    // Initialize animated header
    const header = createAnimatedHeader(
        'NII Coverage Calculator',
        'Matrix Vessel NII Coverage Calculator - MAI-F-NDT-036 REV 0',
        { height: '180px', particleCount: 15, waveIntensity: 0.4 }
    );
    dom.headerContainer.appendChild(header);
}

// Task letter generator
function getNextTaskLetter(tasks) {
    if (tasks.length === 0) return 'A';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lastLetter = tasks[tasks.length - 1].task;
    const lastIndex = letters.indexOf(lastLetter);
    if (lastIndex < 25) {
        return letters[lastIndex + 1];
    }
    return 'A' + letters[0]; // After Z, go to AA
}

function calculateGeometry() {
    const tanTan = parseFloat(dom.tanTan.value) || 0;
    const id = parseFloat(dom.insideDiameter.value) || 0;
    const wt = parseFloat(dom.wallThickness.value) || 0;
    const circStartPos = dom.circStart.value;
    const circEndPos = dom.circEnd.value;

    // Calculate circumference
    const circ = id > 0 ? Math.PI * id : 0;

    // Calculate shell area (cylindrical surface)
    const shellArea = (circ * tanTan) / 1000000; // Convert mm² to m²

    // Calculate dome ends projected area (single dome)
    const radius = id / 2;
    const domeArea = id > 0 ? (Math.PI * radius * radius) / 1000000 : 0;

    // Total surface area
    const totalArea = shellArea + domeArea;

    // Calculate segment based on clock position
    let segmentLength = 0;
    if (circStartPos && circEndPos && id > 0) {
        const startDeg = CLOCK_POSITIONS[circStartPos];
        const endDeg = CLOCK_POSITIONS[circEndPos];
        let segmentDeg = endDeg - startDeg;
        if (segmentDeg < 0) segmentDeg += 360;
        segmentLength = (segmentDeg / 360) * circ;
    }

    // Grid calculations (250x250mm grids = 0.0625 m²)
    const shellGrids = shellArea > 0 ? Math.ceil(shellArea / 0.0625) : 0;
    const shellHours = shellGrids * 0.5;

    const domeGrids = domeArea > 0 ? Math.ceil(domeArea / 0.0625) : 0;

    return {
        circ: circ.toFixed(2),
        shellArea: shellArea.toFixed(2),
        shellGrids: shellGrids,
        shellHours: shellHours.toFixed(1),
        domeArea: domeArea.toFixed(2),
        domeGrids: domeGrids,
        totalArea: totalArea.toFixed(2),
        segmentLength: segmentLength.toFixed(2)
    };
}

function updateGeometry() {
    const geom = calculateGeometry();
    dom.outputCirc.textContent = geom.circ;
    dom.outputShellArea.textContent = geom.shellArea;
    dom.outputDomeArea.textContent = geom.domeArea;
    dom.outputTotalArea.textContent = geom.totalArea;
    dom.outputSegment.textContent = geom.segmentLength;
    dom.outputShellGrids.textContent = geom.shellGrids;
    dom.outputShellHours.textContent = geom.shellHours;
    dom.outputDomeGrids.textContent = geom.domeGrids;
}

function renderPautTable() {
    let html = '';

    pautTasks.forEach((task, index) => {
        const axis1 = parseFloat(task.axis1) || 0;
        const axis2 = parseFloat(task.axis2) || 0;
        const area = axis1 > 0 && axis2 > 0 ? (axis1 * axis2) / 1000000 : 0;
        const grids = area > 0 ? Math.ceil(area / 0.25) : 0;
        const scanTime = grids * task.accessFactor;
        const analysisTime = grids * 0.125;
        const reportTime = grids * 0.042;

        html += `
            <tr class="border-b dark:border-slate-700">
                <td class="p-2 dark:text-slate-300">${task.task}</td>
                <td class="p-2"><input type="number" data-paut-index="${index}" data-paut-field="axis1" value="${task.axis1}" class="w-full text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="0"></td>
                <td class="p-2"><input type="number" data-paut-index="${index}" data-paut-field="axis2" value="${task.axis2}" class="w-full text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="0"></td>
                <td class="p-2"><input type="text" data-paut-index="${index}" data-paut-field="desc" value="${task.desc}" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="Description"></td>
                <td class="p-2 text-right dark:text-slate-300">${area.toFixed(2)}</td>
                <td class="p-2 text-right dark:text-slate-300">${grids}</td>
                <td class="p-2"><input type="number" step="0.01" data-paut-index="${index}" data-paut-field="accessFactor" value="${task.accessFactor}" class="w-20 text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white"></td>
                <td class="p-2 text-right dark:text-slate-300">${scanTime.toFixed(1)}</td>
                <td class="p-2 text-right dark:text-slate-300">${analysisTime.toFixed(1)}</td>
                <td class="p-2 text-right dark:text-slate-300">${reportTime.toFixed(1)}</td>
                <td class="p-2 text-center">
                    <button data-paut-delete="${index}" aria-label="Delete PAUT task ${task.task}" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs px-2 py-1">✕</button>
                </td>
            </tr>
        `;
    });

    dom.pautTableBody.innerHTML = html;
    calculatePautTotals();
    attachPautListeners();
}

function calculatePautTotals() {
    let totalArea = 0, totalScan = 0, totalAnalysis = 0, totalReport = 0;

    pautTasks.forEach(task => {
        const axis1 = parseFloat(task.axis1) || 0;
        const axis2 = parseFloat(task.axis2) || 0;
        const area = axis1 > 0 && axis2 > 0 ? (axis1 * axis2) / 1000000 : 0;
        const grids = area > 0 ? Math.ceil(area / 0.25) : 0;
        const scanTime = grids * task.accessFactor;
        const analysisTime = grids * 0.125;
        const reportTime = grids * 0.042;

        totalArea += area;
        totalScan += scanTime;
        totalAnalysis += analysisTime;
        totalReport += reportTime;
    });

    dom.pautTableFoot.innerHTML = `
        <tr class="border-t-2 dark:border-slate-600 font-bold bg-slate-50 dark:bg-slate-700">
            <td colspan="4" class="p-2 dark:text-white">Total</td>
            <td class="p-2 text-right dark:text-white">${totalArea.toFixed(2)}</td>
            <td class="p-2 text-right dark:text-white"></td>
            <td class="p-2 text-right dark:text-white"></td>
            <td class="p-2 text-right dark:text-white">${totalScan.toFixed(1)}</td>
            <td class="p-2 text-right dark:text-white">${totalAnalysis.toFixed(1)}</td>
            <td class="p-2 text-right dark:text-white">${totalReport.toFixed(1)}</td>
        </tr>
    `;

    dom.pautNII.textContent = (totalArea * 0.3).toFixed(2) + ' m²';

    return { scan: totalScan, analysis: totalAnalysis, report: totalReport };
}

function attachPautListeners() {
    container.querySelectorAll('[data-paut-index]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.pautIndex);
            const field = e.target.dataset.pautField;
            pautTasks[index][field] = e.target.value;
            renderPautTable();
            updateSummary();
        });
    });

    container.querySelectorAll('[data-paut-delete]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.pautDelete);
            pautTasks.splice(index, 1);
            renderPautTable();
            updateSummary();
        });
    });
}

function addPautTask() {
    const newTask = {
        task: getNextTaskLetter(pautTasks),
        axis1: '',
        axis2: '',
        desc: '',
        accessFactor: 0.7
    };
    pautTasks.push(newTask);
    renderPautTable();
    updateSummary();
}

function renderPecTable() {
    let html = '';

    pecTasks.forEach((task, index) => {
        const axis1 = parseFloat(task.axis1) || 0;
        const axis2 = parseFloat(task.axis2) || 0;
        const area = axis1 > 0 && axis2 > 0 ? (axis1 * axis2) / 1000000 : 0;
        const grids = area > 0 ? Math.ceil(area / 0.25) : 0;
        const scanTime = grids * task.accessFactor;
        const analysisTime = grids * 0.167;
        const reportTime = grids * 0.083;

        html += `
            <tr class="border-b dark:border-slate-700">
                <td class="p-2 dark:text-slate-300">${task.task}</td>
                <td class="p-2"><input type="number" data-pec-index="${index}" data-pec-field="axis1" value="${task.axis1}" class="w-full text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="0"></td>
                <td class="p-2"><input type="number" data-pec-index="${index}" data-pec-field="axis2" value="${task.axis2}" class="w-full text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="0"></td>
                <td class="p-2"><input type="text" data-pec-index="${index}" data-pec-field="desc" value="${task.desc}" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="Description"></td>
                <td class="p-2 text-right dark:text-slate-300">${area.toFixed(2)}</td>
                <td class="p-2 text-right dark:text-slate-300">${grids}</td>
                <td class="p-2"><input type="number" step="0.01" data-pec-index="${index}" data-pec-field="accessFactor" value="${task.accessFactor}" class="w-20 text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white"></td>
                <td class="p-2 text-right dark:text-slate-300">${scanTime.toFixed(1)}</td>
                <td class="p-2 text-right dark:text-slate-300">${analysisTime.toFixed(1)}</td>
                <td class="p-2 text-right dark:text-slate-300">${reportTime.toFixed(1)}</td>
                <td class="p-2 text-center">
                    <button data-pec-delete="${index}" aria-label="Delete PEC task ${task.task}" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs px-2 py-1">✕</button>
                </td>
            </tr>
        `;
    });

    dom.pecTableBody.innerHTML = html;
    calculatePecTotals();
    attachPecListeners();
}

function calculatePecTotals() {
    let totalArea = 0, totalScan = 0, totalAnalysis = 0, totalReport = 0;

    pecTasks.forEach(task => {
        const axis1 = parseFloat(task.axis1) || 0;
        const axis2 = parseFloat(task.axis2) || 0;
        const area = axis1 > 0 && axis2 > 0 ? (axis1 * axis2) / 1000000 : 0;
        const grids = area > 0 ? Math.ceil(area / 0.25) : 0;
        const scanTime = grids * task.accessFactor;
        const analysisTime = grids * 0.167;
        const reportTime = grids * 0.083;

        totalArea += area;
        totalScan += scanTime;
        totalAnalysis += analysisTime;
        totalReport += reportTime;
    });

    dom.pecTableFoot.innerHTML = `
        <tr class="border-t-2 dark:border-slate-600 font-bold bg-slate-50 dark:bg-slate-700">
            <td colspan="4" class="p-2 dark:text-white">Total</td>
            <td class="p-2 text-right dark:text-white">${totalArea.toFixed(2)}</td>
            <td class="p-2 text-right dark:text-white"></td>
            <td class="p-2 text-right dark:text-white"></td>
            <td class="p-2 text-right dark:text-white">${totalScan.toFixed(1)}</td>
            <td class="p-2 text-right dark:text-white">${totalAnalysis.toFixed(1)}</td>
            <td class="p-2 text-right dark:text-white">${totalReport.toFixed(1)}</td>
        </tr>
    `;

    dom.pecNII.textContent = (totalArea * 0.8).toFixed(2) + ' m²';

    return { scan: totalScan, analysis: totalAnalysis, report: totalReport };
}

function attachPecListeners() {
    container.querySelectorAll('[data-pec-index]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.pecIndex);
            const field = e.target.dataset.pecField;
            pecTasks[index][field] = e.target.value;
            renderPecTable();
            updateSummary();
        });
    });

    container.querySelectorAll('[data-pec-delete]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.pecDelete);
            pecTasks.splice(index, 1);
            renderPecTable();
            updateSummary();
        });
    });
}

function addPecTask() {
    const newTask = {
        task: getNextTaskLetter(pecTasks),
        axis1: '',
        axis2: '',
        desc: '',
        accessFactor: 0.33
    };
    pecTasks.push(newTask);
    renderPecTable();
    updateSummary();
}

function renderTofdTable() {
    let html = '';

    tofdTasks.forEach((task, index) => {
        const length = parseFloat(task.length) || 0;
        const groups = parseFloat(task.groups) || 0;
        const scanTime = groups * 1.6;
        const analysisTime = groups * 0.6;
        const reportTime = groups * 0.2;

        html += `
            <tr class="border-b dark:border-slate-700">
                <td class="p-2 dark:text-slate-300">${task.task}</td>
                <td class="p-2"><input type="number" data-tofd-index="${index}" data-tofd-field="length" value="${task.length}" class="w-full text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="0"></td>
                <td class="p-2"><input type="number" data-tofd-index="${index}" data-tofd-field="groups" value="${task.groups}" class="w-full text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="0"></td>
                <td class="p-2"><input type="text" data-tofd-index="${index}" data-tofd-field="desc" value="${task.desc}" class="w-full bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white" placeholder="Description"></td>
                <td class="p-2"><input type="number" step="0.01" data-tofd-index="${index}" data-tofd-field="accessFactor" value="${task.accessFactor}" class="w-20 text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded p-1 text-sm dark:text-white"></td>
                <td class="p-2 text-right dark:text-slate-300">${scanTime.toFixed(1)}</td>
                <td class="p-2 text-right dark:text-slate-300">${analysisTime.toFixed(1)}</td>
                <td class="p-2 text-right dark:text-slate-300">${reportTime.toFixed(1)}</td>
                <td class="p-2 text-center">
                    <button data-tofd-delete="${index}" aria-label="Delete TOFD task ${task.task}" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs px-2 py-1">✕</button>
                </td>
            </tr>
        `;
    });

    dom.tofdTableBody.innerHTML = html;
    calculateTofdTotals();
    attachTofdListeners();
}

function calculateTofdTotals() {
    let totalLength = 0, totalScan = 0, totalAnalysis = 0, totalReport = 0;

    tofdTasks.forEach(task => {
        const length = parseFloat(task.length) || 0;
        const groups = parseFloat(task.groups) || 0;
        const scanTime = groups * 1.6;
        const analysisTime = groups * 0.6;
        const reportTime = groups * 0.2;

        totalLength += length * groups;
        totalScan += scanTime;
        totalAnalysis += analysisTime;
        totalReport += reportTime;
    });

    dom.tofdTableFoot.innerHTML = `
        <tr class="border-t-2 dark:border-slate-600 font-bold bg-slate-50 dark:bg-slate-700">
            <td colspan="5" class="p-2 dark:text-white">Total</td>
            <td class="p-2 text-right dark:text-white">${totalScan.toFixed(1)}</td>
            <td class="p-2 text-right dark:text-white">${totalAnalysis.toFixed(1)}</td>
            <td class="p-2 text-right dark:text-white">${totalReport.toFixed(1)}</td>
        </tr>
    `;

    dom.tofdLength.textContent = (totalLength / 1000).toFixed(1) + ' m';

    return { scan: totalScan, analysis: totalAnalysis, report: totalReport };
}

function attachTofdListeners() {
    container.querySelectorAll('[data-tofd-index]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.tofdIndex);
            const field = e.target.dataset.tofdField;
            tofdTasks[index][field] = e.target.value;
            renderTofdTable();
            updateSummary();
        });
    });

    container.querySelectorAll('[data-tofd-delete]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.tofdDelete);
            tofdTasks.splice(index, 1);
            renderTofdTable();
            updateSummary();
        });
    });
}

function addTofdTask() {
    const newTask = {
        task: getNextTaskLetter(tofdTasks),
        length: '',
        groups: '',
        desc: '',
        accessFactor: 0.5
    };
    tofdTasks.push(newTask);
    renderTofdTable();
    updateSummary();
}

function updateSummary() {
    const paut = calculatePautTotals();
    const pec = calculatePecTotals();
    const tofd = calculateTofdTotals();

    const totalScan = paut.scan + pec.scan + tofd.scan;
    const totalAnalysis = paut.analysis + pec.analysis + tofd.analysis;
    const totalReport = paut.report + pec.report + tofd.report;

    dom.summaryTableBody.innerHTML = `
        <tr class="border-b dark:border-slate-700">
            <td class="p-2 font-medium dark:text-white">Hours</td>
            <td class="p-2 text-right dark:text-slate-300">${totalScan.toFixed(1)}</td>
            <td class="p-2 text-right dark:text-slate-300">${totalAnalysis.toFixed(1)}</td>
            <td class="p-2 text-right dark:text-slate-300">${totalReport.toFixed(1)}</td>
        </tr>
        <tr class="bg-slate-50 dark:bg-slate-700">
            <td class="p-2 font-medium dark:text-white">Shifts (9 hr)</td>
            <td class="p-2 text-right dark:text-slate-300">${Math.ceil(totalScan / 9)}</td>
            <td class="p-2 text-right dark:text-slate-300">${Math.ceil(totalAnalysis / 9)}</td>
            <td class="p-2 text-right dark:text-slate-300">${Math.ceil(totalReport / 9)}</td>
        </tr>
    `;
}

function addEventListeners() {
    // Add input listeners for geometry calculations
    [dom.tanTan, dom.insideDiameter, dom.wallThickness, dom.circStart, dom.circEnd].forEach(input => {
        input.addEventListener('input', updateGeometry);
    });

    // Add task buttons
    dom.addPautTaskBtn.addEventListener('click', addPautTask);
    dom.addPecTaskBtn.addEventListener('click', addPecTask);
    dom.addTofdTaskBtn.addEventListener('click', addTofdTask);
}

export default {
    init: (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        cacheDom();
        addEventListeners();

        // Initialize tables
        renderPautTable();
        renderPecTable();
        renderTofdTable();
        updateSummary();
    },

    destroy: () => {
        // Destroy animated background
        const headerContainer = container?.querySelector('#nii-header-container');
        if (headerContainer) {
            const animContainer = headerContainer.querySelector('.animated-header-container');
            if (animContainer && animContainer._animationInstance) {
                animContainer._animationInstance.destroy();
            }
        }

        container.innerHTML = '';
    }
};
