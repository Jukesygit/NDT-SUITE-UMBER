import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/query-client';
import './styles/main.css';
import { initTheme } from './theme.js';
import { initializeTheme } from './themes.js';
import authManager from './auth-manager.js';
import syncService from './sync-service.js';
import { AnimatedBackground } from './animated-background.js';
import { initGlobalStyleEnforcer } from './utils/globalStyleEnforcer.js';

// Auth context - provides reactive auth state to all components
import { AuthProvider } from './contexts/AuthContext';

// Import error boundaries
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

// Import core components (always needed)
import Layout from './components/LayoutNew.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPageNew.jsx';

// Import the Matrix logo loader
import { RandomMatrixSpinner } from './components/MatrixSpinners';

// Lazy load pages for code splitting
const ProfilePage = lazy(() => import('./pages/ProfilePageNew.jsx')); // Primary - battle-tested UI
const DataHubPage = lazy(() => import('./pages/data-hub/index.tsx'));
const TofdCalculatorPage = lazy(() => import('./pages/TofdCalculatorPage.jsx'));
const CscanVisualizerPage = lazy(() => import('./pages/CscanVisualizerPage.jsx'));
const PecVisualizerPage = lazy(() => import('./pages/PecVisualizerPage.jsx'));
const Viewer3DPage = lazy(() => import('./pages/Viewer3DPage.jsx'));
const NiiCalculatorPage = lazy(() => import('./pages/NiiCalculatorPage.jsx'));
const PersonnelPage = lazy(() => import('./pages/personnel/PersonnelPage.tsx')); // Modernized - uses React Query
const LogoDemo = lazy(() => import('./pages/LogoDemo.tsx'));
const LogoAnimatedDemo = lazy(() => import('./pages/LogoAnimatedDemo.tsx'));

// Experimental modernized pages (React Query based) - for continued development
const ProfilePageNew = lazy(() => import('./pages/profile/ProfilePage.tsx'));
const AdminPageNew = lazy(() => import('./pages/admin/index.tsx'));
const AdminStyleDemo = lazy(() => import('./pages/admin/StyleDemo.tsx'));

// Data Hub pages
const VesselOverviewPage = lazy(() => import('./pages/data-hub/VesselOverviewPage.tsx'));
const InspectionPage = lazy(() => import('./pages/data-hub/InspectionPage.tsx'));


// Background manager component
function BackgroundManager() {
    const location = useLocation();

    useEffect(() => {
        // Only show animated background on login page
        if (location.pathname === '/login') {
            const canvas = document.createElement('canvas');
            canvas.id = 'app-background-canvas';
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '0';
            canvas.style.pointerEvents = 'none';
            document.body.appendChild(canvas);

            const bg = new AnimatedBackground(canvas, {
                particleCount: 30,
                waveIntensity: 0.3,
                vertexDensity: 40
            });
            bg.start();

            return () => {
                bg.stop();
                if (canvas.parentElement) {
                    canvas.parentElement.removeChild(canvas);
                }
            };
        }
    }, [location.pathname]);

    return null;
}

function App() {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Initialize old theme system
        initTheme();

        // Initialize new color theme system (defaults to Cyber Teal)
        initializeTheme();

        // Initialize global style enforcer after DOM is ready
        setTimeout(() => {
            initGlobalStyleEnforcer();
        }, 100);

        // Wait for auth manager to initialize before rendering
        const initApp = async () => {
            try {
                console.log('App: Initializing...');

                // Add timeout to prevent infinite loading (increased to 15s for cold starts)
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Initialization timeout')), 15000)
                );

                const initPromise = authManager.initPromise || Promise.resolve();

                await Promise.race([
                    initPromise,
                    timeoutPromise
                ]).catch(err => {
                    console.warn('App initialization error or timeout:', err);
                });

                console.log('App: Initialization complete');
            } catch (error) {
                console.error('App initialization failed:', error);
            } finally {
                console.log('App: Setting loading to false');
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

    // Loading component for lazy loaded pages
    const PageLoader = () => (
        <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
            <div className="flex flex-col items-center gap-6">
                <RandomMatrixSpinner size={200} />
                <div className="text-base text-gray-400 font-medium animate-pulse">Loading...</div>
            </div>
        </div>
    );

    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <GlobalErrorBoundary>
                    <BrowserRouter
                        future={{
                            v7_startTransition: true,
                            v7_relativeSplatPath: true
                        }}
                    >
                    <BackgroundManager />
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            {/* Public route - LoginPage handles its own redirect logic */}
                            <Route path="/login" element={<LoginPage />} />

                            {/* Demo routes - remove after testing */}
                            <Route path="/logo-demo" element={<LogoDemo />} />
                            <Route path="/logo-animated" element={<LogoAnimatedDemo />} />
                            <Route path="/admin-style-demo" element={<AdminStyleDemo />} />

                            {/* Protected routes with layout */}
                            <Route element={<ProtectedRoute />}>
                                <Route element={<Layout />}>
                                    <Route path="/" element={
                                        <ErrorBoundary>
                                            <DataHubPage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/vessel/:assetId/:vesselId" element={
                                        <ErrorBoundary>
                                            <VesselOverviewPage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/inspection/:assetId/:vesselId/:inspectionId" element={
                                        <ErrorBoundary>
                                            <InspectionPage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/inspection/:assetId/:vesselId" element={
                                        <ErrorBoundary>
                                            <InspectionPage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/profile" element={
                                        <ErrorBoundary>
                                            <ProfilePage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/profile-new" element={
                                        <ErrorBoundary>
                                            <ProfilePageNew />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/tofd" element={
                                        <ErrorBoundary>
                                            <TofdCalculatorPage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/cscan" element={
                                        <ErrorBoundary>
                                            <CscanVisualizerPage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/pec" element={
                                        <ErrorBoundary>
                                            <PecVisualizerPage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/3d" element={
                                        <ErrorBoundary>
                                            <Viewer3DPage />
                                        </ErrorBoundary>
                                    } />
                                    <Route path="/nii" element={
                                        <ErrorBoundary>
                                            <NiiCalculatorPage />
                                        </ErrorBoundary>
                                    } />
                                </Route>
                            </Route>

                            {/* Personnel routes - require elevated access (admin or manager) */}
                            <Route element={<ProtectedRoute requireElevatedAccess />}>
                                <Route element={<Layout />}>
                                    <Route path="/personnel" element={
                                        <ErrorBoundary>
                                            <PersonnelPage />
                                        </ErrorBoundary>
                                    } />
                                </Route>
                            </Route>

                            {/* Admin only route */}
                            <Route element={<ProtectedRoute requireAdmin />}>
                                <Route element={<Layout />}>
                                    <Route path="/admin" element={
                                        <ErrorBoundary>
                                            <AdminPageNew />
                                        </ErrorBoundary>
                                    } />
                                </Route>
                            </Route>

                            {/* Catch all - redirect to home */}
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Suspense>
                    </BrowserRouter>
                </GlobalErrorBoundary>
            </AuthProvider>
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}

export default App;
