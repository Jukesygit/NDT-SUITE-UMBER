/**
 * HTML Escape Utility
 * SECURITY: Prevents XSS attacks by escaping special HTML characters
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string safe for HTML insertion
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Escape HTML and also escape characters that could break out of HTML attributes
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string safe for HTML attribute insertion
 */
export function escapeHtmlAttr(str) {
    if (typeof str !== 'string') return '';
    return escapeHtml(str)
        .replace(/`/g, '&#x60;')
        .replace(/=/g, '&#x3D;');
}

/**
 * Create a safe text node and append it to an element
 * This is the safest way to insert user content into the DOM
 * @param {HTMLElement} parent - Parent element to append to
 * @param {string} text - Text content to insert
 * @returns {Text} - The created text node
 */
export function appendTextNode(parent, text) {
    const textNode = document.createTextNode(text);
    parent.appendChild(textNode);
    return textNode;
}

/**
 * Create an option element safely (no innerHTML)
 * @param {string} value - Option value
 * @param {string} text - Option display text
 * @param {boolean} selected - Whether option is selected
 * @returns {HTMLOptionElement} - The created option element
 */
export function createOption(value, text, selected = false) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text; // textContent auto-escapes
    option.selected = selected;
    return option;
}

export default {
    escapeHtml,
    escapeHtmlAttr,
    appendTextNode,
    createOption,
};
