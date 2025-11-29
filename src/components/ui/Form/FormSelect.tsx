/**
 * FormSelect - Select dropdown with label, validation, and accessibility
 *
 * Features:
 * - Label with required indicator
 * - Error message display
 * - Helper text support
 * - Size variants
 * - Option groups support
 * - Glass-morphic styling
 */

import { SelectHTMLAttributes, forwardRef, ReactNode } from 'react';
import type { InputSize } from './FormField';

export interface SelectOption {
    /** Option value */
    value: string;
    /** Display label */
    label: string;
    /** Whether option is disabled */
    disabled?: boolean;
}

export interface SelectOptionGroup {
    /** Group label */
    label: string;
    /** Options in this group */
    options: SelectOption[];
}

export interface FormSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
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
    /** Options to display */
    options?: SelectOption[];
    /** Option groups (alternative to flat options) */
    optionGroups?: SelectOptionGroup[];
    /** Placeholder option text */
    placeholder?: string;
    /** Icon to display on the left */
    leftIcon?: ReactNode;
    /** Additional class name for the container */
    containerClassName?: string;
}

/**
 * Get size classes for select
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
 * FormSelect component
 *
 * @example
 * // Basic usage with options
 * <FormSelect
 *     label="Role"
 *     options={[
 *         { value: 'admin', label: 'Admin' },
 *         { value: 'user', label: 'User' },
 *     ]}
 *     required
 * />
 *
 * @example
 * // With option groups
 * <FormSelect
 *     label="Category"
 *     optionGroups={[
 *         { label: 'Fruits', options: [{ value: 'apple', label: 'Apple' }] },
 *         { label: 'Vegetables', options: [{ value: 'carrot', label: 'Carrot' }] },
 *     ]}
 * />
 *
 * @example
 * // With error
 * <FormSelect
 *     label="Status"
 *     error="Please select a status"
 *     options={statusOptions}
 * />
 */
export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
    (
        {
            label,
            error,
            helperText,
            required = false,
            size = 'md',
            options = [],
            optionGroups,
            placeholder,
            leftIcon,
            containerClassName = '',
            className = '',
            id,
            disabled,
            children,
            ...props
        },
        ref
    ) => {
        // Generate ID if not provided
        const fieldId = id || `select-${label?.toLowerCase().replace(/\s+/g, '-')}`;

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

                {/* Select wrapper */}
                <div className="relative">
                    {/* Left icon */}
                    {leftIcon && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none z-10">
                            {leftIcon}
                        </div>
                    )}

                    {/* Select */}
                    <select
                        ref={ref}
                        id={fieldId}
                        disabled={disabled}
                        aria-invalid={!!error}
                        aria-describedby={
                            error ? `${fieldId}-error` : helperText ? `${fieldId}-helper` : undefined
                        }
                        className={`
                            w-full rounded-lg appearance-none
                            bg-white/5 border
                            ${error ? 'border-red-500/50' : 'border-white/10'}
                            text-white
                            transition-all duration-200
                            focus:outline-none focus:ring-2
                            ${error ? 'focus:ring-red-500/30 focus:border-red-500/50' : 'focus:ring-blue-500/30 focus:border-blue-500/50'}
                            disabled:opacity-50 disabled:cursor-not-allowed
                            cursor-pointer
                            ${getSizeClasses(size)}
                            ${leftIcon ? 'pl-10' : ''}
                            pr-10
                            ${className}
                        `}
                        style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                        {...props}
                    >
                        {/* Placeholder option */}
                        {placeholder && (
                            <option
                                value=""
                                disabled
                                style={{ backgroundColor: '#1e293b', color: 'rgba(255, 255, 255, 0.5)' }}
                            >
                                {placeholder}
                            </option>
                        )}

                        {/* Children (allows custom option rendering) */}
                        {children}

                        {/* Flat options */}
                        {!children && options.map((option) => (
                            <option
                                key={option.value}
                                value={option.value}
                                disabled={option.disabled}
                                style={{ backgroundColor: '#1e293b', color: '#ffffff' }}
                            >
                                {option.label}
                            </option>
                        ))}

                        {/* Option groups */}
                        {!children && optionGroups?.map((group) => (
                            <optgroup
                                key={group.label}
                                label={group.label}
                                style={{ backgroundColor: '#1e293b', color: '#ffffff', fontWeight: 600 }}
                            >
                                {group.options.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                        disabled={option.disabled}
                                        style={{ backgroundColor: '#1e293b', color: '#ffffff', fontWeight: 400 }}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>

                    {/* Dropdown arrow */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
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

FormSelect.displayName = 'FormSelect';

export default FormSelect;
