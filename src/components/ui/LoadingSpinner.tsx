/**
 * LoadingSpinner - Reusable loading indicator for React Query states
 * Re-exports from existing LoadingStates for consistency
 */
import { Spinner, ContentLoader, InlineLoader } from '../LoadingStates';
import { RandomMatrixSpinner } from '../MatrixSpinners';

// Default export - simple spinner for inline use
export default Spinner;

// Named exports for different use cases
export { Spinner, ContentLoader, InlineLoader };

/**
 * PageSpinner - Full page loading state with message
 * Use this when a page is loading its primary data
 *
 * @example
 * if (isLoading) return <PageSpinner message="Loading profile..." />;
 */
export function PageSpinner({ message = 'Loading...' }: { message?: string }) {
    return <ContentLoader type="matrix" message={message} />;
}

/**
 * SectionSpinner - Loading state for a section of a page
 * Uses randomized Matrix logo spinner
 *
 * @example
 * if (isLoading) return <SectionSpinner />;
 */
export function SectionSpinner({ message = null }: { message?: string | null }) {
    return (
        <div className="flex flex-col items-center justify-center py-8">
            <RandomMatrixSpinner size={80} />
            {message && (
                <p className="text-sm text-secondary mt-3">{message}</p>
            )}
        </div>
    );
}

/**
 * ButtonSpinner - For buttons in loading state
 * Uses small randomized Matrix logo spinner
 *
 * @example
 * <button disabled={isLoading}>
 *     {isLoading ? <ButtonSpinner /> : 'Save'}
 * </button>
 */
export function ButtonSpinner() {
    return <RandomMatrixSpinner size={20} />;
}
