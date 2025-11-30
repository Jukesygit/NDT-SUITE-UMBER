-- Competency Management System Schema
-- Phase 1: Core tables for training and competency tracking

-- Competency Categories (organize certifications into logical groups)
CREATE TABLE IF NOT EXISTS competency_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competency Definitions (define each certification/qualification type)
CREATE TABLE IF NOT EXISTS competency_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES competency_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'date', 'expiry_date', 'boolean', 'file', 'number')),
    requires_document BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, name)
);

-- Employee Competencies (actual competency records for each user)
CREATE TABLE IF NOT EXISTS employee_competencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    competency_id UUID REFERENCES competency_definitions(id) ON DELETE CASCADE,
    value TEXT, -- Stores the actual value (string, date, number, etc.)
    expiry_date TIMESTAMPTZ,
    document_url TEXT, -- URL to uploaded certificate/document
    document_name TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending_approval', 'rejected')),
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, competency_id)
);

-- Competency History (audit trail for all changes)
CREATE TABLE IF NOT EXISTS competency_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_competency_id UUID REFERENCES employee_competencies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    competency_id UUID REFERENCES competency_definitions(id),
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'approved', 'rejected', 'expired')),
    old_value TEXT,
    new_value TEXT,
    old_expiry_date TIMESTAMPTZ,
    new_expiry_date TIMESTAMPTZ,
    changed_by UUID REFERENCES auth.users(id),
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_competency_definitions_category ON competency_definitions(category_id);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_user ON employee_competencies(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_competency ON employee_competencies(competency_id);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_status ON employee_competencies(status);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_expiry ON employee_competencies(expiry_date);
CREATE INDEX IF NOT EXISTS idx_competency_history_employee ON competency_history(employee_competency_id);
CREATE INDEX IF NOT EXISTS idx_competency_history_user ON competency_history(user_id);

-- Enable Row Level Security
ALTER TABLE competency_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for competency_categories
-- All authenticated users can view categories
CREATE POLICY "Authenticated users can view competency categories"
    ON competency_categories FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can manage categories
CREATE POLICY "Only admins can manage competency categories"
    ON competency_categories FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- RLS Policies for competency_definitions
-- All authenticated users can view definitions
CREATE POLICY "Authenticated users can view competency definitions"
    ON competency_definitions FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can manage definitions
CREATE POLICY "Only admins can manage competency definitions"
    ON competency_definitions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- RLS Policies for employee_competencies
-- Users can view their own competencies, admins/org_admins can view all in their org
CREATE POLICY "Users can view competencies"
    ON employee_competencies FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR (p.role = 'org_admin' AND p.organization_id IN (
                    SELECT organization_id FROM profiles WHERE id = employee_competencies.user_id
                ))
            )
        )
    );

-- Users can create their own competencies, admins can create for anyone in their org
CREATE POLICY "Users can create competencies"
    ON employee_competencies FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR (p.role = 'org_admin' AND p.organization_id IN (
                    SELECT organization_id FROM profiles WHERE id = employee_competencies.user_id
                ))
            )
        )
    );

-- Users can update their own competencies, admins can update for anyone in their org
CREATE POLICY "Users can update competencies"
    ON employee_competencies FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR (p.role = 'org_admin' AND p.organization_id IN (
                    SELECT organization_id FROM profiles WHERE id = employee_competencies.user_id
                ))
            )
        )
    );

-- Only admins can delete competencies
CREATE POLICY "Admins can delete competencies"
    ON employee_competencies FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- RLS Policies for competency_history
-- Users can view their own history, admins can view all
CREATE POLICY "Users can view competency history"
    ON competency_history FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- Only system can insert history (via triggers)
CREATE POLICY "System can insert competency history"
    ON competency_history FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Function to automatically log competency changes
CREATE OR REPLACE FUNCTION log_competency_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            new_value,
            new_expiry_date,
            changed_by
        ) VALUES (
            NEW.id,
            NEW.user_id,
            NEW.competency_id,
            'created',
            NEW.value,
            NEW.expiry_date,
            auth.uid()
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            old_value,
            new_value,
            old_expiry_date,
            new_expiry_date,
            changed_by
        ) VALUES (
            NEW.id,
            NEW.user_id,
            NEW.competency_id,
            CASE
                WHEN NEW.status = 'active' AND OLD.status = 'pending_approval' THEN 'approved'
                WHEN NEW.status = 'rejected' THEN 'rejected'
                WHEN NEW.status = 'expired' THEN 'expired'
                ELSE 'updated'
            END,
            OLD.value,
            NEW.value,
            OLD.expiry_date,
            NEW.expiry_date,
            auth.uid()
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            old_value,
            old_expiry_date,
            changed_by
        ) VALUES (
            OLD.id,
            OLD.user_id,
            OLD.competency_id,
            'deleted',
            OLD.value,
            OLD.expiry_date,
            auth.uid()
        );
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log all competency changes
DROP TRIGGER IF EXISTS log_employee_competency_changes ON employee_competencies;
CREATE TRIGGER log_employee_competency_changes
    AFTER INSERT OR UPDATE OR DELETE ON employee_competencies
    FOR EACH ROW EXECUTE FUNCTION log_competency_change();

-- Trigger for updated_at
CREATE TRIGGER update_competency_categories_updated_at
    BEFORE UPDATE ON competency_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_competency_definitions_updated_at
    BEFORE UPDATE ON competency_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_competencies_updated_at
    BEFORE UPDATE ON employee_competencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check for expiring competencies
CREATE OR REPLACE FUNCTION get_expiring_competencies(days_threshold INTEGER DEFAULT 30)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    email TEXT,
    competency_name TEXT,
    expiry_date TIMESTAMPTZ,
    days_until_expiry INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.user_id,
        p.username,
        p.email,
        cd.name as competency_name,
        ec.expiry_date,
        EXTRACT(DAY FROM ec.expiry_date - NOW())::INTEGER as days_until_expiry
    FROM employee_competencies ec
    JOIN profiles p ON ec.user_id = p.id
    JOIN competency_definitions cd ON ec.competency_id = cd.id
    WHERE ec.expiry_date IS NOT NULL
        AND ec.expiry_date > NOW()
        AND ec.expiry_date <= (NOW() + INTERVAL '1 day' * days_threshold)
        AND ec.status = 'active'
    ORDER BY ec.expiry_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed default categories based on the CSV structure
INSERT INTO competency_categories (name, description, display_order) VALUES
    ('Personal Details', 'Basic employee information and contact details', 1),
    ('Induction & Workplace Health', 'Health and safety induction records', 2),
    ('Mandatory Offshore Training', 'Required offshore certifications and medical checks', 3),
    ('Onshore Training', 'Rope access, first aid, and onshore safety training', 4),
    ('Internal Training', 'Company-specific training records', 5),
    ('Professional Registration', 'Professional body memberships and registrations', 6),
    ('Plant, API and Visual Qualifications', 'Plant inspection and visual inspection certifications', 7),
    ('NDT Certifications', 'Non-Destructive Testing certifications (PAUT, TOFD, MUT, etc.)', 8),
    ('UAV Operations', 'Drone and UAV operation certifications', 9),
    ('Management Training', 'ISO and management system training', 10),
    ('GWO Training', 'Global Wind Organisation training modules', 11),
    ('Academic Qualifications', 'Degrees and diplomas', 12),
    ('Other Trades', 'Additional trade certifications', 13)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- NEXT STEP: Seed All Competency Definitions
-- ============================================================================
-- IMPORTANT: After running this schema, run the following command to populate
-- all 100+ competency definitions from the Training and Competency Matrix CSV:
--
--    Run: database/seed-all-competencies.sql
--
-- This will create definitions for:
--  - 7 Personal Details fields
--  - 14 Induction & Workplace Health fields
--  - 9 Mandatory Offshore Training certifications
--  - 10 Onshore Training certifications
--  - 1 Internal Training record
--  - 4 Professional Registration fields
--  - 15 Plant, API and Visual Qualifications
--  - 26 NDT Certifications (PAUT, TOFD, MUT, etc.)
--  - 5 UAV Operations certifications
--  - 2 Management Training courses
--  - 6 GWO Training modules
--  - 4 Academic Qualifications
--  - 4 Other Trades certifications
--
-- Total: 107 competency definitions across 13 categories
-- ============================================================================

COMMENT ON TABLE competency_categories IS 'Categories for organizing employee certifications and qualifications';
COMMENT ON TABLE competency_definitions IS 'Definitions of specific competencies, certifications, and qualifications';
COMMENT ON TABLE employee_competencies IS 'Actual competency records for each employee';
COMMENT ON TABLE competency_history IS 'Audit trail of all competency changes';
