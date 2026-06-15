import { type ReactNode, type FC } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import authManager from '../auth-manager.js';
import environmentConfig from '../config/environment';
import {
  LogoGradientShift,
  LogoGradientWave,
  LogoGradientPulse,
  LogoGradientSweep,
  LogoGradientBreathe,
  LogoGradientSplit,
  LogoGradientShimmer,
  LogoGradientAurora,
  LogoGlitchRain,
  LogoGlitchRGB,
  LogoGlitchScanline,
  LogoGlitchNeon,
  LogoGlitchCorrupt,
  LogoGlitchStrobe,
  LogoGlitchNoise,
  LogoGlitchFragment,
  LogoGlitchMelt,
  LogoGlitchHex,
  LogoStatic,
} from './MatrixLogoAnimated';
import { NotificationBell } from './NotificationBell';
import { AnnouncementBanner } from './AnnouncementBanner';
import { useTabVisibility } from '../hooks/queries/useTabVisibility';
import { useTheme } from '../contexts/ThemeContext';

interface LogoVariant {
  id: string;
  label: string;
  component: FC<{ size?: number; className?: string }>;
}

const LOGO_VARIANTS: LogoVariant[] = [
  { id: 'gradient-shift', label: 'Gradient Shift', component: LogoGradientShift },
  { id: 'gradient-wave', label: 'Gradient Wave', component: LogoGradientWave },
  { id: 'gradient-pulse', label: 'Gradient Pulse', component: LogoGradientPulse },
  { id: 'gradient-sweep', label: 'Gradient Sweep', component: LogoGradientSweep },
  { id: 'gradient-breathe', label: 'Gradient Breathe', component: LogoGradientBreathe },
  { id: 'gradient-split', label: 'Gradient Split', component: LogoGradientSplit },
  { id: 'gradient-shimmer', label: 'Gradient Shimmer', component: LogoGradientShimmer },
  { id: 'gradient-aurora', label: 'Gradient Aurora', component: LogoGradientAurora },
  { id: 'glitch-rain', label: 'Glitch Rain', component: LogoGlitchRain },
  { id: 'glitch-rgb', label: 'Glitch RGB', component: LogoGlitchRGB },
  { id: 'glitch-scanline', label: 'Glitch Scanline', component: LogoGlitchScanline },
  { id: 'glitch-neon', label: 'Glitch Neon', component: LogoGlitchNeon },
  { id: 'glitch-corrupt', label: 'Glitch Corrupt', component: LogoGlitchCorrupt },
  { id: 'glitch-strobe', label: 'Glitch Strobe', component: LogoGlitchStrobe },
  { id: 'glitch-noise', label: 'Glitch Noise', component: LogoGlitchNoise },
  { id: 'glitch-fragment', label: 'Glitch Fragment', component: LogoGlitchFragment },
  { id: 'glitch-melt', label: 'Glitch Melt', component: LogoGlitchMelt },
  { id: 'glitch-hex', label: 'Glitch Hex', component: LogoGlitchHex },
  { id: 'static', label: 'Static', component: LogoStatic },
];

function getStoredLogoId(): string {
  try { return localStorage.getItem('dev-logo-variant') || 'gradient-shift'; }
  catch { return 'gradient-shift'; }
}

function getLogoComponent(id: string): FC<{ size?: number; className?: string }> {
  return LOGO_VARIANTS.find(v => v.id === id)?.component ?? LogoGradientShift;
}

const isMaintenanceMode = environmentConfig.isMaintenanceMode();

interface NavChild {
  id: string;
  path: string;
  label: string;
  description: string;
}

interface NavItem {
  id: string;
  path?: string;
  label: string;
  requiresElevatedAccess?: boolean;
  adminOnly?: boolean;
  isGroup?: boolean;
  icon: ReactNode;
  children?: NavChild[];
}

// Navigation configuration
const navigationConfig: NavItem[] = [
  {
    id: 'personnel',
    path: '/personnel',
    label: 'Personnel',
    requiresElevatedAccess: true,  // Only visible to admin and manager
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  {
    id: 'projects',
    path: '/projects',
    label: 'Projects',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    )
  },
  {
    id: 'documents',
    path: '/documents',
    label: 'Documents',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
        label: 'C-Scan Processor & Compositor',
        description: 'Ultrasonic inspection data processing and visualization'
      },
      {
        id: 'vessel-modeler',
        path: '/vessel-modeler',
        label: 'Vessel Modeler',
        description: '3D pressure vessel modeling from GA drawings'
      },
      {
        id: 'scan-viewer',
        path: '/scan-viewer',
        label: 'Scan Viewer',
        description: 'Interactive C-scan heatmap with B-scan and A-scan cursors'
      },
      {
        id: 'topology',
        path: '/topology',
        label: '3D Topology (Experimental)',
        description: 'Interactive 3D surface visualization of scan thickness data'
      },
      {
        id: 'downloads',
        path: '/downloads',
        label: 'Downloads',
        description: 'Desktop applications and companion tools'
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

const THEME_ICONS: Record<string, ReactNode> = {
  system: (
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  light: (
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  dark: (
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ),
};

const THEME_LABELS: Record<string, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

function ThemeToggle() {
  const { preference, cycle } = useTheme();
  return (
    <button
      onClick={cycle}
      className="btn btn--ghost btn--sm"
      title={THEME_LABELS[preference]}
      style={{ padding: '6px 8px', minWidth: 0 }}
    >
      {THEME_ICONS[preference]}
    </button>
  );
}

function LayoutNew() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [hasElevatedAccess, setHasElevatedAccess] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [logoId, setLogoId] = useState(getStoredLogoId);

  const ActiveLogo = getLogoComponent(logoId);

  const handleLogoChange = (id: string) => {
    setLogoId(id);
    try { localStorage.setItem('dev-logo-variant', id); } catch { /* storage unavailable */ }
  };

  // Fetch tab visibility settings from DB
  const { data: tabVisibilitySettings = [] } = useTabVisibility();

  useEffect(() => {
    const checkAccess = () => {
      setIsAdmin(authManager.isAdmin());
      setIsSuperAdmin(authManager.isSuperAdmin());
      setHasElevatedAccess(authManager.hasElevatedAccess());
    };

    checkAccess();
    window.addEventListener('userLoggedIn', checkAccess);
    window.addEventListener('authStateChanged', checkAccess);

    return () => {
      window.removeEventListener('userLoggedIn', checkAccess);
      window.removeEventListener('authStateChanged', checkAccess);
    };
  }, []);

  // Check if any tools submenu item is active
  const isToolsActive = () => {
    const toolsItem = navigationConfig.find(item => item.isGroup);
    return toolsItem?.children?.some(child => child.path === location.pathname);
  };

  const handleLogout = () => {
    // Navigate immediately for instant feedback
    navigate('/login', { replace: true });
    // Then cleanup in background (non-blocking)
    authManager.logout().catch(() => {});
  };

  // Build a map of tab visibility from DB settings
  const tabVisibilityMap = new Map(
    tabVisibilitySettings.map(s => [s.tab_id, s.is_visible])
  );

  // Filter navigation based on user role, maintenance mode, and tab visibility
  const visibleNav = navigationConfig.filter(item => {
    if (isMaintenanceMode) return item.isGroup;
    if (item.adminOnly) return isAdmin;
    if (item.requiresElevatedAccess) return hasElevatedAccess;

    // Super admins always see all tabs regardless of visibility settings
    if (isSuperAdmin) return true;

    // Check tab visibility settings (if settings exist in DB)
    if (tabVisibilityMap.size > 0 && tabVisibilityMap.has(item.id)) {
      return tabVisibilityMap.get(item.id) === true;
    }

    return true;
  });

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header__container">
          <Link to={isMaintenanceMode ? "/cscan" : "/profile"} className="header__brand">
            <ActiveLogo size={44} />
            <span>Matrix Portal</span>
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
                          {item.children!.map((child) => (
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

                const isActive = location.pathname === item.path || (item.path && location.pathname.startsWith(item.path + '/'));
                return (
                  <Link
                    key={item.id}
                    to={item.path!}
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
            {!isMaintenanceMode && <NotificationBell />}
            <ThemeToggle />
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

      {isMaintenanceMode ? (
        <div className="px-5 py-2.5 text-center text-sm border-b"
          style={{ background: 'linear-gradient(90deg, rgba(251,191,36,0.2), rgba(251,191,36,0.08))', borderLeft: '4px solid #f59e0b', color: '#fde047' }}>
          Data features are temporarily unavailable. Tools remain fully functional.
        </div>
      ) : (
        <AnnouncementBanner />
      )}

      {/* Main Content */}
      <main className="main">
        <div className="main__container animate-fadeIn">
          <Outlet />
        </div>
      </main>

      {import.meta.env.DEV && (
        <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 99999, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <DevLogoPicker logoId={logoId} onLogoChange={handleLogoChange} />
          <DevColorPicker />
        </div>
      )}
    </div>
  );
}

function DevLogoPicker({ logoId, onLogoChange }: { logoId: string; onLogoChange: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState(true);
  const [open, setOpen] = useState(false);
  const current = LOGO_VARIANTS.find(v => v.id === logoId);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Logo picker"
        style={{
          width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)',
          background: '#1a1a2e', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}
      >
        <svg viewBox="0 0 2256 1202" width={16} height={9} fill="#10b981" style={{ display: 'block' }}>
          <path d="M36 1199.2 c-17.1-4.5-30.8-18.8-34-35.7-0.8-4.4-1-75-0.8-266l0.3-260 3.3-9.5c4-11.5 10.6-22.3 18.1-29.9 5.6-5.6 778.3-585.2 787.1-590.3 7-4.1 16.1-6.1 25-5.5 19 1.3 34.9 13.6 41.1 31.7l2.2 6.5 0.8 239.5z" />
        </svg>
      </button>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(180deg, #c6c5c2, #b2b1ae)',
      borderRadius: 8, padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.45)',
      fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4a4845',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 4, padding: '3px 8px', fontFamily: 'inherit', fontSize: 11,
            color: '#4a4845', cursor: 'pointer', minWidth: 120, textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          }}
        >
          {current?.label ?? 'Gradient Shift'}
          <span style={{ fontSize: 8 }}>{open ? '▲' : '▼'}</span>
        </button>
        <span style={{ fontSize: 9, color: '#9a968f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>LOGO</span>
        <button
          onClick={() => { setCollapsed(true); setOpen(false); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9a968f', fontSize: 14, lineHeight: 1, padding: '0 2px',
          }}
        >&times;</button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
          background: 'linear-gradient(180deg, #d4d3d0, #c2c1be)',
          borderRadius: 8, padding: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.45)',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
          width: 320, maxHeight: 400, overflowY: 'auto',
        }}>
          {LOGO_VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => { onLogoChange(v.id); setOpen(false); }}
              style={{
                background: v.id === logoId ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.04)',
                border: v.id === logoId ? '2px solid #10b981' : '1px solid rgba(0,0,0,0.06)',
                borderRadius: 6, padding: '8px 4px 4px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <div style={{
                width: 60, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: v.id.startsWith('glitch') ? '#111' : 'transparent', borderRadius: 3,
              }}>
                <v.component size={56} />
              </div>
              <span style={{
                fontSize: 8, color: v.id === logoId ? '#10b981' : '#6a6865',
                textAlign: 'center', lineHeight: 1.2, fontWeight: v.id === logoId ? 600 : 400,
              }}>
                {v.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DevColorPicker() {
  const [color, setColor] = useState('#3a3836');
  const [collapsed, setCollapsed] = useState(false);

  const applyColor = (c: string) => {
    setColor(c);
    document.body.style.background = c;
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)',
          background: color, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      />
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(180deg, #c6c5c2, #b2b1ae)',
      borderRadius: 8, padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.45)',
      fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4a4845',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <input
        type="color"
        value={color}
        onChange={(e) => applyColor(e.target.value)}
        style={{ width: 28, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0 }}
      />
      <input
        type="text"
        value={color}
        onChange={(e) => { if (/^#[0-9a-f]{0,6}$/i.test(e.target.value)) { setColor(e.target.value); if (e.target.value.length === 7) applyColor(e.target.value); } }}
        style={{
          width: 72, background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 4, padding: '3px 6px', fontFamily: 'inherit', fontSize: 11,
          color: '#4a4845', textAlign: 'center',
        }}
      />
      <span style={{ fontSize: 9, color: '#9a968f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>BG</span>
      <button
        onClick={() => setCollapsed(true)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9a968f', fontSize: 14, lineHeight: 1, padding: '0 2px',
        }}
      >&times;</button>
    </div>
  );
}

export default LayoutNew;
