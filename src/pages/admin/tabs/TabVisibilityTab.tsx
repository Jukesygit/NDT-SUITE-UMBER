/**
 * TabVisibilityTab - Super Admin tab to toggle navigation tab visibility for all users
 */

import { useTabVisibility, useUpdateTabVisibility } from '../../../hooks/queries/useTabVisibility';
import { SectionSpinner, ErrorDisplay } from '../../../components/ui';

export default function TabVisibilityTab() {
    const { data: settings = [], isLoading, isError } = useTabVisibility();
    const updateMutation = useUpdateTabVisibility();

    if (isLoading) return <SectionSpinner message="Loading tab settings..." />;
    if (isError) return <ErrorDisplay error={new Error('Failed to load tab visibility settings')} />;

    const handleToggle = (tabId: string, currentlyVisible: boolean) => {
        updateMutation.mutate({ tabId, isVisible: !currentlyVisible });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-white mb-1">Tab Visibility</h2>
                <p className="text-sm text-white/50">
                    Control which navigation tabs are visible to all users. Super admins always see all tabs regardless of these settings.
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {settings.map((setting) => (
                    <div
                        key={setting.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}
                    >
                        <div>
                            <span style={{ fontSize: '14px', fontWeight: 500, color: 'white' }}>
                                {setting.tab_label}
                            </span>
                            <span style={{ marginLeft: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                                ({setting.tab_id})
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={() => handleToggle(setting.tab_id, setting.is_visible)}
                            disabled={updateMutation.isPending}
                            style={{
                                position: 'relative',
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: '28px',
                                width: '52px',
                                flexShrink: 0,
                                borderRadius: '9999px',
                                cursor: updateMutation.isPending ? 'not-allowed' : 'pointer',
                                border: 'none',
                                backgroundColor: setting.is_visible ? '#2563eb' : 'rgba(255,255,255,0.25)',
                                transition: 'background-color 200ms',
                                opacity: updateMutation.isPending ? 0.5 : 1,
                            }}
                            title={setting.is_visible ? 'Click to hide' : 'Click to show'}
                        >
                            <span
                                style={{
                                    display: 'block',
                                    height: '22px',
                                    width: '22px',
                                    borderRadius: '50%',
                                    backgroundColor: 'white',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                    transform: setting.is_visible ? 'translateX(26px)' : 'translateX(3px)',
                                    transition: 'transform 200ms',
                                }}
                            />
                        </button>
                    </div>
                ))}

                {settings.length === 0 && (
                    <div className="text-center py-8 text-white/40 text-sm">
                        No tab visibility settings found. Run the database migration to seed default settings.
                    </div>
                )}
            </div>

            {updateMutation.isError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50">
                    <p className="text-sm text-red-400">
                        Failed to update tab visibility. Please try again.
                    </p>
                </div>
            )}
        </div>
    );
}
