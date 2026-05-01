import { useState, useMemo, lazy, Suspense } from 'react';
import { SectionSpinner } from '../../components/ui';
import { useAccountRequests, usePermissionRequests } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import './admin.css';

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
        <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
            <div className="ad-chassis">
                <div className="ad-panel">
                    {/* Header */}
                    <div className="ad-header">
                        <div className="ad-header-left">
                            <div className="ad-logo" />
                            <div className="ad-header-text">
                                <h1>Admin Dashboard</h1>
                                <p>Manage organizations, users, and system configuration</p>
                            </div>
                        </div>
                    </div>

                    <div className="ad-groove" />

                    {/* Tabs */}
                    <div className="ad-tabs-well">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            const showBadge = tab.id === 'requests' && pendingCount > 0;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`ad-tab${isActive ? ' active' : ''}`}
                                >
                                    {tab.label}
                                    {showBadge && (
                                        <span className="ad-tab-badge">{pendingCount}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="ad-groove" />

                    {/* Tab Content Well */}
                    <div className="ad-display-well" style={{ position: 'relative', zIndex: 1 }}>
                        <div className="ad-display" style={{ minHeight: '300px' }}>
                            <Suspense
                                key={activeTab}
                                fallback={
                                    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ minHeight: '200px' }}>
                                        <SectionSpinner message="Loading..." />
                                    </div>
                                }
                            >
                                {renderTabContent()}
                            </Suspense>
                        </div>
                    </div>

                    {/* Nameplate */}
                    <div className="ad-groove" />
                    <div className="ad-nameplate-bar">
                        <span className="ad-nameplate">Matrix Portal</span>
                        <span className="ad-nameplate-model">Admin Dashboard</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
