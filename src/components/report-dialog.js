// Report Dialog Component - UI for generating vessel inspection reports
import reportGenerator from '../report-generator.js';
import dataManager from '../data-manager.js';

class ReportDialog {
    constructor() {
        this.dialog = null;
        this.assetId = null;
        this.vesselId = null;
        this.vesselName = '';
    }

    /**
     * Show the report generation dialog
     * @param {string} assetId - Asset ID
     * @param {string} vesselId - Vessel ID
     * @param {string} vesselName - Vessel name for display
     */
    show(assetId, vesselId, vesselName) {
        this.assetId = assetId;
        this.vesselId = vesselId;
        this.vesselName = vesselName;
        this.createDialog();
        this.dialog.style.display = 'flex';
    }

    hide() {
        if (this.dialog) {
            this.dialog.style.display = 'none';
        }
    }

    createDialog() {
        // Remove existing dialog if present
        if (this.dialog) {
            this.dialog.remove();
        }

        this.dialog = document.createElement('div');
        this.dialog.className = 'report-dialog-overlay';
        this.dialog.innerHTML = `
            <div class="report-dialog">
                <div class="report-dialog-header">
                    <h2>Generate Inspection Report</h2>
                    <button class="close-btn" id="closeReportDialog">&times;</button>
                </div>

                <div class="report-dialog-body">
                    <div class="report-vessel-info">
                        <p><strong>Vessel:</strong> ${this.vesselName}</p>
                    </div>

                    <form id="reportForm">
                        <div class="form-section">
                            <h3>Report Information</h3>

                            <div class="form-group">
                                <label for="reportNumber">Report Number *</label>
                                <input type="text" id="reportNumber" name="reportNumber" required
                                       placeholder="e.g., BLP-2024-4719-PAUT">
                                <small>Enter the ONE database task reference number</small>
                            </div>

                            <div class="form-group">
                                <label for="inspector">Inspector Name *</label>
                                <input type="text" id="inspector" name="inspector" required
                                       placeholder="Enter inspector name">
                            </div>

                            <div class="form-group">
                                <label for="inspectorQualification">Inspector Qualification</label>
                                <input type="text" id="inspectorQualification" name="inspectorQualification"
                                       placeholder="e.g., PCN L2 PAUT">
                            </div>

                            <div class="form-group">
                                <label for="clientName">Client Name *</label>
                                <input type="text" id="clientName" name="clientName" required
                                       placeholder="Enter client/company name">
                            </div>

                            <div class="form-group">
                                <label for="location">Location *</label>
                                <input type="text" id="location" name="location" required
                                       placeholder="e.g., Site, City, Country">
                            </div>
                        </div>

                        <div class="form-section">
                            <h3>Component & Material Details</h3>

                            <div class="form-group">
                                <label for="lineTagNumber">Line/Tag Number</label>
                                <input type="text" id="lineTagNumber" name="lineTagNumber"
                                       placeholder='e.g., 3"-HC-37711-GC4'>
                            </div>

                            <div class="form-group">
                                <label for="componentDescription">Component Description</label>
                                <input type="text" id="componentDescription" name="componentDescription"
                                       placeholder="e.g., Closed Drains Pipework">
                            </div>

                            <div class="form-group">
                                <label for="material">Material</label>
                                <input type="text" id="material" name="material"
                                       placeholder="e.g., Carbon Steel, Stainless Steel 316L">
                            </div>

                            <div class="form-group">
                                <label for="nominalThickness">Nominal Thickness (mm)</label>
                                <input type="number" id="nominalThickness" name="nominalThickness" step="0.01"
                                       placeholder="e.g., 5.49">
                            </div>

                            <div class="form-group">
                                <label for="corrosionAllowance">Corrosion Allowance (mm)</label>
                                <input type="number" id="corrosionAllowance" name="corrosionAllowance" step="0.01"
                                       placeholder="e.g., 3.0">
                            </div>
                        </div>

                        <div class="form-section">
                            <h3>Inspection Details</h3>

                            <div class="form-group">
                                <label for="procedureNumber">Procedure Number</label>
                                <input type="text" id="procedureNumber" name="procedureNumber"
                                       placeholder="e.g., MAI-P-NDT-009-PAUT-R03">
                            </div>

                            <div class="form-group">
                                <label for="applicableStandard">Applicable Standard</label>
                                <input type="text" id="applicableStandard" name="applicableStandard"
                                       placeholder="e.g., BS EN ISO 16809:2019">
                            </div>

                            <div class="form-group">
                                <label for="mwt">Minimum Wall Thickness (MWT, mm)</label>
                                <input type="number" id="mwt" name="mwt" step="0.01"
                                       placeholder="e.g., 5.4">
                            </div>

                            <div class="form-group">
                                <label for="mwtLocation">MWT Location/Feature</label>
                                <input type="text" id="mwtLocation" name="mwtLocation"
                                       placeholder="e.g., STR7-8, Feature 12">
                            </div>

                            <div class="form-group">
                                <label for="anomalyCode">Overall Anomaly Code</label>
                                <select id="anomalyCode" name="anomalyCode">
                                    <option value="">Select...</option>
                                    <option value="A">A - No defects detected</option>
                                    <option value="B">B - Minor defects within acceptance</option>
                                    <option value="C">C - Defects requiring monitoring</option>
                                    <option value="D">D - Defects requiring repair</option>
                                    <option value="E">E - Defects requiring immediate action</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="scanStatus">Inspection Status</label>
                                <select id="scanStatus" name="scanStatus">
                                    <option value="Completed">Completed</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Pending Review">Pending Review</option>
                                    <option value="Approved">Approved</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-section">
                            <h3>Review & Sign-Off</h3>

                            <div class="form-group">
                                <label for="reviewerName">Reviewer Name</label>
                                <input type="text" id="reviewerName" name="reviewerName"
                                       placeholder="Enter reviewer name">
                            </div>

                            <div class="form-group">
                                <label for="reviewerQualification">Reviewer Qualification</label>
                                <input type="text" id="reviewerQualification" name="reviewerQualification"
                                       placeholder="e.g., PCN L3 PAUT">
                            </div>

                            <div class="form-group">
                                <label for="reviewDate">Review Date</label>
                                <input type="date" id="reviewDate" name="reviewDate">
                            </div>
                        </div>

                        <div class="form-section">
                            <h3>Additional Details (Optional)</h3>

                            <div class="form-group">
                                <label for="description">Inspection Description</label>
                                <textarea id="description" name="description" rows="4"
                                          placeholder="Describe the inspection scope, objectives, and methodology..."></textarea>
                            </div>

                            <div class="form-group">
                                <label for="findings">Findings & Observations</label>
                                <textarea id="findings" name="findings" rows="4"
                                          placeholder="Document any defects, anomalies, or noteworthy observations..."></textarea>
                            </div>

                            <div class="form-group">
                                <label for="recommendations">Recommendations</label>
                                <textarea id="recommendations" name="recommendations" rows="4"
                                          placeholder="Provide recommendations for follow-up actions or repairs..."></textarea>
                            </div>
                        </div>

                        <div class="form-section">
                            <h3>Scanning Log (Optional)</h3>
                            <label class="format-option" style="margin-bottom: 15px;">
                                <input type="checkbox" id="includeScanningLog" name="includeScanningLog">
                                <span class="format-label">
                                    <strong>Include Scanning Log in Report</strong>
                                    <small>Document detailed scan session information</small>
                                </span>
                            </label>

                            <div id="scanningLogContainer" style="display: none;">
                                <div id="scanningLogEntries"></div>
                                <button type="button" class="btn btn-secondary" id="addLogEntryBtn" style="margin-top: 10px;">
                                    + Add Log Entry
                                </button>
                            </div>
                        </div>

                        <div class="form-section">
                            <h3>Output Format</h3>
                            <div class="format-options">
                                <label class="format-option">
                                    <input type="checkbox" name="format" value="html" checked>
                                    <span class="format-label">
                                        <strong>HTML</strong>
                                        <small>Web page for quick viewing and printing</small>
                                    </span>
                                </label>

                                <label class="format-option">
                                    <input type="checkbox" name="format" value="pdf">
                                    <span class="format-label">
                                        <strong>PDF</strong>
                                        <small>Portable document for distribution</small>
                                    </span>
                                </label>

                                <label class="format-option">
                                    <input type="checkbox" name="format" value="docx" checked>
                                    <span class="format-label">
                                        <strong>DOCX</strong>
                                        <small>Editable Word document for customization</small>
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div class="form-section">
                            <h3>Save to Hub</h3>
                            <label class="format-option">
                                <input type="checkbox" id="saveToHub" name="saveToHub" checked>
                                <span class="format-label">
                                    <strong>Save Report to Data Hub</strong>
                                    <small>Store a copy of this report with the vessel for future reference</small>
                                </span>
                            </label>
                        </div>
                    </form>
                </div>

                <div class="report-dialog-footer">
                    <button class="btn btn-secondary" id="cancelReportBtn">Cancel</button>
                    <button class="btn btn-primary" id="generateReportBtn">
                        <span class="btn-text">Generate Report</span>
                        <span class="btn-spinner" style="display: none;">⟳</span>
                    </button>
                </div>

                <div class="report-progress" id="reportProgress" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <p class="progress-text" id="progressText">Generating report...</p>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .report-dialog-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(4px);
                z-index: 10000;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }

            .report-dialog {
                background: #1e293b;
                border-radius: 12px;
                width: 100%;
                max-width: 700px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                animation: slideUp 0.3s ease-out;
            }

            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .report-dialog-header {
                padding: 24px;
                border-bottom: 1px solid #334155;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .report-dialog-header h2 {
                margin: 0;
                color: #f1f5f9;
                font-size: 24px;
            }

            .close-btn {
                background: none;
                border: none;
                color: #94a3b8;
                font-size: 32px;
                cursor: pointer;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                transition: all 0.2s;
            }

            .close-btn:hover {
                background: #334155;
                color: #f1f5f9;
            }

            .report-dialog-body {
                padding: 24px;
                overflow-y: auto;
                flex: 1;
            }

            .report-vessel-info {
                background: #0f172a;
                padding: 16px;
                border-radius: 8px;
                margin-bottom: 24px;
                border-left: 4px solid #3b82f6;
            }

            .report-vessel-info p {
                margin: 0;
                color: #cbd5e1;
            }

            .form-section {
                margin-bottom: 32px;
            }

            .form-section h3 {
                color: #f1f5f9;
                font-size: 18px;
                margin: 0 0 16px 0;
                padding-bottom: 8px;
                border-bottom: 2px solid #334155;
            }

            .form-group {
                margin-bottom: 20px;
            }

            .form-group label {
                display: block;
                color: #cbd5e1;
                font-weight: 500;
                margin-bottom: 8px;
                font-size: 14px;
            }

            .form-group input[type="text"],
            .form-group select,
            .form-group textarea {
                width: 100%;
                padding: 12px;
                background: #0f172a;
                border: 1px solid #334155;
                border-radius: 6px;
                color: #f1f5f9;
                font-size: 14px;
                font-family: inherit;
                transition: all 0.2s;
            }

            .form-group input[type="text"]:focus,
            .form-group select:focus,
            .form-group textarea:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .form-group textarea {
                resize: vertical;
                min-height: 80px;
            }

            .form-group small {
                display: block;
                color: #64748b;
                font-size: 12px;
                margin-top: 6px;
            }

            .format-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .format-option {
                display: flex;
                align-items: flex-start;
                padding: 16px;
                background: #0f172a;
                border: 2px solid #334155;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .format-option:hover {
                border-color: #475569;
                background: #1e293b;
            }

            .format-option input[type="checkbox"] {
                margin-top: 2px;
                margin-right: 12px;
                cursor: pointer;
                width: 18px;
                height: 18px;
            }

            .format-option input[type="checkbox"]:checked + .format-label {
                color: #3b82f6;
            }

            .format-label {
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex: 1;
            }

            .format-label strong {
                color: #f1f5f9;
                font-size: 16px;
            }

            .format-label small {
                color: #94a3b8;
                font-size: 13px;
            }

            .report-dialog-footer {
                padding: 24px;
                border-top: 1px solid #334155;
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }

            .btn {
                padding: 12px 24px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .btn-secondary {
                background: #334155;
                color: #f1f5f9;
            }

            .btn-secondary:hover {
                background: #475569;
            }

            .btn-primary {
                background: #3b82f6;
                color: white;
            }

            .btn-primary:hover {
                background: #2563eb;
            }

            .btn-primary:disabled {
                background: #475569;
                cursor: not-allowed;
                opacity: 0.6;
            }

            .btn-spinner {
                display: inline-block;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .report-progress {
                padding: 20px 24px;
                border-top: 1px solid #334155;
                background: #0f172a;
            }

            .progress-bar {
                width: 100%;
                height: 8px;
                background: #334155;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 12px;
            }

            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #3b82f6, #2563eb);
                width: 0%;
                transition: width 0.3s ease;
                border-radius: 4px;
            }

            .progress-text {
                color: #94a3b8;
                font-size: 14px;
                text-align: center;
                margin: 0;
            }

            .scanning-log-entry {
                background: #0f172a;
                border: 1px solid #334155;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 12px;
                position: relative;
            }

            .scanning-log-entry-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }

            .scanning-log-entry-number {
                font-weight: bold;
                color: #3b82f6;
                font-size: 14px;
            }

            .scanning-log-entry-delete {
                background: #dc2626;
                color: white;
                border: none;
                padding: 4px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            }

            .scanning-log-entry-delete:hover {
                background: #b91c1c;
            }

            .scanning-log-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }

            .scanning-log-grid .form-group {
                margin-bottom: 0;
            }

            .scanning-log-grid input,
            .scanning-log-grid textarea {
                width: 100%;
                padding: 8px;
                background: #1e293b;
                border: 1px solid #475569;
                border-radius: 4px;
                color: #f1f5f9;
                font-size: 13px;
                font-family: inherit;
            }

            .scanning-log-grid input[type="datetime-local"],
            .scanning-log-grid input[type="number"] {
                width: 100%;
            }

            .scanning-log-grid textarea {
                resize: vertical;
                min-height: 60px;
                grid-column: span 2;
            }

            .scanning-log-grid label {
                display: block;
                color: #cbd5e1;
                font-size: 12px;
                margin-bottom: 4px;
                font-weight: 500;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.dialog);

        // Attach event listeners
        this.attachEventListeners();
    }

    attachEventListeners() {
        const closeBtn = this.dialog.querySelector('#closeReportDialog');
        const cancelBtn = this.dialog.querySelector('#cancelReportBtn');
        const generateBtn = this.dialog.querySelector('#generateReportBtn');

        closeBtn.addEventListener('click', () => this.hide());
        cancelBtn.addEventListener('click', () => this.hide());
        generateBtn.addEventListener('click', () => this.handleGenerate());

        // Scanning log toggle
        const includeScanningLogCheckbox = this.dialog.querySelector('#includeScanningLog');
        const scanningLogContainer = this.dialog.querySelector('#scanningLogContainer');

        includeScanningLogCheckbox.addEventListener('change', (e) => {
            scanningLogContainer.style.display = e.target.checked ? 'block' : 'none';
            if (e.target.checked && this.getScanningLogEntries().length === 0) {
                // Auto-add first entry when enabled
                this.addScanningLogEntry();
            }
        });

        // Add log entry button
        const addLogEntryBtn = this.dialog.querySelector('#addLogEntryBtn');
        addLogEntryBtn.addEventListener('click', () => this.addScanningLogEntry());

        // Close on overlay click
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.hide();
            }
        });
    }

    addScanningLogEntry() {
        const container = this.dialog.querySelector('#scanningLogEntries');
        const entryCount = container.children.length + 1;

        // Get current date/time in local format for datetime-local input
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);

        const entryDiv = document.createElement('div');
        entryDiv.className = 'scanning-log-entry';
        entryDiv.innerHTML = `
            <div class="scanning-log-entry-header">
                <div class="scanning-log-entry-number">Log Entry #${entryCount}</div>
                <button type="button" class="scanning-log-entry-delete">Delete</button>
            </div>
            <div class="scanning-log-grid">
                <div class="form-group">
                    <label>Date & Time</label>
                    <input type="datetime-local" class="log-datetime" value="${localDateTime}">
                </div>
                <div class="form-group">
                    <label>Operator Name</label>
                    <input type="text" class="log-operator" placeholder="Enter operator name">
                </div>
                <div class="form-group">
                    <label>Equipment Used</label>
                    <input type="text" class="log-equipment" placeholder="e.g., PAUT Scanner Model XYZ">
                </div>
                <div class="form-group">
                    <label>Settings/Parameters</label>
                    <input type="text" class="log-settings" placeholder="e.g., Frequency 5MHz, Range 50mm">
                </div>
                <div class="form-group">
                    <label>Temperature (°C)</label>
                    <input type="text" class="log-temperature" placeholder="e.g., 22">
                </div>
                <div class="form-group">
                    <label>Humidity (%)</label>
                    <input type="text" class="log-humidity" placeholder="e.g., 45">
                </div>
                <div class="form-group">
                    <label>Notes / Observations</label>
                    <textarea class="log-notes" placeholder="Any additional observations during scanning..."></textarea>
                </div>
            </div>
        `;

        container.appendChild(entryDiv);

        // Attach delete handler
        const deleteBtn = entryDiv.querySelector('.scanning-log-entry-delete');
        deleteBtn.addEventListener('click', () => {
            entryDiv.remove();
            this.renumberLogEntries();
        });
    }

    renumberLogEntries() {
        const container = this.dialog.querySelector('#scanningLogEntries');
        const entries = container.querySelectorAll('.scanning-log-entry');
        entries.forEach((entry, index) => {
            const numberDiv = entry.querySelector('.scanning-log-entry-number');
            numberDiv.textContent = `Log Entry #${index + 1}`;
        });
    }

    getScanningLogEntries() {
        const includeScanningLog = this.dialog.querySelector('#includeScanningLog').checked;
        if (!includeScanningLog) {
            return [];
        }

        const container = this.dialog.querySelector('#scanningLogEntries');
        const entries = container.querySelectorAll('.scanning-log-entry');
        const logEntries = [];

        entries.forEach(entry => {
            logEntries.push({
                dateTime: entry.querySelector('.log-datetime').value,
                operator: entry.querySelector('.log-operator').value,
                equipment: entry.querySelector('.log-equipment').value,
                settings: entry.querySelector('.log-settings').value,
                temperature: entry.querySelector('.log-temperature').value,
                humidity: entry.querySelector('.log-humidity').value,
                notes: entry.querySelector('.log-notes').value
            });
        });

        return logEntries;
    }

    async handleGenerate() {
        const form = this.dialog.querySelector('#reportForm');
        const formData = new FormData(form);

        // Validate required fields
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Get selected formats
        const selectedFormats = Array.from(formData.getAll('format'));
        if (selectedFormats.length === 0) {
            alert('Please select at least one output format.');
            return;
        }

        // Check if user wants to save to hub
        const saveToHub = formData.get('saveToHub') === 'on';

        // Collect metadata - ALL fields including PAUT-specific details
        const metadata = {
            // Basic Info
            reportNumber: formData.get('reportNumber'),
            inspector: formData.get('inspector'),
            inspectorQualification: formData.get('inspectorQualification'),
            clientName: formData.get('clientName'),
            location: formData.get('location'),

            // Component Details
            lineTagNumber: formData.get('lineTagNumber'),
            componentDescription: formData.get('componentDescription'),
            material: formData.get('material'),
            nominalThickness: formData.get('nominalThickness'),
            corrosionAllowance: formData.get('corrosionAllowance'),

            // Inspection Details
            procedureNumber: formData.get('procedureNumber'),
            applicableStandard: formData.get('applicableStandard'),
            mwt: formData.get('mwt'),
            mwtLocation: formData.get('mwtLocation'),
            anomalyCode: formData.get('anomalyCode'),
            scanStatus: formData.get('scanStatus'),

            // Review & Sign-Off
            reviewerName: formData.get('reviewerName'),
            reviewerQualification: formData.get('reviewerQualification'),
            reviewDate: formData.get('reviewDate'),

            // Additional Details
            description: formData.get('description'),
            findings: formData.get('findings'),
            recommendations: formData.get('recommendations'),

            // Scanning Log
            scanningLog: this.getScanningLogEntries()
        };

        // Show progress
        const progressDiv = this.dialog.querySelector('#reportProgress');
        const progressFill = this.dialog.querySelector('#progressFill');
        const progressText = this.dialog.querySelector('#progressText');
        const generateBtn = this.dialog.querySelector('#generateReportBtn');
        const btnText = generateBtn.querySelector('.btn-text');
        const btnSpinner = generateBtn.querySelector('.btn-spinner');

        progressDiv.style.display = 'block';
        generateBtn.disabled = true;
        btnText.style.display = 'none';
        btnSpinner.style.display = 'inline-block';

        try {
            const reportNumber = metadata.reportNumber.replace(/[^a-zA-Z0-9-]/g, '_');
            const totalFormats = selectedFormats.length;
            let completed = 0;

            for (const format of selectedFormats) {
                progressText.textContent = `Generating ${format.toUpperCase()} report...`;
                progressFill.style.width = `${(completed / totalFormats) * 100}%`;

                const report = await reportGenerator.generateReport(
                    this.assetId,
                    this.vesselId,
                    metadata,
                    format
                );

                const filename = `${reportNumber}_${this.vesselName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                reportGenerator.downloadReport(report, format, filename);

                completed++;
                progressFill.style.width = `${(completed / totalFormats) * 100}%`;

                // Small delay between formats
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            progressText.textContent = 'Reports generated successfully!';
            progressFill.style.width = '100%';

            // Save report metadata to hub if requested
            if (saveToHub) {
                progressText.textContent = 'Saving report to hub...';
                await dataManager.addVesselReport(this.assetId, this.vesselId, {
                    reportNumber: metadata.reportNumber,
                    metadata: metadata,
                    formats: selectedFormats
                });
                progressText.textContent = 'Reports generated and saved to hub!';
            }

            // Close dialog after brief delay
            setTimeout(() => {
                this.hide();
                progressDiv.style.display = 'none';
                progressFill.style.width = '0%';
                generateBtn.disabled = false;
                btnText.style.display = 'inline';
                btnSpinner.style.display = 'none';
            }, 1500);

        } catch (error) {
            console.error('Error generating report:', error);
            progressText.textContent = 'Error generating report. Please try again.';
            progressText.style.color = '#ef4444';
            generateBtn.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';

            setTimeout(() => {
                progressDiv.style.display = 'none';
                progressFill.style.width = '0%';
                progressText.style.color = '#94a3b8';
            }, 3000);
        }
    }
}

// Create singleton instance
const reportDialog = new ReportDialog();

export default reportDialog;

