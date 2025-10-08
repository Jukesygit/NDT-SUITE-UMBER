// Tool Layout Helper - Glassmorphic themed layouts for all tools
import { createAnimatedHeader } from './animated-background.js';

/**
 * Create a standard tool page layout with animated header
 * @param {Object} config - Configuration object
 * @param {string} config.title - Tool title
 * @param {string} config.subtitle - Tool subtitle/description
 * @param {HTMLElement|string} config.content - Main content (HTML element or HTML string)
 * @param {Object} config.headerOptions - Options for animated header
 * @returns {HTMLElement} Complete tool layout
 */
export function createToolLayout({ title, subtitle, content, headerOptions = {} }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tool-layout-wrapper';
    wrapper.style.cssText = 'width: 100%; height: 100%; overflow-y: auto; display: flex; flex-direction: column;';

    // Add animated header
    const header = createAnimatedHeader(title, subtitle, {
        height: headerOptions.height || '180px',
        particleCount: headerOptions.particleCount || 15,
        waveIntensity: headerOptions.waveIntensity || 0.4,
        vertexDensity: headerOptions.vertexDensity || 40
    });
    wrapper.appendChild(header);

    // Add main content area
    const contentArea = document.createElement('div');
    contentArea.className = 'tool-content-area glass-scrollbar';
    contentArea.style.cssText = 'flex: 1; padding: 24px; overflow-y: auto;';

    if (typeof content === 'string') {
        contentArea.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        contentArea.appendChild(content);
    }

    wrapper.appendChild(contentArea);

    return wrapper;
}

/**
 * Create a glassmorphic card/panel
 * @param {Object} config - Configuration
 * @param {string} config.title - Card title
 * @param {HTMLElement|string} config.content - Card content
 * @param {string} config.variant - 'card' (prominent) or 'panel' (subtle)
 * @param {string} config.padding - Padding size
 * @returns {HTMLElement}
 */
export function createGlassCard({ title, content, variant = 'panel', padding = '24px' }) {
    const card = document.createElement('div');
    card.className = variant === 'card' ? 'glass-card' : 'glass-panel';
    card.style.padding = padding;

    if (title) {
        const titleEl = document.createElement('h2');
        titleEl.textContent = title;
        titleEl.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            color: #ffffff;
            margin: 0 0 20px 0;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        `;
        card.appendChild(titleEl);
    }

    const contentEl = document.createElement('div');
    if (typeof content === 'string') {
        contentEl.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        contentEl.appendChild(content);
    }
    card.appendChild(contentEl);

    return card;
}

/**
 * Create a grid layout for tool content
 * @param {Array} items - Array of card configs or HTML elements
 * @param {Object} options - Grid options
 * @returns {HTMLElement}
 */
export function createGridLayout(items, options = {}) {
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(${options.minWidth || '300px'}, 1fr));
        gap: ${options.gap || '24px'};
        width: 100%;
    `;

    items.forEach(item => {
        if (item instanceof HTMLElement) {
            grid.appendChild(item);
        } else {
            grid.appendChild(createGlassCard(item));
        }
    });

    return grid;
}

/**
 * Create a glassmorphic button
 * @param {Object} config
 * @param {string} config.text - Button text
 * @param {string} config.variant - 'primary' or 'secondary'
 * @param {Function} config.onClick - Click handler
 * @param {string} config.icon - Optional SVG icon
 * @returns {HTMLElement}
 */
export function createButton({ text, variant = 'primary', onClick, icon, ...attrs }) {
    const button = document.createElement('button');
    button.className = `btn-${variant}`;
    button.textContent = text;

    if (icon) {
        button.innerHTML = `${icon}<span>${text}</span>`;
    }

    if (onClick) {
        button.addEventListener('click', onClick);
    }

    // Apply additional attributes
    Object.entries(attrs).forEach(([key, value]) => {
        button.setAttribute(key, value);
    });

    return button;
}

/**
 * Create a glassmorphic input group with floating label
 * @param {Object} config
 * @returns {HTMLElement}
 */
export function createInputGroup({ id, label, type = 'text', placeholder = '', icon, ...attrs }) {
    const group = document.createElement('div');
    group.className = 'input-group';

    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.className = 'glass-input';
    input.placeholder = placeholder || ' '; // Space for floating label detection

    Object.entries(attrs).forEach(([key, value]) => {
        input.setAttribute(key, value);
    });

    group.appendChild(input);

    if (label) {
        const labelEl = document.createElement('label');
        labelEl.setAttribute('for', id);
        labelEl.textContent = label;
        group.appendChild(labelEl);
    }

    if (icon) {
        const iconEl = document.createElement('div');
        iconEl.className = 'input-icon';
        iconEl.innerHTML = icon;
        group.appendChild(iconEl);
    }

    return group;
}

/**
 * Create a glassmorphic select dropdown
 * @param {Object} config
 * @returns {HTMLElement}
 */
export function createSelect({ id, label, options, value, ...attrs }) {
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '16px';

    if (label) {
        const labelEl = document.createElement('label');
        labelEl.setAttribute('for', id);
        labelEl.textContent = label;
        labelEl.style.cssText = `
            display: block;
            font-size: 13px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 8px;
        `;
        wrapper.appendChild(labelEl);
    }

    const select = document.createElement('select');
    select.id = id;
    select.className = 'glass-select';

    options.forEach(opt => {
        const option = document.createElement('option');
        if (typeof opt === 'string') {
            option.value = opt;
            option.textContent = opt;
        } else {
            option.value = opt.value;
            option.textContent = opt.label || opt.value;
        }
        select.appendChild(option);
    });

    if (value !== undefined) {
        select.value = value;
    }

    Object.entries(attrs).forEach(([key, val]) => {
        select.setAttribute(key, val);
    });

    wrapper.appendChild(select);
    return wrapper;
}

/**
 * Create a glassmorphic modal
 * @param {Object} config
 * @returns {HTMLElement}
 */
export function createModal({ title, content, width = '600px' }) {
    const overlay = document.createElement('div');
    overlay.className = 'glass-modal-overlay';
    overlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'glass-modal';
    modal.style.cssText = `
        width: 90%;
        max-width: ${width};
        max-height: 90vh;
        display: flex;
        flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.cssText = `
        font-size: 20px;
        font-weight: 600;
        color: #ffffff;
        margin: 0;
    `;
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 32px;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        line-height: 1;
        padding: 0;
        width: 32px;
        height: 32px;
    `;
    closeBtn.addEventListener('click', () => overlay.style.display = 'none');
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'glass-scrollbar';
    contentEl.style.cssText = `
        padding: 24px;
        overflow-y: auto;
        flex: 1;
    `;

    if (typeof content === 'string') {
        contentEl.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        contentEl.appendChild(content);
    }

    modal.appendChild(contentEl);
    overlay.appendChild(modal);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.style.display = 'none';
        }
    });

    // Store show/hide methods
    overlay.show = () => overlay.style.display = 'flex';
    overlay.hide = () => overlay.style.display = 'none';
    overlay.setContent = (newContent) => {
        contentEl.innerHTML = '';
        if (typeof newContent === 'string') {
            contentEl.innerHTML = newContent;
        } else if (newContent instanceof HTMLElement) {
            contentEl.appendChild(newContent);
        }
    };

    return overlay;
}

/**
 * Create a results display panel
 * @param {Array} results - Array of {label, value, unit} objects
 * @returns {HTMLElement}
 */
export function createResultsPanel(results) {
    const panel = document.createElement('div');
    panel.className = 'glass-panel';
    panel.style.padding = '16px';

    results.forEach((result, index) => {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            ${index !== results.length - 1 ? 'border-bottom: 1px solid rgba(255, 255, 255, 0.1);' : ''}
        `;

        const label = document.createElement('span');
        label.textContent = result.label;
        label.style.cssText = 'color: rgba(255, 255, 255, 0.7); font-size: 14px;';

        const value = document.createElement('span');
        value.textContent = `${result.value}${result.unit || ''}`;
        value.style.cssText = 'color: #ffffff; font-weight: 600; font-size: 14px;';

        row.appendChild(label);
        row.appendChild(value);
        panel.appendChild(row);
    });

    return panel;
}
