/**
 * Competency Service - Barrel module
 *
 * Re-exports all competency operations as a single class instance to maintain
 * backward compatibility with existing imports:
 *   import competencyService from '../../services/competency-service.js';
 *
 * Internally delegates to:
 *   - competency-queries.ts      (read/fetch operations)
 *   - competency-mutations.ts    (create/update/delete operations)
 *   - competency-comments.ts     (comment queries & mutations)
 *   - competency-definitions.ts  (admin category & definition CRUD)
 */

import * as queries from './competency-queries.ts';
import * as mutations from './competency-mutations.ts';
import * as comments from './competency-comments.ts';
import * as definitions from './competency-definitions.ts';

class CompetencyService {
    // ---- Queries ----
    getCategories = queries.getCategories;
    getCompetencyDefinitions = queries.getCompetencyDefinitions;
    getAllCompetencyDefinitions = queries.getAllCompetencyDefinitions;
    getUserCompetencies = queries.getUserCompetencies;
    getUserCompetenciesByCategory = queries.getUserCompetenciesByCategory;
    getPendingApprovals = queries.getPendingApprovals;
    getExpiringCompetencies = queries.getExpiringCompetencies;
    getCompetencyHistory = queries.getCompetencyHistory;
    getDocumentUrl = queries.getDocumentUrl;
    canManageCompetencies = queries.canManageCompetencies;
    getAllCategories = queries.getAllCategories;
    getAllDefinitions = queries.getAllDefinitions;
    getDefinitionUsageCount = queries.getDefinitionUsageCount;

    // ---- Mutations ----
    upsertCompetency = mutations.upsertCompetency;
    deleteCompetency = mutations.deleteCompetency;
    verifyCompetency = mutations.verifyCompetency;
    requestChanges = mutations.requestChanges;
    uploadDocument = mutations.uploadDocument;
    deleteDocument = mutations.deleteDocument;
    bulkCreateCompetencies = mutations.bulkCreateCompetencies;
    bulkImportCompetencies = mutations.bulkImportCompetencies;

    // ---- Comments ----
    getCompetencyComments = comments.getCompetencyComments;
    getCompetenciesWithComments = comments.getCompetenciesWithComments;
    addCompetencyComment = comments.addCompetencyComment;
    updateCompetencyComment = comments.updateCompetencyComment;
    deleteCompetencyComment = comments.deleteCompetencyComment;
    pinCompetencyComment = comments.pinCompetencyComment;

    // ---- Admin Definitions ----
    _requireAdmin = definitions.requireAdmin;
    createCategory = definitions.createCategory;
    updateCategory = definitions.updateCategory;
    deleteCategory = definitions.deleteCategory;
    reorderCategories = definitions.reorderCategories;
    createDefinition = definitions.createDefinition;
    updateDefinition = definitions.updateDefinition;
    deleteDefinition = definitions.deleteDefinition;
    reorderDefinitions = definitions.reorderDefinitions;
}

const competencyService = new CompetencyService();
export default competencyService;
