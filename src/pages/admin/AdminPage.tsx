import { useState, useEffect, lazy, Suspense } from 'react';
import { createModernHeader } from '../../components/modern-header.js';
import { SectionSpinner } from '../../components/ui';
import { useAccountRequests, usePermissionRequests } from '../../hooks/queries';

// Lazy load tab components
const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const OrganizationsTab = lazy(() => import('./tabs/OrganizationsTab'));
const UsersTab = lazy(() => import('./tabs/UsersTab'));
const AssetsTab = lazy(() => import('./tabs/AssetsTab'));
const RequestsTab = lazy(() => import('./tabs/RequestsTab'));
const SharingTab = lazy(() => import('./tabs/SharingTab'));
const ConfigurationTab = lazy(() => import('./tabs/ConfigurationTab'));
const ActivityLogTab = lazy(() => import('./tabs/ActivityLogTab'));
const CompetencyTypesTab = lazy(() => import('./tabs/CompetencyTypesTab'));

type TabType = 'overview' | 'organizations' | 'users' | 'assets' | 'requests' | 'sharing' | 'configuration' | 'competency-types' | 'activity';

interface Tab {
    id: TabType;
    label: string;
}

const tabs: Tab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'organizations', label: 'Organizations' },
    { id: 'users', label: 'Users' },
    { id: 'assets', label: 'Assets' },
    { id: 'requests', label: 'Requests' },
    { id: 'sharing', label: 'Sharing' },
    { id: 'configuration', label: 'Configuration' },
    { id: 'competency-types', label: 'Competency Types' },
    { id: 'activity', label: 'Activity Log' },
];

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    // Fetch pending requests for badge count
    const { data: accountRequests = [] } = useAccountRequests();
    const { data: permissionRequests = [] } = usePermissionRequests();
    const pendingCount = accountRequests.length + permissionRequests.length;

    // Initialize the modern header
    useEffect(() => {
        const container = document.getElementById('admin-header');
        if (container && container.children.length === 0) {
            const header = createModernHeader(
                'Admin Dashboard',
                'Manage organizations, users, assets, and system configuration',
                {
                    showParticles: true,
                    particleCount: 25,
                    gradientColors: ['#8b5cf6', '#3b82f6'], // Purple to blue
                    height: '100px',
                    showLogo: false
                }
            );
            container.appendChild(header);
        }
    }, []);

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab />;
            case 'organizations':
                return <OrganizationsTab />;
            case 'users':
                return <UsersTab />;
            case 'assets':
                return <AssetsTab />;
            case 'requests':
                return <RequestsTab />;
            case 'sharing':
                return <SharingTab />;
            case 'configuration':
                return <ConfigurationTab />;
            case 'competency-types':
                return <CompetencyTypesTab />;
            case 'activity':
                return <ActivityLogTab />;
            default:
                return <OverviewTab />;
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div id="admin-header" style={{ flexShrink: 0 }}></div>

            {/* Navigation Tabs - matching Personnel Management style */}
            <div
                className="glass-panel"
                style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 0,
                    flexShrink: 0,
                    padding: 0
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

            {/* Content Area - matching Personnel Management style */}
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
