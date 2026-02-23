import { useState, lazy, Suspense, useMemo } from 'react';
import { SectionSpinner } from '../../components/ui';
// @ts-ignore - JS module without type declarations
import authManager from '../../auth-manager.js';
import ManageCategoriesModal from './modals/ManageCategoriesModal';
import DocumentStats from './components/DocumentStats';
import { useDocumentsDueForReview, useDocumentCategories, useDocuments } from '../../hooks/queries/useDocuments';
import type { ReviewDueDocument } from '../../types/document-control';
import './document-control.css';

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
    const [search, setSearch] = useState('');
    const canManage = authManager.hasPermission('manage_users');

    const tabs: Tab[] = [
        { id: 'register', label: 'Document Register' },
        ...(canManage ? [{ id: 'reviews' as TabType, label: 'Review Dashboard' }] : []),
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'register': return <DocumentRegisterTab canManage={canManage} search={search} />;
            case 'reviews': return canManage ? <ReviewDashboardTab /> : null;
            default: return <DocumentRegisterTab canManage={canManage} search={search} />;
        }
    };

    return (
        <div className="h-full overflow-y-auto glass-scrollbar" style={{ padding: '32px 40px' }}>
            {/* Header */}
            <div className="dc-header">
                <div className="dc-header-left">
                    <div className="dc-logo">DC</div>
                    <div className="dc-header-text">
                        <h1>Document Control</h1>
                        <p>Manage controlled documents, versions, and review cycles</p>
                    </div>
                </div>
                <div className="dc-header-actions">
                    {canManage && (
                        <>
                            <button
                                className="dc-btn"
                                onClick={() => setShowCategories(true)}
                            >
                                Manage Categories
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Stats */}
            <DocumentStats />

            {/* Main 2-column Layout */}
            <div className="dc-main-layout">
                {/* Content Card */}
                <div className="dc-content-card">
                    <div className="dc-card-header">
                        <div className="dc-card-tabs">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    className={`dc-card-tab ${activeTab === tab.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        {activeTab === 'register' && (
                            <div className="dc-search">
                                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.35-4.35" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search documents..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    <Suspense
                        key={activeTab}
                        fallback={
                            <div className="flex flex-col items-center justify-center py-12 gap-4">
                                <SectionSpinner message="Loading..." />
                            </div>
                        }
                    >
                        {renderTabContent()}
                    </Suspense>
                </div>

                {/* Sidebar */}
                <DocumentSidebar />
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

function DocumentSidebar() {
    const { data: reviewDocs = [] } = useDocumentsDueForReview(90);
    const { data: categories = [] } = useDocumentCategories();
    const { data: documents = [] } = useDocuments();

    const overdue = reviewDocs.filter(d => d.is_overdue);
    const dueSoon = reviewDocs.filter(d => !d.is_overdue);
    const attentionItems = [...overdue, ...dueSoon].slice(0, 5);

    // Count documents per category
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        documents.forEach(doc => {
            if (doc.category_id) {
                counts[doc.category_id] = (counts[doc.category_id] || 0) + 1;
            }
        });
        return counts;
    }, [documents]);

    const maxCategoryCount = useMemo(() => {
        const vals = Object.values(categoryCounts);
        return vals.length > 0 ? Math.max(...vals) : 1;
    }, [categoryCounts]);

    // Recent activity derived from recently updated documents
    const recentDocs = useMemo(() => {
        return [...documents]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 3);
    }, [documents]);

    const getTimeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        return `${days}d ago`;
    };

    return (
        <div className="dc-sidebar">
            {/* Attention Required */}
            {attentionItems.length > 0 && (
                <div className="dc-sidebar-card">
                    <div className="dc-sidebar-title">
                        <span className="dc-sidebar-dot red" />
                        Attention Required
                    </div>
                    {attentionItems.map((item: ReviewDueDocument) => (
                        <div key={item.document_id} className="dc-review-item">
                            <div>
                                <div className="dc-review-item-title">{item.title}</div>
                                <div className="dc-review-item-meta">
                                    {item.doc_number} &middot; {item.owner_username}
                                </div>
                            </div>
                            <span className={`dc-review-tag ${item.is_overdue ? 'overdue' : 'soon'}`}>
                                {item.is_overdue
                                    ? `${Math.abs(item.days_until_review)}d overdue`
                                    : `${item.days_until_review}d left`
                                }
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Categories */}
            {categories.length > 0 && (
                <div className="dc-sidebar-card">
                    <div className="dc-sidebar-title">Categories</div>
                    <div className="dc-cat-list">
                        {categories.map((cat) => {
                            const count = categoryCounts[cat.id] || 0;
                            const pct = maxCategoryCount > 0 ? (count / maxCategoryCount) * 100 : 0;
                            return (
                                <div key={cat.id} className="dc-cat-item">
                                    <span className="dc-cat-name">{cat.name}</span>
                                    <div className="dc-cat-bar">
                                        <div className="dc-cat-fill" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="dc-cat-count">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Recent Activity */}
            {recentDocs.length > 0 && (
                <div className="dc-sidebar-card">
                    <div className="dc-sidebar-title">Recent Activity</div>
                    {recentDocs.map((doc) => (
                        <div key={doc.id} className="dc-activity-item">
                            <div className={`dc-activity-dot ${doc.status === 'approved' ? 'approve' : doc.status === 'under_review' ? 'submit' : 'edit'}`}>
                                {doc.status === 'approved' ? '\u2713' : doc.status === 'under_review' ? '\u25B6' : '\u2191'}
                            </div>
                            <div>
                                <div className="dc-activity-text">
                                    <strong>{doc.doc_number}</strong> {doc.title}
                                </div>
                                <div className="dc-activity-time">{getTimeAgo(doc.updated_at)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
