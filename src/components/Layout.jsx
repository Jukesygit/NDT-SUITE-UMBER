import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import authManager from '../auth-manager.js';
import syncStatus from './sync-status.js';

// Tool configuration
const tools = [
    {
        id: 'home',
        path: '/',
        name: 'Data Hub',
        description: 'Organize and manage your inspection scans by asset and vessel.',
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>`
    },
    {
        id: 'admin',
        path: '/admin',
        name: 'Admin Dashboard',
        description: 'Manage users, organizations, and permissions.',
        adminOnly: true,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`
    },
    {
        id: 'profile',
        path: '/profile',
        name: 'Profile',
        description: 'Manage your profile and request permissions.',
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>`
    },
    {
        id: 'personnel',
        path: '/personnel',
        name: 'Personnel',
        description: 'Manage employee competencies and certifications.',
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`
    },
    {
        id: 'tools-dropdown',
        isDropdown: true,
        name: 'Tools',
        description: 'NDT visualization and calculation tools',
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>`,
        subTools: [
            {
                id: 'cscan',
                path: '/cscan',
                name: 'C-Scan Visualiser',
                description: 'Visualize C-Scan data from ultrasonic inspections with composite generation.',
                icon: `<svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 0h-4m4 0l-5-5"></path></svg>`
            },
            {
                id: 'pec',
                path: '/pec',
                name: 'PEC Visualiser',
                description: 'Visualize Pulsed Eddy Current data as interactive heatmaps.',
                icon: `<svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`
            },
            {
                id: '3dview',
                path: '/3d',
                name: '3D Model Viewer',
                description: 'View 3D models with advanced texture projection and layer management.',
                icon: `<svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"></path></svg>`
            },
            {
                id: 'nii',
                path: '/nii',
                name: 'Coverage Calculator',
                description: 'Calculate inspection coverage and time estimates for PAUT, PEC, and TOFD methods.',
                icon: `<svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`
            },
            {
                id: 'tofd',
                path: '/tofd',
                name: 'TOFD Calculator',
                description: 'Calculate coverage and dead zones for Time-of-Flight Diffraction inspections.',
                icon: `<svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-6m-3 6v-3m-3 3v-6m0 0l6-6m-6 6l6 6"></path></svg>`
            }
        ]
    }
];

function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [syncStatusElement, setSyncStatusElement] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [hoveredTool, setHoveredTool] = useState(null);
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const toolButtonRefs = useRef({});

    useEffect(() => {
        // Initial check
        const checkAdmin = () => {
            const isAdminUser = authManager.isAdmin();
            console.log('Layout: Checking admin status:', isAdminUser, authManager.getCurrentUser());
            setIsAdmin(isAdminUser);
        };

        checkAdmin();

        // Listen for auth state changes
        const unsubscribe = authManager.onAuthStateChange(() => {
            console.log('Layout: Auth state changed');
            checkAdmin();
        });

        // Also listen for userLoggedIn event
        const handleUserLoggedIn = () => {
            console.log('Layout: User logged in event');
            checkAdmin();
        };
        window.addEventListener('userLoggedIn', handleUserLoggedIn);

        return () => {
            if (unsubscribe) unsubscribe();
            window.removeEventListener('userLoggedIn', handleUserLoggedIn);
        };
    }, []);

    useEffect(() => {
        // Initialize sync status component (it appends itself to document.body)
        console.log('Layout: Creating sync status component');
        const element = syncStatus.create();
        setSyncStatusElement(element);

        return () => {
            console.log('Layout: Cleaning up sync status component');
            syncStatus.remove();
        };
    }, []); // Empty dependency array - only run once on mount

    // Handle click outside dropdown to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is outside both the button and the dropdown menu
            if (dropdownOpen &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target)) {
                setDropdownOpen(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dropdownOpen]);

    // Check if current path is in dropdown
    const isDropdownActive = (subTools) => {
        return subTools?.some(tool => tool.path === location.pathname);
    };

    const availableTools = tools.filter(tool => {
        if (tool.adminOnly) {
            return isAdmin;
        }
        return true;
    });

    return (
        <div id="app-container" className="tool-active" style={{ display: 'flex', height: '100vh' }}>
            <aside id="toolbar" className="glass-panel" style={{
                position: 'relative',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 100%), rgba(15,15,20,0.4)',
                borderRight: '1.5px solid rgba(255,255,255,0.2)',
                borderTop: '1.5px solid rgba(255,255,255,0.25)',
                width: '90px',
                flexShrink: 0,
                height: '100vh',
                zIndex: 20,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.15) inset',
                overflow: 'visible'
            }}>
                <div className="flex flex-col h-full w-full items-center justify-between py-6">
                    <div className="flex flex-col items-center gap-3 w-full px-3">
                        <nav id="toolbar-content" className="flex flex-col items-center justify-center gap-3 w-full">
                            {availableTools.map((tool, index) => {
                                if (tool.isDropdown) {
                                    const isActive = isDropdownActive(tool.subTools);
                                    const isOpen = dropdownOpen === tool.id;
                                    const iconWithColor = tool.icon
                                        .replace('stroke="currentColor"', 'stroke="#ffffff"')
                                        .replace('class="w-7 h-7', 'class="w-7 h-7" style="display: block; opacity: 1;');

                                    return (
                                        <div key={tool.id} style={{ position: 'relative', width: '100%' }}>
                                            <button
                                                ref={buttonRef}
                                                type="button"
                                                className="tool-btn"
                                                style={{
                                                    position: 'relative',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    height: '56px',
                                                    width: '100%',
                                                    borderRadius: '12px',
                                                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    background: (isActive || isOpen)
                                                        ? 'linear-gradient(135deg, rgba(100, 150, 255, 0.18) 0%, rgba(100, 150, 255, 0.12) 100%)'
                                                        : hoveredTool === tool.id
                                                        ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.06) 100%)'
                                                        : 'rgba(255, 255, 255, 0.04)',
                                                    backdropFilter: 'blur(10px)',
                                                    WebkitBackdropFilter: 'blur(10px)',
                                                    border: '1px solid',
                                                    borderColor: (isActive || isOpen)
                                                        ? 'rgba(100, 150, 255, 0.4)'
                                                        : hoveredTool === tool.id
                                                        ? 'rgba(255, 255, 255, 0.18)'
                                                        : 'rgba(255, 255, 255, 0.08)',
                                                    boxShadow: (isActive || isOpen)
                                                        ? '0 4px 20px rgba(100, 150, 255, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                                                        : hoveredTool === tool.id
                                                        ? '0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                                                        : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                                    color: '#ffffff',
                                                    opacity: 0,
                                                    animation: `slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${index * 50}ms forwards`,
                                                    cursor: 'pointer',
                                                    transform: hoveredTool === tool.id ? 'translateY(-2px)' : 'translateY(0)',
                                                    overflow: 'hidden'
                                                }}
                                                title={tool.name}
                                                aria-label={tool.name}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    console.log('Tools button clicked, current state:', isOpen, 'setting to:', !isOpen);

                                                    if (!isOpen && buttonRef.current) {
                                                        const rect = buttonRef.current.getBoundingClientRect();
                                                        setDropdownPosition({
                                                            top: rect.top,
                                                            left: rect.right + 12
                                                        });
                                                    }

                                                    setDropdownOpen(isOpen ? null : tool.id);
                                                }}
                                                onMouseEnter={() => setHoveredTool(tool.id)}
                                                onMouseLeave={() => setHoveredTool(null)}
                                            >
                                                {/* Active indicator */}
                                                {(isActive || isOpen) && (
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            left: 0,
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            width: '3px',
                                                            height: '60%',
                                                            backgroundColor: 'rgba(100, 150, 255, 0.9)',
                                                            borderRadius: '0 2px 2px 0',
                                                            boxShadow: '0 0 8px rgba(100, 150, 255, 0.4)',
                                                            animation: 'slideInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                                        }}
                                                    />
                                                )}
                                                <div dangerouslySetInnerHTML={{ __html: iconWithColor }} />
                                            </button>

                                            {/* Dropdown Menu - Rendered as Portal */}
                                            {isOpen && ReactDOM.createPortal(
                                                <div
                                                    ref={dropdownRef}
                                                    style={{
                                                        position: 'fixed',
                                                        left: `${dropdownPosition.left}px`,
                                                        top: `${dropdownPosition.top}px`,
                                                        minWidth: '340px',
                                                        maxWidth: '420px',
                                                        backdropFilter: 'blur(24px)',
                                                        WebkitBackdropFilter: 'blur(24px)',
                                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.06) 100%), rgba(15,15,20,0.96)',
                                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                                        borderTop: '1px solid rgba(255, 255, 255, 0.25)',
                                                        borderRadius: '16px',
                                                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08) inset',
                                                        padding: '10px',
                                                        zIndex: 9999,
                                                        opacity: 0,
                                                        animation: 'dropdownFadeIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                                                        pointerEvents: 'auto',
                                                        overflow: 'hidden'
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {tool.subTools.map((subTool, subIndex) => {
                                                        const isSubActive = location.pathname === subTool.path;
                                                        const subIconWithColor = subTool.icon
                                                            .replace('stroke="currentColor"', 'stroke="#ffffff"')
                                                            .replace('class="w-5 h-5', 'class="w-5 h-5" style="flex-shrink: 0;');

                                                        return (
                                                            <Link
                                                                key={subTool.id}
                                                                to={subTool.path}
                                                                onClick={() => setDropdownOpen(null)}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '14px',
                                                                    padding: '14px 16px',
                                                                    borderRadius: '12px',
                                                                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                    background: isSubActive
                                                                        ? 'linear-gradient(135deg, rgba(100, 150, 255, 0.16) 0%, rgba(100, 150, 255, 0.1) 100%)'
                                                                        : 'transparent',
                                                                    border: '1px solid',
                                                                    borderColor: isSubActive
                                                                        ? 'rgba(100, 150, 255, 0.3)'
                                                                        : 'transparent',
                                                                    color: '#ffffff',
                                                                    textDecoration: 'none',
                                                                    opacity: 0,
                                                                    animation: `slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${subIndex * 50 + 50}ms forwards`,
                                                                    cursor: 'pointer',
                                                                    position: 'relative',
                                                                    overflow: 'hidden'
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    if (!isSubActive) {
                                                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.05) 100%)';
                                                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                                                                        e.currentTarget.style.transform = 'translateX(6px)';
                                                                        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.15)';
                                                                    }
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    if (!isSubActive) {
                                                                        e.currentTarget.style.background = 'transparent';
                                                                        e.currentTarget.style.borderColor = 'transparent';
                                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                                        e.currentTarget.style.boxShadow = 'none';
                                                                    }
                                                                }}
                                                            >
                                                                <div dangerouslySetInnerHTML={{ __html: subIconWithColor }} />
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{
                                                                        fontSize: '15px',
                                                                        fontWeight: '600',
                                                                        marginBottom: '3px',
                                                                        color: isSubActive ? 'rgba(100, 150, 255, 1)' : '#ffffff',
                                                                        letterSpacing: '-0.01em'
                                                                    }}>
                                                                        {subTool.name}
                                                                    </div>
                                                                    <div style={{
                                                                        fontSize: '12px',
                                                                        color: 'rgba(255, 255, 255, 0.55)',
                                                                        lineHeight: '1.4',
                                                                        letterSpacing: '0.01em'
                                                                    }}>
                                                                        {subTool.description}
                                                                    </div>
                                                                </div>
                                                                {/* Active indicator for dropdown items */}
                                                                {isSubActive && (
                                                                    <div
                                                                        style={{
                                                                            width: '6px',
                                                                            height: '6px',
                                                                            borderRadius: '50%',
                                                                            backgroundColor: 'rgba(100, 150, 255, 0.9)',
                                                                            boxShadow: '0 0 8px rgba(100, 150, 255, 0.6)',
                                                                            flexShrink: 0
                                                                        }}
                                                                    />
                                                                )}
                                                            </Link>
                                                        );
                                                    })}
                                                </div>,
                                                document.body
                                            )}
                                        </div>
                                    );
                                }

                                // Regular tool button
                                const isActive = location.pathname === tool.path;
                                const iconWithColor = tool.icon
                                    .replace('stroke="currentColor"', 'stroke="#ffffff"')
                                    .replace('class="w-7 h-7', 'class="w-7 h-7" style="display: block; opacity: 1;');
                                return (
                                    <Link
                                        key={tool.id}
                                        to={tool.path}
                                        className="tool-btn"
                                        style={{
                                            position: 'relative',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            height: '56px',
                                            width: '100%',
                                            borderRadius: '12px',
                                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                            background: isActive
                                                ? 'linear-gradient(135deg, rgba(100, 150, 255, 0.18) 0%, rgba(100, 150, 255, 0.12) 100%)'
                                                : hoveredTool === tool.id
                                                ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.06) 100%)'
                                                : 'rgba(255, 255, 255, 0.04)',
                                            backdropFilter: 'blur(10px)',
                                            WebkitBackdropFilter: 'blur(10px)',
                                            border: '1px solid',
                                            borderColor: isActive
                                                ? 'rgba(100, 150, 255, 0.4)'
                                                : hoveredTool === tool.id
                                                ? 'rgba(255, 255, 255, 0.18)'
                                                : 'rgba(255, 255, 255, 0.08)',
                                            boxShadow: isActive
                                                ? '0 4px 20px rgba(100, 150, 255, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                                                : hoveredTool === tool.id
                                                ? '0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                                                : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                            color: '#ffffff',
                                            opacity: 0,
                                            animation: `slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${index * 50}ms forwards`,
                                            transform: hoveredTool === tool.id ? 'translateY(-2px)' : 'translateY(0)',
                                            overflow: 'hidden'
                                        }}
                                        title={tool.name}
                                        aria-label={tool.name}
                                        onMouseEnter={() => setHoveredTool(tool.id)}
                                        onMouseLeave={() => setHoveredTool(null)}
                                    >
                                        {/* Active indicator */}
                                        {isActive && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: 0,
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    width: '3px',
                                                    height: '60%',
                                                    backgroundColor: 'rgba(100, 150, 255, 0.9)',
                                                    borderRadius: '0 2px 2px 0',
                                                    boxShadow: '0 0 8px rgba(100, 150, 255, 0.4)',
                                                    animation: 'slideInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }}
                                            />
                                        )}
                                        <div dangerouslySetInnerHTML={{ __html: iconWithColor }} />
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Logout Button */}
                    <div className="flex flex-col items-center gap-3 w-full px-3">
                        <button
                            onClick={async () => {
                                try {
                                    await authManager.logout();
                                    // Wait for session to clear, then navigate
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                    // Use navigate instead of hard reload
                                    navigate('/login');
                                } catch (error) {
                                    console.error('Error logging out:', error);
                                    navigate('/login');
                                }
                            }}
                            className="tool-btn"
                            style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '56px',
                                width: '100%',
                                borderRadius: '12px',
                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                background: hoveredTool === 'logout'
                                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.22) 0%, rgba(239, 68, 68, 0.16) 100%)'
                                    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(239, 68, 68, 0.1) 100%)',
                                backdropFilter: 'blur(10px)',
                                WebkitBackdropFilter: 'blur(10px)',
                                border: '1px solid',
                                borderColor: hoveredTool === 'logout'
                                    ? 'rgba(239, 68, 68, 0.5)'
                                    : 'rgba(239, 68, 68, 0.3)',
                                boxShadow: hoveredTool === 'logout'
                                    ? '0 4px 16px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                                    : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                                cursor: 'pointer',
                                transform: hoveredTool === 'logout' ? 'translateY(-2px)' : 'translateY(0)',
                                overflow: 'hidden'
                            }}
                            title="Logout"
                            aria-label="Logout"
                            onMouseEnter={() => setHoveredTool('logout')}
                            onMouseLeave={() => setHoveredTool(null)}
                        >
                            <svg className="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            <main id="main-content" className="flex-1 overflow-hidden relative z-10">
                <Outlet />
            </main>
        </div>
    );
}

export default Layout;
