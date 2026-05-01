/**
 * ProfileAvatar - User avatar display with upload functionality
 */

import { ChangeEvent } from 'react';
import { RandomMatrixSpinner } from '../../components/MatrixSpinners';

interface ProfileAvatarProps {
    avatarUrl?: string;
    username: string;
    email: string;
    isUploading?: boolean;
    onUpload?: (file: File) => void;
    disabled?: boolean;
}

function UserIcon() {
    return (
        <svg
            style={{ width: '48px', height: '48px', color: 'var(--color-neutral-400)' }}
            fill="currentColor"
            viewBox="0 0 24 24"
        >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
    );
}

export function ProfileAvatar({
    avatarUrl,
    username,
    email,
    isUploading = false,
    onUpload,
    disabled = false,
}: ProfileAvatarProps) {
    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            alert('Image must be less than 2MB');
            return;
        }
        onUpload?.(file);
    };

    return (
        <div className="pf-avatar-section">
            <div className="pf-avatar-wrapper">
                <div className="pf-avatar-circle">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="Profile" />
                    ) : (
                        <UserIcon />
                    )}
                </div>
                {isUploading && (
                    <div className="pf-avatar-overlay">
                        <RandomMatrixSpinner size={40} />
                    </div>
                )}
            </div>

            <div>
                <h3 className="pf-avatar-name">{username}</h3>
                <p className="pf-avatar-email">{email}</p>
                {onUpload && (
                    <label
                        className="pf-btn sm"
                        style={{
                            cursor: disabled || isUploading ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            opacity: disabled || isUploading ? 0.5 : 1,
                        }}
                    >
                        <svg style={{ width: '12px', height: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {isUploading ? 'Uploading...' : 'Change Photo'}
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            disabled={disabled || isUploading}
                            style={{ display: 'none' }}
                        />
                    </label>
                )}
            </div>
        </div>
    );
}

export default ProfileAvatar;
