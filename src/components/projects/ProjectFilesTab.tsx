/**
 * ProjectFilesTab - Browse, upload, and manage project files
 */

import { useState, useRef } from 'react';
import { Upload, Trash2, Download, FileText, Image, File } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useUploadProjectFile, useDeleteProjectFile } from '../../hooks/mutations/useInspectionProjectMutations';
import { getProjectFileUrl } from '../../services/inspection-project-service';
import { useAuth } from '../../contexts/AuthContext';
import type { ProjectFile, ProjectVessel, ProjectFileType } from '../../types/inspection-project';

interface ProjectFilesTabProps {
    projectId: string;
    files: ProjectFile[];
    vessels: ProjectVessel[];
    scanComposites: { id: string; name: string; created_at: string; project_vessel_id: string | null }[];
    vesselModels: { id: string; name: string; updated_at: string; project_vessel_id: string | null }[];
}

const FILE_TYPE_LABELS: Record<ProjectFileType, string> = {
    ga_drawing: 'GA Drawing',
    location_drawing: 'Location Drawing',
    pid_drawing: 'P&ID Drawing',
    rba_file: 'RBA File',
    photo: 'Photo',
    reference: 'Reference',
    report: 'Report',
    nde_file: 'NDE File',
    other: 'Other',
};

function FileIcon({ mimeType }: { mimeType: string | null }) {
    if (mimeType?.startsWith('image/')) return <Image size={14} style={{ color: 'var(--amber)', opacity: 0.7 }} />;
    if (mimeType?.includes('pdf')) return <FileText size={14} style={{ color: 'var(--red)', opacity: 0.7 }} />;
    return <File size={14} style={{ color: 'rgba(53, 160, 88, 0.40)' }} />;
}

function formatBytes(bytes: number | null): string {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectFilesTab({ projectId, files, vessels, scanComposites, vesselModels }: ProjectFilesTabProps) {
    const { user } = useAuth();
    const uploadMutation = useUploadProjectFile();
    const deleteMutation = useDeleteProjectFile();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [vesselFilter, setVesselFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [uploadVesselId, setUploadVesselId] = useState<string>('');
    const [uploadFileType, setUploadFileType] = useState<ProjectFileType>('reference');
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ProjectFile | null>(null);

    const vesselMap = new Map(vessels.map(v => [v.id, v]));

    const getVesselLabel = (vesselId: string | null) => {
        if (!vesselId) return 'Project';
        const v = vesselMap.get(vesselId);
        return v ? `${v.vessel_tag ?? ''} ${v.vessel_name}`.trim() : 'Unknown';
    };

    type FileEntry = {
        id: string;
        name: string;
        vesselId: string | null;
        type: string;
        date: string;
        size: string;
        mimeType: string | null;
        source: 'file' | 'composite' | 'model';
        storagePath?: string;
        bucket?: string;
    };

    const allFiles: FileEntry[] = [
        ...files.map(f => ({
            id: f.id, name: f.name, vesselId: f.project_vessel_id,
            type: FILE_TYPE_LABELS[f.file_type] || f.file_type, date: f.created_at,
            size: formatBytes(f.size_bytes), mimeType: f.mime_type, source: 'file' as const,
            storagePath: f.storage_path, bucket: f.storage_bucket,
        })),
        ...scanComposites.map(sc => ({
            id: sc.id, name: sc.name, vesselId: sc.project_vessel_id,
            type: 'Scan Composite', date: sc.created_at, size: '', mimeType: null, source: 'composite' as const,
        })),
        ...vesselModels.map(vm => ({
            id: vm.id, name: vm.name, vesselId: vm.project_vessel_id,
            type: 'Vessel Model', date: vm.updated_at, size: '', mimeType: null, source: 'model' as const,
        })),
    ];

    const filtered = allFiles.filter(f => {
        if (vesselFilter !== 'all' && f.vesselId !== (vesselFilter === 'project' ? null : vesselFilter)) return false;
        if (typeFilter !== 'all' && f.type !== typeFilter) return false;
        return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const uniqueTypes = [...new Set(allFiles.map(f => f.type))].sort();

    const handleUpload = async (selectedFiles: FileList) => {
        if (!user) return;
        for (const file of Array.from(selectedFiles)) {
            await uploadMutation.mutateAsync({
                projectId, projectVesselId: uploadVesselId || undefined,
                userId: user.id, name: file.name, fileType: uploadFileType, file,
            });
        }
        setShowUploadModal(false);
    };

    const handleDownload = async (entry: FileEntry) => {
        if (entry.source !== 'file' || !entry.storagePath) return;
        const url = await getProjectFileUrl(entry.storagePath, entry.bucket);
        window.open(url, '_blank');
    };

    return (
        <div className="pj-content">
            {/* Toolbar */}
            <div className="pj-toolbar">
                <div className="pj-toolbar-left">
                    <select value={vesselFilter} onChange={e => setVesselFilter(e.target.value)} className="pj-select">
                        <option value="all">All vessels</option>
                        <option value="project">Project-level</option>
                        {vessels.map(v => (
                            <option key={v.id} value={v.id}>
                                {v.vessel_tag ? `${v.vessel_tag} ` : ''}{v.vessel_name}
                            </option>
                        ))}
                    </select>
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="pj-select">
                        <option value="all">All types</option>
                        {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <button onClick={() => setShowUploadModal(true)} className="pj-btn primary">
                    <Upload size={14} />
                    Upload
                </button>
            </div>

            {/* File list */}
            {filtered.length === 0 ? (
                <div className="pj-display-well">
                    <div className="pj-display">
                        <div className="pj-empty">
                            <div className="pj-empty-title">No files</div>
                            <div className="pj-empty-text">Upload files or save composites/models from the tools to see them here.</div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="pj-display-well">
                    <div className="pj-card-display">
                        <div className="pj-file-table-header">
                            <span>Name</span>
                            <span>Vessel</span>
                            <span>Type</span>
                            <span>Size</span>
                            <span />
                        </div>
                        {filtered.map(entry => (
                            <div key={`${entry.source}-${entry.id}`} className="pj-file-row">
                                <div className="pj-file-name">
                                    <FileIcon mimeType={entry.mimeType} />
                                    <span>{entry.name}</span>
                                </div>
                                <span className="pj-file-meta">{getVesselLabel(entry.vesselId)}</span>
                                <span className="pj-file-meta">{entry.type}</span>
                                <span className="pj-file-meta" style={{ opacity: 0.7 }}>{entry.size}</span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {entry.source === 'file' && (
                                        <>
                                            <button onClick={() => handleDownload(entry)} title="Download" className="pj-file-action-btn">
                                                <Download size={13} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const pf = files.find(f => f.id === entry.id);
                                                    if (pf) setDeleteTarget(pf);
                                                }}
                                                title="Delete"
                                                className="pj-file-action-btn danger"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <Modal isOpen={true} title="Upload File" onClose={() => setShowUploadModal(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 380 }}>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Assign to Vessel</span>
                            <select value={uploadVesselId} onChange={e => setUploadVesselId(e.target.value)} className="pj-form-input">
                                <option value="">Project-level (shared)</option>
                                {vessels.map(v => (
                                    <option key={v.id} value={v.id}>
                                        {v.vessel_tag ? `${v.vessel_tag} ` : ''}{v.vessel_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">File Type</span>
                            <select value={uploadFileType} onChange={e => setUploadFileType(e.target.value as ProjectFileType)} className="pj-form-input">
                                {Object.entries(FILE_TYPE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <input ref={fileInputRef} type="file" multiple onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); }} style={{ display: 'none' }} />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadMutation.isPending}
                            className="pj-upload-zone"
                        >
                            <Upload size={18} />
                            {uploadMutation.isPending ? 'Uploading...' : 'Choose files...'}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <Modal isOpen={true} title="Delete File" onClose={() => setDeleteTarget(null)}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
                        Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setDeleteTarget(null)} className="pj-btn secondary">Cancel</button>
                        <button
                            onClick={async () => {
                                await deleteMutation.mutateAsync({ id: deleteTarget.id, projectId });
                                setDeleteTarget(null);
                            }}
                            className="pj-btn danger"
                        >
                            Delete
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
