-- Competency Comments Feature
-- Allows commenting on competencies, especially useful for tracking expiring certifications

-- Create competency_comments table
CREATE TABLE IF NOT EXISTS competency_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_competency_id UUID REFERENCES employee_competencies(id) ON DELETE CASCADE NOT NULL,
    comment_text TEXT NOT NULL,
    comment_type TEXT DEFAULT 'general' CHECK (comment_type IN ('general', 'expiry_update', 'renewal_in_progress', 'renewal_completed', 'unable_to_renew', 'escalation')),
    is_pinned BOOLEAN DEFAULT false, -- Pin important comments to top
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Metadata fields
    mentioned_users UUID[], -- Array of user IDs mentioned in comment
    attachments JSONB DEFAULT '[]'::jsonb -- Store attachment metadata
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_competency_comments_employee_competency ON competency_comments(employee_competency_id);
CREATE INDEX IF NOT EXISTS idx_competency_comments_created_by ON competency_comments(created_by);
CREATE INDEX IF NOT EXISTS idx_competency_comments_created_at ON competency_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competency_comments_type ON competency_comments(comment_type);
CREATE INDEX IF NOT EXISTS idx_competency_comments_pinned ON competency_comments(is_pinned) WHERE is_pinned = true;

-- Enable Row Level Security
ALTER TABLE competency_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for competency_comments
-- Users can view comments on their own competencies, admins can view all
CREATE POLICY "Users can view competency comments"
    ON competency_comments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM employee_competencies ec
            WHERE ec.id = competency_comments.employee_competency_id
            AND (
                ec.user_id = auth.uid()
                OR
                EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND (
                        p.role = 'admin'
                        OR (p.role = 'org_admin' AND p.organization_id IN (
                            SELECT organization_id FROM profiles WHERE id = ec.user_id
                        ))
                    )
                )
            )
        )
    );

-- Users can create comments on competencies they can view
CREATE POLICY "Users can create competency comments"
    ON competency_comments FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employee_competencies ec
            WHERE ec.id = competency_comments.employee_competency_id
            AND (
                ec.user_id = auth.uid()
                OR
                EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND (
                        p.role = 'admin'
                        OR (p.role = 'org_admin' AND p.organization_id IN (
                            SELECT organization_id FROM profiles WHERE id = ec.user_id
                        ))
                    )
                )
            )
        )
    );

-- Users can update their own comments, admins can update all
CREATE POLICY "Users can update own competency comments"
    ON competency_comments FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- Users can delete their own comments, admins can delete all
CREATE POLICY "Users can delete own competency comments"
    ON competency_comments FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_competency_comments_updated_at
    BEFORE UPDATE ON competency_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get competencies with recent comments
CREATE OR REPLACE FUNCTION get_competencies_with_comments(
    p_user_id UUID DEFAULT NULL,
    p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
    competency_id UUID,
    competency_name TEXT,
    user_id UUID,
    username TEXT,
    comment_count BIGINT,
    latest_comment TEXT,
    latest_comment_date TIMESTAMPTZ,
    has_pinned_comments BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.id as competency_id,
        cd.name as competency_name,
        ec.user_id,
        p.username,
        COUNT(cc.id) as comment_count,
        (
            SELECT comment_text
            FROM competency_comments
            WHERE employee_competency_id = ec.id
            ORDER BY created_at DESC
            LIMIT 1
        ) as latest_comment,
        MAX(cc.created_at) as latest_comment_date,
        BOOL_OR(cc.is_pinned) as has_pinned_comments
    FROM employee_competencies ec
    JOIN competency_definitions cd ON ec.competency_id = cd.id
    JOIN profiles p ON ec.user_id = p.id
    LEFT JOIN competency_comments cc ON ec.id = cc.employee_competency_id
        AND cc.created_at >= NOW() - INTERVAL '1 day' * p_days_back
    WHERE (p_user_id IS NULL OR ec.user_id = p_user_id)
    GROUP BY ec.id, cd.name, ec.user_id, p.username
    HAVING COUNT(cc.id) > 0
    ORDER BY latest_comment_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get expiring competencies WITH comment info
CREATE OR REPLACE FUNCTION get_expiring_competencies_with_comments(
    days_threshold INTEGER DEFAULT 30
)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    email TEXT,
    competency_id UUID,
    competency_name TEXT,
    expiry_date TIMESTAMPTZ,
    days_until_expiry INTEGER,
    comment_count BIGINT,
    latest_comment TEXT,
    latest_comment_type TEXT,
    has_renewal_in_progress BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.user_id,
        p.username,
        p.email,
        ec.id as competency_id,
        cd.name as competency_name,
        ec.expiry_date,
        EXTRACT(DAY FROM ec.expiry_date - NOW())::INTEGER as days_until_expiry,
        COUNT(cc.id) as comment_count,
        (
            SELECT comment_text
            FROM competency_comments
            WHERE employee_competency_id = ec.id
            ORDER BY created_at DESC
            LIMIT 1
        ) as latest_comment,
        (
            SELECT comment_type
            FROM competency_comments
            WHERE employee_competency_id = ec.id
            ORDER BY created_at DESC
            LIMIT 1
        ) as latest_comment_type,
        EXISTS (
            SELECT 1 FROM competency_comments
            WHERE employee_competency_id = ec.id
            AND comment_type = 'renewal_in_progress'
        ) as has_renewal_in_progress
    FROM employee_competencies ec
    JOIN profiles p ON ec.user_id = p.id
    JOIN competency_definitions cd ON ec.competency_id = cd.id
    LEFT JOIN competency_comments cc ON ec.id = cc.employee_competency_id
    WHERE ec.expiry_date IS NOT NULL
        AND ec.expiry_date > NOW()
        AND ec.expiry_date <= (NOW() + INTERVAL '1 day' * days_threshold)
        AND ec.status = 'active'
    GROUP BY ec.id, ec.user_id, p.username, p.email, cd.name, ec.expiry_date
    ORDER BY ec.expiry_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment count to employee_competencies view (materialized view for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS competency_comment_summary AS
SELECT
    ec.id as employee_competency_id,
    ec.user_id,
    ec.competency_id,
    COUNT(cc.id) as total_comments,
    COUNT(cc.id) FILTER (WHERE cc.created_at >= NOW() - INTERVAL '7 days') as recent_comments,
    MAX(cc.created_at) as last_comment_date,
    BOOL_OR(cc.is_pinned) as has_pinned
FROM employee_competencies ec
LEFT JOIN competency_comments cc ON ec.id = cc.employee_competency_id
GROUP BY ec.id, ec.user_id, ec.competency_id;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_competency_comment_summary_ec_id ON competency_comment_summary(employee_competency_id);
CREATE INDEX IF NOT EXISTS idx_competency_comment_summary_user ON competency_comment_summary(user_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_competency_comment_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY competency_comment_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE competency_comments IS 'Comments on employee competencies for tracking renewal status and updates';
COMMENT ON COLUMN competency_comments.comment_type IS 'Type of comment: general, expiry_update, renewal_in_progress, renewal_completed, unable_to_renew, escalation';
COMMENT ON COLUMN competency_comments.is_pinned IS 'Pin important comments to the top for visibility';
COMMENT ON COLUMN competency_comments.mentioned_users IS 'Array of user IDs mentioned in the comment for notifications';
COMMENT ON COLUMN competency_comments.attachments IS 'JSON array of attachment metadata (file names, URLs, etc.)';
