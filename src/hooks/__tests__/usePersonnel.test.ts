/**
 * Tests for usePersonnel React Query hooks and utility functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '../../test/test-utils';

// Mock services
vi.mock('../../services/personnel-service.js', () => ({
    default: {
        getAllPersonnelWithCompetencies: vi.fn(),
        getPersonnelComplianceReport: vi.fn(),
        getCompetencyMatrix: vi.fn(),
    },
}));
vi.mock('../../auth-manager.js', () => ({
    default: {
        getOrganizations: vi.fn().mockResolvedValue([]),
    },
}));

import {
    usePersonnel,
    usePersonDetail,
    useOrganizations,
    useCompetencyMatrix,
    getCompetencyStats,
    getPendingApprovalCount,
    getPendingApprovalCompetencies,
} from '../queries/usePersonnel';
import personnelService from '../../services/personnel-service';
import authManager from '../../auth-manager.js';

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// usePersonnel
// ---------------------------------------------------------------------------
describe('usePersonnel', () => {
    it('fetches personnel and normalizes organizations', async () => {
        vi.mocked(personnelService.getAllPersonnelWithCompetencies).mockResolvedValueOnce([
            { id: 'u1', username: 'alice', organizations: [{ id: 'o1', name: 'Acme' }] } as any,
        ]);

        const wrapper = createWrapper();
        const { result } = renderHook(() => usePersonnel(), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
        // organizations should be normalized from array to single object
        expect(result.current.data![0].organizations).toEqual({ id: 'o1', name: 'Acme' });
    });

    it('handles empty response', async () => {
        vi.mocked(personnelService.getAllPersonnelWithCompetencies).mockResolvedValueOnce([]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => usePersonnel(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// usePersonDetail
// ---------------------------------------------------------------------------
describe('usePersonDetail', () => {
    it('does not fetch when personId is undefined', () => {
        const wrapper = createWrapper();
        const { result } = renderHook(() => usePersonDetail(undefined), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('fetches person detail', async () => {
        vi.mocked(personnelService.getPersonnelComplianceReport).mockResolvedValueOnce({
            person: { id: 'u1', username: 'bob', organizations: { id: 'o1', name: 'Corp' } },
        } as any);
        const wrapper = createWrapper();
        const { result } = renderHook(() => usePersonDetail('u1'), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.username).toBe('bob');
    });
});

// ---------------------------------------------------------------------------
// useOrganizations
// ---------------------------------------------------------------------------
describe('useOrganizations', () => {
    it('filters out SYSTEM organization', async () => {
        vi.mocked(authManager.getOrganizations).mockResolvedValueOnce([
            { id: 'o1', name: 'Acme' }, { id: 'o2', name: 'SYSTEM' },
        ]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useOrganizations(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
        expect(result.current.data![0].name).toBe('Acme');
    });
});

// ---------------------------------------------------------------------------
// useCompetencyMatrix
// ---------------------------------------------------------------------------
describe('useCompetencyMatrix', () => {
    it('fetches competency matrix', async () => {
        const matrix = { personnel: [], competencies: [] };
        vi.mocked(personnelService.getCompetencyMatrix).mockResolvedValueOnce(matrix);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetencyMatrix(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual(matrix);
    });
});

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------
describe('getCompetencyStats', () => {
    it('calculates stats correctly', () => {
        const comps = [
            { id: '1', status: 'active', competency_id: 'c1', user_id: 'u1' },
            { id: '2', status: 'expired', competency_id: 'c2', user_id: 'u1' },
            {
                id: '3', status: 'active', competency_id: 'c3', user_id: 'u1',
                expiry_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days
            },
        ] as any;
        const stats = getCompetencyStats(comps);
        expect(stats.total).toBe(3);
        expect(stats.active).toBe(2);
        expect(stats.expired).toBe(1);
        expect(stats.expiring).toBe(1); // within 30 days
    });

    it('handles empty array', () => {
        const stats = getCompetencyStats([]);
        expect(stats).toEqual({ total: 0, active: 0, expiring: 0, expired: 0 });
    });
});

describe('getPendingApprovalCount', () => {
    it('counts pending competencies with documents', () => {
        const comps = [
            { id: '1', status: 'pending_approval', document_url: 'doc.pdf', competency_id: 'c1', user_id: 'u1' },
            { id: '2', status: 'pending_approval', document_url: null, competency_id: 'c2', user_id: 'u1' },
            { id: '3', status: 'active', document_url: 'doc2.pdf', competency_id: 'c3', user_id: 'u1' },
        ] as any;
        expect(getPendingApprovalCount(comps)).toBe(1);
    });
});

describe('getPendingApprovalCompetencies', () => {
    it('returns only pending competencies with documents', () => {
        const comps = [
            { id: '1', status: 'pending_approval', document_url: 'doc.pdf', competency_id: 'c1', user_id: 'u1' },
            { id: '2', status: 'active', document_url: 'doc.pdf', competency_id: 'c2', user_id: 'u1' },
        ] as any;
        const pending = getPendingApprovalCompetencies(comps);
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe('1');
    });
});
