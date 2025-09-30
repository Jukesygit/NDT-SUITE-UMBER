// Main Application Entry Point
import './styles/main.css';
import { initTheme } from './theme.js';
import tofdCalculator from './tools/tofd-calculator.js';
import cscanVisualizer from './tools/cscan-visualizer.js';
import pecVisualizer from './tools/pec-visualizer.js';
import viewer3D from './tools/3d-viewer.js';

// Tool Registry - add new tools here
const tools = [
    {
        id: 'home',
        name: 'Home',
        description: 'A collection of powerful and easy-to-use tools for Non-Destructive Testing professionals. Select a tool to begin.',
        active: true,
        isHome: true,
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
    }
];

class NDTApp {
    constructor() {
        this.activeTool = null;
        this.homeTool = tools.find(t => t.isHome);
        this.dom = {
            appContainer: document.getElementById('app-container'),
            toolbarContent: document.getElementById('toolbar-content'),
            landingContent: document.getElementById('landing-content'),
            landingTitle: document.getElementById('landing-title'),
            landingDescription: document.getElementById('landing-description'),
            mainContent: document.getElementById('main-content')
        };
    }

    createToolbarButton(tool) {
        const buttonClasses = `tool-btn relative flex items-center justify-center h-16 w-16 rounded-lg text-gray-400 transition-colors ${
            tool.active ? 'hover:bg-gray-700 hover:text-white cursor-pointer' : 'cursor-not-allowed opacity-50'
        }`;
        return `<button id="btn-${tool.id}" data-tool-id="${tool.id}" class="${buttonClasses}" title="${tool.name}" ${!tool.active ? 'disabled' : ''}>${tool.icon}</button>`;
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
            // Show home
            this.dom.appContainer.classList.remove('tool-active');
            this.dom.landingContent.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            this.updateDescription(this.homeTool);
            this.activeTool = null;
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
            btn.classList.toggle('bg-gray-700', isActive);
            btn.classList.toggle('text-white', isActive);
        });
    }

    initialize() {
        // Create toolbar buttons
        this.dom.toolbarContent.innerHTML = tools
            .map(tool => this.createToolbarButton(tool))
            .join('');

        // Initialize theme
        initTheme();

        // Event listeners
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

        // Start with home
        this.switchTool('home');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new NDTApp();
    app.initialize();
});