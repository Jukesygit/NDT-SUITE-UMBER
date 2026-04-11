/**
 * ProjectFilesTab - Browse, upload, and manage project files
 */

import { useState, useRef } from 'react';
import { Upload, Trash2, Download, FileText, Image, File } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
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
    photo: 'Photo',
    reference: 'Reference',
    report: 'Report',
    nde_file: 'NDE File',
    other: 'Other',
};

function FileIcon({ mimeType }: { mimeType: string | null }) {
    if (mimeType?.startsWith('image/')) return <Image size={16} style={{ color: '#a78bfa' }} />;
    if (mimeType?.includes('pdf')) return <FileText size={16} style={{ color: '#ef4444' }} />;
    return <File size={16} style={{ color: '#6b7280' }} />;
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

    // Build unified file list from project_files + composites + models
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
            id: f.id,
            name: f.name,
            vesselId: f.project_vessel_id,
            type: FILE_TYPE_LABELS[f.file_type] || f.file_type,
            date: f.created_at,
            size: formatBytes(f.size_bytes),
            mimeType: f.mime_type,
            source: 'file' as const,
            storagePath: f.storage_path,
            bucket: f.storage_bucket,
        })),
        ...scanComposites.map(sc => ({
            id: sc.id,
            name: sc.name,
            vesselId: sc.project_vessel_id,
            type: 'Scan Composite',
            date: sc.created_at,
            size: '',
            mimeType: null,
            source: 'composite' as const,
        })),
        ...vesselModels.map(vm => ({
            id: vm.id,
            name: vm.name,
            vesselId: vm.project_vessel_id,
            type: 'Vessel Model',
            date: vm.updated_at,
            size: '',
            mimeType: null,
            source: 'model' as const,
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
                projectId,
                projectVesselId: uploadVesselId || undefined,
                userId: user.id,
                name: file.name,
                fileType: uploadFileType,
                file,
            });
        }
        setShowUploadModal(false);
    };

    const handleDownload = async (entry: FileEntry) => {
        if (entry.source !== 'file' || !entry.storagePath) return;
        const url = await getProjectFileUrl(entry.storagePath, entry.bucket);
        window.open(url, '_blank');
    };

    const INPUT_STYLE: React.CSSProperties = {
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        color: '#fff',
        fontSize: '0.85rem',
        outline: 'none',
    };

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <select
                    value={vesselFilter}
                    onChange={e => setVesselFilter(e.target.value)}
                    style={{ ...INPUT_STYLE, minWidth: 160 }}
                >
                    <option value="all">All vessels</option>
                    <option value="project">Project-level</option>
                    {vessels.map(v => (
                        <option key={v.id} value={v.id}>
                            {v.vessel_tag ? `${v.vessel_tag} ` : ''}{v.vessel_name}
                        </option>
                    ))}
                </select>
                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    style={{ ...INPUT_STYLE, minWidth: 140 }}
                >
                    <option value="all">All types</option>
                    {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div style={{ flex: 1 }} />
                <button
                    onClick={() => setShowUploadModal(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#3b82f6',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    <Upload size={16} />
                    Upload
                </button>
            </div>

            {/* File list */}
            {filtered.length === 0 ? (
                <EmptyState
                    title="No files"
                    message="Upload files or save composites/models from the tools to see them here."
                    icon="folder"
                />
            ) : (
                <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 120px 100px 80px 60px',
                        gap: 8,
                        padding: '8px 16px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.4)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        background: 'rgba(255,255,255,0.02)',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <span>Name</span>
                        <span>Vessel</span>
                        <span>Type</span>
                        <span>Size</span>
                        <span />
                    </div>

                    {/* Rows */}
                    {filtered.map(entry => (
                        <div
                            key={`${entry.source}-${entry.id}`}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 120px 100px 80px 60px',
                                gap: 8,
                                padding: '10px 16px',
                                alignItems: 'center',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                fontSize: '0.8rem',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <FileIcon mimeType={entry.mimeType} />
                                <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {entry.name}
                                </span>
                            </div>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                                {getVesselLabel(entry.vesselId)}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                                {entry.type}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
                                {entry.size}
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {entry.source === 'file' && (
                                    <>
                                        <button
                                            onClick={() => handleDownload(entry)}
                                            title="Download"
                                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 2 }}
                                        >
                                            <Download size={14} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                const pf = files.find(f => f.id === entry.id);
                                                if (pf) setDeleteTarget(pf);
                                            }}
                                            title="Delete"
                                            style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.5)', cursor: 'pointer', padding: 2 }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <Modal title="Upload File" onClose={() => setShowUploadModal(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 380 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Assign to Vessel</span>
                            <select value={uploadVesselId} onChange={e => setUploadVesselId(e.target.value)} style={INPUT_STYLE}>
                                <option value="">Project-level (shared)</option>
                                {vessels.map(v => (
                                    <option key={v.id} value={v.id}>
                                        {v.vessel_tag ? `${v.vessel_tag} ` : ''}{v.vessel_name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>File Type</span>
                            <select value={uploadFileType} onChange={e => setUploadFileType(e.target.value as ProjectFileType)} style={INPUT_STYLE}>
                                {Object.entries(FILE_TYPE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); }}
                            style={{ display: 'none' }}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadMutation.isPending}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                padding: '20px',
                                borderRadius: 8,
                                border: '2px dashed rgba(255,255,255,0.15)',
                                background: 'rgba(255,255,255,0.02)',
                                color: 'rgba(255,255,255,0.5)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                            }}
                        >
                            <Upload size={20} />
                            {uploadMutation.isPending ? 'Uploading...' : 'Choose files...'}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <Modal title="Delete File" onClose={() => setDeleteTarget(null)}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
                        Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setDeleteTarget(null)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                            Cancel
                        </button>
                        <button
                            onClick={async () => {
                                await deleteMutation.mutateAsync({ id: deleteTarget.id, projectId });
                                setDeleteTarget(null);
                            }}
                            style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}
                        >
                            Delete
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
