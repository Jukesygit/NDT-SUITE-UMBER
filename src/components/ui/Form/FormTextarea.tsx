/**
 * FormTextarea - Multi-line text input with label, validation, and accessibility
 *
 * Features:
 * - Label with required indicator
 * - Error message display
 * - Helper text support
 * - Character count
 * - Auto-resize option
 * - Glass-morphic styling
 */

import { TextareaHTMLAttributes, forwardRef, useState, useCallback, useEffect, useRef } from 'react';

export interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    /** Field label */
    label?: string;
    /** Error message to display */
    error?: string;
    /** Helper text below field */
    helperText?: string;
    /** Whether field is required */
    required?: boolean;
    /** Show character count */
    showCharCount?: boolean;
    /** Auto-resize based on content */
    autoResize?: boolean;
    /** Minimum number of rows */
    minRows?: number;
    /** Maximum number of rows for auto-resize */
    maxRows?: number;
    /** Additional class name for the container */
    containerClassName?: string;
}

/**
 * FormTextarea component
 *
 * @example
 * // Basic usage
 * <FormTextarea
 *     label="Description"
 *     placeholder="Enter description..."
 *     rows={4}
 * />
 *
 * @example
 * // With character limit and count
 * <FormTextarea
 *     label="Bio"
 *     maxLength={500}
 *     showCharCount
 *     helperText="Tell us about yourself"
 * />
 *
 * @example
 * // Auto-resizing
 * <FormTextarea
 *     label="Notes"
 *     autoResize
 *     minRows={2}
 *     maxRows={10}
 * />
 */
export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
    (
        {
            label,
            error,
            helperText,
            required = false,
            showCharCount = false,
            autoResize = false,
            minRows = 3,
            maxRows = 10,
            containerClassName = '',
            className = '',
            id,
            disabled,
            maxLength,
            value,
            defaultValue,
            onChange,
            rows,
            ...props
        },
        ref
    ) => {
        // Generate ID if not provided
        const fieldId = id || `textarea-${label?.toLowerCase().replace(/\s+/g, '-')}`;

        // Track character count
        const [charCount, setCharCount] = useState(() => {
            const initial = value ?? defaultValue ?? '';
            return String(initial).length;
        });

        // Internal ref for auto-resize
        const internalRef = useRef<HTMLTextAreaElement | null>(null);

        // Combine refs
        const setRefs = useCallback(
            (node: HTMLTextAreaElement | null) => {
                internalRef.current = node;
                if (typeof ref === 'function') {
                    ref(node);
                } else if (ref) {
                    ref.current = node;
                }
            },
            [ref]
        );

        // Auto-resize logic
        const adjustHeight = useCallback(() => {
            const textarea = internalRef.current;
            if (!textarea || !autoResize) return;

            // Reset height to calculate scrollHeight correctly
            textarea.style.height = 'auto';

            // Calculate line height
            const computedStyle = window.getComputedStyle(textarea);
            const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
            const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
            const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

            // Calculate min and max heights
            const minHeight = lineHeight * minRows + paddingTop + paddingBottom;
            const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom;

            // Set new height
            const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
            textarea.style.height = `${newHeight}px`;
        }, [autoResize, minRows, maxRows]);

        // Handle change with character count and auto-resize
        const handleChange = useCallback(
            (e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setCharCount(e.target.value.length);
                adjustHeight();
                onChange?.(e);
            },
            [onChange, adjustHeight]
        );

        // Initial auto-resize
        useEffect(() => {
            adjustHeight();
        }, [adjustHeight, value]);

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

                {/* Textarea */}
                <textarea
                    ref={setRefs}
                    id={fieldId}
                    disabled={disabled}
                    rows={autoResize ? minRows : (rows ?? minRows)}
                    maxLength={maxLength}
                    value={value}
                    defaultValue={defaultValue}
                    onChange={handleChange}
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
                        px-3.5 py-2.5 text-sm
                        resize-none
                        ${autoResize ? 'overflow-hidden' : 'overflow-auto'}
                        ${className}
                    `}
                    {...props}
                />

                {/* Bottom row: error/helper + char count */}
                <div className="flex justify-between items-start mt-1.5 gap-4">
                    <div className="flex-1">
                        {/* Error message */}
                        {error && (
                            <p
                                id={`${fieldId}-error`}
                                className="text-xs text-red-400 flex items-center gap-1"
                                role="alert"
                            >
                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
                                className="text-xs text-white/40"
                            >
                                {helperText}
                            </p>
                        )}
                    </div>

                    {/* Character count */}
                    {showCharCount && (
                        <p className={`text-xs flex-shrink-0 ${
                            maxLength && charCount >= maxLength ? 'text-red-400' : 'text-white/40'
                        }`}>
                            {charCount}{maxLength ? `/${maxLength}` : ''}
                        </p>
                    )}
                </div>
            </div>
        );
    }
);

FormTextarea.displayName = 'FormTextarea';

export default FormTextarea;
