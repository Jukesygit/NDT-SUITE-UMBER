import { useState, lazy, Suspense } from 'react';
import { PageHeader, SectionSpinner } from '../../components/ui';
// @ts-ignore - JS module without type declarations
import authManager from '../../auth-manager.js';
import ManageCategoriesModal from './modals/ManageCategoriesModal';

const DocumentRegisterTab = lazy(() => import('./tabs/DocumentRegisterTab'));
const ReviewDashboardTab = lazy(() => import('./tabs/ReviewDashboardTab'));

type TabType = 'register' | 'reviews';

interface Tab {
    id: TabType;
    label: string;
}

export default function DocumentsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('register');
    const [showCategories, setShowCategories] = useState(false);
    const canManage = authManager.hasPermission('manage_users');

    const tabs: Tab[] = [
        { id: 'register', label: 'Document Register' },
        ...(canManage ? [{ id: 'reviews' as TabType, label: 'Review Dashboard' }] : []),
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'register': return <DocumentRegisterTab canManage={canManage} />;
            case 'reviews': return canManage ? <ReviewDashboardTab /> : null;
            default: return <DocumentRegisterTab canManage={canManage} />;
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <PageHeader
                title="Document Control"
                subtitle="Controlled documents, procedures, and work instructions"
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
                <div className="flex items-center px-6">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
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
                            </button>
                        );
                    })}
                    {canManage && (
                        <button
                            onClick={() => setShowCategories(true)}
                            className="ml-auto px-3 py-1.5 text-xs font-medium rounded-md
                                bg-white/5 hover:bg-white/10 text-white/60 hover:text-white
                                border border-white/10 transition-all"
                            title="Manage document categories"
                        >
                            Manage Categories
                        </button>
                    )}
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

            {showCategories && (
                <ManageCategoriesModal
                    isOpen={showCategories}
                    onClose={() => setShowCategories(false)}
                />
            )}
        </div>
    );
}
