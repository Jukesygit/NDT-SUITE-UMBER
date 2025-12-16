/**
 * FormField - Glassmorphic text input with label and validation
 *
 * Uses glass-input class from glassmorphic.css for consistent styling
 */

import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
    label?: string;
    error?: string;
    helperText?: string;
    required?: boolean;
    size?: InputSize;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    containerClassName?: string;
}

function getSizeStyles(size: InputSize): React.CSSProperties {
    switch (size) {
        case 'sm':
            return { padding: '8px 12px', fontSize: '13px' };
        case 'lg':
            return { padding: '14px 16px', fontSize: '15px' };
        case 'md':
        default:
            return { padding: '10px 14px', fontSize: '14px' };
    }
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
    (
        {
            label,
            error,
            helperText,
            required = false,
            size = 'md',
            leftIcon,
            rightIcon,
            containerClassName = '',
            className = '',
            id,
            disabled,
            ...props
        },
        ref
    ) => {
        const fieldId = id || `field-${label?.toLowerCase().replace(/\s+/g, '-') || 'input'}`;

        return (
            <div className={`mb-4 ${containerClassName}`}>
                {/* Label */}
                {label && (
                    <label
                        htmlFor={fieldId}
                        className="block text-xs font-medium mb-1.5"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {label}
                        {required && (
                            <span style={{ color: 'var(--danger)', marginLeft: '2px' }}>*</span>
                        )}
                    </label>
                )}

                {/* Input wrapper */}
                <div className="relative">
                    {/* Left icon */}
                    {leftIcon && (
                        <div
                            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ color: 'var(--text-dim)' }}
                        >
                            {leftIcon}
                        </div>
                    )}

                    {/* Input - uses glass-input class */}
                    <input
                        ref={ref}
                        id={fieldId}
                        disabled={disabled}
                        aria-invalid={!!error}
                        aria-describedby={
                            error ? `${fieldId}-error` : helperText ? `${fieldId}-helper` : undefined
                        }
                        className={`glass-input ${className}`}
                        style={{
                            ...getSizeStyles(size),
                            paddingLeft: leftIcon ? '40px' : undefined,
                            paddingRight: rightIcon ? '40px' : undefined,
                            borderColor: error ? 'var(--danger)' : undefined,
                            opacity: disabled ? 0.5 : undefined,
                            cursor: disabled ? 'not-allowed' : undefined,
                        }}
                        {...props}
                    />

                    {/* Right icon */}
                    {rightIcon && (
                        <div
                            className="absolute right-3 top-1/2 -translate-y-1/2"
                            style={{ color: 'var(--text-dim)' }}
                        >
                            {rightIcon}
                        </div>
                    )}
                </div>

                {/* Error message */}
                {error && (
                    <p
                        id={`${fieldId}-error`}
                        className="mt-1.5 text-xs flex items-center gap-1"
                        style={{ color: 'var(--danger)' }}
                        role="alert"
                    >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                            />
                        </svg>
                        {error}
                    </p>
                )}

                {/* Helper text */}
                {helperText && !error && (
                    <p
                        id={`${fieldId}-helper`}
                        className="mt-1.5 text-xs"
                        style={{ color: 'var(--text-dim)' }}
                    >
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);

FormField.displayName = 'FormField';

export default FormField;
