import { useState, lazy, Suspense } from 'react';
import { PageHeader, SectionSpinner } from '../../components/ui';
import { useAccountRequests, usePermissionRequests } from '../../hooks/queries';

const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const OrganizationsTab = lazy(() => import('./tabs/OrganizationsTab'));
const UsersTab = lazy(() => import('./tabs/UsersTab'));
const RequestsTab = lazy(() => import('./tabs/RequestsTab'));
const ConfigurationTab = lazy(() => import('./tabs/ConfigurationTab'));
const ActivityLogTab = lazy(() => import('./tabs/ActivityLogTab'));
const CompetencyTypesTab = lazy(() => import('./tabs/CompetencyTypesTab'));
const NotificationsTab = lazy(() => import('./tabs/NotificationsTab'));
const UKASComplianceTab = lazy(() => import('./tabs/UKASComplianceTab'));

type TabType = 'overview' | 'organizations' | 'users' | 'requests' | 'notifications' | 'configuration' | 'competency-types' | 'activity' | 'ukas-compliance';

interface Tab {
    id: TabType;
    label: string;
}

const tabs: Tab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'organizations', label: 'Organizations' },
    { id: 'users', label: 'Users' },
    { id: 'requests', label: 'Requests' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'configuration', label: 'Configuration' },
    { id: 'competency-types', label: 'Competency Types' },
    { id: 'activity', label: 'Activity Log' },
    { id: 'ukas-compliance', label: 'UKAS Compliance' },
];

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    const { data: accountRequests = [] } = useAccountRequests();
    const { data: permissionRequests = [] } = usePermissionRequests();
    const pendingCount = accountRequests.length + permissionRequests.length;

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview': return <OverviewTab />;
            case 'organizations': return <OrganizationsTab />;
            case 'users': return <UsersTab />;
            case 'requests': return <RequestsTab />;
            case 'notifications': return <NotificationsTab />;
            case 'configuration': return <ConfigurationTab />;
            case 'competency-types': return <CompetencyTypesTab />;
            case 'activity': return <ActivityLogTab />;
            case 'ukas-compliance': return <UKASComplianceTab />;
            default: return <OverviewTab />;
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <PageHeader
                title="Admin Dashboard"
                subtitle="Manage organizations, users, and system configuration"
            />

            <div
                className="glass-panel"
                style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 0,
                    flexShrink: 0,
                    padding: 0,
                }}
            >
                <div className="flex px-6">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        const showBadge = tab.id === 'requests' && pendingCount > 0;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                                style={{
                                    borderColor: isActive ? 'var(--accent-primary)' : 'transparent',
                                    color: isActive ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {tab.label}
                                {showBadge && (
                                    <span className="ml-2 glass-badge badge-red text-xs">
                                        {pendingCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                <Suspense
                    key={activeTab}
                    fallback={
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                            <SectionSpinner message="Loading..." />
                        </div>
                    }
                >
                    {renderTabContent()}
                </Suspense>
            </div>
        </div>
    );
}
