// NII Coverage Calculator Tool Module
// Matrix Vessel NII Coverage Calculator - MAI-F-NDT-036
import { createAnimatedHeader } from '../animated-background.js';
import { initGlobalStyleEnforcer, destroyGlobalStyleEnforcer } from '../utils/globalStyleEnforcer.js';

let container, dom = {};
let styleEnforcer = null;

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
    { task: 'A', axis1: '', axis2: '', desc: '', accessFactor: 0.5 },
    { task: 'B', axis1: '', axis2: '', desc: '', accessFactor: 0.5 },
    { task: 'C', axis1: '', axis2: '', desc: '', accessFactor: 0.5 },
    { task: 'D', axis1: '', axis2: '', desc: '', accessFactor: 0.5 }
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
        <div class="glass-panel rounded-lg p-6 mb-6">
            <h2 class="text-lg font-semibold text-primary pb-4 border-b border-glass">Input Parameters</h2>
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
        <div class="glass-panel rounded-lg p-6 mb-6">
            <h2 class="text-lg font-semibold text-primary pb-4 border-b border-glass">Output</h2>
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
        <div class="glass-panel rounded-lg p-6 mb-6">
            <div class="flex justify-between items-center pb-4 border-b border-glass">
                <h2 class="text-lg font-semibold text-primary">PAUT Time Calculations</h2>
                <button id="addPautTaskBtn" class="btn btn-primary btn-sm">+ Add Task</button>
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
        <div class="glass-panel rounded-lg p-6 mb-6">
            <div class="flex justify-between items-center pb-4 border-b border-glass">
                <h2 class="text-lg font-semibold text-primary">PEC Time Calculations</h2>
                <button id="addPecTaskBtn" class="btn btn-primary btn-sm">+ Add Task</button>
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
        <div class="glass-panel rounded-lg p-6 mb-6">
            <div class="flex justify-between items-center pb-4 border-b border-glass">
                <h2 class="text-lg font-semibold text-primary">TOFD Time Calculations</h2>
                <button id="addTofdTaskBtn" class="btn btn-primary btn-sm">+ Add Task</button>
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
        <div class="glass-panel rounded-lg p-6 mb-6">
            <h2 class="text-lg font-semibold text-primary pb-4 border-b border-glass">Total Times (based on 9 hour shifts)</h2>
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
        { height: '100px', particleCount: 15, waveIntensity: 0.4 }
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

    // Calculate circumference using OD (Outside Diameter) like Excel
    // Excel formula: =PI()*(ID+(2*WT))
    const od = id + (2 * wt);
    const circ = id > 0 ? Math.PI * od : 0;

    // Calculate shell area (cylindrical surface)
    const shellArea = (circ * tanTan) / 1000000; // Convert mm² to m²

    // Calculate dome ends projected area (2 domes with 1.09 factor for elliptical heads)
    // Excel formula: =2*(1.09*((ID+2*WT)^2)/1000000)
    const domeArea = id > 0 ? 2 * (1.09 * Math.pow(od, 2)) / 1000000 : 0;

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

    // Grid calculations - Excel divides by 0.25 not 0.0625
    const shellGrids = shellArea > 0 ? Math.ceil(shellArea / 0.25) : 0;
    const shellHours = shellGrids * 0.5;

    const domeGrids = domeArea > 0 ? Math.ceil(domeArea / 0.25) : 0;

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
        // Excel formulas for PAUT:
        // Scan Time: =ROUNDUP((accessFactor*grids), 0)
        // Analysis Time: =ROUNDUP((scanTime/2), 1)
        // Report Time: =ROUNDUP((analysisTime/2), 1)
        const scanTime = Math.ceil(task.accessFactor * grids);
        const analysisTime = Math.ceil(scanTime / 2 * 10) / 10; // ROUNDUP to 1 decimal
        const reportTime = Math.ceil(analysisTime / 2 * 10) / 10; // ROUNDUP to 1 decimal

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
                    <button data-paut-duplicate="${index}" aria-label="Duplicate PAUT task ${task.task}" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs px-2 py-1 mr-1" title="Duplicate">📋</button>
                    <button data-paut-delete="${index}" aria-label="Delete PAUT task ${task.task}" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs px-2 py-1" title="Delete">✕</button>
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
        const scanTime = Math.ceil(task.accessFactor * grids);
        const analysisTime = Math.ceil(scanTime / 2 * 10) / 10;
        const reportTime = Math.ceil(analysisTime / 2 * 10) / 10;

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

    // Excel uses 40% for PAUT NII Assessment, not 30%
    const geom = calculateGeometry();
    const totalSurfaceArea = parseFloat(geom.totalArea);
    dom.pautNII.textContent = (totalSurfaceArea * 0.4).toFixed(2) + ' m²';

    return { scan: totalScan, analysis: totalAnalysis, report: totalReport };
}

function attachPautListeners() {
    container.querySelectorAll('[data-paut-index]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.pautIndex);
            const field = e.target.dataset.pautField;
            pautTasks[index][field] = e.target.value;

            // Only update calculations, not the entire table
            if (field === 'axis1' || field === 'axis2' || field === 'accessFactor') {
                updatePautRow(index);
                calculatePautTotals();
                updateSummary();
            }
        });
    });

    container.querySelectorAll('[data-paut-duplicate]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.pautDuplicate);
            duplicatePautTask(index);
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

function updatePautRow(index) {
    const task = pautTasks[index];
    const axis1 = parseFloat(task.axis1) || 0;
    const axis2 = parseFloat(task.axis2) || 0;
    const area = axis1 > 0 && axis2 > 0 ? (axis1 * axis2) / 1000000 : 0;
    const grids = area > 0 ? Math.ceil(area / 0.25) : 0;
    const scanTime = Math.ceil(task.accessFactor * grids);
    const analysisTime = Math.ceil(scanTime / 2 * 10) / 10;
    const reportTime = Math.ceil(analysisTime / 2 * 10) / 10;

    // Update only the calculated cells
    const row = dom.pautTableBody.querySelector(`tr:nth-child(${index + 1})`);
    if (row) {
        row.querySelector('td:nth-child(5)').textContent = area.toFixed(2);
        row.querySelector('td:nth-child(6)').textContent = grids;
        row.querySelector('td:nth-child(8)').textContent = scanTime.toFixed(1);
        row.querySelector('td:nth-child(9)').textContent = analysisTime.toFixed(1);
        row.querySelector('td:nth-child(10)').textContent = reportTime.toFixed(1);
    }
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

function duplicatePautTask(index) {
    const taskToDuplicate = pautTasks[index];
    const newTask = {
        task: getNextTaskLetter(pautTasks),
        axis1: taskToDuplicate.axis1,
        axis2: taskToDuplicate.axis2,
        desc: taskToDuplicate.desc + ' (Copy)',
        accessFactor: taskToDuplicate.accessFactor
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
        // PEC uses same time calculations as PAUT in Excel
        const scanTime = Math.ceil(task.accessFactor * grids);
        const analysisTime = Math.ceil(scanTime / 2 * 10) / 10;
        const reportTime = Math.ceil(analysisTime / 2 * 10) / 10;

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
                    <button data-pec-duplicate="${index}" aria-label="Duplicate PEC task ${task.task}" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs px-2 py-1 mr-1" title="Duplicate">📋</button>
                    <button data-pec-delete="${index}" aria-label="Delete PEC task ${task.task}" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs px-2 py-1" title="Delete">✕</button>
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
        const scanTime = Math.ceil(task.accessFactor * grids);
        const analysisTime = Math.ceil(scanTime / 2 * 10) / 10;
        const reportTime = Math.ceil(analysisTime / 2 * 10) / 10;

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

    // Excel uses 40% of (shell + dome) for PEC NII Assessment
    const geom = calculateGeometry();
    const shellAndDome = parseFloat(geom.shellArea) + parseFloat(geom.domeArea);
    dom.pecNII.textContent = (shellAndDome * 0.4).toFixed(2) + ' m²';

    return { scan: totalScan, analysis: totalAnalysis, report: totalReport };
}

function attachPecListeners() {
    container.querySelectorAll('[data-pec-index]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.pecIndex);
            const field = e.target.dataset.pecField;
            pecTasks[index][field] = e.target.value;

            // Only update calculations, not the entire table
            if (field === 'axis1' || field === 'axis2' || field === 'accessFactor') {
                updatePecRow(index);
                calculatePecTotals();
                updateSummary();
            }
        });
    });

    container.querySelectorAll('[data-pec-duplicate]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.pecDuplicate);
            duplicatePecTask(index);
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

function updatePecRow(index) {
    const task = pecTasks[index];
    const axis1 = parseFloat(task.axis1) || 0;
    const axis2 = parseFloat(task.axis2) || 0;
    const area = axis1 > 0 && axis2 > 0 ? (axis1 * axis2) / 1000000 : 0;
    const grids = area > 0 ? Math.ceil(area / 0.25) : 0;
    const scanTime = Math.ceil(task.accessFactor * grids);
    const analysisTime = Math.ceil(scanTime / 2 * 10) / 10;
    const reportTime = Math.ceil(analysisTime / 2 * 10) / 10;

    // Update only the calculated cells
    const row = dom.pecTableBody.querySelector(`tr:nth-child(${index + 1})`);
    if (row) {
        row.querySelector('td:nth-child(5)').textContent = area.toFixed(2);
        row.querySelector('td:nth-child(6)').textContent = grids;
        row.querySelector('td:nth-child(8)').textContent = scanTime.toFixed(1);
        row.querySelector('td:nth-child(9)').textContent = analysisTime.toFixed(1);
        row.querySelector('td:nth-child(10)').textContent = reportTime.toFixed(1);
    }
}

function addPecTask() {
    const newTask = {
        task: getNextTaskLetter(pecTasks),
        axis1: '',
        axis2: '',
        desc: '',
        accessFactor: 0.5
    };
    pecTasks.push(newTask);
    renderPecTable();
    updateSummary();
}

function duplicatePecTask(index) {
    const taskToDuplicate = pecTasks[index];
    const newTask = {
        task: getNextTaskLetter(pecTasks),
        axis1: taskToDuplicate.axis1,
        axis2: taskToDuplicate.axis2,
        desc: taskToDuplicate.desc + ' (Copy)',
        accessFactor: taskToDuplicate.accessFactor
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
        // Excel formulas for TOFD:
        // Scan Time: =ROUNDUP((((accessFactor*groups)/1000)*length), 0)
        // Analysis Time: =ROUNDUP((scanTime/3.33), 0)
        // Report Time: =ROUNDUP((analysisTime/3), 0)
        const scanTime = Math.ceil(((task.accessFactor * groups) / 1000) * length);
        const analysisTime = Math.ceil(scanTime / 3.33);
        const reportTime = Math.ceil(analysisTime / 3);

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
                    <button data-tofd-duplicate="${index}" aria-label="Duplicate TOFD task ${task.task}" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs px-2 py-1 mr-1" title="Duplicate">📋</button>
                    <button data-tofd-delete="${index}" aria-label="Delete TOFD task ${task.task}" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs px-2 py-1" title="Delete">✕</button>
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
        const scanTime = Math.ceil(((task.accessFactor * groups) / 1000) * length);
        const analysisTime = Math.ceil(scanTime / 3.33);
        const reportTime = Math.ceil(analysisTime / 3);

        totalLength += length;  // Just sum lengths, not length * groups
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

    dom.tofdLength.textContent = totalLength.toFixed(1) + ' mm';  // Display in mm like Excel

    return { scan: totalScan, analysis: totalAnalysis, report: totalReport };
}

function attachTofdListeners() {
    container.querySelectorAll('[data-tofd-index]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.tofdIndex);
            const field = e.target.dataset.tofdField;
            tofdTasks[index][field] = e.target.value;

            // Only update calculations, not the entire table
            if (field === 'length' || field === 'groups' || field === 'accessFactor') {
                updateTofdRow(index);
                calculateTofdTotals();
                updateSummary();
            }
        });
    });

    container.querySelectorAll('[data-tofd-duplicate]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.tofdDuplicate);
            duplicateTofdTask(index);
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

function updateTofdRow(index) {
    const task = tofdTasks[index];
    const length = parseFloat(task.length) || 0;
    const groups = parseFloat(task.groups) || 0;
    const scanTime = Math.ceil(((task.accessFactor * groups) / 1000) * length);
    const analysisTime = Math.ceil(scanTime / 3.33);
    const reportTime = Math.ceil(analysisTime / 3);

    // Update only the calculated cells
    const row = dom.tofdTableBody.querySelector(`tr:nth-child(${index + 1})`);
    if (row) {
        row.querySelector('td:nth-child(6)').textContent = scanTime.toFixed(1);
        row.querySelector('td:nth-child(7)').textContent = analysisTime.toFixed(1);
        row.querySelector('td:nth-child(8)').textContent = reportTime.toFixed(1);
    }
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

function duplicateTofdTask(index) {
    const taskToDuplicate = tofdTasks[index];
    const newTask = {
        task: getNextTaskLetter(tofdTasks),
        length: taskToDuplicate.length,
        groups: taskToDuplicate.groups,
        desc: taskToDuplicate.desc + ' (Copy)',
        accessFactor: taskToDuplicate.accessFactor
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

        // Add tool-container class for global styles
        container.classList.add('tool-container');

        // Initialize global style enforcer
        styleEnforcer = initGlobalStyleEnforcer();

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

        // Clean up global style enforcer
        if (styleEnforcer) {
            destroyGlobalStyleEnforcer();
            styleEnforcer = null;
        }

        container.innerHTML = '';
    }
};
