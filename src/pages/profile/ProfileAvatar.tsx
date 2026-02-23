/**
 * ProfileAvatar - User avatar display with upload functionality
 */

import { ChangeEvent } from 'react';
import { RandomMatrixSpinner } from '../../components/MatrixSpinners';

interface ProfileAvatarProps {
    /** Current avatar URL */
    avatarUrl?: string;
    /** User's display name */
    username: string;
    /** User's email */
    email: string;
    /** Whether avatar is currently uploading */
    isUploading?: boolean;
    /** Callback when file is selected for upload */
    onUpload?: (file: File) => void;
    /** Whether upload is disabled */
    disabled?: boolean;
}

/**
 * User icon placeholder
 */
function UserIcon() {
    return (
        <svg
            style={{ width: '60px', height: '60px', color: 'rgba(255, 255, 255, 0.5)' }}
            fill="currentColor"
            viewBox="0 0 24 24"
        >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
    );
}

/**
 * Camera/upload icon
 */
function CameraIcon() {
    return (
        <svg
            style={{ width: '14px', height: '14px', marginRight: '6px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
        </svg>
    );
}

/**
 * ProfileAvatar component
 *
 * @example
 * <ProfileAvatar
 *     avatarUrl={profile?.avatar_url}
 *     username={user.username}
 *     email={user.email}
 *     isUploading={uploadAvatar.isPending}
 *     onUpload={(file) => uploadAvatar.mutate({ userId: user.id, file })}
 * />
 */
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

        // Reset input value so same file can be selected again on retry
        e.target.value = '';

        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('Image must be less than 2MB');
            return;
        }

        onUpload?.(file);
    };

    return (
        <div className="pf-avatar-section">
            {/* Avatar Circle */}
            <div className="pf-avatar-wrapper">
                <div className="pf-avatar-circle">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="Profile" />
                    ) : (
                        <UserIcon />
                    )}
                </div>

                {/* Upload Overlay */}
                {isUploading && (
                    <div className="pf-avatar-overlay">
                        <RandomMatrixSpinner size={40} />
                    </div>
                )}
            </div>

            {/* User Info & Upload Button */}
            <div>
                <h3 className="pf-avatar-name">{username}</h3>
                <p className="pf-avatar-email">{email}</p>

                {onUpload && (
                    <label
                        className="pf-btn sm"
                        style={{
                            cursor: disabled || isUploading ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            opacity: disabled || isUploading ? 0.5 : 1,
                        }}
                    >
                        <CameraIcon />
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
