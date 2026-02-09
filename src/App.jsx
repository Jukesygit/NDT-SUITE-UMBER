import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/query-client';
import './styles/main.css';
import { initializeTheme } from './themes.js';
import authManager from './auth-manager.js';
import { AnimatedBackground } from './animated-background.js';
import { AuthProvider } from './contexts/AuthContext';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import Layout from './components/LayoutNew.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RequireAccess from './components/RequireAccess.jsx';
import LoginPage from './pages/LoginPageNew.jsx';
import { RandomMatrixSpinner } from './components/MatrixSpinners';

const ProfilePage = lazy(() => import('./pages/profile/ProfilePage.tsx'));
const CscanVisualizerPage = lazy(() => import('./pages/CscanVisualizerPage.jsx'));
const PersonnelPage = lazy(() => import('./pages/personnel/PersonnelPage.tsx'));
const AdminPage = lazy(() => import('./pages/admin/index.tsx'));

function SuspenseRoutes({ children, fallback }) {
    const location = useLocation();
    return (
        <Suspense key={location.pathname} fallback={fallback}>
            {children}
        </Suspense>
    );
}

function BackgroundManager() {
    const location = useLocation();

    useEffect(() => {
        if (location.pathname !== '/login') return;

        const canvas = document.createElement('canvas');
        canvas.id = 'app-background-canvas';
        Object.assign(canvas.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '0',
            pointerEvents: 'none',
        });
        document.body.appendChild(canvas);

        const bg = new AnimatedBackground(canvas, {
            particleCount: 30,
            waveIntensity: 0.3,
            vertexDensity: 40,
        });
        bg.start();

        return () => {
            bg.stop();
            canvas.remove();
        };
    }, [location.pathname]);

    return null;
}

const PageLoader = () => (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-6">
            <RandomMatrixSpinner size={200} />
            <div className="text-base text-gray-400 font-medium animate-pulse">Loading...</div>
        </div>
    </div>
);

function App() {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        initializeTheme();

        const initApp = async () => {
            try {
                const timeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Initialization timeout')), 15000)
                );
                await Promise.race([
                    authManager.initPromise || Promise.resolve(),
                    timeout,
                ]).catch(() => {});
            } finally {
                setIsLoading(false);
            }
        };

        initApp();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
                <div className="flex flex-col items-center gap-6">
                    <RandomMatrixSpinner size={280} />
                    <div className="text-lg text-gray-400 font-medium animate-pulse">Loading NDT Suite...</div>
                </div>
            </div>
        );
    }

    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <GlobalErrorBoundary>
                    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                        <BackgroundManager />
                        <SuspenseRoutes fallback={<PageLoader />}>
                            <Routes>
                                <Route path="/login" element={<LoginPage />} />
                                <Route element={<ProtectedRoute />}>
                                    <Route element={<Layout />}>
                                        <Route path="/" element={<Navigate to="/profile" replace />} />
                                        <Route path="/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
                                        <Route path="/cscan" element={<ErrorBoundary><CscanVisualizerPage /></ErrorBoundary>} />
                                        <Route path="/personnel" element={
                                            <RequireAccess requireElevatedAccess>
                                                <ErrorBoundary><PersonnelPage /></ErrorBoundary>
                                            </RequireAccess>
                                        } />
                                        <Route path="/admin" element={
                                            <RequireAccess requireAdmin>
                                                <ErrorBoundary><AdminPage /></ErrorBoundary>
                                            </RequireAccess>
                                        } />
                                    </Route>
                                </Route>
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </SuspenseRoutes>
                    </BrowserRouter>
                </GlobalErrorBoundary>
            </AuthProvider>
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}

export default App;
