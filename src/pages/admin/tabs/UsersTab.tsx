/**
 * UsersTab - User management with DataTable
 * Features: Search, create, edit, delete users
 */

import { useState, useMemo, useCallback } from 'react';
import { useAdminUsers } from '../../../hooks/queries/useAdminUsers';
import { useOrganizations } from '../../../hooks/queries/useAdminOrganizations';
import { useDeleteUser } from '../../../hooks/mutations/useUserMutations';
import { DataTable, Column } from '../../../components/ui/DataTable/DataTable';
import { SectionSpinner } from '../../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay';
import { ConfirmDialog } from '../../../components/ui/Modal/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { CreateUserModal, EditUserModal } from '../modals';
import type { Profile } from '../../../types/database.types';
import type { AdminUser } from '../../../types/admin';

export default function UsersTab() {
    const { data: users = [], isLoading, error } = useAdminUsers();
    const { data: organizations = [] } = useOrganizations();
    const deleteUser = useDeleteUser();

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [deletingUser, setDeletingUser] = useState<Profile | null>(null);

    // Helper to get org name by ID
    const getOrgName = useCallback((orgId: string | null | undefined): string => {
        if (!orgId) return 'N/A';
        const org = organizations.find((o) => o.id === orgId);
        return org?.name || 'Unknown';
    }, [organizations]);

    // Filtered users based on search (includes org name)
    const filteredUsers = useMemo(() => {
        if (!searchQuery.trim()) return users;

        const query = searchQuery.toLowerCase();
        return users.filter((user) => {
            const username = user.username.toLowerCase();
            const email = user.email.toLowerCase();
            const orgName = getOrgName(user.organization_id).toLowerCase();
            return username.includes(query) || email.includes(query) || orgName.includes(query);
        });
    }, [users, searchQuery, getOrgName]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Column definitions
    const columns = useMemo<Column<Profile>[]>(
        () => [
            {
                key: 'user',
                header: 'User',
                sortable: true,
                render: (user) => (
                    <div>
                        <p style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.username}</p>
                        <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.5)' }}>{user.email}</p>
                    </div>
                ),
            },
            {
                key: 'organization',
                header: 'Organization',
                render: (user) => (
                    <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                        {getOrgName(user.organization_id)}
                    </span>
                ),
            },
            {
                key: 'role',
                header: 'Role',
                align: 'center',
                render: (user) => (
                    <StatusBadge variant={user.role as any}>
                        {user.role}
                    </StatusBadge>
                ),
            },
            {
                key: 'status',
                header: 'Status',
                align: 'center',
                render: (user) => (
                    <StatusBadge variant={user.is_active ? 'active' : 'inactive'} />
                ),
            },
            {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (user) => (
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={() => setEditingUser(user as unknown as AdminUser)}
                            style={{
                                padding: '6px 12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: '#60a5fa',
                                background: 'rgba(96, 165, 250, 0.1)',
                                borderRadius: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Edit
                        </button>
                        <button
                            onClick={() => setDeletingUser(user)}
                            style={{
                                padding: '6px 12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: '#f87171',
                                background: 'rgba(248, 113, 113, 0.1)',
                                borderRadius: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Delete
                        </button>
                    </div>
                ),
            },
        ],
        [getOrgName]
    );

    // Handle delete confirmation
    const handleDeleteConfirm = async () => {
        if (!deletingUser) return;

        const result = await deleteUser.mutateAsync(deletingUser.id);

        if (result.success) {
            setDeletingUser(null);
        } else {
            // Error is handled by the mutation
            console.error('Delete failed:', result.error);
        }
    };

    // Show loading state
    if (isLoading) {
        return <SectionSpinner message="Loading users..." />;
    }

    // Show error state
    if (error) {
        return <ErrorDisplay error={error} title="Failed to load users" />;
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>Users</h2>
                    <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px' }}>
                        {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
                    </p>
                </div>
                <button
                    onClick={() => setCreateModalOpen(true)}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New User
                </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-4">
                <div className="flex-1 max-w-md">
                    <div className="search-bar-enhanced">
                        <input
                            type="text"
                            placeholder="Search by username, email, or organization..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="search-bar-enhanced__input"
                        />
                        <svg className="search-bar-enhanced__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* DataTable */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <DataTable
                    data={paginatedUsers}
                    columns={columns}
                    rowKey={(user) => user.id}
                    emptyState={{
                        title: searchQuery ? 'No users found' : 'No users yet',
                        message: searchQuery
                            ? 'Try adjusting your search terms'
                            : 'Create your first user to get started',
                        icon: 'users',
                    }}
                />

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{
                        padding: '16px 24px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
                            Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                            {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of{' '}
                            {filteredUsers.length} users
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '14px' }}
                            >
                                Previous
                            </button>
                            <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '14px' }}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!deletingUser}
                onClose={() => setDeletingUser(null)}
                onConfirm={handleDeleteConfirm}
                title="Delete User"
                message={
                    deletingUser ? (
                        <div className="text-left">
                            <p>Are you sure you want to delete this user?</p>
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                <p className="font-medium text-gray-900">{deletingUser.username}</p>
                                <p className="text-sm text-gray-600">{deletingUser.email}</p>
                            </div>
                            <p className="mt-3 text-sm text-gray-600">
                                This action cannot be undone.
                            </p>
                        </div>
                    ) : (
                        ''
                    )
                }
                confirmText="Delete User"
                variant="danger"
                isLoading={deleteUser.isPending}
            />

            {/* Create User Modal */}
            <CreateUserModal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
            />

            {/* Edit User Modal */}
            {editingUser && (
                <EditUserModal
                    isOpen={!!editingUser}
                    onClose={() => setEditingUser(null)}
                    user={editingUser}
                />
            )}
        </div>
    );
}
