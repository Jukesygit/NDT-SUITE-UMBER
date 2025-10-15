-- Script to identify and remove duplicate assets after transfer issues
-- Run this to find duplicates first, then manually delete the one you don't want

-- Find duplicate assets (same ID in multiple organizations)
SELECT
    a1.id,
    a1.name,
    a1.organization_id as org1_id,
    o1.name as org1_name,
    a2.organization_id as org2_id,
    o2.name as org2_name
FROM assets a1
JOIN assets a2 ON a1.id = a2.id AND a1.organization_id != a2.organization_id
JOIN organizations o1 ON a1.organization_id = o1.id
JOIN organizations o2 ON a2.organization_id = o2.id;

-- To delete the duplicate from SYSTEM org (if Matrix HQ should only be in Matrix):
-- DELETE FROM assets
-- WHERE id = '1760005463715_80wxv3qok'
-- AND organization_id = (SELECT id FROM organizations WHERE name = 'SYSTEM');

-- Or to delete from Matrix org (if it should only be in SYSTEM):
-- DELETE FROM assets
-- WHERE id = '1760005463715_80wxv3qok'
-- AND organization_id = (SELECT id FROM organizations WHERE name = 'Matrix');
