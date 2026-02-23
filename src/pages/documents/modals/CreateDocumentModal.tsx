import { useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { Modal, FormField, FormSelect, FormTextarea } from '../../../components/ui';
import { useDocumentCategories } from '../../../hooks/queries/useDocuments';
import { useCreateDocument, useCreateRevision, useSubmitForReview } from '../../../hooks/mutations/useDocumentMutations';
// @ts-ignore
import authManager from '../../../auth-manager.js';

const VALID_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function CreateDocumentModal({ isOpen, onClose }: Props) {
    const { data: categories = [] } = useDocumentCategories();
    const createDoc = useCreateDocument();
    const createRevision = useCreateRevision();
    const submitForReview = useSubmitForReview();

    const [docNumber, setDocNumber] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [reviewPeriod, setReviewPeriod] = useState('12');
    const [file, setFile] = useState<File | null>(null);
    const [changeSummary, setChangeSummary] = useState('');
    const [submitReview, setSubmitReview] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState<'creating' | 'uploading' | 'submitting' | null>(null);

    const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }));

    const reviewOptions = [
        { value: '3', label: '3 months' },
        { value: '6', label: '6 months' },
        { value: '12', label: '12 months' },
        { value: '24', label: '24 months' },
        { value: '36', label: '36 months' },
    ];

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
        setError('');

        if (!docNumber.trim()) { setError('Document number is required'); return; }
        if (!title.trim()) { setError('Title is required'); return; }
        if (!categoryId) { setError('Category is required'); return; }
        if (!file) { setError('Please upload a document file'); return; }

        try {
            // 1. Create document record
            setStep('creating');
            const session = await authManager.getSession();
            const doc = await createDoc.mutateAsync({
                doc_number: docNumber.trim(),
                title: title.trim(),
                description: description.trim() || undefined,
                category_id: categoryId,
                owner_id: session.user.id,
                review_period_months: parseInt(reviewPeriod),
            });

            // 2. Upload file and create revision
            setStep('uploading');
            const revision = await createRevision.mutateAsync({
                documentId: doc.id,
                file,
                changeSummary: changeSummary.trim() || 'Initial revision',
            });

            // 3. Optionally submit for review
            if (submitReview) {
                setStep('submitting');
                await submitForReview.mutateAsync(revision.id);
            }

            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create document');
            setStep(null);
        }
    }, [docNumber, title, categoryId, file, description, reviewPeriod, changeSummary, submitReview, createDoc, createRevision, submitForReview, onClose]);

    const isSubmitting = step !== null;

    const footer = (
        <div className="flex justify-end gap-3">
            <button onClick={onClose} disabled={isSubmitting} className="dc-btn">
                Cancel
            </button>
            <button onClick={handleSubmit} disabled={isSubmitting} className="dc-btn primary">
                {step === 'creating' ? 'Creating...' : step === 'uploading' ? 'Uploading...' : step === 'submitting' ? 'Submitting...' : 'Create Document'}
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New Controlled Document" size="large" footer={footer}>
            <div className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        label="Document Number"
                        value={docNumber}
                        onChange={(e) => setDocNumber(e.target.value)}
                        placeholder="e.g. PROC-001"
                        required
                    />
                    <FormSelect
                        label="Category"
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        options={categoryOptions}
                        placeholder="Select category"
                        required
                    />
                </div>

                <FormField
                    label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Ultrasonic Testing General Procedure"
                    required
                />

                <FormTextarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the document..."
                    rows={2}
                />

                <FormSelect
                    label="Review Period"
                    value={reviewPeriod}
                    onChange={(e) => setReviewPeriod(e.target.value)}
                    options={reviewOptions}
                />

                {/* File Upload */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                        Document File <span className="text-red-400">*</span>
                    </label>
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                            isDragging
                                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                                : 'border-gray-600 hover:border-gray-500'
                        }`}
                        onClick={() => document.getElementById('doc-file-input')?.click()}
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
                                <svg className="w-8 h-8 text-gray-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="text-sm text-gray-400">Drop a file here or click to browse</p>
                                <p className="text-xs text-gray-500 mt-1">PDF or images, max 25MB</p>
                            </div>
                        )}
                        <input
                            id="doc-file-input"
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                    </div>
                </div>

                <FormTextarea
                    label="Change Summary"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="Initial release"
                    rows={2}
                />

                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={submitReview}
                        onChange={(e) => setSubmitReview(e.target.checked)}
                        className="rounded border-gray-600"
                    />
                    Submit for review immediately after creation
                </label>
            </div>
        </Modal>
    );
}
