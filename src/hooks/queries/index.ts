// Profile queries
export { useProfile } from './useProfile';

// Competency queries
export {
    useCompetencies,
    useCompetencyDefinitions,
    useCompetencyCategories,
    useExpiringCompetencies,
    useCompetencyComments,
} from './useCompetencies';

// Personnel queries
export {
    usePersonnel,
    usePersonDetail,
    useOrganizations,
    useCompetencyMatrix,
    getCompetencyStats,
    getPendingApprovalCount,
    getPendingApprovalCompetencies,
    personnelKeys,
} from './usePersonnel';
export type {
    Person,
    PersonCompetency,
    Organization,
    CompetencyStats,
    CompetencyMatrix,
    CompetencyMatrixEntry,
} from './usePersonnel';

// Admin queries - Dashboard Stats
export { useAdminStats } from './useAdminStats';

// Admin queries - Organizations
export {
    useOrganizations as useAdminOrganizations,
    useOrganizationsWithStats,
    organizationKeys,
} from './useAdminOrganizations';

// Admin queries - Users
export {
    useAdminUsers,
    useAdminUser,
    userKeys,
} from './useAdminUsers';

// Admin queries - Account & Permission Requests
export {
    useAccountRequests,
    usePermissionRequests,
    requestKeys,
} from './useAccountRequests';

// Admin queries - Configuration
export {
    useAdminConfig,
    useConfigMetadata,
    configKeys,
} from './useAdminConfig';

// Activity Log queries
export {
    useActivityLogs,
    useActivityUsers,
    activityLogKeys,
} from './useActivityLog';

// Document Control queries
export {
    useDocuments,
    useDocument,
    useDocumentRevisions,
    useDocumentCategories,
    useAllDocumentCategories,
    useDocumentsDueForReview,
    useDocumentStats,
    useDocumentReviewSchedule,
    documentKeys,
} from './useDocuments';
