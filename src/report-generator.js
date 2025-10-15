// Report Generator Module - Generates inspection reports in multiple formats
import { Document, Paragraph, TextRun, AlignmentType, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun } from 'docx';
import { jsPDF } from 'jspdf';
import dataManager from './data-manager.js';
import authManager from './auth-manager.js';

class ReportGenerator {
    constructor() {
        this.reportData = null;
    }

    /**
     * Render annotations onto an image and return a data URL
     * @param {Object} drawing - Drawing object with imageDataUrl and annotations
     * @returns {Promise<string>} Data URL of image with annotations rendered
     */
    async renderAnnotationsOnImage(drawing) {
        if (!drawing || !drawing.imageDataUrl) {
            return null;
        }

        // If no annotations, return original image
        if (!drawing.annotations || drawing.annotations.length === 0) {
            return drawing.imageDataUrl;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                // Draw original image
                ctx.drawImage(img, 0, 0);

                // Draw each annotation
                drawing.annotations.forEach((annotation, index) => {
                    if (annotation.type === 'box') {
                        // Draw rectangle box
                        ctx.strokeStyle = 'rgba(34, 197, 94, 1)';
                        ctx.lineWidth = 3;
                        ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);

                        // Fill with semi-transparent green
                        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
                        ctx.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);

                        // Draw number badge at top-left corner
                        const badgeX = annotation.x;
                        const badgeY = annotation.y - 25;
                        ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
                        ctx.fillRect(badgeX, badgeY, 30, 25);
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(badgeX, badgeY, 30, 25);

                        ctx.fillStyle = 'white';
                        ctx.font = 'bold 14px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(index + 1, badgeX + 15, badgeY + 12);

                        // Draw label if exists
                        if (annotation.label) {
                            const labelX = annotation.x + annotation.width + 10;
                            const labelY = annotation.y;
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                            ctx.fillRect(labelX, labelY, 150, 25);
                            ctx.fillStyle = 'white';
                            ctx.font = '12px Arial';
                            ctx.textAlign = 'left';
                            ctx.fillText(annotation.label, labelX + 5, labelY + 12);
                        }
                    } else {
                        // Draw marker circle (default type)
                        ctx.beginPath();
                        const radius = 15;
                        ctx.arc(annotation.x, annotation.y, radius, 0, 2 * Math.PI);
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(239, 68, 68, 1)';
                        ctx.lineWidth = 3;
                        ctx.stroke();

                        // Draw number in center
                        ctx.fillStyle = 'white';
                        ctx.font = 'bold 14px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(index + 1, annotation.x, annotation.y);

                        // Draw label if exists
                        if (annotation.label) {
                            const labelX = annotation.x + radius + 10;
                            const labelY = annotation.y - 10;
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                            ctx.fillRect(labelX, labelY, 150, 25);
                            ctx.fillStyle = 'white';
                            ctx.font = '12px Arial';
                            ctx.textAlign = 'left';
                            ctx.fillText(annotation.label, labelX + 5, labelY + 12);
                        }
                    }
                });

                // Convert canvas to data URL
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = drawing.imageDataUrl;
        });
    }

    /**
     * Generate a report for a specific vessel
     * @param {string} assetId - Asset ID
     * @param {string} vesselId - Vessel ID
     * @param {Object} metadata - Additional metadata (inspector name, report number, etc.)
     * @param {string} format - Output format: 'html', 'pdf', or 'docx'
     * @returns {Promise<Blob|string>} Generated report
     */
    async generateReport(assetId, vesselId, metadata, format = 'html') {
        // Gather all vessel data
        const asset = dataManager.getAsset(assetId);
        const vessel = dataManager.getVessel(assetId, vesselId);

        if (!asset || !vessel) {
            throw new Error('Asset or vessel not found');
        }

        // Render annotations on drawings before generating report
        let locationDrawingWithAnnotations = vessel.locationDrawing;
        let gaDrawingWithAnnotations = vessel.gaDrawing;

        if (vessel.locationDrawing) {
            const annotatedImageUrl = await this.renderAnnotationsOnImage(vessel.locationDrawing);
            locationDrawingWithAnnotations = {
                ...vessel.locationDrawing,
                imageDataUrl: annotatedImageUrl,
                originalImageDataUrl: vessel.locationDrawing.imageDataUrl
            };
        }

        if (vessel.gaDrawing) {
            const annotatedImageUrl = await this.renderAnnotationsOnImage(vessel.gaDrawing);
            gaDrawingWithAnnotations = {
                ...vessel.gaDrawing,
                imageDataUrl: annotatedImageUrl,
                originalImageDataUrl: vessel.gaDrawing.imageDataUrl
            };
        }

        // Prepare report data
        this.reportData = {
            metadata: {
                reportNumber: metadata.reportNumber || 'N/A',
                reportDate: new Date().toLocaleDateString(),
                inspector: metadata.inspector || authManager.getCurrentUser()?.email || 'Unknown',
                clientName: metadata.clientName || 'N/A',
                location: metadata.location || 'N/A',
                ...metadata
            },
            asset: {
                id: asset.id,
                name: asset.name
            },
            vessel: {
                id: vessel.id,
                name: vessel.name,
                images: vessel.images || [],
                model3d: vessel.model3d,
                scans: vessel.scans || [],
                locationDrawing: locationDrawingWithAnnotations,
                gaDrawing: gaDrawingWithAnnotations
            },
            generatedAt: new Date().toISOString()
        };

        // Generate report based on format
        switch (format.toLowerCase()) {
            case 'html':
                return this.generateHTML();
            case 'pdf':
                return await this.generatePDF();
            case 'docx':
                return await this.generateDOCX();
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Generate HTML report
     * @returns {string} HTML string
     */
    generateHTML() {
        const { metadata, asset, vessel } = this.reportData;

        // Helper function to safely display values
        const val = (value) => value || 'N/A';

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PAUT Inspection Report - ${metadata.reportNumber || vessel.name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .report-container {
            background: white;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            border-bottom: 3px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #2563eb;
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header .subtitle {
            color: #666;
            font-size: 16px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin: 30px 0;
            padding: 20px;
            background: #f9fafb;
            border-radius: 8px;
        }
        .info-item {
            display: flex;
            flex-direction: column;
        }
        .info-label {
            font-weight: bold;
            color: #374151;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
        }
        .info-value {
            color: #1f2937;
            font-size: 16px;
        }
        .section {
            margin: 40px 0;
        }
        .section-title {
            font-size: 22px;
            color: #1f2937;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        .scan-item {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .scan-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .scan-name {
            font-size: 18px;
            font-weight: bold;
            color: #1f2937;
        }
        .scan-type {
            background: #2563eb;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: bold;
        }
        .scan-meta {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 15px;
        }
        .scan-thumbnail {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .images-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .image-item {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
        }
        .image-item img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            margin-bottom: 10px;
        }
        .image-caption {
            font-size: 14px;
            color: #6b7280;
            text-align: center;
        }
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #e5e7eb;
            padding: 12px;
            text-align: left;
        }
        th {
            background: #f3f4f6;
            font-weight: bold;
            color: #374151;
        }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #9ca3af;
            font-style: italic;
        }
        @media print {
            body { background: white; }
            .report-container { box-shadow: none; padding: 20px; }
            .scan-item { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="report-container">
        <div class="header">
            <h1>PAUT INSPECTION REPORT: ${val(metadata.reportNumber)}</h1>
            <div class="subtitle">Non-Destructive Testing - Phased Array Ultrasonic Testing</div>
        </div>

        <div class="section">
            <h2 class="section-title">1. Component Details & Procedure</h2>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Line/Tag Number</div>
                    <div class="info-value">${val(metadata.lineTagNumber)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Description</div>
                    <div class="info-value">${val(metadata.componentDescription)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Material</div>
                    <div class="info-value">${val(metadata.material)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Nominal Thickness</div>
                    <div class="info-value">${val(metadata.nominalThickness)} mm</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Corrosion Allowance</div>
                    <div class="info-value">${val(metadata.corrosionAllowance)} mm</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Procedure No.</div>
                    <div class="info-value">${val(metadata.procedureNumber)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Applicable Standard</div>
                    <div class="info-value">${val(metadata.applicableStandard)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Asset/Vessel</div>
                    <div class="info-value">${asset.name} / ${vessel.name}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">2. Inspection Results Summary</h2>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Overall Minimum Wall Thickness (MWT)</div>
                    <div class="info-value" style="font-size: 20px; color: #dc2626; font-weight: bold;">${val(metadata.mwt)} mm</div>
                </div>
                <div class="info-item">
                    <div class="info-label">MWT Location/Feature</div>
                    <div class="info-value">${val(metadata.mwtLocation)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Overall Anomaly Code</div>
                    <div class="info-value" style="font-size: 20px; font-weight: bold; color: ${
                        metadata.anomalyCode === 'A' ? '#10b981' :
                        metadata.anomalyCode === 'B' ? '#3b82f6' :
                        metadata.anomalyCode === 'C' ? '#f59e0b' :
                        metadata.anomalyCode === 'D' ? '#ef4444' :
                        metadata.anomalyCode === 'E' ? '#7f1d1d' : '#6b7280'
                    };">${val(metadata.anomalyCode)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Inspection Status</div>
                    <div class="info-value">${val(metadata.scanStatus)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Report Date</div>
                    <div class="info-value">${metadata.reportDate}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Location</div>
                    <div class="info-value">${val(metadata.location)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Client</div>
                    <div class="info-value">${val(metadata.clientName)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Total Scans Performed</div>
                    <div class="info-value">${vessel.scans.length}</div>
                </div>
            </div>
            ${metadata.description || metadata.findings ? `
                <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                    <p style="margin: 0; font-weight: bold; color: #92400e;">General Notes / Findings:</p>
                    <p style="margin: 10px 0 0 0;">${val(metadata.description || metadata.findings)}</p>
                </div>
            ` : ''}
        </div>

        ${vessel.locationDrawing || vessel.gaDrawing ? `
        <div class="section">
            <h2 class="section-title">Technical Drawings</h2>
            <div class="images-grid">
                ${vessel.locationDrawing ? `
                    <div class="image-item">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #1f2937;">Location Drawing</h3>
                        <img src="${vessel.locationDrawing.imageDataUrl}" alt="Location Drawing">
                        ${vessel.locationDrawing.annotations && vessel.locationDrawing.annotations.length > 0 ? `
                            <div class="image-caption" style="margin-top: 10px; text-align: left; font-size: 13px; color: #6b7280;">
                                <strong style="color: #374151;">Annotations (${vessel.locationDrawing.annotations.length}):</strong>
                                <ul style="margin: 5px 0; padding-left: 20px; line-height: 1.6;">
                                    ${vessel.locationDrawing.annotations.map((ann, i) => `
                                        <li><strong>${i + 1}.</strong> ${ann.label || (ann.type === 'box' ? 'Marked area' : 'Test Point')}</li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}
                        ${vessel.locationDrawing.comment ? `
                            <div class="image-caption" style="margin-top: 10px; padding: 10px; background: #f3f4f6; border-left: 4px solid #8b5cf6; border-radius: 4px;">
                                <strong style="color: #7c3aed;">Comment:</strong>
                                <p style="margin: 5px 0 0 0; color: #374151;">${vessel.locationDrawing.comment}</p>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                ${vessel.gaDrawing ? `
                    <div class="image-item">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #1f2937;">GA Drawing</h3>
                        <img src="${vessel.gaDrawing.imageDataUrl}" alt="GA Drawing">
                        ${vessel.gaDrawing.annotations && vessel.gaDrawing.annotations.length > 0 ? `
                            <div class="image-caption" style="margin-top: 10px; text-align: left; font-size: 13px; color: #6b7280;">
                                <strong style="color: #374151;">Annotations (${vessel.gaDrawing.annotations.length}):</strong>
                                <ul style="margin: 5px 0; padding-left: 20px; line-height: 1.6;">
                                    ${vessel.gaDrawing.annotations.map((ann, i) => `
                                        <li><strong>${i + 1}.</strong> ${ann.label || (ann.type === 'box' ? 'Marked area' : 'Test Point')}</li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}
                        ${vessel.gaDrawing.comment ? `
                            <div class="image-caption" style="margin-top: 10px; padding: 10px; background: #f3f4f6; border-left: 4px solid #8b5cf6; border-radius: 4px;">
                                <strong style="color: #7c3aed;">Comment:</strong>
                                <p style="margin: 5px 0 0 0; color: #374151;">${vessel.gaDrawing.comment}</p>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
        ` : ''}

        <div class="section">
            <h2 class="section-title">3. Detailed Inspection Log</h2>
            ${vessel.scans.length > 0 ? vessel.scans.map(scan => `
                <div class="scan-item">
                    <div class="scan-header">
                        <div class="scan-name">${scan.name}</div>
                        <div class="scan-type">${scan.toolType.toUpperCase()}</div>
                    </div>
                    <div class="scan-meta">
                        Scan ID: ${scan.id} | Date: ${new Date(scan.timestamp).toLocaleString()}
                    </div>
                    ${scan.thumbnail ? `
                        <img src="${scan.thumbnail}" alt="${scan.name}" class="scan-thumbnail">
                    ` : '<div class="no-data">No scan image available</div>'}
                </div>
            `).join('') : '<div class="no-data">No inspection scans recorded</div>'}
        </div>

        ${vessel.images && vessel.images.length > 0 ? `
        <div class="section">
            <h2 class="section-title">Vessel Images</h2>
            <div class="images-grid">
                ${vessel.images.map(img => `
                    <div class="image-item">
                        <img src="${img.dataUrl}" alt="${img.name}">
                        <div class="image-caption">${img.name}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <div class="section">
            <h2 class="section-title">Scan Summary</h2>
            <table>
                <thead>
                    <tr>
                        <th>Scan Name</th>
                        <th>Type</th>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${vessel.scans.map(scan => `
                        <tr>
                            <td>${scan.name}</td>
                            <td>${scan.toolType.toUpperCase()}</td>
                            <td>${new Date(scan.timestamp).toLocaleDateString()}</td>
                            <td>${metadata.scanStatus || 'Completed'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        ${metadata.findings ? `
        <div class="section">
            <h2 class="section-title">Findings & Observations</h2>
            <p>${metadata.findings}</p>
        </div>
        ` : ''}

        ${metadata.recommendations ? `
        <div class="section">
            <h2 class="section-title">Recommendations</h2>
            <p>${metadata.recommendations}</p>
        </div>
        ` : ''}

        ${metadata.scanningLog && metadata.scanningLog.length > 0 ? `
        <div class="section">
            <h2 class="section-title">Scanning Log</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date & Time</th>
                        <th>Operator</th>
                        <th>Equipment</th>
                        <th>Settings</th>
                        <th>Temp (°C)</th>
                        <th>Humidity (%)</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${metadata.scanningLog.map(entry => {
                        // Format the datetime
                        let formattedDateTime = 'N/A';
                        if (entry.dateTime) {
                            try {
                                const date = new Date(entry.dateTime);
                                formattedDateTime = date.toLocaleString();
                            } catch (e) {
                                formattedDateTime = entry.dateTime;
                            }
                        }
                        return `
                        <tr>
                            <td>${formattedDateTime}</td>
                            <td>${val(entry.operator)}</td>
                            <td>${val(entry.equipment)}</td>
                            <td>${val(entry.settings)}</td>
                            <td>${val(entry.temperature)}</td>
                            <td>${val(entry.humidity)}</td>
                            <td>${val(entry.notes)}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="section">
            <h2 class="section-title">4. Sign-Off</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: bold; background: #f9fafb; width: 30%;">Technician</td>
                    <td style="border: 1px solid #e5e7eb; padding: 12px;">${val(metadata.inspector)}</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: bold; background: #f9fafb;">Qualification</td>
                    <td style="border: 1px solid #e5e7eb; padding: 12px;">${val(metadata.inspectorQualification)}</td>
                </tr>
                ${metadata.reviewerName ? `
                <tr>
                    <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: bold; background: #f9fafb;">Reviewed By</td>
                    <td style="border: 1px solid #e5e7eb; padding: 12px;">${val(metadata.reviewerName)}</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: bold; background: #f9fafb;">Reviewer Qualification</td>
                    <td style="border: 1px solid #e5e7eb; padding: 12px;">${val(metadata.reviewerQualification)}</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: bold; background: #f9fafb;">Review Date</td>
                    <td style="border: 1px solid #e5e7eb; padding: 12px;">${val(metadata.reviewDate)}</td>
                </tr>
                ` : ''}
            </table>
        </div>

        <div class="footer">
            <p>Generated by NDT Suite | ${new Date().toLocaleString()}</p>
            <p>This report is generated electronically and is valid without signature.</p>
        </div>
    </div>
</body>
</html>`;

        return html;
    }

    /**
     * Generate PDF report
     * @returns {Promise<Blob>} PDF blob
     */
    async generatePDF() {
        const { metadata, asset, vessel } = this.reportData;

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        let yPos = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - (2 * margin);

        // Helper function to check if we need a new page
        const checkPageBreak = (requiredSpace) => {
            if (yPos + requiredSpace > pageHeight - margin) {
                doc.addPage();
                yPos = margin;
                return true;
            }
            return false;
        };

        // Header
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont(undefined, 'bold');
        doc.text('NDT INSPECTION REPORT', margin, 20);
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text('Phased Array Ultrasonic Testing (PAUT)', margin, 30);

        yPos = 50;
        doc.setTextColor(0, 0, 0);

        // Report Information
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Report Information', margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        const infoItems = [
            ['Report Number:', metadata.reportNumber],
            ['Report Date:', metadata.reportDate],
            ['Inspector:', metadata.inspector],
            ['Client:', metadata.clientName],
            ['Asset:', asset.name],
            ['Vessel:', vessel.name],
            ['Location:', metadata.location],
            ['Total Scans:', vessel.scans.length.toString()]
        ];

        infoItems.forEach(([label, value]) => {
            checkPageBreak(7);
            doc.setFont(undefined, 'bold');
            doc.text(label, margin, yPos);
            doc.setFont(undefined, 'normal');
            doc.text(value, margin + 50, yPos);
            yPos += 7;
        });

        yPos += 5;

        // Description
        if (metadata.description) {
            checkPageBreak(20);
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Inspection Description', margin, yPos);
            yPos += 8;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            const descLines = doc.splitTextToSize(metadata.description, contentWidth);
            descLines.forEach(line => {
                checkPageBreak(5);
                doc.text(line, margin, yPos);
                yPos += 5;
            });
            yPos += 5;
        }

        // Technical Drawings
        if (vessel.locationDrawing || vessel.gaDrawing) {
            checkPageBreak(20);
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Technical Drawings', margin, yPos);
            yPos += 10;

            // Location Drawing
            if (vessel.locationDrawing) {
                checkPageBreak(100);
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.text('Location Drawing', margin, yPos);
                yPos += 8;

                try {
                    const imgWidth = contentWidth;
                    const imgHeight = 80;
                    doc.addImage(vessel.locationDrawing.imageDataUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
                    yPos += imgHeight + 5;

                    // Add annotations list
                    if (vessel.locationDrawing.annotations && vessel.locationDrawing.annotations.length > 0) {
                        doc.setFontSize(10);
                        doc.setFont(undefined, 'bold');
                        doc.text(`Annotations (${vessel.locationDrawing.annotations.length}):`, margin, yPos);
                        yPos += 5;

                        doc.setFont(undefined, 'normal');
                        vessel.locationDrawing.annotations.forEach((ann, i) => {
                            checkPageBreak(5);
                            doc.text(`${i + 1}. ${ann.label || (ann.type === 'box' ? 'Marked area' : 'Test Point')}`, margin + 5, yPos);
                            yPos += 5;
                        });
                        yPos += 3;
                    }
                } catch (err) {
                    console.error('Error adding Location Drawing to PDF:', err);
                    doc.setFontSize(10);
                    doc.text('(Location Drawing could not be loaded)', margin, yPos);
                    yPos += 6;
                }
                yPos += 5;
            }

            // GA Drawing
            if (vessel.gaDrawing) {
                checkPageBreak(100);
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.text('GA Drawing', margin, yPos);
                yPos += 8;

                try {
                    const imgWidth = contentWidth;
                    const imgHeight = 80;
                    doc.addImage(vessel.gaDrawing.imageDataUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
                    yPos += imgHeight + 5;

                    // Add annotations list
                    if (vessel.gaDrawing.annotations && vessel.gaDrawing.annotations.length > 0) {
                        doc.setFontSize(10);
                        doc.setFont(undefined, 'bold');
                        doc.text(`Annotations (${vessel.gaDrawing.annotations.length}):`, margin, yPos);
                        yPos += 5;

                        doc.setFont(undefined, 'normal');
                        vessel.gaDrawing.annotations.forEach((ann, i) => {
                            checkPageBreak(5);
                            doc.text(`${i + 1}. ${ann.label || (ann.type === 'box' ? 'Marked area' : 'Test Point')}`, margin + 5, yPos);
                            yPos += 5;
                        });
                        yPos += 3;
                    }
                } catch (err) {
                    console.error('Error adding GA Drawing to PDF:', err);
                    doc.setFontSize(10);
                    doc.text('(GA Drawing could not be loaded)', margin, yPos);
                    yPos += 6;
                }
                yPos += 5;
            }
        }

        // Scans
        checkPageBreak(20);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Inspection Scans', margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        for (const scan of vessel.scans) {
            checkPageBreak(30);

            // Scan header
            doc.setFont(undefined, 'bold');
            doc.text(scan.name, margin, yPos);
            doc.setFont(undefined, 'normal');
            doc.text(`[${scan.toolType.toUpperCase()}]`, margin + 100, yPos);
            yPos += 6;

            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Scan ID: ${scan.id}`, margin, yPos);
            yPos += 5;
            doc.text(`Date: ${new Date(scan.timestamp).toLocaleString()}`, margin, yPos);
            yPos += 8;

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);

            // Add thumbnail if available
            if (scan.thumbnail) {
                try {
                    checkPageBreak(80);
                    const imgWidth = contentWidth;
                    const imgHeight = 60;
                    doc.addImage(scan.thumbnail, 'PNG', margin, yPos, imgWidth, imgHeight);
                    yPos += imgHeight + 10;
                } catch (err) {
                    console.error('Error adding scan thumbnail to PDF:', err);
                    doc.text('(Thumbnail could not be loaded)', margin, yPos);
                    yPos += 6;
                }
            }

            yPos += 5;
        }

        // Findings
        if (metadata.findings) {
            checkPageBreak(20);
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Findings & Observations', margin, yPos);
            yPos += 8;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            const findingsLines = doc.splitTextToSize(metadata.findings, contentWidth);
            findingsLines.forEach(line => {
                checkPageBreak(5);
                doc.text(line, margin, yPos);
                yPos += 5;
            });
            yPos += 5;
        }

        // Recommendations
        if (metadata.recommendations) {
            checkPageBreak(20);
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Recommendations', margin, yPos);
            yPos += 8;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            const recLines = doc.splitTextToSize(metadata.recommendations, contentWidth);
            recLines.forEach(line => {
                checkPageBreak(5);
                doc.text(line, margin, yPos);
                yPos += 5;
            });
            yPos += 5;
        }

        // Scanning Log
        if (metadata.scanningLog && metadata.scanningLog.length > 0) {
            checkPageBreak(20);
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Scanning Log', margin, yPos);
            yPos += 10;

            doc.setFontSize(9);

            for (const entry of metadata.scanningLog) {
                checkPageBreak(40);

                // Format datetime
                let formattedDateTime = 'N/A';
                if (entry.dateTime) {
                    try {
                        const date = new Date(entry.dateTime);
                        formattedDateTime = date.toLocaleString();
                    } catch (e) {
                        formattedDateTime = entry.dateTime;
                    }
                }

                // Draw a box for each entry
                doc.setDrawColor(200, 200, 200);
                doc.rect(margin, yPos, contentWidth, 35);

                yPos += 5;

                // Left column
                doc.setFont(undefined, 'bold');
                doc.text('Date & Time:', margin + 2, yPos);
                doc.setFont(undefined, 'normal');
                doc.text(formattedDateTime, margin + 35, yPos);

                doc.setFont(undefined, 'bold');
                doc.text('Operator:', margin + 2, yPos + 5);
                doc.setFont(undefined, 'normal');
                doc.text(entry.operator || 'N/A', margin + 35, yPos + 5);

                doc.setFont(undefined, 'bold');
                doc.text('Equipment:', margin + 2, yPos + 10);
                doc.setFont(undefined, 'normal');
                const equipmentText = doc.splitTextToSize(entry.equipment || 'N/A', 50);
                doc.text(equipmentText, margin + 35, yPos + 10);

                // Right column
                const rightColX = margin + contentWidth / 2;

                doc.setFont(undefined, 'bold');
                doc.text('Settings:', rightColX, yPos);
                doc.setFont(undefined, 'normal');
                const settingsText = doc.splitTextToSize(entry.settings || 'N/A', 50);
                doc.text(settingsText, rightColX + 25, yPos);

                doc.setFont(undefined, 'bold');
                doc.text('Temp:', rightColX, yPos + 5);
                doc.setFont(undefined, 'normal');
                doc.text(entry.temperature ? `${entry.temperature}°C` : 'N/A', rightColX + 25, yPos + 5);

                doc.setFont(undefined, 'bold');
                doc.text('Humidity:', rightColX, yPos + 10);
                doc.setFont(undefined, 'normal');
                doc.text(entry.humidity ? `${entry.humidity}%` : 'N/A', rightColX + 25, yPos + 10);

                // Notes (full width)
                if (entry.notes) {
                    doc.setFont(undefined, 'bold');
                    doc.text('Notes:', margin + 2, yPos + 15);
                    doc.setFont(undefined, 'normal');
                    const notesText = doc.splitTextToSize(entry.notes, contentWidth - 20);
                    doc.text(notesText, margin + 2, yPos + 20);
                }

                yPos += 40;
            }

            yPos += 5;
        }

        // Footer
        const footerY = pageHeight - 15;
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated by NDT Suite | ${new Date().toLocaleString()}`, pageWidth / 2, footerY, { align: 'center' });

        return doc.output('blob');
    }

    /**
     * Generate DOCX report (editable)
     * @returns {Promise<Blob>} DOCX blob
     */
    async generateDOCX() {
        const { metadata, asset, vessel } = this.reportData;

        const children = [
            // Title
            new Paragraph({
                text: 'NDT INSPECTION REPORT',
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: 'Non-Destructive Testing - Phased Array Ultrasonic Testing (PAUT)',
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),

            // Report Information Section
            new Paragraph({
                text: 'Report Information',
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 200 }
            })
        ];

        // Info table
        const infoTableRows = [
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Report Number:', bold: true })] }),
                    new TableCell({ children: [new Paragraph(metadata.reportNumber)] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Report Date:', bold: true })] }),
                    new TableCell({ children: [new Paragraph(metadata.reportDate)] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Inspector:', bold: true })] }),
                    new TableCell({ children: [new Paragraph(metadata.inspector)] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Client:', bold: true })] }),
                    new TableCell({ children: [new Paragraph(metadata.clientName)] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Asset:', bold: true })] }),
                    new TableCell({ children: [new Paragraph(asset.name)] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Vessel:', bold: true })] }),
                    new TableCell({ children: [new Paragraph(vessel.name)] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Location:', bold: true })] }),
                    new TableCell({ children: [new Paragraph(metadata.location)] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Total Scans:', bold: true })] }),
                    new TableCell({ children: [new Paragraph(vessel.scans.length.toString())] })
                ]
            })
        ];

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: infoTableRows
            })
        );

        // Description
        if (metadata.description) {
            children.push(
                new Paragraph({
                    text: 'Inspection Description',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 300, after: 200 }
                }),
                new Paragraph({
                    text: metadata.description,
                    spacing: { after: 200 }
                })
            );
        }

        // Technical Drawings Section
        if (vessel.locationDrawing || vessel.gaDrawing) {
            children.push(
                new Paragraph({
                    text: 'Technical Drawings',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 300, after: 200 }
                })
            );

            // Location Drawing
            if (vessel.locationDrawing) {
                children.push(
                    new Paragraph({
                        text: 'Location Drawing',
                        heading: HeadingLevel.HEADING_3,
                        spacing: { before: 200, after: 100 }
                    })
                );

                try {
                    const base64Data = vessel.locationDrawing.imageDataUrl.split(',')[1];
                    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

                    children.push(
                        new Paragraph({
                            children: [
                                new ImageRun({
                                    data: imageBuffer,
                                    transformation: {
                                        width: 600,
                                        height: 400
                                    }
                                })
                            ],
                            spacing: { after: 200 }
                        })
                    );

                    // Add annotations list
                    if (vessel.locationDrawing.annotations && vessel.locationDrawing.annotations.length > 0) {
                        children.push(
                            new Paragraph({
                                children: [
                                    new TextRun({ text: `Annotations (${vessel.locationDrawing.annotations.length}):`, bold: true })
                                ],
                                spacing: { after: 100 }
                            })
                        );

                        vessel.locationDrawing.annotations.forEach((ann, i) => {
                            children.push(
                                new Paragraph({
                                    text: `${i + 1}. ${ann.label || (ann.type === 'box' ? 'Marked area' : 'Test Point')}`,
                                    spacing: { after: 50 }
                                })
                            );
                        });

                        children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
                    }
                } catch (err) {
                    console.error('Error adding Location Drawing to DOCX:', err);
                    children.push(
                        new Paragraph({
                            text: '(Location Drawing could not be loaded)',
                            italics: true,
                            spacing: { after: 200 }
                        })
                    );
                }
            }

            // GA Drawing
            if (vessel.gaDrawing) {
                children.push(
                    new Paragraph({
                        text: 'GA Drawing',
                        heading: HeadingLevel.HEADING_3,
                        spacing: { before: 200, after: 100 }
                    })
                );

                try {
                    const base64Data = vessel.gaDrawing.imageDataUrl.split(',')[1];
                    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

                    children.push(
                        new Paragraph({
                            children: [
                                new ImageRun({
                                    data: imageBuffer,
                                    transformation: {
                                        width: 600,
                                        height: 400
                                    }
                                })
                            ],
                            spacing: { after: 200 }
                        })
                    );

                    // Add annotations list
                    if (vessel.gaDrawing.annotations && vessel.gaDrawing.annotations.length > 0) {
                        children.push(
                            new Paragraph({
                                children: [
                                    new TextRun({ text: `Annotations (${vessel.gaDrawing.annotations.length}):`, bold: true })
                                ],
                                spacing: { after: 100 }
                            })
                        );

                        vessel.gaDrawing.annotations.forEach((ann, i) => {
                            children.push(
                                new Paragraph({
                                    text: `${i + 1}. ${ann.label || (ann.type === 'box' ? 'Marked area' : 'Test Point')}`,
                                    spacing: { after: 50 }
                                })
                            );
                        });

                        children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
                    }
                } catch (err) {
                    console.error('Error adding GA Drawing to DOCX:', err);
                    children.push(
                        new Paragraph({
                            text: '(GA Drawing could not be loaded)',
                            italics: true,
                            spacing: { after: 200 }
                        })
                    );
                }
            }
        }

        // Scans Section
        children.push(
            new Paragraph({
                text: 'Inspection Scans',
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 200 }
            })
        );

        for (const scan of vessel.scans) {
            children.push(
                new Paragraph({
                    text: scan.name,
                    heading: HeadingLevel.HEADING_3,
                    spacing: { before: 200, after: 100 }
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: 'Type: ', bold: true }),
                        new TextRun(scan.toolType.toUpperCase())
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: 'Scan ID: ', bold: true }),
                        new TextRun(scan.id)
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: 'Date: ', bold: true }),
                        new TextRun(new Date(scan.timestamp).toLocaleString())
                    ],
                    spacing: { after: 200 }
                })
            );

            // Add thumbnail if available
            if (scan.thumbnail) {
                try {
                    // Convert base64 to buffer
                    const base64Data = scan.thumbnail.split(',')[1];
                    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

                    children.push(
                        new Paragraph({
                            children: [
                                new ImageRun({
                                    data: imageBuffer,
                                    transformation: {
                                        width: 500,
                                        height: 300
                                    }
                                })
                            ],
                            spacing: { after: 200 }
                        })
                    );
                } catch (err) {
                    console.error('Error adding image to DOCX:', err);
                    children.push(
                        new Paragraph({
                            text: '(Thumbnail could not be loaded)',
                            italics: true,
                            spacing: { after: 200 }
                        })
                    );
                }
            }
        }

        // Scan Summary Table
        children.push(
            new Paragraph({
                text: 'Scan Summary',
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 200 }
            })
        );

        const scanTableRows = [
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: 'Scan Name', bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: 'Type', bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: 'Date', bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: 'Status', bold: true })] })
                ]
            }),
            ...vessel.scans.map(scan => new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph(scan.name)] }),
                    new TableCell({ children: [new Paragraph(scan.toolType.toUpperCase())] }),
                    new TableCell({ children: [new Paragraph(new Date(scan.timestamp).toLocaleDateString())] }),
                    new TableCell({ children: [new Paragraph(metadata.scanStatus || 'Completed')] })
                ]
            }))
        ];

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: scanTableRows
            })
        );

        // Findings
        if (metadata.findings) {
            children.push(
                new Paragraph({
                    text: 'Findings & Observations',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 300, after: 200 }
                }),
                new Paragraph({
                    text: metadata.findings,
                    spacing: { after: 200 }
                })
            );
        }

        // Recommendations
        if (metadata.recommendations) {
            children.push(
                new Paragraph({
                    text: 'Recommendations',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 300, after: 200 }
                }),
                new Paragraph({
                    text: metadata.recommendations,
                    spacing: { after: 200 }
                })
            );
        }

        // Scanning Log
        if (metadata.scanningLog && metadata.scanningLog.length > 0) {
            children.push(
                new Paragraph({
                    text: 'Scanning Log',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 300, after: 200 }
                })
            );

            // Create table for scanning log
            const scanningLogRows = [
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ text: 'Date & Time', bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: 'Operator', bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: 'Equipment', bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: 'Settings', bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: 'Temp (°C)', bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: 'Humidity (%)', bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: 'Notes', bold: true })] })
                    ]
                })
            ];

            for (const entry of metadata.scanningLog) {
                // Format datetime
                let formattedDateTime = 'N/A';
                if (entry.dateTime) {
                    try {
                        const date = new Date(entry.dateTime);
                        formattedDateTime = date.toLocaleString();
                    } catch (e) {
                        formattedDateTime = entry.dateTime;
                    }
                }

                scanningLogRows.push(
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph(formattedDateTime)] }),
                            new TableCell({ children: [new Paragraph(entry.operator || 'N/A')] }),
                            new TableCell({ children: [new Paragraph(entry.equipment || 'N/A')] }),
                            new TableCell({ children: [new Paragraph(entry.settings || 'N/A')] }),
                            new TableCell({ children: [new Paragraph(entry.temperature || 'N/A')] }),
                            new TableCell({ children: [new Paragraph(entry.humidity || 'N/A')] }),
                            new TableCell({ children: [new Paragraph(entry.notes || 'N/A')] })
                        ]
                    })
                );
            }

            children.push(
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: scanningLogRows
                })
            );
        }

        // Footer
        children.push(
            new Paragraph({
                text: `Generated by NDT Suite | ${new Date().toLocaleString()}`,
                alignment: AlignmentType.CENTER,
                spacing: { before: 400 }
            }),
            new Paragraph({
                text: 'This report is generated electronically and is valid without signature.',
                alignment: AlignmentType.CENTER,
                italics: true
            })
        );

        const doc = new Document({
            sections: [{
                properties: {},
                children: children
            }]
        });

        // Use Packer to create blob (needs to be imported from docx)
        const { Packer } = await import('docx');
        const blob = await Packer.toBlob(doc);
        return blob;
    }

    /**
     * Download the generated report
     * @param {Blob|string} report - Report data
     * @param {string} format - Format type
     * @param {string} filename - Base filename
     */
    downloadReport(report, format, filename) {
        if (format === 'html') {
            // For HTML, create a blob from the string
            const blob = new Blob([report], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.html`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            // For PDF and DOCX, report is already a blob
            const url = URL.createObjectURL(report);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Preview HTML report in new window
     * @param {string} html - HTML content
     */
    previewHTML(html) {
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
    }
}

// Create singleton instance
const reportGenerator = new ReportGenerator();

export default reportGenerator;
