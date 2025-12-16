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

// Admin queries - Assets
export {
    useAdminAssets,
    assetKeys,
} from './useAdminAssets';

// Admin queries - Asset Sharing
export {
    useAssetShares,
    useAccessRequests,
    shareKeys,
} from './useAssetShares';

// Admin queries - Configuration
export {
    useAdminConfig,
    useConfigMetadata,
    configKeys,
} from './useAdminConfig';

// Data Hub queries
export {
    useDataHubOrganizations,
    useAssetsByOrg,
    useVesselsByAsset,
    useVesselDetails,
    useVesselInspections,
    useInspection,
    useVesselScans,
    useVesselStrakes,
    useVesselImages,
    dataHubKeys,
    inspectionKeys,
} from './useDataHub';
export type {
    AssetWithCounts,
    Vessel,
    VesselWithCounts,
    Inspection,
    Scan,
    Strake,
    VesselImage,
} from './useDataHub';
