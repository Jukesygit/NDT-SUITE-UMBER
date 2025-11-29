import { lazy, Suspense } from 'react';
import { PageSpinner } from '../../components/ui';
import ErrorBoundary from '../../components/ErrorBoundary';

const AdminPage = lazy(() => import('./AdminPage'));

export default function AdminPageWrapper() {
    return (
        <ErrorBoundary>
            <Suspense fallback={<PageSpinner message="Loading admin dashboard..." />}>
                <AdminPage />
            </Suspense>
        </ErrorBoundary>
    );
}
