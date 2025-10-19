import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './styles/main.css';
import { initTheme } from './theme.js';
import { initializeTheme } from './themes.js';
import authManager from './auth-manager.js';
import syncService from './sync-service.js';
import { AnimatedBackground } from './animated-background.js';

// Import pages/components
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import DataHubPage from './pages/DataHubPage.jsx';
import TofdCalculatorPage from './pages/TofdCalculatorPage.jsx';
import CscanVisualizerPage from './pages/CscanVisualizerPage.jsx';
import PecVisualizerPage from './pages/PecVisualizerPage.jsx';
import Viewer3DPage from './pages/Viewer3DPage.jsx';
import NiiCalculatorPage from './pages/NiiCalculatorPage.jsx';

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

        // Check authentication status
        const checkAuth = async () => {
            try {
                // Wait for auth manager to initialize
                await authManager.initPromise;
                const session = await authManager.getSession();
                setIsLoggedIn(!!session);
            } catch (error) {
                console.error('Auth check failed:', error);
                setIsLoggedIn(false);
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();

        // Listen for auth state changes
        const unsubscribe = authManager.onAuthStateChange((session) => {
            setIsLoggedIn(!!session);
            // Sync service is automatically active when user is logged in
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-xl">Loading...</div>
            </div>
        );
    }

    return (
        <BrowserRouter>
            <BackgroundManager />
            <Routes>
                {/* Public route */}
                <Route path="/login" element={
                    isLoggedIn ? <Navigate to="/" replace /> : <LoginPage onLogin={() => setIsLoggedIn(true)} />
                } />

                {/* Protected routes with layout */}
                <Route element={<ProtectedRoute isLoggedIn={isLoggedIn} />}>
                    <Route element={<Layout />}>
                        <Route path="/" element={<DataHubPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/tofd" element={<TofdCalculatorPage />} />
                        <Route path="/cscan" element={<CscanVisualizerPage />} />
                        <Route path="/pec" element={<PecVisualizerPage />} />
                        <Route path="/3d" element={<Viewer3DPage />} />
                        <Route path="/nii" element={<NiiCalculatorPage />} />

                        {/* Admin only route */}
                        <Route path="/admin" element={
                            <ProtectedRoute requireAdmin>
                                <AdminDashboard />
                            </ProtectedRoute>
                        } />
                    </Route>
                </Route>

                {/* Catch all - redirect to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
