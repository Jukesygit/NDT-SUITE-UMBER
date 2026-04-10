import { useState, useMemo, lazy, Suspense } from 'react';
import { PageHeader, SectionSpinner } from '../../components/ui';
import { useAccountRequests, usePermissionRequests } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';

const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const OrganizationsTab = lazy(() => import('./tabs/OrganizationsTab'));
const UsersTab = lazy(() => import('./tabs/UsersTab'));
const RequestsTab = lazy(() => import('./tabs/RequestsTab'));
const ConfigurationTab = lazy(() => import('./tabs/ConfigurationTab'));
const ActivityLogTab = lazy(() => import('./tabs/ActivityLogTab'));
const CompetencyTypesTab = lazy(() => import('./tabs/CompetencyTypesTab'));
const NotificationsTab = lazy(() => import('./tabs/NotificationsTab'));
const UKASComplianceTab = lazy(() => import('./tabs/UKASComplianceTab'));
const TabVisibilityTab = lazy(() => import('./tabs/TabVisibilityTab'));

type TabType = 'overview' | 'organizations' | 'users' | 'requests' | 'notifications' | 'configuration' | 'competency-types' | 'activity' | 'ukas-compliance' | 'tab-visibility';

interface Tab {
    id: TabType;
    label: string;
    superAdminOnly?: boolean;
}

const allTabs: Tab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'organizations', label: 'Organizations' },
    { id: 'users', label: 'Users' },
    { id: 'requests', label: 'Requests' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'configuration', label: 'Configuration' },
    { id: 'competency-types', label: 'Competency Types' },
    { id: 'activity', label: 'Activity Log' },
    { id: 'ukas-compliance', label: 'UKAS Compliance' },
    { id: 'tab-visibility', label: 'Tab Visibility', superAdminOnly: true },
];

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const { isSuperAdmin } = useAuth();

    const { data: accountRequests = [] } = useAccountRequests();
    const { data: permissionRequests = [] } = usePermissionRequests();
    const pendingCount = accountRequests.length + permissionRequests.length;

    // Filter tabs based on role (Tab Visibility tab is super_admin only)
    const tabs = useMemo(() =>
        allTabs.filter(tab => !tab.superAdminOnly || isSuperAdmin),
        [isSuperAdmin]
    );

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
            case 'tab-visibility': return <TabVisibilityTab />;
            default: return <OverviewTab />;
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <PageHeader
                title="Admin Dashboard"
                subtitle="Manage organizations, users, and system configuration"
                icon={
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                }
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
