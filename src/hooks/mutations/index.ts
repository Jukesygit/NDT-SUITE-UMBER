// Profile mutations
export { useUpdateProfile } from './useUpdateProfile';
export { useUploadAvatar } from './useUploadAvatar';

// Competency mutations
export {
    useCreateCompetency,
    useUpdateCompetency,
    useDeleteCompetency,
    useUploadCompetencyDocument,
} from './useCompetencyMutations';

// Personnel mutations
export {
    useUpdatePerson,
    useUpdatePersonCompetency,
    useDeletePersonCompetency,
    useAddPersonCompetency,
    exportPersonnelToCSV,
} from './usePersonnelMutations';
export type { UpdatePersonData, UpdateCompetencyData, AddCompetencyData } from './usePersonnelMutations';

// Organization mutations
export {
    useCreateOrganization,
    useUpdateOrganization,
    useDeleteOrganization,
} from './useOrganizationMutations';

// User mutations
export {
    useCreateUser,
    useUpdateUser,
    useDeleteUser,
} from './useUserMutations';

// Request mutations (account & permission requests)
export {
    useApproveAccountRequest,
    useRejectAccountRequest,
    useApprovePermissionRequest,
    useRejectPermissionRequest,
} from './useRequestMutations';

// Asset transfer mutations
export {
    useTransferAsset,
    useBulkTransferAssets,
    useAdminCreateAsset,
} from './useAssetTransferMutations';

// Share mutations
export {
    useCreateShare,
    useUpdateShare,
    useDeleteShare,
    useApproveAccessRequest,
    useRejectAccessRequest,
} from './useShareMutations';

// Configuration mutations
export {
    useAddConfigItem,
    useUpdateConfigItem,
    useRemoveConfigItem,
    useResetConfigList,
    useResetAllConfig,
    useImportConfig,
} from './useConfigMutations';

// Data Hub mutations (assets & vessels)
export {
    useCreateAsset,
    useUpdateAsset,
    useDeleteAsset,
    useCreateVessel,
    useUpdateVessel,
    useDeleteVessel,
} from './useDataHubMutations';

// Inspection mutations (scans, strakes, images)
export {
    useDeleteScan,
    useUpdateScan,
    useDeleteVesselImage,
    useRenameVesselImage,
    useCreateStrake,
    useUpdateStrake,
    useDeleteStrake,
} from './useInspectionMutations';
