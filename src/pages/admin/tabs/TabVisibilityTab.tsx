/**
 * TabVisibilityTab - Super Admin tab to toggle navigation tab visibility for all users
 */

import { useTabVisibility, useUpdateTabVisibility } from '../../../hooks/queries/useTabVisibility';
import { SectionSpinner, ErrorDisplay } from '../../../components/ui';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';

export default function TabVisibilityTab() {
    const { data: settings = [], isLoading, isError } = useTabVisibility();
    const updateMutation = useUpdateTabVisibility();

    if (isLoading) return <SectionSpinner message="Loading tab settings..." />;
    if (isError) return <ErrorDisplay message="Failed to load tab visibility settings" />;

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

            <div className="grid gap-3">
                {settings.map((setting) => (
                    <div
                        key={setting.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10"
                    >
                        <div>
                            <span className="text-sm font-medium text-white">
                                {setting.tab_label}
                            </span>
                            <span className="ml-3 text-xs text-white/40">
                                ({setting.tab_id})
                            </span>
                        </div>

                        <button
                            onClick={() => handleToggle(setting.tab_id, setting.is_visible)}
                            disabled={updateMutation.isPending}
                            className={`
                                relative inline-flex h-6 w-11 items-center rounded-full
                                transition-colors duration-200 ease-in-out
                                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-[#1a1a2e]
                                disabled:opacity-50 disabled:cursor-not-allowed
                                ${setting.is_visible
                                    ? 'bg-blue-600'
                                    : 'bg-white/20'
                                }
                            `}
                            title={setting.is_visible ? 'Click to hide' : 'Click to show'}
                        >
                            {updateMutation.isPending ? (
                                <span className="absolute inset-0 flex items-center justify-center">
                                    <RandomMatrixSpinner size={14} />
                                </span>
                            ) : (
                                <span
                                    className={`
                                        inline-block h-4 w-4 rounded-full bg-white shadow
                                        transform transition-transform duration-200 ease-in-out
                                        ${setting.is_visible ? 'translate-x-6' : 'translate-x-1'}
                                    `}
                                />
                            )}
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
