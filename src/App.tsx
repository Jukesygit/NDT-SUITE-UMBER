import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, Suspense, lazy, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/query-client';
import './styles/main.css';
import { initializeTheme } from './themes';
import authManager from './auth-manager.js';
import { AnimatedBackground } from './animated-background';
import { AuthProvider } from './contexts/AuthContext';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import Layout from './components/LayoutNew';
import ProtectedRoute from './components/ProtectedRoute';
import RequireAccess from './components/RequireAccess';
import RequireTabVisible from './components/RequireTabVisible';
import LoginPage from './pages/LoginPageNew';
import PrivacyPolicyPage from './pages/legal/PrivacyPolicyPage.tsx';
import { RandomMatrixSpinner } from './components/MatrixSpinners';
import environmentConfig from './config/environment';

const ProfilePage = lazy(() => import('./pages/profile/ProfilePage.tsx'));
const CscanVisualizerPage = lazy(() => import('./pages/CscanVisualizerPage'));
const PersonnelPage = lazy(() => import('./pages/personnel/PersonnelPage.tsx'));
const AdminPage = lazy(() => import('./pages/admin/index.tsx'));
const VesselModelerPage = lazy(() => import('./pages/VesselModelerPage.tsx'));
const DocumentsPage = lazy(() => import('./pages/documents/index.tsx'));

interface SuspenseRoutesProps {
    children: ReactNode;
    fallback: ReactNode;
}

function SuspenseRoutes({ children, fallback }: SuspenseRoutesProps) {
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

const isMaintenanceMode = environmentConfig.isMaintenanceMode();

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
                                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                                <Route element={<ProtectedRoute />}>
                                    <Route element={<Layout />}>
                                        <Route path="/" element={<Navigate to={isMaintenanceMode ? "/cscan" : "/profile"} replace />} />
                                        <Route path="/cscan" element={
                                            <RequireTabVisible tabId="tools">
                                                <ErrorBoundary><CscanVisualizerPage /></ErrorBoundary>
                                            </RequireTabVisible>
                                        } />
                                        <Route path="/vessel-modeler" element={
                                            <RequireTabVisible tabId="tools">
                                                <ErrorBoundary><VesselModelerPage /></ErrorBoundary>
                                            </RequireTabVisible>
                                        } />
                                        {isMaintenanceMode ? (
                                            <>
                                                <Route path="/profile" element={<Navigate to="/cscan" replace />} />
                                                <Route path="/documents" element={<Navigate to="/cscan" replace />} />
                                                <Route path="/personnel" element={<Navigate to="/cscan" replace />} />
                                                <Route path="/admin" element={<Navigate to="/cscan" replace />} />
                                            </>
                                        ) : (
                                            <>
                                                <Route path="/profile" element={
                                                    <RequireTabVisible tabId="profile">
                                                        <ErrorBoundary><ProfilePage /></ErrorBoundary>
                                                    </RequireTabVisible>
                                                } />
                                                <Route path="/documents" element={
                                                    <RequireTabVisible tabId="documents">
                                                        <ErrorBoundary><DocumentsPage /></ErrorBoundary>
                                                    </RequireTabVisible>
                                                } />
                                                <Route path="/personnel" element={
                                                    <RequireAccess requireElevatedAccess>
                                                        <RequireTabVisible tabId="personnel">
                                                            <ErrorBoundary><PersonnelPage /></ErrorBoundary>
                                                        </RequireTabVisible>
                                                    </RequireAccess>
                                                } />
                                                <Route path="/admin" element={
                                                    <RequireAccess requireAdmin>
                                                        <RequireTabVisible tabId="admin">
                                                            <ErrorBoundary><AdminPage /></ErrorBoundary>
                                                        </RequireTabVisible>
                                                    </RequireAccess>
                                                } />
                                            </>
                                        )}
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
