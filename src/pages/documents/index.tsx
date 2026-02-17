import { lazy, Suspense } from 'react';
import { PageSpinner } from '../../components/ui';
import ErrorBoundary from '../../components/ErrorBoundary';

const DocumentsPage = lazy(() => import('./DocumentsPage'));

export default function DocumentsPageWrapper() {
    return (
        <ErrorBoundary>
            <Suspense fallback={<PageSpinner message="Loading document control..." />}>
                <DocumentsPage />
            </Suspense>
        </ErrorBoundary>
    );
}
