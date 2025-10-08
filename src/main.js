// Main Application Entry Point
import './styles/main.css';
import { initTheme } from './theme.js';
import authManager, { PERMISSIONS } from './auth-manager.js';
import login from './tools/login.js';
import adminDashboard from './tools/admin-dashboard.js';
import tofdCalculator from './tools/tofd-calculator.js';
import cscanVisualizer from './tools/cscan-visualizer.js';
import pecVisualizer from './tools/pec-visualizer.js';
import viewer3D from './tools/3d-viewer.js';
import dataHub from './tools/data-hub.js';
import niiCalculator from './tools/nii-coverage-calculator.js';
import profile from './tools/profile.js';

// Tool Registry - add new tools here
const tools = [
    {
        id: 'admin',
        name: 'Admin Dashboard',
        description: 'Manage users, organizations, and permissions.',
        active: true,
        adminOnly: true,
        module: adminDashboard,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`
    },
    {
        id: 'profile',
        name: 'Profile',
        description: 'Manage your profile and request permissions.',
        active: true,
        module: profile,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>`
    },
    {
        id: 'home',
        name: 'Data Hub',
        description: 'Organize and manage your inspection scans by asset and vessel.',
        active: true,
        isHome: true,
        module: dataHub,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>`
    },
    {
        id: 'tofd',
        name: 'TOFD Calculator',
        description: 'Calculate coverage and dead zones for Time-of-Flight Diffraction inspections.',
        active: true,
        module: tofdCalculator,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-6m-3 6v-3m-3 3v-6m0 0l6-6m-6 6l6 6"></path></svg>`
    },
    {
        id: 'cscan',
        name: 'C-Scan Visualiser',
        description: 'Visualize C-Scan data from ultrasonic inspections with composite generation.',
        active: true,
        module: cscanVisualizer,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 0h-4m4 0l-5-5"></path></svg>`
    },
    {
        id: 'pec',
        name: 'PEC Visualiser',
        description: 'Visualize Pulsed Eddy Current data as interactive heatmaps.',
        active: true,
        module: pecVisualizer,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`
    },
    {
        id: '3dview',
        name: '3D Model Viewer',
        description: 'View 3D models with advanced texture projection and layer management.',
        active: true,
        module: viewer3D,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"></path></svg>`
    },
    {
        id: 'nii',
        name: 'NII Coverage Calculator',
        description: 'Calculate inspection coverage and time estimates for PAUT, PEC, and TOFD methods.',
        active: true,
        module: niiCalculator,
        icon: `<svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`
    }
];

class NDTApp {
    constructor() {
        this.activeTool = null;
        this.homeTool = tools.find(t => t.isHome);
        this.isLoggedIn = false;
        this.pending3DModelData = null;
        this.dom = {
            appContainer: document.getElementById('app-container'),
            toolbarContent: document.getElementById('toolbar-content'),
            landingContent: document.getElementById('landing-content'),
            landingTitle: document.getElementById('landing-title'),
            landingDescription: document.getElementById('landing-description'),
            mainContent: document.getElementById('main-content')
        };
        // Make app instance globally accessible for tools
        window.ndtApp = this;
    }

    getAvailableTools() {
        if (!this.isLoggedIn) return [];

        return tools.filter(tool => {
            // Admin-only tools
            if (tool.adminOnly) {
                return authManager.isAdmin();
            }
            return true;
        });
    }

    createToolbarButton(tool) {
        const buttonClasses = `tool-btn relative flex items-center justify-center h-16 w-16 rounded-lg text-gray-400 transition-all ${
            tool.active ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
        }`;
        const buttonStyle = tool.active ?
            'background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(4px); border: 1px solid rgba(255, 255, 255, 0.1);' :
            'background: rgba(255, 255, 255, 0.02);';
        return `<button id="btn-${tool.id}" data-tool-id="${tool.id}" class="${buttonClasses}" style="${buttonStyle}" title="${tool.name}" aria-label="${tool.name}" ${!tool.active ? 'disabled' : ''} onmouseover="if(!this.disabled) this.style.background='rgba(100, 150, 255, 0.2)'; this.style.borderColor='rgba(100, 150, 255, 0.3)'" onmouseout="if(!this.disabled) this.style.background='rgba(255, 255, 255, 0.05)'; this.style.borderColor='rgba(255, 255, 255, 0.1)'">${tool.icon}</button>`;
    }

    updateDescription(tool) {
        this.dom.landingTitle.textContent = tool.name;
        this.dom.landingDescription.textContent = tool.description;
    }

    switchTool(toolId) {
        const toolToActivate = tools.find(t => t.id === toolId);
        if (!toolToActivate || !toolToActivate.active) return;

        // Cleanup previous tool
        if (this.activeTool && this.activeTool.module && this.activeTool.module.destroy) {
            const container = document.getElementById(`tool-${this.activeTool.id}`);
            try {
                this.activeTool.module.destroy(container);
            } catch (error) {
                console.error(`Error destroying tool ${this.activeTool.id}:`, error);
            }
        }

        // Hide all containers
        this.dom.landingContent.classList.add('hidden');
        this.dom.mainContent.querySelectorAll('.tool-container').forEach(el => {
            el.classList.add('hidden');
        });

        if (toolToActivate.isHome) {
            // Show home (data hub)
            this.dom.appContainer.classList.add('tool-active');
            this.dom.landingContent.classList.add('hidden');
            const toolContainer = document.getElementById(`tool-home`);
            toolContainer.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            // Initialize data hub (async)
            if (toolToActivate.module && toolToActivate.module.init) {
                try {
                    const initResult = toolToActivate.module.init(toolContainer);
                    if (initResult && initResult.then) {
                        initResult.catch(error => {
                            console.error('Error initializing data hub:', error);
                        });
                    }
                } catch (error) {
                    console.error('Error initializing data hub:', error);
                }
            }
            this.activeTool = toolToActivate;
        } else {
            // Show tool
            this.dom.appContainer.classList.add('tool-active');
            const toolContainer = document.getElementById(`tool-${toolToActivate.id}`);
            toolContainer.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            // Initialize tool
            if (toolToActivate.module && toolToActivate.module.init) {
                try {
                    toolToActivate.module.init(toolContainer);
                } catch (error) {
                    console.error(`Error initializing tool ${toolToActivate.id}:`, error);
                    toolContainer.innerHTML = `
                        <div class="flex items-center justify-center h-full">
                            <div class="text-center p-8">
                                <h2 class="text-2xl font-bold text-red-600 mb-4">Error Loading Tool</h2>
                                <p class="text-gray-600 dark:text-gray-400">
                                    There was an error loading this tool. Please check the console for details.
                                </p>
                            </div>
                        </div>
                    `;
                }
            }
            this.activeTool = toolToActivate;
        }

        // Update toolbar highlighting
        this.dom.toolbarContent.querySelectorAll('.tool-btn').forEach(btn => {
            const isActive = btn.dataset.toolId === (this.activeTool?.id || 'home');
            if (isActive) {
                btn.style.background = 'linear-gradient(135deg, rgba(90,150,255,0.3), rgba(110,170,255,0.3))';
                btn.style.borderColor = 'rgba(100, 150, 255, 0.5)';
                btn.style.boxShadow = '0 0 20px rgba(100, 150, 255, 0.3)';
                btn.classList.add('text-white');
            } else {
                btn.style.background = 'rgba(255, 255, 255, 0.05)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                btn.style.boxShadow = 'none';
                btn.classList.remove('text-white');
            }
        });
    }

    async initialize() {
        // Initialize auth manager
        await authManager.ensureInitialized();

        // Initialize theme
        initTheme();

        // Set up global event listeners first
        this.setupGlobalEventListeners();

        // Check if user is logged in
        this.isLoggedIn = authManager.isLoggedIn();

        if (!this.isLoggedIn) {
            this.showLoginScreen();
            return;
        }

        // User is logged in, show main app
        this.showMainApp();
    }

    setupGlobalEventListeners() {
        // Listen for login events
        window.addEventListener('userLoggedIn', () => {
            this.isLoggedIn = true;
            this.showMainApp();
        });

        // Listen for loadScan events from data hub
        window.addEventListener('loadScan', (e) => {
            const { toolType, scanData } = e.detail;
            this.loadScanInTool(toolType, scanData);
        });

        // Listen for load3DModel events from data hub
        window.addEventListener('load3DModel', (e) => {
            // Store the event data for the 3D viewer to pick up on init
            this.pending3DModelData = e.detail;
            this.switchTool('3dview');
        });

        // Event listeners for toolbar
        this.dom.toolbarContent.addEventListener('mouseover', (e) => {
            if (this.dom.appContainer.classList.contains('tool-active')) return;
            const button = e.target.closest('.tool-btn');
            if (button) {
                const tool = tools.find(t => t.id === button.dataset.toolId);
                if (tool) this.updateDescription(tool);
            }
        });

        this.dom.toolbarContent.addEventListener('mouseleave', () => {
            if (!this.dom.appContainer.classList.contains('tool-active')) {
                this.updateDescription(this.homeTool);
            }
        });

        this.dom.toolbarContent.addEventListener('click', (e) => {
            const button = e.target.closest('.tool-btn');
            if (button && !button.disabled) {
                this.switchTool(button.dataset.toolId);
            }
        });
    }

    showLoginScreen() {
        const loginContainer = document.getElementById('tool-login');
        if (!loginContainer) {
            // Create login container
            const container = document.createElement('div');
            container.id = 'tool-login';
            container.className = 'tool-container fixed inset-0 z-50';
            this.dom.mainContent.appendChild(container);
        }

        // Hide main UI
        this.dom.appContainer.classList.remove('tool-active');
        document.body.style.overflow = 'auto';

        // Show login
        const loginContainer2 = document.getElementById('tool-login');
        loginContainer2.classList.remove('hidden');
        login.init(loginContainer2);
    }

    showMainApp() {
        // Hide login
        const loginContainer = document.getElementById('tool-login');
        if (loginContainer) {
            loginContainer.classList.add('hidden');
        }

        // Create toolbar buttons
        const availableTools = this.getAvailableTools();
        this.dom.toolbarContent.innerHTML = availableTools
            .map(tool => this.createToolbarButton(tool))
            .join('');

        // Add user info and logout button to toolbar
        this.addUserInfoToToolbar();

        // Start with home tool
        this.switchTool('home');
    }

    addUserInfoToToolbar() {
        const user = authManager.getCurrentUser();
        if (!user) return;

        const userInfoContainer = document.getElementById('user-info-container');
        if (!userInfoContainer) return;

        userInfoContainer.className = 'p-3 flex flex-col items-center gap-2 w-full';
        userInfoContainer.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';

        const badgeClass = user.role === 'admin' ? 'badge-purple' :
                          user.role === 'org_admin' ? 'badge-blue' :
                          user.role === 'editor' ? 'badge-green' : 'glass-badge';

        userInfoContainer.innerHTML = `
            <div class="text-xs text-gray-400 text-center w-full">
                <div class="font-medium text-white mb-1">${user.username}</div>
                <span class="glass-badge ${badgeClass}">${user.role}</span>
            </div>
            <button id="logout-btn" class="btn-secondary w-full text-xs py-2 px-3" aria-label="Logout from account">
                Logout
            </button>
        `;

        const logoutBtn = userInfoContainer.querySelector('#logout-btn');
        logoutBtn.addEventListener('click', async () => {
            await authManager.logout();
            this.isLoggedIn = false;
            this.showLoginScreen();
        });
    }

    loadScanInTool(toolType, scanData) {
        // Map tool types to tool IDs
        const toolMap = {
            'pec': 'pec',
            'cscan': 'cscan',
            '3dview': '3dview'
        };

        const toolId = toolMap[toolType];
        if (!toolId) {
            console.error('Unknown tool type:', toolType);
            return;
        }

        // Switch to the appropriate tool
        this.switchTool(toolId);

        // Dispatch event to load the scan data in the tool
        setTimeout(() => {
            const event = new CustomEvent('loadScanData', {
                detail: { scanData }
            });
            window.dispatchEvent(event);
        }, 100); // Small delay to ensure tool is initialized
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new NDTApp();
    app.initialize();
});