/**
 * PersonnelExpandedRow - Expanded details view for a person in the table.
 * Orchestrates sub-components for personal details, competencies, and modals.
 */

import { useState, useCallback } from 'react';
import type { Person, Organization } from '../../hooks/queries/usePersonnel';
import { useUpdatePerson } from '../../hooks/mutations';
import { EditCompetencyModal } from '../profile/EditCompetencyModal';
import { WitnessCheckModal } from '../../components/features/witness/WitnessCheckModal';
import type { PersonEditData } from './PersonnelExpandedRowUtils';

// @ts-ignore - JS module without types
import authManager from '../../auth-manager.js';

// Sub-components
import { PersonDetail } from './PersonDetail';
import { CompetencySection } from './CompetencySection';
import { CertificateDetailModal } from './CertificateDetailModal';
import { CompetencyPickerModal } from './CompetencyPickerModal';
import { useCompetencyManagement } from './useCompetencyManagement';

interface PersonnelExpandedRowProps {
    person: Person;
    isAdmin: boolean;
    organizations: Organization[];
    onUpdate?: () => void;
}

/**
 * PersonnelExpandedRow component
 */
export function PersonnelExpandedRow({ person, isAdmin, organizations, onUpdate }: PersonnelExpandedRowProps) {
    // Person editing state
    const [editingPerson, setEditingPerson] = useState(false);
    const [personEditData, setPersonEditData] = useState<PersonEditData>({
        username: person.username,
        email: person.email,
        role: person.role,
        organization_id: person.organization_id || '',
        mobile_number: person.mobile_number || '',
        home_address: person.home_address || '',
        nearest_uk_train_station: person.nearest_uk_train_station || '',
        date_of_birth: person.date_of_birth || '',
        next_of_kin: person.next_of_kin || '',
        next_of_kin_emergency_contact_number: person.next_of_kin_emergency_contact_number || '',
        vantage_number: person.vantage_number || '',
    });

    // Save error state
    const [saveError, setSaveError] = useState<string | null>(null);

    // Mutations
    const updatePerson = useUpdatePerson();

    // Competency management (editing, adding, witness checks, certificate viewing)
    const cm = useCompetencyManagement(person.id, onUpdate);

    const handleEditPerson = useCallback(() => {
        setSaveError(null);
        setPersonEditData({
            username: person.username,
            email: person.email,
            role: person.role,
            organization_id: person.organization_id || '',
            mobile_number: person.mobile_number || '',
            home_address: person.home_address || '',
            nearest_uk_train_station: person.nearest_uk_train_station || '',
            date_of_birth: person.date_of_birth || '',
            next_of_kin: person.next_of_kin || '',
            next_of_kin_emergency_contact_number: person.next_of_kin_emergency_contact_number || '',
            vantage_number: person.vantage_number || '',
        });
        setEditingPerson(true);
    }, [person]);

    const handleCancelPersonEdit = useCallback(() => {
        setEditingPerson(false);
    }, []);

    const handleSavePerson = useCallback(async () => {
        setSaveError(null);
        try {
            await updatePerson.mutateAsync({
                personId: person.id,
                data: personEditData,
            });
            setEditingPerson(false);
            onUpdate?.();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to save changes. Please try again.';
            setSaveError(errorMessage);
        }
    }, [person.id, personEditData, updatePerson, onUpdate]);

    return (
        <div className="pm-expanded">
            {/* Personal Information Section */}
            <PersonDetail
                person={person}
                isAdmin={isAdmin}
                organizations={organizations}
                editingPerson={editingPerson}
                personEditData={personEditData}
                setPersonEditData={setPersonEditData}
                saveError={saveError}
                isSaving={updatePerson.isPending}
                onEdit={handleEditPerson}
                onCancel={handleCancelPersonEdit}
                onSave={handleSavePerson}
            />

            {/* Divider */}
            <div
                style={{
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                    margin: '20px 0',
                }}
            />

            {/* Competencies Section */}
            <CompetencySection
                competencies={person.competencies || []}
                isAdmin={isAdmin}
                onEditCompetency={cm.handleEditCompetency}
                onWitnessCheck={cm.handleWitnessCheck}
                onViewCertificate={cm.setViewingCompetency}
                onAddCompetency={() => cm.setShowCompetencyPicker(true)}
            />

            {/* Certificate Detail Modal */}
            <CertificateDetailModal
                competency={cm.viewingCompetency}
                resolvedDocumentUrl={cm.resolvedDocumentUrl}
                onClose={() => cm.setViewingCompetency(null)}
            />

            {/* Edit Competency Modal (Admin only) */}
            {cm.editingCompetency && cm.editModalDefinition && cm.editModalInitialData && (
                <EditCompetencyModal
                    isOpen={!!cm.editingCompetency}
                    onClose={() => cm.setEditingCompetency(null)}
                    onSave={cm.handleSaveCompetencyModal}
                    isNew={false}
                    initialData={cm.editModalInitialData}
                    definition={cm.editModalDefinition}
                    isSaving={cm.updateCompetencyIsPending}
                    onDocumentUpload={cm.handleDocumentUpload}
                    isUploadingDocument={cm.uploadDocumentIsPending}
                />
            )}

            {/* Witness Check Modal (Admin only) */}
            {cm.witnessingCompetency && (
                <WitnessCheckModal
                    isOpen={!!cm.witnessingCompetency}
                    onClose={() => cm.setWitnessingCompetency(null)}
                    competencyName={cm.witnessingCompetency.competency?.name || 'Certification'}
                    personName={person.username}
                    existingWitnessData={{
                        witness_checked: cm.witnessingCompetency.witness_checked,
                        witnessed_by: cm.witnessingCompetency.witnessed_by,
                        witnessed_at: cm.witnessingCompetency.witnessed_at,
                        witness_notes: cm.witnessingCompetency.witness_notes,
                    }}
                    currentUser={{
                        id: authManager.getCurrentUser()?.id || '',
                        name: authManager.getCurrentUser()?.username || authManager.getCurrentUser()?.email || 'Unknown',
                    }}
                    onSave={cm.handleSaveWitnessCheck}
                    onRemove={cm.handleRemoveWitnessCheck}
                    isSaving={cm.updateCompetencyIsPending}
                />
            )}

            {/* Competency Type Picker Modal */}
            <CompetencyPickerModal
                isOpen={cm.showCompetencyPicker}
                onClose={() => {
                    cm.setShowCompetencyPicker(false);
                    cm.setPickerSearchTerm('');
                    cm.setPickerCategory('all');
                }}
                onSelect={cm.handleSelectCompetencyType}
                definitions={cm.definitions}
                categories={cm.categories}
                searchTerm={cm.pickerSearchTerm}
                onSearchTermChange={cm.setPickerSearchTerm}
                selectedCategory={cm.pickerCategory}
                onCategoryChange={cm.setPickerCategory}
            />

            {/* Add New Competency Modal */}
            {cm.addingCompetency && cm.addModalDefinition && (
                <EditCompetencyModal
                    isOpen={!!cm.addingCompetency}
                    onClose={() => cm.setAddingCompetency(null)}
                    onSave={cm.handleSaveNewCompetency}
                    isNew={true}
                    definition={cm.addModalDefinition}
                    isSaving={cm.addCompetencyIsPending}
                    onDocumentUpload={cm.handleNewDocumentUpload}
                    isUploadingDocument={cm.uploadDocumentIsPending}
                />
            )}
        </div>
    );
}

export default PersonnelExpandedRow;
