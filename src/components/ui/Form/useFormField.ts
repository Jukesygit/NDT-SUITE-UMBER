/**
 * useFormField - Hook for managing individual form field state
 *
 * Provides value, onChange, error, and validation for a single field.
 * For complex forms, consider using React Hook Form or Formik.
 */

import { useState, useCallback, ChangeEvent } from 'react';

export interface UseFormFieldOptions<T> {
    /** Initial value */
    initialValue: T;
    /** Validation function - returns error message or undefined */
    validate?: (value: T) => string | undefined;
    /** Transform value on change */
    transform?: (value: T) => T;
    /** Validate on blur instead of change */
    validateOnBlur?: boolean;
}

export interface UseFormFieldReturn<T> {
    /** Current value */
    value: T;
    /** Error message if validation failed */
    error: string | undefined;
    /** Whether field has been touched (blurred) */
    touched: boolean;
    /** Whether field is dirty (value changed from initial) */
    isDirty: boolean;
    /** onChange handler for input elements */
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    /** onBlur handler for validation on blur */
    onBlur: () => void;
    /** Set value directly */
    setValue: (value: T) => void;
    /** Set error manually */
    setError: (error: string | undefined) => void;
    /** Reset to initial value */
    reset: () => void;
    /** Validate and return whether valid */
    validate: () => boolean;
}

/**
 * Hook for managing a single form field
 *
 * @example
 * function LoginForm() {
 *     const email = useFormField({
 *         initialValue: '',
 *         validate: (v) => !v.includes('@') ? 'Invalid email' : undefined,
 *     });
 *
 *     const password = useFormField({
 *         initialValue: '',
 *         validate: (v) => v.length < 8 ? 'Must be 8+ characters' : undefined,
 *         validateOnBlur: true,
 *     });
 *
 *     const handleSubmit = (e) => {
 *         e.preventDefault();
 *         const emailValid = email.validate();
 *         const passwordValid = password.validate();
 *         if (emailValid && passwordValid) {
 *             // Submit form
 *         }
 *     };
 *
 *     return (
 *         <form onSubmit={handleSubmit}>
 *             <FormField
 *                 label="Email"
 *                 value={email.value}
 *                 onChange={email.onChange}
 *                 onBlur={email.onBlur}
 *                 error={email.touched ? email.error : undefined}
 *             />
 *             <FormField
 *                 label="Password"
 *                 type="password"
 *                 value={password.value}
 *                 onChange={password.onChange}
 *                 onBlur={password.onBlur}
 *                 error={password.touched ? password.error : undefined}
 *             />
 *         </form>
 *     );
 * }
 */
export function useFormField<T = string>({
    initialValue,
    validate: validateFn,
    transform,
    validateOnBlur = false,
}: UseFormFieldOptions<T>): UseFormFieldReturn<T> {
    const [value, setValueState] = useState<T>(initialValue);
    const [error, setError] = useState<string | undefined>(undefined);
    const [touched, setTouched] = useState(false);

    const isDirty = value !== initialValue;

    const runValidation = useCallback(
        (val: T): string | undefined => {
            if (!validateFn) return undefined;
            return validateFn(val);
        },
        [validateFn]
    );

    const setValue = useCallback(
        (newValue: T) => {
            const finalValue = transform ? transform(newValue) : newValue;
            setValueState(finalValue);

            if (!validateOnBlur) {
                setError(runValidation(finalValue));
            }
        },
        [transform, validateOnBlur, runValidation]
    );

    const onChange = useCallback(
        (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
            const newValue = e.target.value as unknown as T;
            setValue(newValue);
        },
        [setValue]
    );

    const onBlur = useCallback(() => {
        setTouched(true);
        if (validateOnBlur) {
            setError(runValidation(value));
        }
    }, [validateOnBlur, runValidation, value]);

    const reset = useCallback(() => {
        setValueState(initialValue);
        setError(undefined);
        setTouched(false);
    }, [initialValue]);

    const validate = useCallback((): boolean => {
        const validationError = runValidation(value);
        setError(validationError);
        setTouched(true);
        return !validationError;
    }, [runValidation, value]);

    return {
        value,
        error,
        touched,
        isDirty,
        onChange,
        onBlur,
        setValue,
        setError,
        reset,
        validate,
    };
}

export default useFormField;
