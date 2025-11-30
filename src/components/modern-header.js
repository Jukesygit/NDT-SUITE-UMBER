// Modern Header Component - Inspired by color scheme demo
// Creates stunning gradient headers with animations and visual depth

/**
 * Creates a modern, visually striking header with gradient text and effects
 * @param {string} title - Main header title
 * @param {string} subtitle - Optional subtitle/description
 * @param {object} options - Configuration options
 * @returns {HTMLElement} - Header element ready to append
 */
export function createModernHeader(title, subtitle = '', options = {}) {
    const {
        showParticles = true,
        particleCount = 20,
        gradientColors = ['#60a5fa', '#34d399'], // Cyan to emerald by default
        height = '100px',
        showStats = false,
        statsContent = null,
        showLogo = true,
        logoSize = '60px'
    } = options;

    const header = document.createElement('div');
    header.className = 'modern-header';
    header.style.cssText = `
        position: relative;
        padding: var(--spacing-lg) var(--spacing-2xl);
        flex-shrink: 0;
        background: linear-gradient(135deg,
            rgba(15, 23, 42, 0.95) 0%,
            rgba(30, 41, 59, 0.9) 50%,
            rgba(51, 65, 85, 0.85) 100%
        );
        border-bottom: 2px solid rgba(255, 255, 255, 0.15);
        overflow: hidden;
        min-height: ${height};
        display: flex;
        flex-direction: column;
        justify-content: center;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
    `;

    // Animated gradient background overlay
    const gradientOverlay = document.createElement('div');
    gradientOverlay.className = 'header-gradient-overlay';
    gradientOverlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg,
            ${gradientColors[0]}15 0%,
            ${gradientColors[1]}10 50%,
            ${gradientColors[0]}05 100%
        );
        background-size: 200% 200%;
        animation: gradientRotate 8s ease infinite;
        opacity: 0.6;
        z-index: 0;
    `;
    header.appendChild(gradientOverlay);

    // Particle system (if enabled)
    if (showParticles) {
        const particlesContainer = document.createElement('div');
        particlesContainer.className = 'header-particles';
        particlesContainer.style.cssText = `
            position: absolute;
            inset: 0;
            z-index: 1;
            overflow: hidden;
            pointer-events: none;
        `;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'header-particle';
            const size = Math.random() * 4 + 2;
            const left = Math.random() * 100;
            const duration = Math.random() * 10 + 15;
            const delay = Math.random() * 5;
            const opacity = Math.random() * 0.3 + 0.1;

            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: ${gradientColors[Math.floor(Math.random() * gradientColors.length)]};
                border-radius: 50%;
                left: ${left}%;
                bottom: -10px;
                opacity: ${opacity};
                animation: floatUp ${duration}s linear ${delay}s infinite;
                box-shadow: 0 0 ${size * 2}px ${gradientColors[0]};
            `;
            particlesContainer.appendChild(particle);
        }
        header.appendChild(particlesContainer);
    }

    // Content container (above particles)
    const content = document.createElement('div');
    content.style.cssText = `
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 24px;
    `;

    // Logo (if enabled)
    if (showLogo) {
        const logoContainer = document.createElement('div');
        logoContainer.className = 'modern-header-logo';
        logoContainer.style.cssText = `
            flex-shrink: 0;
            width: ${logoSize};
            height: ${logoSize};
            animation: logoFadeIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
        `;

        const logo = document.createElement('img');
        logo.src = '/assets/logo.png';
        logo.alt = 'NDT Suite Logo';
        logo.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 0 12px #60a5fa80) drop-shadow(0 0 20px #60a5fa40);
        `;
        logoContainer.appendChild(logo);
        content.appendChild(logoContainer);
    }

    // Text content wrapper
    const textContent = document.createElement('div');
    textContent.style.cssText = `
        flex: 1;
        min-width: 0;
    `;

    // Main title with gradient text
    const titleElement = document.createElement('h1');
    titleElement.className = 'modern-header-title';
    titleElement.textContent = title;
    titleElement.style.cssText = `
        font-size: 36px;
        font-weight: 700;
        margin: 0 0 ${subtitle ? '8px' : '0'} 0;
        background: linear-gradient(135deg, ${gradientColors.join(', ')});
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -0.02em;
        line-height: 1.2;
        animation: slideInFromLeft 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    textContent.appendChild(titleElement);

    // Subtitle
    if (subtitle) {
        const subtitleElement = document.createElement('p');
        subtitleElement.className = 'modern-header-subtitle';
        subtitleElement.textContent = subtitle;
        subtitleElement.style.cssText = `
            font-size: 16px;
            color: rgba(255, 255, 255, 0.75);
            margin: 0;
            font-weight: 500;
            animation: slideInFromLeft 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s backwards;
        `;
        textContent.appendChild(subtitleElement);
    }

    // Stats section (optional)
    if (showStats && statsContent) {
        const statsContainer = document.createElement('div');
        statsContainer.className = 'modern-header-stats';
        statsContainer.style.cssText = `
            margin-top: 24px;
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            animation: slideInFromLeft 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s backwards;
        `;
        statsContainer.innerHTML = statsContent;
        textContent.appendChild(statsContainer);
    }

    content.appendChild(textContent);
    header.appendChild(content);

    // Add animations to document if not already added
    if (!document.querySelector('#modern-header-styles')) {
        const style = document.createElement('style');
        style.id = 'modern-header-styles';
        style.textContent = `
            @keyframes gradientRotate {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
            }

            @keyframes floatUp {
                0% {
                    transform: translateY(0) translateX(0);
                    opacity: 0;
                }
                10% {
                    opacity: var(--particle-opacity, 0.3);
                }
                90% {
                    opacity: var(--particle-opacity, 0.3);
                }
                100% {
                    transform: translateY(-100vh) translateX(${Math.random() * 100 - 50}px);
                    opacity: 0;
                }
            }

            @keyframes slideInFromLeft {
                from {
                    opacity: 0;
                    transform: translateX(-30px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            .modern-header:hover .header-gradient-overlay {
                opacity: 0.8;
                transition: opacity 0.5s ease;
            }

            .modern-header-title {
                position: relative;
            }

            .modern-header-title::after {
                content: '';
                position: absolute;
                bottom: -8px;
                left: 0;
                width: 80px;
                height: 4px;
                background: linear-gradient(90deg, var(--accent-primary, #60a5fa), transparent);
                border-radius: 2px;
                animation: expandWidth 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s backwards;
            }

            @keyframes expandWidth {
                from {
                    width: 0;
                }
                to {
                    width: 80px;
                }
            }

            @keyframes logoFadeIn {
                from {
                    opacity: 0;
                    transform: scale(0.8) rotate(-10deg);
                }
                to {
                    opacity: 1;
                    transform: scale(1) rotate(0deg);
                }
            }

            @keyframes logoFloat {
                0%, 100% {
                    transform: translateY(0px) rotate(0deg);
                }
                50% {
                    transform: translateY(-8px) rotate(2deg);
                }
            }

            @keyframes logoPulse {
                0%, 100% {
                    filter: drop-shadow(0 0 20px currentColor) drop-shadow(0 0 40px currentColor);
                }
                50% {
                    filter: drop-shadow(0 0 30px currentColor) drop-shadow(0 0 60px currentColor);
                }
            }

            .modern-header-logo:hover img {
                transform: scale(1.05) rotate(5deg);
                transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
        `;
        document.head.appendChild(style);
    }

    return header;
}

/**
 * Creates a stat badge for header stats section
 * @param {string} label - Stat label
 * @param {string|number} value - Stat value
 * @param {string} accentColor - Optional accent color
 * @returns {string} - HTML string for stat badge
 */
export function createStatBadge(label, value, accentColor = '#60a5fa') {
    return `
        <div class="modern-stat-badge" style="
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            background: linear-gradient(135deg,
                rgba(255,255,255,0.15) 0%,
                rgba(255,255,255,0.08) 100%),
                rgba(30, 41, 59, 0.6);
            border: 1.5px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3),
                        0 0 0 1px ${accentColor}20 inset;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        "
        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0, 0, 0, 0.4)'"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 16px rgba(0, 0, 0, 0.3)'">
            <div style="
                font-size: 24px;
                font-weight: 700;
                color: ${accentColor};
                line-height: 1;
            ">${value}</div>
            <div style="
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: rgba(255, 255, 255, 0.7);
                font-weight: 600;
            ">${label}</div>
        </div>
    `;
}

export default { createModernHeader, createStatBadge };
