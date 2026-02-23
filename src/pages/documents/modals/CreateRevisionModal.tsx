import { useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { Modal, FormTextarea } from '../../../components/ui';
import { useCreateRevision, useSubmitForReview } from '../../../hooks/mutations/useDocumentMutations';

const VALID_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    documentId: string;
}

export default function CreateRevisionModal({ isOpen, onClose, documentId }: Props) {
    const createRevision = useCreateRevision();
    const submitForReview = useSubmitForReview();

    const [file, setFile] = useState<File | null>(null);
    const [changeSummary, setChangeSummary] = useState('');
    const [submitReview, setSubmitReview] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const validateFile = (f: File): string | null => {
        if (!VALID_FILE_TYPES.includes(f.type)) return 'Invalid file type. Please upload a PDF or image.';
        if (f.size > MAX_FILE_SIZE) return 'File too large. Maximum size is 25MB.';
        return null;
    };

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const err = validateFile(f);
        if (err) { setError(err); return; }
        setFile(f);
        setError('');
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (!f) return;
        const err = validateFile(f);
        if (err) { setError(err); return; }
        setFile(f);
        setError('');
    };

    const handleSubmit = useCallback(async () => {
        if (!file) { setError('Please upload a document file'); return; }
        if (!changeSummary.trim()) { setError('Please describe what changed'); return; }

        setError('');
        setIsSubmitting(true);

        try {
            const revision = await createRevision.mutateAsync({
                documentId,
                file,
                changeSummary: changeSummary.trim(),
            });

            if (submitReview) {
                await submitForReview.mutateAsync(revision.id);
            }

            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create revision');
        } finally {
            setIsSubmitting(false);
        }
    }, [file, changeSummary, submitReview, documentId, createRevision, submitForReview, onClose]);

    const footer = (
        <div className="flex justify-end gap-3">
            <button onClick={onClose} disabled={isSubmitting} className="dc-btn">Cancel</button>
            <button onClick={handleSubmit} disabled={isSubmitting} className="dc-btn primary">
                {isSubmitting ? 'Uploading...' : 'Create Revision'}
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload New Revision" size="medium" footer={footer}>
            <div className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                        isDragging ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5' : 'border-gray-600 hover:border-gray-500'
                    }`}
                    onClick={() => document.getElementById('rev-file-input')?.click()}
                >
                    {file ? (
                        <div className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm text-gray-300">{file.name}</span>
                            <span className="text-xs text-gray-500">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm text-gray-400">Drop a file here or click to browse</p>
                            <p className="text-xs text-gray-500 mt-1">PDF or images, max 25MB</p>
                        </div>
                    )}
                    <input
                        id="rev-file-input"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                </div>

                <FormTextarea
                    label="What Changed"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="Describe the changes in this revision..."
                    rows={3}
                    required
                />

                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={submitReview}
                        onChange={(e) => setSubmitReview(e.target.checked)}
                        className="rounded border-gray-600"
                    />
                    Submit for review immediately
                </label>
            </div>
        </Modal>
    );
}
