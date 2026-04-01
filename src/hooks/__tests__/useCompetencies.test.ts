/**
 * Tests for useCompetencies React Query hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '../../test/test-utils';

vi.mock('../../services/competency-service.ts', () => ({
    default: {
        getUserCompetencies: vi.fn(),
        getUserCompetenciesByCategory: vi.fn(),
        getCompetencyDefinitions: vi.fn(),
        getCategories: vi.fn(),
        getExpiringCompetencies: vi.fn(),
        getCompetencyComments: vi.fn(),
        getPendingApprovals: vi.fn(),
        getAllCategories: vi.fn(),
        getAllDefinitions: vi.fn(),
        getDefinitionUsageCount: vi.fn(),
    },
}));

import {
    useCompetencies,
    useCompetenciesByCategory,
    useCompetencyDefinitions,
    useCompetencyCategories,
    useExpiringCompetencies,
    useCompetencyComments,
    usePendingApprovals,
    useAllCompetencyCategories,
    useAllCompetencyDefinitions,
    useDefinitionUsageCount,
} from '../queries/useCompetencies';
import competencyService from '../../services/competency-service.ts';

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// useCompetencies
// ---------------------------------------------------------------------------
describe('useCompetencies', () => {
    it('does not fetch when userId is undefined', () => {
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetencies(undefined), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('fetches competencies for a user', async () => {
        vi.mocked(competencyService.getUserCompetencies).mockResolvedValueOnce([
            { id: 'ec1', user_id: 'u1' },
        ]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetencies('u1'), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// useCompetenciesByCategory
// ---------------------------------------------------------------------------
describe('useCompetenciesByCategory', () => {
    it('does not fetch when userId is undefined', () => {
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetenciesByCategory(undefined), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('fetches grouped competencies', async () => {
        vi.mocked(competencyService.getUserCompetenciesByCategory).mockResolvedValueOnce([
            { category: { id: 'c1' }, competencies: [] },
        ]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetenciesByCategory('u1'), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// useCompetencyDefinitions
// ---------------------------------------------------------------------------
describe('useCompetencyDefinitions', () => {
    it('fetches definitions', async () => {
        vi.mocked(competencyService.getCompetencyDefinitions).mockResolvedValueOnce([
            { id: 'd1', name: 'UT' },
        ]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetencyDefinitions(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
    });

    it('passes categoryId to service', async () => {
        vi.mocked(competencyService.getCompetencyDefinitions).mockResolvedValueOnce([]);
        const wrapper = createWrapper();
        renderHook(() => useCompetencyDefinitions('cat-1'), { wrapper });
        await waitFor(() =>
            expect(competencyService.getCompetencyDefinitions).toHaveBeenCalledWith('cat-1'),
        );
    });
});

// ---------------------------------------------------------------------------
// useCompetencyCategories
// ---------------------------------------------------------------------------
describe('useCompetencyCategories', () => {
    it('fetches categories', async () => {
        vi.mocked(competencyService.getCategories).mockResolvedValueOnce([
            { id: 'c1', name: 'NDT Methods', description: null, display_order: 0, is_active: true, created_at: '', updated_at: '' },
        ]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetencyCategories(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data![0].name).toBe('NDT Methods');
    });
});

// ---------------------------------------------------------------------------
// useExpiringCompetencies
// ---------------------------------------------------------------------------
describe('useExpiringCompetencies', () => {
    it('fetches expiring competencies with default threshold', async () => {
        vi.mocked(competencyService.getExpiringCompetencies).mockResolvedValueOnce([]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useExpiringCompetencies(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(competencyService.getExpiringCompetencies).toHaveBeenCalledWith(30, false);
    });
});

// ---------------------------------------------------------------------------
// useCompetencyComments
// ---------------------------------------------------------------------------
describe('useCompetencyComments', () => {
    it('does not fetch when id is undefined', () => {
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetencyComments(undefined), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('fetches comments', async () => {
        vi.mocked(competencyService.getCompetencyComments).mockResolvedValueOnce([
            { id: 'cm1', comment_text: 'good' },
        ]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useCompetencyComments('ec1'), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// usePendingApprovals
// ---------------------------------------------------------------------------
describe('usePendingApprovals', () => {
    it('fetches pending approvals', async () => {
        vi.mocked(competencyService.getPendingApprovals).mockResolvedValueOnce([]);
        const wrapper = createWrapper();
        const { result } = renderHook(() => usePendingApprovals(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
});

// ---------------------------------------------------------------------------
// useAllCompetencyCategories
// ---------------------------------------------------------------------------
describe('useAllCompetencyCategories', () => {
    it('fetches all categories including inactive', async () => {
        vi.mocked(competencyService.getAllCategories).mockResolvedValueOnce([]);
        const wrapper = createWrapper();
        renderHook(() => useAllCompetencyCategories(), { wrapper });
        await waitFor(() =>
            expect(competencyService.getAllCategories).toHaveBeenCalledWith(true),
        );
    });
});

// ---------------------------------------------------------------------------
// useAllCompetencyDefinitions
// ---------------------------------------------------------------------------
describe('useAllCompetencyDefinitions', () => {
    it('fetches all definitions', async () => {
        vi.mocked(competencyService.getAllDefinitions).mockResolvedValueOnce([]);
        const wrapper = createWrapper();
        renderHook(() => useAllCompetencyDefinitions('cat-1', true), { wrapper });
        await waitFor(() =>
            expect(competencyService.getAllDefinitions).toHaveBeenCalledWith(true, 'cat-1'),
        );
    });
});

// ---------------------------------------------------------------------------
// useDefinitionUsageCount
// ---------------------------------------------------------------------------
describe('useDefinitionUsageCount', () => {
    it('does not fetch when id is undefined', () => {
        const wrapper = createWrapper();
        const { result } = renderHook(() => useDefinitionUsageCount(undefined), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('fetches usage count', async () => {
        vi.mocked(competencyService.getDefinitionUsageCount).mockResolvedValueOnce(5);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useDefinitionUsageCount('def-1'), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toBe(5);
    });
});
