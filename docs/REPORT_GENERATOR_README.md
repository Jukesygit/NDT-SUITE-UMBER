# NDT Inspection Report Generator

## Overview

The automatic report generation tool creates comprehensive inspection reports from vessel data in multiple formats (HTML, PDF, and DOCX). This allows technicians to quickly generate professional reports and customize them as needed.

## Features

- **Multiple Output Formats:**
  - **HTML**: Web page for quick viewing and printing
  - **PDF**: Portable document for distribution
  - **DOCX**: Editable Word document for customization

- **Comprehensive Report Content:**
  - Report metadata (report number, inspector, client, location)
  - Asset and vessel information
  - All inspection scans with thumbnails
  - Vessel images
  - Scan summary table
  - Findings and observations (optional)
  - Recommendations (optional)

## How to Use

### 1. Access the Report Generator

1. Navigate to the **Data Hub** tool
2. Open an asset to view its vessels
3. Click the **three-dot menu** (⋮) next to any vessel
4. Select **📄 Generate Report** from the menu

### 2. Fill in Report Details

The report generation dialog will appear with the following fields:

#### Required Fields:
- **Report Number**: Enter the ONE database task reference number (e.g., `BLP-2024-4719-PAUT`)
- **Inspector Name**: Name of the inspector conducting the inspection
- **Client Name**: Company or client name
- **Location**: Site, city, and country where inspection took place

#### Optional Fields:
- **Scan Status**: Select from Completed, In Progress, Pending Review, or Approved
- **Inspection Description**: Describe the scope, objectives, and methodology
- **Findings & Observations**: Document defects, anomalies, or noteworthy observations
- **Recommendations**: Provide recommendations for follow-up actions or repairs

### 3. Select Output Formats

Choose one or more output formats:
- ✅ HTML (checked by default)
- ☐ PDF
- ✅ DOCX (checked by default)

### 4. Generate Report

1. Click the **Generate Report** button
2. The system will generate reports in all selected formats
3. Each report will be automatically downloaded to your browser's download folder
4. Filename format: `[ReportNumber]_[VesselName].[format]`

## Report Structure

### Header Section
- Report title and subtitle
- NDT logo and branding

### Report Information
Displays all metadata in a grid format:
- Report Number
- Report Date
- Inspector
- Client
- Asset Name
- Vessel Name
- Location
- Total Scans

### Inspection Scans
For each scan:
- Scan name and ID
- Scan type (PEC, CSCAN, 3D View)
- Date and time
- Thumbnail image (if available)

### Vessel Images
Gallery of all uploaded vessel images with captions

### Scan Summary Table
Tabular summary of all scans including:
- Scan name
- Type
- Date
- Status

### Findings & Observations
(If provided) Documented findings from the inspection

### Recommendations
(If provided) Recommended actions or repairs

### Footer
- Generated timestamp
- NDT Suite branding
- Electronic signature notice

## Editing Reports

### HTML Reports
- Can be opened in any web browser
- Use browser's "Print to PDF" feature for archiving
- Can be edited with HTML editors or converted to other formats

### PDF Reports
- Read-only format
- Professional appearance
- Suitable for distribution and archiving
- Can be annotated using PDF tools

### DOCX Reports (Recommended for Editing)
- **Fully editable** in Microsoft Word, Google Docs, or LibreOffice
- Technicians can:
  - Add or remove sections
  - Modify text and formatting
  - Insert additional images
  - Add tables or charts
  - Adjust layout and styling
  - Add company-specific headers/footers
  - Insert digital signatures

## Technical Details

### File Locations
- **Report Generator Module**: `src/report-generator.js`
- **Report Dialog Component**: `src/components/report-dialog.js`
- **Integration**: `src/tools/data-hub.js`

### Dependencies
- `docx`: Word document generation
- `jspdf`: PDF generation
- `pdfmake`: PDF formatting (backup)
- `html2canvas`: Canvas utilities (if needed)

### Data Sources
Reports pull data from:
- Asset information (from Data Manager)
- Vessel details (name, ID, 3D model status)
- All scans (name, type, timestamp, thumbnails)
- Vessel images (uploaded photos)
- User-provided metadata (inspector, client, findings, etc.)

## Customization

### Template Modifications
To customize report templates, edit the following methods in `src/report-generator.js`:

- `generateHTML()`: Modify HTML report structure and styling
- `generatePDF()`: Adjust PDF layout and content
- `generateDOCX()`: Change Word document structure

### Styling
HTML reports use embedded CSS. To modify:
1. Open `src/report-generator.js`
2. Find the `<style>` section in `generateHTML()`
3. Adjust colors, fonts, layout, etc.

### Adding Fields
To add new fields to reports:
1. Update the report dialog form in `src/components/report-dialog.js`
2. Add field handling in `generateHTML()`, `generatePDF()`, and `generateDOCX()`
3. Update the metadata collection in the dialog's `handleGenerate()` method

## Troubleshooting

### Report generation fails
- Check browser console for errors
- Ensure all required fields are filled
- Verify vessel has scan data

### Images not appearing
- Check that scan thumbnails are properly saved
- Verify vessel images are uploaded correctly
- Large images may take time to process

### DOCX files won't open
- Ensure Microsoft Word, Google Docs, or compatible software is installed
- Try re-generating the report
- Check file isn't corrupted during download

### PDF formatting issues
- Large images may affect layout
- Try reducing image sizes in scans
- Verify browser supports PDF generation

## Best Practices

1. **Always fill in the Report Number**: This is critical for tracking and organization
2. **Use consistent naming**: Follow your organization's naming conventions
3. **Add findings and recommendations**: These make reports more valuable
4. **Generate multiple formats**: Keep DOCX for editing, PDF for distribution
5. **Review before distributing**: Open and review generated reports before sending to clients
6. **Save to appropriate location**: Move reports from Downloads to proper project folders

## Future Enhancements

Possible future features:
- Company logo upload
- Custom templates
- Batch report generation (multiple vessels)
- Email integration
- Cloud storage integration
- Report versioning
- Digital signature support
- Report approval workflow

## Support

For issues or feature requests, contact the development team or check the project repository.

---

**Generated by NDT Suite Report Generator**
Version 1.0.0
