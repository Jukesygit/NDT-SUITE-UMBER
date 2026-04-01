/**
 * CompetencyPickerModal - Modal for selecting a competency type to add
 */

import { Modal } from '../../components/ui';
import type { CompetencyDefinition, CompetencyCategory } from '../../hooks/queries/useCompetencies';

interface CompetencyPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (definition: CompetencyDefinition) => void;
    definitions: CompetencyDefinition[];
    categories: CompetencyCategory[];
    searchTerm: string;
    onSearchTermChange: (term: string) => void;
    selectedCategory: string;
    onCategoryChange: (category: string) => void;
}

export function CompetencyPickerModal({
    isOpen,
    onClose,
    onSelect,
    definitions,
    categories,
    searchTerm,
    onSearchTermChange,
    selectedCategory,
    onCategoryChange,
}: CompetencyPickerModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Add Certification"
            size="large"
        >
            {/* Search */}
            <div style={{ marginBottom: '16px' }}>
                <input
                    type="text"
                    className="pm-input"
                    placeholder="Search certifications..."
                    value={searchTerm}
                    onChange={(e) => onSearchTermChange(e.target.value)}
                />
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => onCategoryChange('all')}
                    className={selectedCategory === 'all' ? 'pm-btn primary sm' : 'pm-btn sm'}
                >
                    All
                </button>
                {(categories || [])
                    .filter((cat) => !cat.name.toLowerCase().includes('personal details'))
                    .map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => onCategoryChange(cat.id)}
                            className={selectedCategory === cat.id ? 'pm-btn primary sm' : 'pm-btn sm'}
                        >
                            {cat.name}
                        </button>
                    ))}
            </div>

            {/* Competency List */}
            <div className="pm-expanded-comp-list">
                {(definitions || [])
                    .filter((def) => {
                        // Filter out personal details
                        const categoryName = typeof def.category === 'object' ? def.category?.name : def.category;
                        if (categoryName?.toLowerCase().includes('personal details')) return false;

                        // Category filter
                        if (selectedCategory !== 'all') {
                            const defCategoryId = typeof def.category === 'object' ? def.category?.id : null;
                            if (defCategoryId !== selectedCategory) return false;
                        }

                        // Search filter
                        if (searchTerm) {
                            const search = searchTerm.toLowerCase();
                            if (!def.name.toLowerCase().includes(search)) return false;
                        }

                        return true;
                    })
                    .map((def) => (
                        <div
                            key={def.id}
                            onClick={() => onSelect(def)}
                            className="pm-expanded-comp-item"
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                            }}
                        >
                            <div>
                                <div className="pm-competency-name">{def.name}</div>
                                {def.description && (
                                    <div className="pm-competency-meta">{def.description}</div>
                                )}
                            </div>
                            <svg style={{ width: '18px', height: '18px', color: 'var(--accent-primary)', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                    ))}
            </div>
        </Modal>
    );
}
