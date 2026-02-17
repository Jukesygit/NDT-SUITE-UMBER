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

// Competency Definition Admin mutations (categories & definitions)
export {
    useCreateCategory,
    useUpdateCategory,
    useDeleteCategory,
    useReorderCategories,
    useCreateDefinition,
    useUpdateDefinition,
    useDeleteDefinition,
    useReorderDefinitions,
} from './useCompetencyDefinitionMutations';
export type {
    CategoryData,
    CategoryUpdateData,
    DefinitionData,
    DefinitionUpdateData,
} from './useCompetencyDefinitionMutations';

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

// Configuration mutations
export {
    useAddConfigItem,
    useUpdateConfigItem,
    useRemoveConfigItem,
    useResetConfigList,
    useResetAllConfig,
    useImportConfig,
} from './useConfigMutations';

// Document Control mutations
export {
    useCreateDocument,
    useUpdateDocument,
    useWithdrawDocument,
    useCreateRevision,
    useSubmitForReview,
    useApproveRevision,
    useRejectRevision,
    useCompleteReviewNoChanges,
    useCreateDocumentCategory,
    useUpdateDocumentCategory,
    useDeleteDocumentCategory,
    useReorderDocumentCategories,
} from './useDocumentMutations';

