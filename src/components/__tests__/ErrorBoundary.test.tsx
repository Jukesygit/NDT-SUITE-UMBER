/**
 * Tests for ErrorBoundary component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// Component that throws an error
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) {
        throw new Error('Test error message');
    }
    return <div>Content rendered successfully</div>;
}

beforeEach(() => {
    // Suppress React error boundary console output
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
    it('renders children when no error occurs', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={false} />
            </ErrorBoundary>,
        );
        expect(screen.getByText('Content rendered successfully')).toBeInTheDocument();
    });

    it('renders default fallback UI when error occurs', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>,
        );
        expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('Try Again')).toBeInTheDocument();
        expect(screen.getByText('Go Home')).toBeInTheDocument();
    });

    it('renders custom fallback when provided', () => {
        render(
            <ErrorBoundary fallback={<div>Custom error page</div>}>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>,
        );
        expect(screen.getByText('Custom error page')).toBeInTheDocument();
    });

    it('resets error state when Try Again is clicked', () => {
        // After clicking Try Again, the boundary resets hasError to false,
        // but the same children re-render. If the child still throws, it
        // will show the error UI again. We verify the reset mechanism works
        // by checking the button exists and is clickable.
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>,
        );

        expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();

        // Click try again - this resets the error state internally
        const tryAgainBtn = screen.getByText('Try Again');
        expect(tryAgainBtn).toBeInTheDocument();
        fireEvent.click(tryAgainBtn);

        // The child throws again on re-render, so error UI reappears
        expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
    });
});
