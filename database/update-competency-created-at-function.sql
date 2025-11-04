-- Function to update the created_at field for employee competencies
-- This is needed because created_at typically has a DEFAULT NOW() constraint
-- and cannot be directly updated through normal UPDATE statements

CREATE OR REPLACE FUNCTION update_competency_created_at(
    p_user_id UUID,
    p_competency_id UUID,
    p_created_at TIMESTAMPTZ
)
RETURNS void AS $$
BEGIN
    -- Only allow admins and org_admins to update this
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'org_admin')
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;

    -- Update the created_at field
    UPDATE employee_competencies
    SET created_at = p_created_at
    WHERE user_id = p_user_id
    AND competency_id = p_competency_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Competency not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_competency_created_at(UUID, UUID, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION update_competency_created_at IS 'Allows admins to update the issued/created date of an employee competency';
