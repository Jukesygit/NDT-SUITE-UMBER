import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, Suspense, lazy } from 'react';
import './styles/main.css';
import { initTheme } from './theme.js';
import { initializeTheme } from './themes.js';
import authManager from './auth-manager.js';
import syncService from './sync-service.js';
import { AnimatedBackground } from './animated-background.js';
import { initGlobalStyleEnforcer } from './utils/globalStyleEnforcer.js';

// Import error boundaries
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

// Import core components (always needed)
import Layout from './components/LayoutNew.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPageNew.jsx';

// Import the Matrix logo loader
import { MatrixLogoRacer } from './components/MatrixLogoLoader';

// Lazy load pages for code splitting
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePageNew.jsx'));
const DataHubPage = lazy(() => import('./pages/DataHubPage.jsx'));
const TofdCalculatorPage = lazy(() => import('./pages/TofdCalculatorPage.jsx'));
const CscanVisualizerPage = lazy(() => import('./pages/CscanVisualizerPage.jsx'));
const PecVisualizerPage = lazy(() => import('./pages/PecVisualizerPage.jsx'));
const Viewer3DPage = lazy(() => import('./pages/Viewer3DPage.jsx'));
const NiiCalculatorPage = lazy(() => import('./pages/NiiCalculatorPage.jsx'));
const PersonnelManagementPage = lazy(() => import('./pages/PersonnelManagementPage.jsx'));
const LogoDemo = lazy(() => import('./pages/LogoDemo.tsx'));
const LogoAnimatedDemo = lazy(() => import('./pages/LogoAnimatedDemo.tsx'));

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
    const [isLoggedIn, setIsLoggedIn] = useState(false);
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

        // Check authentication status
        const checkAuth = async () => {
            try {
                console.log('App: Starting auth check...');

                // Add timeout to prevent infinite loading (increased to 15s for cold starts)
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Auth check timeout')), 15000)
                );

                const authCheckPromise = async () => {
                    // Wait for auth manager to initialize
                    if (authManager.initPromise) {
                        await authManager.initPromise;
                    }
                    const session = await authManager.getSession();
                    return session;
                };

                const session = await Promise.race([
                    authCheckPromise(),
                    timeoutPromise
                ]).catch(err => {
                    console.warn('Auth check error or timeout:', err);
                    return null;
                });

                console.log('App: Auth check complete, session:', session);
                setIsLoggedIn(!!session);
            } catch (error) {
                console.error('Auth check failed:', error);
                setIsLoggedIn(false);
            } finally {
                console.log('App: Setting loading to false');
                setIsLoading(false);
            }
        };

        checkAuth();

        // Listen for auth state changes
        const unsubscribe = authManager.onAuthStateChange((session) => {
            console.log('App: Auth state changed, session:', session);
            setIsLoggedIn(!!session);
            // Sync service is automatically active when user is logged in
        });

        // Also listen for explicit logout event
        const handleLogout = () => {
            console.log('App: User logged out event received');
            setIsLoggedIn(false);
        };
        window.addEventListener('userLoggedOut', handleLogout);

        return () => {
            if (unsubscribe) unsubscribe();
            window.removeEventListener('userLoggedOut', handleLogout);
        };
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
                <div className="flex flex-col items-center gap-6">
                    <MatrixLogoRacer size={280} duration={4} />
                    <div className="text-lg text-gray-400 font-medium animate-pulse">Loading NDT Suite...</div>
                </div>
            </div>
        );
    }

    // Loading component for lazy loaded pages
    const PageLoader = () => (
        <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
            <div className="flex flex-col items-center gap-6">
                <MatrixLogoRacer size={200} duration={4} />
                <div className="text-base text-gray-400 font-medium animate-pulse">Loading...</div>
            </div>
        </div>
    );

    return (
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
                        {/* Public route */}
                        <Route path="/login" element={
                            isLoggedIn ? <Navigate to="/" replace /> : <LoginPage onLogin={() => setIsLoggedIn(true)} />
                        } />

                        {/* Demo routes - remove after testing */}
                        <Route path="/logo-demo" element={<LogoDemo />} />
                        <Route path="/logo-animated" element={<LogoAnimatedDemo />} />

                        {/* Protected routes with layout */}
                        <Route element={<ProtectedRoute isLoggedIn={isLoggedIn} />}>
                            <Route element={<Layout />}>
                                <Route path="/" element={
                                    <ErrorBoundary>
                                        <DataHubPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="/profile" element={
                                    <ErrorBoundary>
                                        <ProfilePage />
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
                                <Route path="/personnel" element={
                                    <ErrorBoundary>
                                        <PersonnelManagementPage />
                                    </ErrorBoundary>
                                } />

                                {/* Admin only route */}
                                <Route path="/admin" element={
                                    <ErrorBoundary>
                                        <AdminDashboard />
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
    );
}

export default App;
