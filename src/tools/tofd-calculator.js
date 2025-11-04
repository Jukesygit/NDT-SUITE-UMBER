// TOFD Calculator Tool Module - Complete with all features
import { createAnimatedHeader } from '../animated-background.js';

let container, dom = {}, resizeObserver;

const parameters = [
    { id: 'weldType', label: 'Weld Type', type: 'select', options: ['Single V', 'Double V', 'None'], value: 'Single V' },
    { id: 'thickness', label: 'Material Thickness (mm)', type: 'slider', min: 10, max: 200, step: 1, value: 52 },
    { id: 'capWidth', label: 'Cap Width (mm)', type: 'slider', min: 1, max: 50, step: 1, value: 16 },
    { id: 'velocity', label: 'Calibrated Velocity (m/s)', type: 'slider', min: 2000, max: 7000, step: 1, value: 5920 },
    { id: 'calibTemp', label: 'Calibration Temp (°C)', type: 'slider', min: -20, max: 100, step: 1, value: 20 },
    { id: 'inspTemp', label: 'Inspection Temp (°C)', type: 'slider', min: -20, max: 400, step: 1, value: 20 },
    { id: 'pcs', label: 'Probe Separation - PCS (mm)', type: 'slider', min: 20, max: 200, step: 1, value: 74 },
    { id: 'wedgeDelay', label: 'Wedge Delay (µs)', type: 'slider', min: 0, max: 10, step: 0.01, value: 2.24 },
    { id: 'frequency', label: 'Transducer Freq (MHz)', type: 'slider', min: 1, max: 15, step: 0.1, value: 5 },
    { id: 'transducerDiameter', label: 'Transducer Diameter (mm)', type: 'slider', min: 1, max: 20, step: 0.1, value: 5 },
    { id: 'angle', label: 'Angle in Material (°)', type: 'slider', min: 30, max: 80, step: 1, value: 63 },
];

const resultDisplayOrder = [
    { id: 'correctedVelocity', label: 'Corrected Velocity', unit: ' m/s' },
    { id: 'latWavePos', label: 'Lateral Wave Position', unit: ' µs' },
    { id: 'backwallPos', label: 'Backwall Position', unit: ' µs' },
    { id: 'timeRange', label: 'Time Range', unit: ' µs' },
    { id: 'nearSurfaceDeadZone', label: 'Near-Surface Dead Zone', unit: ' mm' },
    { id: 'backwallDeadZone', label: 'Backwall Dead Zone', unit: ' mm' },
];

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div id="tofd-header-container" style="flex-shrink: 0;"></div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
        <div class="container mx-auto max-w-7xl">
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div class="lg:col-span-2 glass-card" style="padding: 24px;">
                    <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Inspection Parameters</h2>
                    <div class="space-y-5" id="input-container"></div>
                </div>

                <div class="lg:col-span-3 glass-card" style="padding: 24px;">
                    <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Coverage Visualization</h2>
                    <div class="glass-panel" style="padding: 8px; margin-top: 16px; height: 400px; min-height: 300px;">
                        <canvas id="tofdCanvas" style="width: 100%; height: 100%;"></canvas>
                    </div>
                    <div id="results" class="mt-6 text-sm font-medium glass-panel" style="padding: 16px;"></div>
                    <div class="mt-6">
                        <button id="analyze-btn" class="btn-primary w-full py-3">
                            Run Analysis
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<div id="analysis-modal" class="fixed inset-0 z-50 hidden">
    <div class="modal-overlay fixed inset-0 bg-black/40 dark:bg-black/60 opacity-0" id="modal-overlay"></div>
    <div class="modal-content bg-white dark:bg-slate-800 rounded-lg shadow-xl mx-auto mt-10 mb-10 max-w-3xl w-11/12 relative transform scale-95 max-h-[90vh] flex flex-col">
        <div class="p-5 border-b dark:border-slate-700 flex justify-between items-center flex-shrink-0">
            <h3 class="text-lg font-semibold dark:text-white">Setup Analysis & Recommendations</h3>
            <button id="close-modal-btn" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-3xl leading-none" aria-label="Close analysis modal">&times;</button>
        </div>
        <div id="modal-body" class="p-6 overflow-y-auto flex-grow">
            <div id="loader" class="flex justify-center items-center h-full">
                <div class="loader"></div>
            </div>
            <div id="analysis-text" class="text-sm text-slate-600 dark:text-slate-300 space-y-4 hidden"></div>
        </div>
    </div>
</div>
`;

function createUI() {
    const inputContainer = dom.inputContainer;
    parameters.forEach(p => {
        const wrapper = document.createElement('div');
        const labelDiv = document.createElement('div');
        labelDiv.className = 'flex justify-between items-center mb-1.5';
        
        const label = document.createElement('label');
        label.textContent = p.label;
        label.htmlFor = p.id;
        label.className = 'font-medium text-sm text-slate-700 dark:text-slate-300';
        labelDiv.appendChild(label);
        
        if (p.type === 'select') {
            const select = document.createElement('select');
            select.id = p.id;
            select.className = 'w-28 text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-1.5 text-sm';
            p.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select.appendChild(option);
            });
            select.value = p.value;
            labelDiv.appendChild(select);
            wrapper.appendChild(labelDiv);
            select.addEventListener('change', updateAll);
        } else {
            const numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.id = `num-${p.id}`;
            numberInput.min = p.min;
            numberInput.max = p.max;
            numberInput.step = p.step;
            numberInput.value = p.value;
            numberInput.className = 'w-24 text-right bg-slate-50 dark:bg-slate-700 border dark:border-slate-600 rounded-md p-1 text-sm';
            labelDiv.appendChild(numberInput);
            
            const rangeInput = document.createElement('input');
            rangeInput.type = 'range';
            rangeInput.id = `range-${p.id}`;
            rangeInput.min = p.min;
            rangeInput.max = p.max;
            rangeInput.step = p.step;
            rangeInput.value = p.value;
            rangeInput.className = 'w-full';
            rangeInput.setAttribute('aria-label', p.label);
            
            wrapper.appendChild(labelDiv);
            wrapper.appendChild(rangeInput);
            
            numberInput.addEventListener('input', () => {
                rangeInput.value = numberInput.value;
                updateAll();
            });
            rangeInput.addEventListener('input', () => {
                numberInput.value = rangeInput.value;
                updateAll();
            });
        }
        
        inputContainer.appendChild(wrapper);
    });
    
    resultDisplayOrder.forEach(r => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-3 border-b dark:border-slate-700 last:border-b-0';
        const label = document.createElement('span');
        label.className = 'text-slate-600 dark:text-slate-400';
        label.textContent = r.label + ':';
        const valueSpan = document.createElement('span');
        valueSpan.id = r.id;
        valueSpan.className = 'font-semibold dark:text-white';
        div.appendChild(label);
        div.appendChild(valueSpan);
        dom.resultsContainer.appendChild(div);
    });
}

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#tofd-header-container'),
        canvas: q('#tofdCanvas'),
        inputContainer: q('#input-container'),
        resultsContainer: q('#results'),
        modal: q('#analysis-modal'),
        modalOverlay: q('#modal-overlay'),
        closeModalBtn: q('#close-modal-btn'),
        analyzeBtn: q('#analyze-btn'),
        analysisTextEl: q('#analysis-text'),
        loader: q('#loader')
    };

    // Initialize animated header
    const header = createAnimatedHeader(
        'TOFD Calculator',
        'Calculate and visualize TOFD inspection coverage',
        { height: '100px', particleCount: 15, waveIntensity: 0.4 }
    );
    dom.headerContainer.appendChild(header);
}

function updateAll() {
    const values = getCurrentValues();
    const results = calculateTOFD(values);
    updateUI(results);
    drawCoverage(values, results);
}

function getCurrentValues() {
    const values = {};
    parameters.forEach(p => {
        const el = dom.inputContainer.querySelector(
            p.type === 'select' ? `#${p.id}` : `#num-${p.id}`
        );
        values[p.id] = p.type === 'select' ? el.value : parseFloat(el.value) || 0;
    });
    return values;
}

function updateUI(results) {
    resultDisplayOrder.forEach(r => {
        const el = dom.resultsContainer.querySelector(`#${r.id}`);
        if (el && results[r.id] !== undefined) {
            el.textContent = `${results[r.id].toFixed(r.unit.includes('m/s') ? 0 : 2)}${r.unit}`;
        }
    });
}

function calculateTOFD(v) {
    const T = v.thickness;
    const S = v.pcs / 2;
    const V_cal_ms = v.velocity;
    const t_w = v.wedgeDelay;
    const freq = v.frequency;
    const D = v.transducerDiameter;
    const T_cal = v.calibTemp;
    const T_insp = v.inspTemp;
    
    const K = 0.00054;
    const delta_T = T_insp - T_cal;
    const V_corr_ms = V_cal_ms * (1 - (K * delta_T));
    
    if (V_corr_ms <= 0 || freq <= 0 || D <= 0) {
        return {
            correctedVelocity: V_corr_ms,
            latWavePos: 0,
            backwallPos: 0,
            timeRange: 0,
            nearSurfaceDeadZone: T,
            backwallDeadZone: T,
            beamSpreadAngleDegrees: 0
        };
    }
    
    const V_mm_us = V_corr_ms / 1000;
    const latWavePos = (v.pcs / V_mm_us) + (2 * t_w);
    const backwallPath = 2 * Math.sqrt(S**2 + T**2);
    const backwallPos = backwallPath / V_mm_us + (2 * t_w);
    const timeRange = backwallPos - latWavePos;
    
    const tp = 1.5 / freq;
    const term1_ns = (V_mm_us * tp) / 2;
    const nearSurfaceDeadZone = (S > 0) ? Math.sqrt(term1_ns**2 + S**2) - S : 0;
    
    const t_bw_prime = backwallPos - (2 * t_w);
    const t_defect_max_time = t_bw_prime - tp;
    let backwallDeadZone = 0;
    
    if (t_defect_max_time > 0) {
        const term_under_sqrt = ((V_mm_us * t_defect_max_time) / 2)**2 - S**2;
        if (term_under_sqrt > 0) {
            const depth_max_detectable = Math.sqrt(term_under_sqrt);
            backwallDeadZone = T - depth_max_detectable;
        } else {
            backwallDeadZone = T;
        }
    } else {
        backwallDeadZone = T;
    }
    
    const K_spread = 1.22;
    const V_corr_mms = V_corr_ms * 1000;
    const freq_hz = freq * 1e6;
    const sin_alpha = (K_spread * V_corr_mms) / (freq_hz * D);
    const beamSpreadAngleDegrees = Math.asin(Math.min(sin_alpha, 1)) * (180 / Math.PI);
    
    return {
        correctedVelocity: V_corr_ms,
        latWavePos,
        backwallPos,
        timeRange,
        nearSurfaceDeadZone: Math.max(0, nearSurfaceDeadZone),
        backwallDeadZone: Math.max(0, backwallDeadZone),
        beamSpreadAngleDegrees
    };
}

function drawCoverage(values, results) {
    const canvas = dom.canvas;
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width - 16; // Account for padding
    canvas.height = rect.height - 16;
    
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    
    const T = values.thickness, PCS = values.pcs, capWidth = values.capWidth;
    const mainAngleRad = values.angle * (Math.PI / 180);
    const spreadAngleRad = results.beamSpreadAngleDegrees * (Math.PI / 180);
    const leftAngleRad = mainAngleRad - spreadAngleRad;
    const rightAngleRad = mainAngleRad + spreadAngleRad;
    
    const scale = Math.min(w / (PCS * 1.2), h / (T * 1.2));
    const yOffset = (h - (T * scale)) / 2;
    const xOffset = (w - (PCS * scale)) / 2;
    
    const isDark = document.documentElement.classList.contains('dark');
    
    ctx.fillStyle = isDark ? '#1e293b' : '#e2e8f0';
    ctx.strokeStyle = isDark ? '#475569' : '#94a3b8';
    ctx.fillRect(xOffset - (10 * scale), yOffset, PCS * scale + (20 * scale), T * scale);
    ctx.strokeRect(xOffset - (10 * scale), yOffset, PCS * scale + (20 * scale), T * scale);
    
    ctx.strokeStyle = isDark ? 'rgba(100, 115, 135, 0.6)' : 'rgba(100, 116, 139, 0.4)';
    ctx.lineWidth = 1;
    
    if (values.weldType === 'Single V') {
        ctx.beginPath();
        ctx.moveTo(w / 2 - (capWidth / 2 * scale), yOffset);
        ctx.lineTo(w / 2 + (capWidth / 2 * scale), yOffset);
        ctx.lineTo(w / 2, yOffset + T * scale);
        ctx.closePath();
        ctx.stroke();
    } else if (values.weldType === 'Double V') {
        const midY = yOffset + (T * scale) / 2;
        ctx.beginPath();
        ctx.moveTo(w / 2 - (capWidth / 2 * scale), yOffset);
        ctx.lineTo(w / 2, midY);
        ctx.lineTo(w / 2 + (capWidth / 2 * scale), yOffset);
        ctx.moveTo(w / 2 - (capWidth / 2 * scale), yOffset + T * scale);
        ctx.lineTo(w / 2, midY);
        ctx.lineTo(w / 2 + (capWidth / 2 * scale), yOffset + T * scale);
        ctx.stroke();
    }
    
    const beamEntryPointTx = xOffset;
    const beamEntryPointRx = xOffset + PCS * scale;
    const backwallY = yOffset + T * scale;
    
    ctx.fillStyle = isDark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(59, 130, 246, 0.2)';
    
    ctx.beginPath();
    ctx.moveTo(beamEntryPointTx, yOffset);
    ctx.lineTo(beamEntryPointTx + (T * scale) * Math.tan(leftAngleRad), backwallY);
    ctx.lineTo(beamEntryPointTx + (T * scale) * Math.tan(rightAngleRad), backwallY);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(beamEntryPointRx, yOffset);
    ctx.lineTo(beamEntryPointRx - (T * scale) * Math.tan(rightAngleRad), backwallY);
    ctx.lineTo(beamEntryPointRx - (T * scale) * Math.tan(leftAngleRad), backwallY);
    ctx.closePath();
    ctx.fill();
    
    const probeSize = Math.max(4, 6 * scale);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(xOffset - probeSize / 2, yOffset - probeSize, probeSize, probeSize);
    ctx.fillRect(xOffset + PCS * scale - probeSize / 2, yOffset - probeSize, probeSize, probeSize);
    
    const drawingAreaX = xOffset - (10 * scale);
    const drawingAreaWidth = PCS * scale + (20 * scale);
    const nsDeadZoneHeight = results.nearSurfaceDeadZone * scale;
    
    ctx.fillStyle = isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)';
    ctx.fillRect(drawingAreaX, yOffset, drawingAreaWidth, nsDeadZoneHeight);
    
    const bwDeadZoneHeight = results.backwallDeadZone * scale;
    ctx.fillStyle = isDark ? 'rgba(251, 191, 36, 0.3)' : 'rgba(234, 179, 8, 0.25)';
    ctx.fillRect(drawingAreaX, yOffset + T * scale - bwDeadZoneHeight, drawingAreaWidth, bwDeadZoneHeight);
}

function openModal() {
    dom.modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => {
        dom.modalOverlay.classList.remove('opacity-0');
        dom.modal.querySelector('.modal-content').classList.remove('scale-95');
        dom.modal.querySelector('.modal-content').classList.add('scale-100');
    }, 10);
}

function closeModal() {
    dom.modalOverlay.classList.add('opacity-0');
    dom.modal.querySelector('.modal-content').classList.remove('scale-100');
    dom.modal.querySelector('.modal-content').classList.add('scale-95');
    setTimeout(() => {
        dom.modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 300);
}

function parseMarkdown(text) {
    let html = text
        .replace(/^\*\*(.*?)\*\*$/gm, '<h3 class="text-md font-semibold text-slate-900 dark:text-white mt-4 first:mt-0">$1</h3>')
        .replace(/^- (.*?)$/gm, '<li class="ml-4">$1</li>')
        .replace(/(\r\n|\n|\r)/gm, '<br>');
    
    if (html.includes('<li>')) {
        html = '<ul class="list-disc list-inside space-y-2">' + html.replace(/<br>/g, '') + '</ul>';
    }
    return html;
}

async function handleAnalysis() {
    openModal();
    dom.loader.style.display = 'flex';
    dom.analysisTextEl.style.display = 'none';
    
    try {
        const values = getCurrentValues();
        const results = calculateTOFD(values);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        let analysisResponse = `This setup provides reasonable coverage but has notable dead zones that could be optimized.

**Coverage Analysis**
- With a PCS of ${values.pcs} mm and a thickness of ${values.thickness} mm, the primary beam intersection appears well-placed for mid-wall inspection.
- The beam spread of ${results.beamSpreadAngleDegrees.toFixed(2)} degrees provides some additional coverage, which is beneficial for detecting off-axis flaws or flaws near the weld root and cap.

**Dead Zones**
- The near-surface dead zone of ${results.nearSurfaceDeadZone.toFixed(2)} mm is ${results.nearSurfaceDeadZone > 5 ? 'significant' : 'acceptable'}. ${results.nearSurfaceDeadZone > 5 ? 'It could potentially mask flaws in the weld cap or immediate subsurface.' : 'This should provide adequate near-surface coverage.'}
- The backwall dead zone of ${results.backwallDeadZone.toFixed(2)} mm is ${results.backwallDeadZone > 3 ? 'a concern' : 'acceptable'}, as it ${results.backwallDeadZone > 3 ? 'limits the ability to detect root flaws' : 'provides good root coverage'}.

**Recommendations**
- To reduce the near-surface dead zone, consider using a higher frequency probe (e.g., ${(values.frequency + 2.5).toFixed(1)} MHz or ${(values.frequency + 5).toFixed(1)} MHz) to shorten the pulse length.
- ${values.pcs < 100 ? 'To improve root coverage, you could slightly increase the PCS. This pushes the intersection point of the backwall reflection further from the center, reducing the dead zone.' : 'The current PCS provides good coverage. Further increases may reduce sensitivity.'}
- If cap inspection is critical, a separate near-surface inspection technique (like Phased Array) should be performed in conjunction with this TOFD setup.
- Temperature compensation is ${Math.abs(values.calibTemp - values.inspTemp) > 20 ? 'important' : 'minor'} for this inspection (ΔT = ${Math.abs(values.calibTemp - values.inspTemp)}°C).`;
        
        dom.analysisTextEl.innerHTML = parseMarkdown(analysisResponse);
    } catch (error) {
        dom.analysisTextEl.innerHTML = '<p class="text-red-500">Error fetching analysis. Please try again later.</p>';
        console.error('Analysis failed:', error);
    } finally {
        dom.loader.style.display = 'none';
        dom.analysisTextEl.style.display = 'block';
    }
}

function addEventListeners() {
    dom.analyzeBtn.addEventListener('click', handleAnalysis);
    dom.closeModalBtn.addEventListener('click', closeModal);
    dom.modalOverlay.addEventListener('click', closeModal);
    
    const debouncedUpdate = () => {
        window.requestAnimationFrame(updateAll);
    };
    
    resizeObserver = new ResizeObserver(debouncedUpdate);
    resizeObserver.observe(dom.canvas.parentElement);
    
    document.addEventListener('themeChanged', updateAll);
}

function removeEventListeners() {
    if (resizeObserver) {
        resizeObserver.disconnect();
    }
    document.removeEventListener('themeChanged', updateAll);
}

export default {
    init: (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        container.classList.add('bg-slate-100', 'dark:bg-slate-900');
        cacheDom();
        createUI();
        addEventListeners();
        updateAll();
    },
    
    destroy: () => {
        // Destroy animated background
        const headerContainer = container?.querySelector('#tofd-header-container');
        if (headerContainer) {
            const animContainer = headerContainer.querySelector('.animated-header-container');
            if (animContainer && animContainer._animationInstance) {
                animContainer._animationInstance.destroy();
            }
        }

        removeEventListeners();
        container.innerHTML = '';
        container.classList.remove('bg-slate-100', 'dark:bg-slate-900');
    }
};