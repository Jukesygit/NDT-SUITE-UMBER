/**
 * OrganizationsTab - Organization management for admin dashboard
 *
 * Features:
 * - Grid layout of organization cards
 * - Statistics (users, assets, scans) per organization
 * - Create, edit, and delete organizations
 * - Context menu for actions
 */

import { useState, useRef, useEffect } from 'react';
import {
    useOrganizationsWithStats,
    useAdminUsers,
} from '../../../hooks/queries';
import { useDeleteOrganization } from '../../../hooks/mutations';
import { EmptyState, SectionSpinner, ConfirmDialog } from '../../../components/ui';
import { CreateOrganizationModal, EditOrganizationModal, OrganizationDetailModal } from '../modals';
import type { OrganizationStats } from '../../../services/admin-service';
import type { Profile } from '../../../types/database.types';

/**
 * Simple context menu component
 */
interface ContextMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    position: { x: number; y: number };
}

function ContextMenu({ isOpen, onClose, onEdit, onDelete, position }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            ref={menuRef}
            style={{
                position: 'absolute',
                zIndex: 50,
                background: 'rgba(30, 41, 59, 0.95)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
                padding: '4px 0',
                minWidth: '120px',
                left: position.x,
                top: position.y
            }}
        >
            <button
                onClick={() => {
                    onEdit();
                    onClose();
                }}
                style={{
                    width: '100%',
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                Edit
            </button>
            <button
                onClick={() => {
                    onDelete();
                    onClose();
                }}
                style={{
                    width: '100%',
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#f87171',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                Delete
            </button>
        </div>
    );
}

/**
 * Organization card component
 */
interface OrganizationCardProps {
    org: OrganizationStats;
    userCount: number;
    onClick: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

function OrganizationCard({ org, userCount, onClick, onEdit, onDelete }: OrganizationCardProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
                x: rect.right - 120, // Align to right edge
                y: rect.bottom + 4,
            });
        }
        setMenuOpen(!menuOpen);
    };

    const createdDate = new Date(org.organization.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    return (
        <div
            className="glass-card"
            style={{
                position: 'relative',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                cursor: 'pointer'
            }}
            onClick={onClick}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.15)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Menu button */}
            <button
                ref={buttonRef}
                onClick={handleMenuClick}
                style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    padding: '4px',
                    borderRadius: '4px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                aria-label="More options"
            >
                <svg
                    style={{ width: '20px', height: '20px', color: 'rgba(255, 255, 255, 0.7)' }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v.01M12 12v.01M12 18v.01"
                    />
                </svg>
            </button>

            <ContextMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                onEdit={onEdit}
                onDelete={onDelete}
                position={menuPosition}
            />

            {/* Organization name */}
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', paddingRight: '32px' }}>
                {org.organization.name}
            </h3>

            {/* Stats */}
            <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.5)' }}>Users</p>
                <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{userCount}</p>
            </div>

            {/* Created date */}
            <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                    Created {createdDate}
                </p>
            </div>
        </div>
    );
}

export default function OrganizationsTab() {
    const { data: orgsWithStats = [], isLoading, error } = useOrganizationsWithStats();
    const { data: users = [] } = useAdminUsers();

    // Mutations (create/update handled by modals, delete used directly)
    const deleteOrg = useDeleteOrganization();

    // Modal states
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editingOrg, setEditingOrg] = useState<OrganizationStats | null>(null);
    const [viewingOrg, setViewingOrg] = useState<OrganizationStats | null>(null);
    const [deletingOrg, setDeletingOrg] = useState<OrganizationStats | null>(null);

    // Get user count per organization
    const getUserCount = (orgId: string) => {
        return users.filter((user: Profile) => user.organization_id === orgId).length;
    };

    const handleDelete = async () => {
        if (!deletingOrg) return;

        const result = await deleteOrg.mutateAsync(deletingOrg.organization.id);

        if (result.success) {
            setDeletingOrg(null);
        }
    };

    if (isLoading) {
        return <SectionSpinner message="Loading organizations..." />;
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-red-400">Failed to load organizations</p>
                <p className="text-sm text-white/50 mt-2">{error.message}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Organizations
                    </h2>
                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: '4px' }}>
                        Manage organizations and their resources
                    </p>
                </div>
                <button
                    onClick={() => setCreateModalOpen(true)}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Organization
                </button>
            </div>

            {/* Organizations grid */}
            {orgsWithStats.length === 0 ? (
                <EmptyState
                    title="No Organizations"
                    message="Create your first organization to get started"
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {orgsWithStats.map((org) => (
                        <OrganizationCard
                            key={org.organization.id}
                            org={org}
                            userCount={getUserCount(org.organization.id)}
                            onClick={() => setViewingOrg(org)}
                            onEdit={() => setEditingOrg(org)}
                            onDelete={() => setDeletingOrg(org)}
                        />
                    ))}
                </div>
            )}

            {/* Delete confirmation dialog */}
            <ConfirmDialog
                isOpen={!!deletingOrg}
                onClose={() => setDeletingOrg(null)}
                onConfirm={handleDelete}
                title="Delete Organization"
                message={
                    <>
                        Are you sure you want to delete <strong>{deletingOrg?.organization.name}</strong>?
                        <br />
                        <br />
                        This will permanently delete all associated data including users, assets, vessels, and scans.
                        This action cannot be undone.
                    </>
                }
                confirmText="Delete"
                variant="danger"
                isLoading={deleteOrg.isPending}
            />

            {/* Create Organization Modal */}
            <CreateOrganizationModal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
            />

            {/* Edit Organization Modal */}
            <EditOrganizationModal
                isOpen={!!editingOrg}
                onClose={() => setEditingOrg(null)}
                organization={editingOrg}
            />

            {/* Organization Detail Modal */}
            <OrganizationDetailModal
                isOpen={!!viewingOrg}
                onClose={() => setViewingOrg(null)}
                organization={viewingOrg}
            />
        </div>
    );
}
