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

    // Upload directly using supabase storage - use 'avatars' bucket which we know works
    const fileExt = file.name.split('.').pop();
    const competencySlug = competencyName.replace(/\s+/g, '_').toLowerCase();
    const fileName = `cert_${competencySlug}_${Date.now()}.${fileExt}`;
    const filePath = `${userId}/certificates/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
        });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

    return {
        url: urlData.publicUrl,
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
