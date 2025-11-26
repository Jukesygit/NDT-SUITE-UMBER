import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import authManager from '../auth-manager.js';
import syncStatus from './sync-status.js';
import { LogoGradientShift } from './MatrixLogoAnimated';

// Navigation configuration
const navigationConfig = [
  {
    id: 'home',
    path: '/',
    label: 'Data Hub',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  },
  {
    id: 'personnel',
    path: '/personnel',
    label: 'Personnel',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  {
    id: 'tools',
    label: 'Tools',
    isGroup: true,
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    children: [
      {
        id: 'cscan',
        path: '/cscan',
        label: 'C-Scan Visualizer',
        description: 'Ultrasonic inspection data visualization'
      },
      {
        id: 'pec',
        path: '/pec',
        label: 'PEC Visualizer',
        description: 'Pulsed Eddy Current heatmaps'
      },
      {
        id: '3d',
        path: '/3d',
        label: '3D Viewer',
        description: 'Advanced 3D model viewing'
      },
      {
        id: 'nii',
        path: '/nii',
        label: 'Coverage Calculator',
        description: 'Inspection coverage estimates'
      },
      {
        id: 'tofd',
        path: '/tofd',
        label: 'TOFD Calculator',
        description: 'Time-of-Flight calculations'
      }
    ]
  },
  {
    id: 'profile',
    path: '/profile',
    label: 'Profile',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  },
  {
    id: 'admin',
    path: '/admin',
    label: 'Admin',
    adminOnly: true,
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }
];

function LayoutNew() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    const checkAdmin = () => {
      setIsAdmin(authManager.isAdmin());
    };

    checkAdmin();
    const unsubscribe = authManager.onAuthStateChange(checkAdmin);
    window.addEventListener('userLoggedIn', checkAdmin);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('userLoggedIn', checkAdmin);
    };
  }, []);

  useEffect(() => {
    const element = syncStatus.create();
    return () => syncStatus.remove();
  }, []);

  // Check if any tools submenu item is active
  const isToolsActive = () => {
    const toolsItem = navigationConfig.find(item => item.isGroup);
    return toolsItem?.children?.some(child => child.path === location.pathname);
  };

  const handleLogout = async () => {
    try {
      console.log('LayoutNew: Logout initiated');
      await authManager.logout();
      // Wait a bit for auth state to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      // Navigate to login
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('LayoutNew: Error logging out:', error);
      // Navigate anyway to ensure user gets to login screen
      navigate('/login', { replace: true });
    }
  };

  // Filter navigation based on admin status
  const visibleNav = navigationConfig.filter(item =>
    !item.adminOnly || isAdmin
  );

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header__container">
          <Link to="/" className="header__brand">
            <LogoGradientShift size={44} />
            <span>NDT Suite</span>
          </Link>

          <nav className="header__nav">
            <div className="nav">
              {visibleNav.map((item) => {
                if (item.isGroup) {
                  const isActive = isToolsActive();
                  return (
                    <div key={item.id} className="dropdown">
                      <button
                        className={`nav__item ${isActive ? 'nav__item--active' : ''}`}
                        onClick={() => setToolsOpen(!toolsOpen)}
                      >
                        <span className="nav__icon">{item.icon}</span>
                        {item.label}
                        <svg
                          className="nav__icon"
                          style={{
                            width: '1rem',
                            height: '1rem',
                            transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0)',
                            transition: 'transform 0.2s'
                          }}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {toolsOpen && (
                        <div className="dropdown__menu animate-slideDown">
                          {item.children.map((child) => (
                            <Link
                              key={child.id}
                              to={child.path}
                              className={`dropdown__item ${location.pathname === child.path ? 'dropdown__item--active' : ''}`}
                              onClick={() => setToolsOpen(false)}
                            >
                              <div>
                                <div className="text-base font-medium">{child.label}</div>
                                <div className="text-xs text-tertiary">{child.description}</div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`nav__item ${isActive ? 'nav__item--active' : ''}`}
                  >
                    <span className="nav__icon">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="header__actions">
            <button
              onClick={handleLogout}
              className="btn btn--ghost btn--sm"
              title="Logout"
            >
              <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main">
        <div className="main__container animate-fadeIn">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default LayoutNew;
