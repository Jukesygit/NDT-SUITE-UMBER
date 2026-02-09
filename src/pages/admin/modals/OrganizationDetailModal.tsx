/**
 * OrganizationDetailModal - View organization details
 */

import Modal from '../../../components/ui/Modal/Modal';
import type { OrganizationStats } from '../../../services/admin-service';

export interface OrganizationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    organization: OrganizationStats | null;
}

export function OrganizationDetailModal({ isOpen, onClose, organization }: OrganizationDetailModalProps) {
    if (!organization) return null;

    const createdDate = new Date(organization.organization.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={organization.organization.name}
            size="large"
        >
            <div className="space-y-6">
                {/* Organization Info */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="glass-card p-4">
                        <p className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Users</p>
                        <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{organization.userCount || 0}</p>
                    </div>
                    <div className="glass-card p-4">
                        <p className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Created</p>
                        <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{createdDate}</p>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export default OrganizationDetailModal;
