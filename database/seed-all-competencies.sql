-- Complete Competency Definitions Seeding
-- This populates all fields from the Training and Competency Matrix CSV

-- Helper function to get category ID
CREATE OR REPLACE FUNCTION get_category_id(category_name TEXT)
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT id FROM competency_categories WHERE name = category_name LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- PERSONAL DETAILS
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Personal Details'), 'Date of Birth', 'date', false, 1),
    (get_category_id('Personal Details'), 'Mobile Number', 'text', false, 2),
    (get_category_id('Personal Details'), 'Email Address', 'text', false, 3),
    (get_category_id('Personal Details'), 'Home Address', 'text', false, 4),
    (get_category_id('Personal Details'), 'Nearest UK Train Station', 'text', false, 5),
    (get_category_id('Personal Details'), 'Next of Kin / Emergency Contact Name', 'text', false, 6),
    (get_category_id('Personal Details'), 'Next of Kin / Emergency Contact Number', 'text', false, 7)
ON CONFLICT (category_id, name) DO NOTHING;

-- INDUCTION & WORKPLACE HEALTH
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Induction & Workplace Health'), 'Certificate of Incorporation', 'text', true, 1),
    (get_category_id('Induction & Workplace Health'), 'Company Number', 'text', false, 2),
    (get_category_id('Induction & Workplace Health'), 'Company Insurance Expiry Date', 'expiry_date', true, 3),
    (get_category_id('Induction & Workplace Health'), 'H&S Induction Completed', 'boolean', true, 4),
    (get_category_id('Induction & Workplace Health'), 'DSE Questionnaire Completed', 'boolean', true, 5),
    (get_category_id('Induction & Workplace Health'), 'Driving Licence Expiry Date', 'expiry_date', true, 6),
    (get_category_id('Induction & Workplace Health'), 'Passport Primary', 'text', false, 7),
    (get_category_id('Induction & Workplace Health'), 'Primary Passport Expiry', 'expiry_date', true, 8),
    (get_category_id('Induction & Workplace Health'), 'Passport Secondary', 'text', false, 9),
    (get_category_id('Induction & Workplace Health'), 'Passport Secondary Expiry', 'expiry_date', true, 10),
    (get_category_id('Induction & Workplace Health'), 'Pension Information', 'text', false, 11),
    (get_category_id('Induction & Workplace Health'), 'PPE Issued', 'boolean', false, 12),
    (get_category_id('Induction & Workplace Health'), 'Policies & Procedures Issued (Quality, H&S, Environmental & Impartiality)', 'boolean', true, 13),
    (get_category_id('Induction & Workplace Health'), 'Vantage No', 'text', false, 14)
ON CONFLICT (category_id, name) DO NOTHING;

-- MANDATORY OFFSHORE TRAINING
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Mandatory Offshore Training'), 'BOSIET / FOET Expiry Date', 'expiry_date', true, 1),
    (get_category_id('Mandatory Offshore Training'), 'Norwegian Escape Chute Expiry Date', 'expiry_date', true, 2),
    (get_category_id('Mandatory Offshore Training'), 'Offshore Medical Expiry Date', 'expiry_date', true, 3),
    (get_category_id('Mandatory Offshore Training'), 'Audiometry Expiry Date', 'expiry_date', true, 4),
    (get_category_id('Mandatory Offshore Training'), 'MIST Expiry Date', 'expiry_date', true, 5),
    (get_category_id('Mandatory Offshore Training'), 'DONUT Escape training Expiry Date', 'expiry_date', true, 6),
    (get_category_id('Mandatory Offshore Training'), 'PSL 44 Vision Test Expiry', 'expiry_date', true, 7),
    (get_category_id('Mandatory Offshore Training'), 'Bideltiod Measurement', 'text', false, 8),
    (get_category_id('Mandatory Offshore Training'), 'CCNSG / CSCS Safety Passport Expiry Date', 'expiry_date', true, 9)
ON CONFLICT (category_id, name) DO NOTHING;

-- ONSHORE TRAINING
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Onshore Training'), 'IRATA Level and No.', 'text', true, 1),
    (get_category_id('Onshore Training'), 'IRATA Expiry Date', 'expiry_date', true, 2),
    (get_category_id('Onshore Training'), 'Logbook Entry', 'boolean', false, 3),
    (get_category_id('Onshore Training'), 'Logbook - 6 Monthly Check Due', 'expiry_date', false, 4),
    (get_category_id('Onshore Training'), 'First Aid at Work Expiry', 'expiry_date', true, 5),
    (get_category_id('Onshore Training'), 'Anti corruption and Bribery', 'boolean', true, 6),
    (get_category_id('Onshore Training'), 'IOSH', 'boolean', true, 7),
    (get_category_id('Onshore Training'), 'Fire Warden', 'boolean', true, 8),
    (get_category_id('Onshore Training'), 'Defib', 'boolean', true, 9),
    (get_category_id('Onshore Training'), 'Confined Space Entry', 'boolean', true, 10)
ON CONFLICT (category_id, name) DO NOTHING;

-- INTERNAL TRAINING
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Internal Training'), 'MAI-F-IMS-008 Record of Internal Training R03', 'boolean', true, 1)
ON CONFLICT (category_id, name) DO NOTHING;

-- PROFESSIONAL REGISTRATION
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Professional Registration'), 'IEng Incorporated Engineer', 'text', true, 1),
    (get_category_id('Professional Registration'), 'Engtech Engineering Technician', 'text', true, 2),
    (get_category_id('Professional Registration'), 'Project Management (PFQ/PMQ)', 'text', true, 3),
    (get_category_id('Professional Registration'), 'BINDT Registration', 'text', true, 4)
ON CONFLICT (category_id, name) DO NOTHING;

-- PLANT, API AND VISUAL QUALIFICATIONS
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Plant, API and Visual Qualifications'), 'ASME Plant Inspection L3', 'expiry_date', true, 1),
    (get_category_id('Plant, API and Visual Qualifications'), 'ASME Plant Inspection L2', 'expiry_date', true, 2),
    (get_category_id('Plant, API and Visual Qualifications'), 'ASME Plant Inspection L1', 'expiry_date', true, 3),
    (get_category_id('Plant, API and Visual Qualifications'), 'API 510 Pressure Vessel', 'expiry_date', true, 4),
    (get_category_id('Plant, API and Visual Qualifications'), 'API 570 Pipework', 'expiry_date', true, 5),
    (get_category_id('Plant, API and Visual Qualifications'), 'API 653 Storage Tanks', 'expiry_date', true, 6),
    (get_category_id('Plant, API and Visual Qualifications'), 'CSWIP Plant Inspector Level 3', 'expiry_date', true, 7),
    (get_category_id('Plant, API and Visual Qualifications'), 'CSWIP Plant Inspector Level 2', 'expiry_date', true, 8),
    (get_category_id('Plant, API and Visual Qualifications'), 'CSWIP 3.2 (Snr Weld Inspector)', 'expiry_date', true, 9),
    (get_category_id('Plant, API and Visual Qualifications'), 'CSWIP 3.1 (Weld Inspector)', 'expiry_date', true, 10),
    (get_category_id('Plant, API and Visual Qualifications'), 'CSWIP 3.0 (Visual Inspection)', 'expiry_date', true, 11),
    (get_category_id('Plant, API and Visual Qualifications'), 'Flange Face Inspection and Remedials', 'boolean', true, 12),
    (get_category_id('Plant, API and Visual Qualifications'), 'ICorr Painting Inspector Level 1', 'expiry_date', true, 13),
    (get_category_id('Plant, API and Visual Qualifications'), 'Certs signed by candidate', 'boolean', false, 14),
    (get_category_id('Plant, API and Visual Qualifications'), 'Ceaform In House Training', 'boolean', true, 15)
ON CONFLICT (category_id, name) DO NOTHING;

-- NDT CERTIFICATIONS
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('NDT Certifications'), 'PCN Number', 'text', false, 1),
    (get_category_id('NDT Certifications'), 'EN 9712 PAUT L3', 'expiry_date', true, 2),
    (get_category_id('NDT Certifications'), 'EN 9712 TOFD L3', 'expiry_date', true, 3),
    (get_category_id('NDT Certifications'), 'EN 9712 MUT L3', 'expiry_date', true, 4),
    (get_category_id('NDT Certifications'), 'EN 9712 PAUT L2', 'expiry_date', true, 5),
    (get_category_id('NDT Certifications'), 'EN 9712 PAUT L2 - Matrix competency witness inspection', 'boolean', false, 6),
    (get_category_id('NDT Certifications'), 'EN 9712 TOFD L2', 'expiry_date', true, 7),
    (get_category_id('NDT Certifications'), 'EN 9712 TOFD L2 - Matrix competency witness inspection', 'boolean', false, 8),
    (get_category_id('NDT Certifications'), 'EN 9712 RAD L2', 'expiry_date', true, 9),
    (get_category_id('NDT Certifications'), 'EN 9712 RAD L2 - Matrix competency witness inspection', 'boolean', false, 10),
    (get_category_id('NDT Certifications'), 'Basic Radiation Safety', 'expiry_date', true, 11),
    (get_category_id('NDT Certifications'), 'Basic Radiation Safety - Matrix competency witness inspection', 'boolean', false, 12),
    (get_category_id('NDT Certifications'), 'EN 9712 MUT L2 3.8/3.9', 'expiry_date', true, 13),
    (get_category_id('NDT Certifications'), 'EN 9712 MUT L2 3.8/3.9 - Matrix competency witness inspection', 'boolean', false, 14),
    (get_category_id('NDT Certifications'), 'EN 9712 MUT L2 3.1/3.2', 'expiry_date', true, 15),
    (get_category_id('NDT Certifications'), 'EN 9712 MUT L2 3.1/3.2 - Matrix competency witness inspection', 'boolean', false, 16),
    (get_category_id('NDT Certifications'), 'PEC L2 Training', 'expiry_date', true, 17),
    (get_category_id('NDT Certifications'), 'PEC L2 Training - Matrix competency witness inspection', 'boolean', false, 18),
    (get_category_id('NDT Certifications'), 'EN 9712 ECI L2', 'expiry_date', true, 19),
    (get_category_id('NDT Certifications'), 'EN 9712 ECI L2 - Matrix competency witness inspection', 'boolean', false, 20),
    (get_category_id('NDT Certifications'), 'EN 9712 MPI L2', 'expiry_date', true, 21),
    (get_category_id('NDT Certifications'), 'EN 9712 MPI L2 - Matrix competency witness inspection', 'boolean', false, 22),
    (get_category_id('NDT Certifications'), 'EN 9712 LPI L2', 'expiry_date', true, 23),
    (get_category_id('NDT Certifications'), 'EN 9712 LPI L2 - Matrix competency witness inspection', 'boolean', false, 24),
    (get_category_id('NDT Certifications'), 'EN 9712 VIS L2', 'expiry_date', true, 25),
    (get_category_id('NDT Certifications'), 'EN 9712 VIS L2 - Matrix competency witness inspection', 'boolean', false, 26)
ON CONFLICT (category_id, name) DO NOTHING;

-- UAV OPERATIONS
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('UAV Operations'), 'CAA PFCO / GVC Multi Rotor', 'expiry_date', true, 1),
    (get_category_id('UAV Operations'), 'Flyer ID', 'text', false, 2),
    (get_category_id('UAV Operations'), 'Internal TRG', 'boolean', true, 3),
    (get_category_id('UAV Operations'), 'Currency 350', 'boolean', false, 4),
    (get_category_id('UAV Operations'), 'Elios 2', 'boolean', true, 5)
ON CONFLICT (category_id, name) DO NOTHING;

-- MANAGEMENT TRAINING
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Management Training'), 'ISO 17020 Awareness training', 'boolean', true, 1),
    (get_category_id('Management Training'), 'ISO 9001 Training', 'boolean', true, 2)
ON CONFLICT (category_id, name) DO NOTHING;

-- GWO TRAINING (Global Wind Organisation)
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('GWO Training'), 'Fire Awareness', 'expiry_date', true, 1),
    (get_category_id('GWO Training'), 'First Aid', 'expiry_date', true, 2),
    (get_category_id('GWO Training'), 'Sea Survival', 'expiry_date', true, 3),
    (get_category_id('GWO Training'), 'Working at Height', 'expiry_date', true, 4),
    (get_category_id('GWO Training'), 'Manual Handling', 'expiry_date', true, 5),
    (get_category_id('GWO Training'), 'Blade Repair', 'expiry_date', true, 6)
ON CONFLICT (category_id, name) DO NOTHING;

-- ACADEMIC QUALIFICATIONS
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Academic Qualifications'), 'Degree', 'text', true, 1),
    (get_category_id('Academic Qualifications'), 'HND Higher National Diploma', 'text', true, 2),
    (get_category_id('Academic Qualifications'), 'HNC Higher National Certificate', 'text', true, 3),
    (get_category_id('Academic Qualifications'), 'NC National Certificate', 'text', true, 4)
ON CONFLICT (category_id, name) DO NOTHING;

-- OTHER TRADES
INSERT INTO competency_definitions (category_id, name, field_type, requires_document, display_order) VALUES
    (get_category_id('Other Trades'), 'Electrician', 'boolean', true, 1),
    (get_category_id('Other Trades'), 'Leg Entry', 'boolean', true, 2),
    (get_category_id('Other Trades'), 'Rigger Competence Stage 3', 'boolean', true, 3),
    (get_category_id('Other Trades'), 'Rigger Competence Level 4', 'boolean', true, 4)
ON CONFLICT (category_id, name) DO NOTHING;

-- Clean up helper function
DROP FUNCTION IF EXISTS get_category_id(TEXT);

-- Verify the seeding
SELECT
    cc.name as category,
    COUNT(cd.id) as competency_count
FROM competency_categories cc
LEFT JOIN competency_definitions cd ON cd.category_id = cc.id
GROUP BY cc.id, cc.name
ORDER BY cc.display_order;

COMMENT ON SCHEMA public IS 'All competency definitions from Training and Competency Matrix have been seeded';
