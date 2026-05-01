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
                    <div style={{ padding: '16px', border: '1px solid rgba(53, 160, 88, 0.20)', borderRadius: '8px', background: 'rgba(53, 160, 88, 0.05)' }}>
                        <p className="text-xs mb-1" style={{ color: 'rgba(53, 160, 88, 0.45)' }}>Users</p>
                        <p className="text-2xl font-bold" style={{ color: 'var(--green-bright)' }}>{organization.userCount || 0}</p>
                    </div>
                    <div style={{ padding: '16px', border: '1px solid rgba(53, 160, 88, 0.20)', borderRadius: '8px', background: 'rgba(53, 160, 88, 0.05)' }}>
                        <p className="text-xs mb-1" style={{ color: 'rgba(53, 160, 88, 0.45)' }}>Created</p>
                        <p className="text-lg font-medium" style={{ color: 'rgba(53, 160, 88, 0.70)' }}>{createdDate}</p>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export default OrganizationDetailModal;
