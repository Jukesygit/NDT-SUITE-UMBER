# NII Calculator Discrepancies Analysis

## Critical Differences Found Between Excel and Web App

### 1. **Circumference Calculation (MAJOR ISSUE)**
**Excel Formula:** `=PI()*(B6+(2*(B7)))` where B6=ID and B7=WT
**Excel Logic:** Uses Outside Diameter (OD) = ID + (2 × WT)
**Web App:** `Math.PI * id` - Uses only Inside Diameter
**Impact:** This will result in significantly different circumference values

### 2. **Dome Ends Projected Area (MAJOR ISSUE)**
**Excel Formula:** `=2*(1.09*((ID+2*WT)^2)/1000000)`
**Excel Logic:**
- Uses 2 domes (multiplied by 2)
- Applies a 1.09 factor (likely for elliptical heads)
- Based on OD not ID
**Web App:** `(Math.PI * radius * radius) / 1000000` where radius = ID/2
**Web App Logic:**
- Single dome only
- No 1.09 factor
- Based on ID not OD
**Impact:** Excel result will be ~4.36x larger than web app

### 3. **Grid Calculations**
**Excel:** Uses 0.25 m² per grid (250×250mm becomes 0.0625 m² but formula divides by 0.25)
**Web App:** Uses 0.0625 m² per grid (250×250mm)
**Impact:** Excel will show 4x fewer grids than the web app

### 4. **PAUT Calculations**
**Excel:**
- Scan Time: `ROUNDUP((accessFactor * grids), 0)`
- Analysis Time: `ROUNDUP((scanTime/2), 1)`
- Report Time: `ROUNDUP((analysisTime/2), 1)`

**Web App:**
- Scan Time: `grids * accessFactor`
- Analysis Time: `grids * 0.125`
- Report Time: `grids * 0.042`

**Impact:** Completely different calculation methods for times

### 5. **PEC Calculations**
**Excel:**
- Access Factor: Divides PAUT access factor by 1.5
- Analysis: Same as PAUT `ROUNDUP((scanTime/2), 1)`
- Report: Same as PAUT `ROUNDUP((analysisTime/2), 1)`

**Web App:**
- Access Factor: Fixed at 0.33
- Analysis Time: `grids * 0.167`
- Report Time: `grids * 0.083`

### 6. **TOFD Calculations**
**Excel Formula:**
- Scan Time: `ROUNDUP((((accessFactor*groups)/1000)*length), 0)`
- Analysis Time: `ROUNDUP((scanTime/3.33), 0)`
- Report Time: `ROUNDUP((analysisTime/3), 0)`

**Web App:**
- Scan Time: `groups * 1.6`
- Analysis Time: `groups * 0.6`
- Report Time: `groups * 0.2`

**Impact:** Excel includes length in calculation, web app doesn't

### 7. **NII Assessment Areas**
**Excel:**
- PAUT: 40% of total surface area
- PEC: 40% of (shell area + dome area)

**Web App:**
- PAUT: 30% of total area
- PEC: 80% of total area

### 8. **Rounding Differences**
Excel uses `ROUNDUP` extensively, web app doesn't round intermediate calculations

## Summary of Required Fixes

1. Fix circumference to use OD instead of ID
2. Fix dome area calculation (2x multiplier, 1.09 factor, use OD)
3. Change grid size from 0.0625 to 0.25 for division
4. Implement Excel's time calculation formulas
5. Fix PEC access factor relationship to PAUT
6. Include length in TOFD calculations
7. Update NII assessment percentages
8. Add ROUNDUP for all calculations matching Excel