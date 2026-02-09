/**
 * UI Components Barrel Export
 *
 * Import UI components from this file for cleaner imports:
 * import { Spinner, ErrorDisplay, EmptyState } from '../components/ui';
 */

// Loading states
export {
    default as Spinner,
    PageSpinner,
    SectionSpinner,
    ButtonSpinner,
    ContentLoader,
    InlineLoader,
} from './LoadingSpinner';

// Error states
export {
    default as ErrorDisplay,
    InlineError,
} from './ErrorDisplay';

// Empty states
export {
    default as EmptyState,
    NoSearchResults,
} from './EmptyState';

// Data display
export { DataTable, useTableSort } from './DataTable';
export type { Column, SortDirection, DataTableProps } from './DataTable';

// Modals
export { Modal, useModal, ConfirmDialog } from './Modal';
export type { ModalProps, ModalSize, ConfirmDialogProps } from './Modal';

// Page layout
export { PageHeader } from './PageHeader';

// Form components
export { FormField, FormSelect, FormTextarea, FormCheckbox, useFormField } from './Form';
export type {
    FormFieldProps,
    InputSize,
    FormSelectProps,
    SelectOption,
    SelectOptionGroup,
    FormTextareaProps,
    FormCheckboxProps,
    UseFormFieldOptions,
    UseFormFieldReturn,
} from './Form';
