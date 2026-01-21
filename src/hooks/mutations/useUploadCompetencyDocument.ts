/**
 * useUploadCompetencyDocument - Mutation hook for uploading competency documents
 */

import { useMutation } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

// ES module import
// @ts-ignore - JS module without types
import supabaseImport from '../../supabase-client.js';
// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;

interface UploadCompetencyDocumentParams {
    userId: string;
    competencyName: string;
    file: File;
}

interface UploadCompetencyDocumentResult {
    url: string;
    name: string;
}

// Timeout wrapper for async operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
}

async function uploadCompetencyDocument(params: UploadCompetencyDocumentParams): Promise<UploadCompetencyDocumentResult> {
    const { userId, competencyName, file } = params;

    // Validate file type - images and PDFs supported
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Please upload an image (JPG, PNG, GIF, WebP) or PDF file.');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        throw new Error('File must be less than 10MB');
    }

    // Upload to 'documents' bucket (matching competency-service.js pattern)
    const fileExt = file.name.split('.').pop();
    const competencySlug = competencyName.replace(/\s+/g, '_').toLowerCase();
    const fileName = `${userId}/${competencySlug}_${Date.now()}.${fileExt}`;
    const filePath = `competency-documents/${fileName}`;

    // Upload with 60 second timeout to prevent indefinite hanging
    const uploadPromise = supabase.storage
        .from('documents')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
        });

    try {
        const { error: uploadError } = await withTimeout(
            uploadPromise,
            60000, // 60 second timeout
            'Upload timed out. Please check your connection and try again.'
        );

        if (uploadError) {
            console.error('Supabase upload error:', uploadError);
            throw new Error(uploadError.message || 'Failed to upload document');
        }
    } catch (error) {
        console.error('Upload failed:', error);
        throw error;
    }

    // Return the storage path (not a URL) - signed URLs are generated when viewing
    return {
        url: filePath,
        name: file.name
    };
}

/**
 * Hook for uploading competency document
 *
 * @example
 * const uploadDocument = useUploadCompetencyDocument();
 *
 * const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) {
 *         uploadDocument.mutate({
 *             userId,
 *             competencyName: 'PAUT Level 2',
 *             file
 *         }, {
 *             onSuccess: (result) => {
 *                 setFormData({ ...formData, document_url: result.url, document_name: result.name });
 *             }
 *         });
 *     }
 * };
 */
export function useUploadCompetencyDocument() {
    return useMutation({
        mutationFn: uploadCompetencyDocument,
    });
}

export default useUploadCompetencyDocument;
