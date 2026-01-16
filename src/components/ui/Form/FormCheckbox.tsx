/**
 * FormCheckbox - Checkbox input with label and accessibility
 *
 * Features:
 * - Custom styled checkbox
 * - Label support
 * - Error state
 * - Indeterminate state
 * - Glass-morphic styling
 */

import { InputHTMLAttributes, forwardRef, useEffect, useRef } from 'react';

export interface FormCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    /** Checkbox label */
    label: string;
    /** Error message to display */
    error?: string;
    /** Helper text */
    helperText?: string;
    /** Indeterminate state (for "select all" patterns) */
    indeterminate?: boolean;
    /** Additional class name for the container */
    containerClassName?: string;
}

/**
 * FormCheckbox component
 *
 * @example
 * // Basic usage
 * <FormCheckbox
 *     label="I agree to the terms"
 *     checked={agreed}
 *     onChange={(e) => setAgreed(e.target.checked)}
 * />
 *
 * @example
 * // With error
 * <FormCheckbox
 *     label="Accept terms"
 *     error="You must accept the terms"
 * />
 *
 * @example
 * // Indeterminate (for select all)
 * <FormCheckbox
 *     label="Select all"
 *     indeterminate={someSelected && !allSelected}
 *     checked={allSelected}
 *     onChange={handleSelectAll}
 * />
 */
export const FormCheckbox = forwardRef<HTMLInputElement, FormCheckboxProps>(
    (
        {
            label,
            error,
            helperText,
            indeterminate = false,
            containerClassName = '',
            className = '',
            id,
            disabled,
            checked,
            ...props
        },
        ref
    ) => {
        // Generate ID if not provided
        const fieldId = id || `checkbox-${label?.toLowerCase().replace(/\s+/g, '-')}`;

        // Use checked prop to determine visual state (more reliable than CSS peer)
        const isChecked = checked === true;

        // Internal ref for indeterminate state
        const internalRef = useRef<HTMLInputElement | null>(null);

        // Set indeterminate state (can't be done via attribute)
        useEffect(() => {
            if (internalRef.current) {
                internalRef.current.indeterminate = indeterminate;
            }
        }, [indeterminate]);

        // Combine refs
        const setRefs = (node: HTMLInputElement | null) => {
            internalRef.current = node;
            if (typeof ref === 'function') {
                ref(node);
            } else if (ref) {
                ref.current = node;
            }
        };

        return (
            <div className={`mb-4 ${containerClassName}`}>
                <label
                    htmlFor={fieldId}
                    className={`
                        flex items-start gap-3 cursor-pointer
                        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                >
                    {/* Custom checkbox */}
                    <div className="relative flex-shrink-0 mt-0.5">
                        <input
                            ref={setRefs}
                            type="checkbox"
                            id={fieldId}
                            disabled={disabled}
                            checked={checked}
                            aria-invalid={!!error}
                            aria-describedby={error ? `${fieldId}-error` : undefined}
                            className={`sr-only ${className}`}
                            {...props}
                        />
                        {/* Checkbox background - use isChecked for styling */}
                        <div
                            className={`
                                w-5 h-5 rounded
                                border-2 transition-all duration-200
                                ${error ? 'border-red-500/50' : 'border-white/20'}
                                ${isChecked ? 'bg-blue-500 border-blue-500' : ''}
                                ${disabled ? 'opacity-50' : ''}
                            `}
                        />
                        {/* Checkmark - show when checked */}
                        <svg
                            className={`
                                absolute top-1 left-1 w-3 h-3 text-white
                                transition-opacity pointer-events-none
                                ${isChecked ? 'opacity-100' : 'opacity-0'}
                            `}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            {indeterminate ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 12h14"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                />
                            )}
                        </svg>
                    </div>

                    {/* Label text */}
                    <div className="flex-1">
                        <span className="text-sm text-white/80">
                            {label}
                        </span>
                        {helperText && (
                            <p className="text-xs text-white/40 mt-0.5">
                                {helperText}
                            </p>
                        )}
                    </div>
                </label>

                {/* Error message */}
                {error && (
                    <p
                        id={`${fieldId}-error`}
                        className="mt-1.5 text-xs text-red-400 flex items-center gap-1 ml-8"
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
            </div>
        );
    }
);

FormCheckbox.displayName = 'FormCheckbox';

export default FormCheckbox;
