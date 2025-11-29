/**
 * FormField - Text input field with label, validation, and accessibility
 *
 * Features:
 * - Label with required indicator
 * - Error message display
 * - Helper text support
 * - Size variants
 * - Icon support (left/right)
 * - Glass-morphic styling
 */

import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
    /** Field label */
    label?: string;
    /** Error message to display */
    error?: string;
    /** Helper text below field */
    helperText?: string;
    /** Whether field is required */
    required?: boolean;
    /** Size variant */
    size?: InputSize;
    /** Icon to display on the left */
    leftIcon?: ReactNode;
    /** Icon to display on the right */
    rightIcon?: ReactNode;
    /** Additional class name for the container */
    containerClassName?: string;
}

/**
 * Get size classes for input
 */
function getSizeClasses(size: InputSize): string {
    switch (size) {
        case 'sm':
            return 'h-8 px-3 text-sm';
        case 'lg':
            return 'h-12 px-4 text-base';
        case 'md':
        default:
            return 'h-10 px-3.5 text-sm';
    }
}

/**
 * FormField component
 *
 * @example
 * // Basic usage
 * <FormField
 *     label="Email"
 *     type="email"
 *     placeholder="Enter your email"
 *     required
 * />
 *
 * @example
 * // With error
 * <FormField
 *     label="Password"
 *     type="password"
 *     error="Password must be at least 8 characters"
 * />
 *
 * @example
 * // With icon
 * <FormField
 *     label="Search"
 *     leftIcon={<SearchIcon />}
 *     placeholder="Search..."
 * />
 */
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
        // Generate ID if not provided
        const fieldId = id || `field-${label?.toLowerCase().replace(/\s+/g, '-')}`;

        return (
            <div className={`mb-4 ${containerClassName}`}>
                {/* Label */}
                {label && (
                    <label
                        htmlFor={fieldId}
                        className="block text-[13px] font-medium text-white/60 mb-1.5"
                    >
                        {label}
                        {required && (
                            <span className="text-red-400 ml-0.5">*</span>
                        )}
                    </label>
                )}

                {/* Input wrapper */}
                <div className="relative">
                    {/* Left icon */}
                    {leftIcon && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
                            {leftIcon}
                        </div>
                    )}

                    {/* Input */}
                    <input
                        ref={ref}
                        id={fieldId}
                        disabled={disabled}
                        aria-invalid={!!error}
                        aria-describedby={
                            error ? `${fieldId}-error` : helperText ? `${fieldId}-helper` : undefined
                        }
                        className={`
                            w-full rounded-lg
                            bg-white/5 border
                            ${error ? 'border-red-500/50' : 'border-white/10'}
                            text-white placeholder-white/30
                            transition-all duration-200
                            focus:outline-none focus:ring-2
                            ${error ? 'focus:ring-red-500/30 focus:border-red-500/50' : 'focus:ring-blue-500/30 focus:border-blue-500/50'}
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${getSizeClasses(size)}
                            ${leftIcon ? 'pl-10' : ''}
                            ${rightIcon ? 'pr-10' : ''}
                            ${className}
                        `}
                        {...props}
                    />

                    {/* Right icon */}
                    {rightIcon && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                            {rightIcon}
                        </div>
                    )}
                </div>

                {/* Error message */}
                {error && (
                    <p
                        id={`${fieldId}-error`}
                        className="mt-1.5 text-xs text-red-400 flex items-center gap-1"
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
                        className="mt-1.5 text-xs text-white/40"
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
