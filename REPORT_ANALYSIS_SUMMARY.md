# NDT Inspection Report Analysis Summary

## Overview
**Date:** October 14, 2025
**Total Reports Analyzed:** 12 DOCX files
**Location:** C:\Users\jonas\OneDrive\Desktop\NII Reports examples

## Reports Analyzed
1. ARM-2025-3189-PAUT-ARM-2023-129-PS.docx
2. BLP-2024-4719-PAUT.docx
3. BRT-2024-9267-PAUT-V-1401.docx
4. BRT-2025-359-PAUT-X-0511.docx
5. LOM-2025-4884-PAUT-V-2801-1.docx
6. LOM-2025-5193-PAUT-3-HC-37711.docx
7. LOM-2025-5194-PAUT-2-DH-37713.docx
8. LOM-2025-5306-PAUT-2-HC-37007.docx
9. LOM-2025-5307-PAUT-2-HC-37001.docx
10. LOM-2025-5308-PAUT-2-HC-37008.docx
11. NEV-2025-4974-PAUT-H-1701-1.docx
12. NEV-2025-5569-PAUT (V-0320-1).docx

---

## CRITICAL MISSING FIELDS

### High Priority - Component Information
These fields appear in 11/12 reports and are ESSENTIAL:

1. **Description** - Full inspection description
   - Examples: "PAUT on anomaly ARM-2023-129-PS", "PAUT Hydroform testing of MEG Flash Separator Recycle Heater A"
   - **Status:** MISSING - needs text area field

2. **Line/Tag Number** - Component identifier
   - Examples: "V-1401", "X-0511", "3"-HC-37711-GC4", "2"-HC-37001-GC4"
   - **Status:** MISSING - needs text field

3. **Drawing Number** - Technical drawing reference
   - Examples: "BG-ARMA-A1-00-07-83-01-04213", "C5117/8001", "02813-NEV-V-0320-1"
   - **Status:** MISSING - needs text field

### High Priority - Material & Coating Information

4. **Coating Type** (11/12 reports)
   - **Status:** MISSING - needs dropdown
   - **Options:** Painted, Uncoated, Coated, N/A

5. **Temperature** (11/12 reports)
   - **Status:** MISSING - needs dropdown/text combo
   - **Options:** Ambient, Ambient (Isolated), Hot (with temperature field), Cold

6. **Stress Relief** (11/12 reports)
   - **Status:** MISSING - needs dropdown
   - **Options:** N/A, Yes, No, Unknown

7. **Nominal Thickness** (11/12 reports)
   - **Status:** MISSING - needs numeric field with "mm" unit
   - Example: "25mm"

8. **Corrosion Allowance** (11/12 reports)
   - **Status:** MISSING - needs numeric field with "mm" unit
   - Examples: "0mm", "3.0mm"

### High Priority - Procedure & Standards

9. **Technique Nos** (11/12 reports)
   - **Status:** MISSING - needs dropdown/text
   - **Options:** MAI-T-NDT-015-PAUT R01, Corrosion Mapping, N/A, Custom

10. **Applicable Standard** (11/12 reports)
    - **Status:** MISSING - needs dropdown
    - **Options:** BS EN ISO 16809:2019, BS EN ISO 13588, HBR-GBR-TAS-PRC-0011, Other

---

## EQUIPMENT FIELDS MISSING

### Equipment Details

11. **Serial No** (for equipment)
    - Examples: "Gekko 1239", "QC-0096426"
    - **Status:** MISSING - needs text field

12. **Wedge** (11/12 reports)
    - **Status:** MISSING - needs dropdown/text
    - **Options:** 0° Curved wedge, 10mm Curved 20/38/18, Custom

13. **Scanner Frame** (multiple reports)
    - Example: "10mm Curved 20/38/18"
    - **Status:** MISSING - needs text field

14. **Ref Blocks** (11/12 reports)
    - **Status:** MISSING - needs text field

15. **Couplant** (11/12 reports)
    - **Status:** MISSING - needs dropdown
    - **Options:** Sonagel, Water, Gel, Other

---

## INSPECTION RESULTS FIELDS MISSING

### Coverage and Setup Information

16. **Vessel Coverage**
    - Examples: "The overall target coverage of the vessel shell was 50%. >65% coverage achieved."
    - **Status:** MISSING - needs text area

17. **Provision of datum points**
    - Description: Index (X/Y) and Scan datum information
    - **Status:** MISSING - needs structured fields (Index Datum, Scan Datum)

18. **Scan sensitivity**
    - Examples: "A minimum scan sensitivity of reference +14dB has been used"
    - **Status:** MISSING - needs text field

19. **Restrictions**
    - Examples: "Scan Restrictions included saddles, nozzles, nameplate, and external pipework"
    - **Status:** MISSING - needs text area

### Per-Scan Documentation

20. **Feature / Description** (per scan in scanning log)
    - Examples: "Vessel Shell – Code C internal corrosion", "Shell Anomaly Code D"
    - **Status:** MISSING - needs column in scanning log table

21. **Analysis / Interpretation** (per scan)
    - Detailed interpretation of scan results with measurements and codes
    - **Status:** MISSING - needs large text area for each scan entry

---

## CALIBRATION FIELDS MISSING

22. **Calibration Block Velocity**
    - Examples: "5890 m/sec ±30m/sec", "5920 m/sec ±30m/sec"
    - **Status:** MISSING - needs velocity field + tolerance field

23. **Calibration measurements note**
    - Standard text: "All dimensions & measurements in mm"
    - **Status:** MISSING - could be auto-generated

---

## PHOTO & DOCUMENTATION FIELDS MISSING

24. **Inspection Results – Condition Photos section**
    - **Status:** MISSING - needs photo upload section with captions

25. **Photo captions** (per photo)
    - Examples: "Photo 1: Stand-off photo of the vessel", "Photo 2: General condition of the top dome"
    - **Status:** MISSING - needs caption text field for each uploaded photo

26. **Inspection Results – Plot plan showing test location**
    - **Status:** MISSING - needs image insertion capability

27. **Inspection Results – PACMAP Composite Image**
    - **Status:** MISSING - needs image section for composite scans

---

## PERSONNEL & REVIEW FIELDS MISSING

28. **Reviewed / Client Acceptance section** (11/12 reports)
    - Separate section for reviewer name, qualification, signature, and date
    - **Status:** MISSING - needs complete reviewer section mirroring technician section

29. **Equipment Checks checkbox/confirmation**
    - Standard text: "Equipment Checks in accordance with MAI-F-NDT-019 PAUT Equipment Checks completed"
    - **Status:** MISSING - needs checkbox or confirmation field

---

## PHASED ARRAY CONFIGURATION - ENHANCEMENT NEEDED

The "Phased Array Beamset Configuration" section exists but needs enhancement with these sub-fields:

- **Group/Type** (Type, Active Elements)
- **Angle** (0°, Linear at 0°, etc.)
- **Skew** (0°, etc.)
- **Active Elements** (1-64, Tx: 1-63 Rx: 2-64, etc.)
- **Mode** (Pulse Echo, etc.)
- **Filter** (BP 5MHz, etc.)
- **Gain Offset** (None, numeric value)
- **Focus Range** (40mm, etc.)
- **PRF** (Pulse Repetition Frequency)

**Status:** PARTIALLY IMPLEMENTED - needs detailed configuration table/form

---

## RECOMMENDED DROPDOWN OPTIONS

### Material (enhance existing)
- Carbon Steel
- Duplex
- Duplex/Super Duplex
- Stainless Steel
- Other (with text field)

### Coating Type (NEW)
- Painted
- Uncoated
- Coated
- N/A

### Temperature (NEW)
- Ambient
- Ambient (Isolated)
- Hot (with custom temperature field)
- Cold

### Stress Relief (NEW)
- N/A
- Yes
- No
- Unknown

### Couplant (NEW)
- Sonagel
- Water
- Gel
- Other (with text field)

### Equipment Model (enhance existing)
- Eddyfi Gekko
- Omniscan X4
- Other (with text field)

### Applicable Standard (NEW)
- BS EN ISO 16809:2019
- BS EN ISO 13588
- HBR-GBR-TAS-PRC-0011
- Other (with text field)

---

## SCANNING LOG TABLE ENHANCEMENTS

Current scanning log table should include these columns:

1. **Scan File Name** (exists)
2. **Feature/Description** (MISSING - add column)
3. **Location** (exists)
4. **Reading** (exists)
5. **Code** (exists - verify present)
6. **Comments** (exists)
7. **Analysis/Interpretation** (MISSING - add large text field or link to detailed view)

Additionally, some reports use:
- **Phased Array Manual Raster Scan log** (different table format - consider as alternative template)

---

## EXISTING FIELDS TO VERIFY

These fields appear to exist but should be verified for completeness:

1. **Procedure No** - verify location and format consistency
2. **Acceptance Criteria** - verify location
3. **Technician** - verify format matches reports
4. **Equipment/Equip. Model** - verify completeness
5. **Probe** - verify with standardized options
6. **Calibration Blocks** - verify field name and location
7. **Material** - enhance with dropdown options
8. **Date** - verify format consistency (DD/MM/YYYY vs DD/MM/YY)
9. **Qualification** - standardize format
10. **Signature** - verify implementation

---

## STANDARDIZED TEXT SNIPPETS

Consider auto-populating these common phrases:

### Calibration Section
"All dimensions & measurements in mm. Calibration Block Velocity: 5920 m/sec ±30m/sec."

### Equipment Checks
"Equipment Checks in accordance with MAI-F-NDT-019 PAUT Equipment Checks completed"

---

## REPORT FILENAME PATTERNS

Reports follow these naming conventions:
- `{SITE}-{YEAR}-{NUMBER}-PAUT-{COMPONENT}.docx`
- Examples: "LOM-2025-5307-PAUT-2-HC-37001.docx", "NEV-2025-5569-PAUT (V-0320-1).docx"

Consider using similar auto-naming for generated reports based on:
- Site code
- Year
- Report number
- Component tag

---

## IMPLEMENTATION PRIORITY

### Phase 1: Critical Component Fields (Highest Priority)
1. Description
2. Line/Tag Number
3. Drawing Number
4. Coating Type (dropdown)
5. Temperature (dropdown/text)
6. Stress Relief (dropdown)
7. Nominal Thickness
8. Corrosion Allowance

### Phase 2: Equipment & Procedures
9. Technique Nos
10. Applicable Standard (dropdown)
11. Serial No
12. Wedge
13. Scanner Frame
14. Ref Blocks
15. Couplant (dropdown)

### Phase 3: Inspection Results Enhancement
16. Vessel Coverage
17. Datum points (structured fields)
18. Scan sensitivity
19. Restrictions
20. Feature/Description (in scanning log)
21. Analysis/Interpretation (per scan)

### Phase 4: Calibration & Documentation
22. Calibration Block Velocity
23. Calibration note (auto-generate)
24. Photo section with captions
25. Plot plan image insertion
26. PACMAP image section

### Phase 5: Personnel & Review
27. Reviewer/Client Acceptance section
28. Equipment Checks confirmation

### Phase 6: Advanced Configuration
29. Enhanced Phased Array Beamset Configuration table
30. Alternative scanning log formats

---

## FILES GENERATED

Three JSON files have been created in the working directory:

1. **report_analysis_results.json** - Basic analysis with all extracted field labels, equipment info, materials, procedures, etc.

2. **detailed_report_analysis.json** - Detailed field mappings with frequency counts and all unique values found

3. **COMPREHENSIVE_REPORT_ANALYSIS.json** - Comprehensive structured summary with current status for each field and recommended implementations

---

## SUMMARY STATISTICS

- **Total unique field labels found:** 239
- **Critical fields appearing in 11-12 reports:** 15
- **Equipment-related fields:** 9
- **Critical missing fields:** 25+
- **Recommended new dropdown fields:** 7
- **Standard equipment models found:** 3 (Eddyfi Gekko, Omniscan X4, and variants)
- **Standard probe types found:** 4+ variations
- **Common procedures:** MAI-P-NDT-009-PAUT (various revisions)
- **Common standards:** BS EN ISO 16809:2019, BS EN ISO 13588, HBR-GBR-TAS-PRC-0011

---

## CONCLUSION

The current NDT report generator is missing approximately **25-30 critical fields** that appear consistently across the analyzed reports. The highest priority additions should be:

1. Component identification fields (Description, Line/Tag Number, Drawing Number)
2. Material/coating properties (Coating Type, Temperature, Stress Relief, Nominal Thickness, Corrosion Allowance)
3. Equipment details (Couplant, Wedge, Scanner Frame, Serial No, Ref Blocks)
4. Standards and techniques (Technique Nos, Applicable Standard)
5. Enhanced scanning log (Feature/Description, Analysis/Interpretation columns)
6. Reviewer/Client Acceptance section

Implementing these fields with the recommended dropdown options will bring the report generator into full compliance with the actual reports being used in the field.
