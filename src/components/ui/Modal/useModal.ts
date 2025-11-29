/**
 * useModal - Custom hook for managing modal state
 *
 * Usage:
 * const { isOpen, open, close, toggle } = useModal();
 *
 * <button onClick={open}>Open Modal</button>
 * <Modal isOpen={isOpen} onClose={close}>
 *     Modal content
 * </Modal>
 */

import { useState, useCallback } from 'react';

interface UseModalReturn {
    /** Whether the modal is currently open */
    isOpen: boolean;
    /** Open the modal */
    open: () => void;
    /** Close the modal */
    close: () => void;
    /** Toggle the modal open/closed */
    toggle: () => void;
    /** Set modal state directly */
    setIsOpen: (isOpen: boolean) => void;
}

/**
 * Hook for managing modal open/close state
 *
 * @param initialState - Initial open state (default: false)
 * @returns Modal state and control functions
 *
 * @example
 * function MyComponent() {
 *     const deleteModal = useModal();
 *     const editModal = useModal();
 *
 *     return (
 *         <>
 *             <button onClick={deleteModal.open}>Delete</button>
 *             <button onClick={editModal.open}>Edit</button>
 *
 *             <Modal isOpen={deleteModal.isOpen} onClose={deleteModal.close} title="Confirm Delete">
 *                 Are you sure?
 *             </Modal>
 *
 *             <Modal isOpen={editModal.isOpen} onClose={editModal.close} title="Edit Item">
 *                 <EditForm />
 *             </Modal>
 *         </>
 *     );
 * }
 */
export function useModal(initialState = false): UseModalReturn {
    const [isOpen, setIsOpen] = useState(initialState);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen(prev => !prev), []);

    return {
        isOpen,
        open,
        close,
        toggle,
        setIsOpen,
    };
}

export default useModal;
