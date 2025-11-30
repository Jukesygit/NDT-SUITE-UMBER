// Lightweight Animated Background for Tool Headers
// Performant version without mouse interaction

export class AnimatedBackground {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            particleCount: options.particleCount || 20,
            waveIntensity: options.waveIntensity || 0.5,
            vertexDensity: options.vertexDensity || 30,
            ...options
        };

        this.vertices = [];
        this.particles = [];
        this.animationFrameId = null;
        this.isRunning = false;

        this.init();
    }

    init() {
        // Don't call resizeCanvas here - it will be called when animation starts
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (!this.canvas.parentElement) return;

        const rect = this.canvas.parentElement.getBoundingClientRect();
        const width = rect.width || 1920; // Fallback width
        const height = rect.height || 180; // Fallback height

        this.canvas.width = width;
        this.canvas.height = height;

        if (this.isRunning) {
            this.initVertices();
            this.initParticles();
        }
    }

    initVertices() {
        const cols = Math.floor(this.canvas.width / this.options.vertexDensity);
        const rows = Math.floor(this.canvas.height / this.options.vertexDensity);
        const spacing = Math.max(this.canvas.width / cols, this.canvas.height / rows);

        this.vertices = [];
        for (let y = -2; y <= rows + 2; y++) {
            for (let x = -2; x <= cols + 2; x++) {
                this.vertices.push({
                    x: x * spacing,
                    y: y * spacing,
                    ox: x * spacing,
                    oy: y * spacing,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }

        this.cols = cols;
        this.rows = rows;
        this.totalCols = cols + 5;
    }

    initParticles() {
        this.particles = [];
        for (let i = 0; i < this.options.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                size: Math.random() * 2.5 + 1,
                opacity: Math.random() * 0.5 + 0.2,
                hue: Math.random() * 60 + 180
            });
        }
    }

    drawBackground() {
        // Modern glassmorphic gradient with deep blue/purple tones
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, 'rgba(15, 23, 42, 0.95)'); // Deep slate
        gradient.addColorStop(0.3, 'rgba(30, 41, 59, 0.9)');
        gradient.addColorStop(0.6, 'rgba(51, 65, 85, 0.85)');
        gradient.addColorStop(1, 'rgba(30, 41, 59, 0.95)');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Add subtle radial gradient overlay for depth
        const radialGradient = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, 0,
            this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.7
        );
        radialGradient.addColorStop(0, 'rgba(59, 130, 246, 0.05)'); // Blue accent
        radialGradient.addColorStop(0.5, 'rgba(147, 51, 234, 0.03)'); // Purple accent
        radialGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = radialGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawParticles() {
        this.particles.forEach(p => {
            // Update position
            p.x += p.vx;
            p.y += p.vy;

            // Wrap around edges
            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            // Draw particle with modern glow effect
            const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
            // Use blue/cyan tones for modern look
            const hue = 200 + p.hue * 0.3; // Blue to cyan range
            grad.addColorStop(0, `hsla(${hue}, 85%, 65%, ${p.opacity * 0.8})`);
            grad.addColorStop(0.5, `hsla(${hue}, 80%, 60%, ${p.opacity * 0.3})`);
            grad.addColorStop(1, `hsla(${hue}, 75%, 55%, 0)`);
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    updateVertices(time) {
        const waveDirection = time * 1.2; // Faster animation
        const intensity = this.options.waveIntensity;

        this.vertices.forEach(vertex => {
            const distanceFromEdge = Math.sqrt(
                Math.pow((vertex.ox - this.canvas.width / 2) / this.canvas.width, 2) +
                Math.pow((vertex.oy - this.canvas.height / 2) / this.canvas.height, 2)
            );

            const waveBend1 = Math.sin(vertex.ox * 0.004 + time * 0.5) * 50 * intensity;
            const waveBend2 = Math.cos(vertex.ox * 0.007 - time * 0.3) * 35 * intensity;
            const freqVariation = 1 + Math.sin(vertex.ox * 0.003) * 0.8;

            const wave1 = Math.sin((vertex.oy + waveBend1) * 0.005 * freqVariation + waveDirection) * 18 * intensity;
            const wave2 = Math.sin((vertex.oy + waveBend2) * 0.009 * freqVariation + waveDirection * 1.5 + Math.PI / 3) * 12 * intensity;
            const wave3 = Math.cos((vertex.ox + waveBend1 * 0.5) * 0.004 + waveDirection * 0.9) * 10 * intensity;

            const randomFactor = Math.sin(vertex.phase + time * 2.0) * 0.4 + 1;
            const waveX = (wave1 * 0.3 + wave3) * (0.7 + distanceFromEdge * 0.3) * randomFactor;
            const waveY = (wave1 + wave2 * 0.5) * (0.8 + distanceFromEdge * 0.2) * randomFactor;

            vertex.x = vertex.ox + waveX;
            vertex.y = vertex.oy + waveY;
        });
    }

    drawTriangle(v1, v2, v3) {
        const area = Math.abs((v2.x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (v2.y - v1.y)) / 2;
        if (area < 5) return;

        const normalZ = (v2.x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (v2.y - v1.y);
        const normalizedZ = normalZ / (Math.abs(normalZ) + 1000);
        const lightDotNormal = normalizedZ * 0.6 + 0.5;
        const shadeFactor = 0.4 + lightDotNormal * 0.6;
        const specular = Math.pow(Math.max(lightDotNormal, 0), 5) * 0.3;

        const distortion = (
            Math.sqrt(Math.pow(v1.x - v1.ox, 2) + Math.pow(v1.y - v1.oy, 2)) +
            Math.sqrt(Math.pow(v2.x - v2.ox, 2) + Math.pow(v2.y - v2.oy, 2)) +
            Math.sqrt(Math.pow(v3.x - v3.ox, 2) + Math.pow(v3.y - v3.oy, 2))
        ) / 3;

        const normalizedDistortion = Math.min(distortion / 30, 1);
        const colorIntensity = Math.pow(normalizedDistortion, 2.5);

        // Modern blue/purple color scheme
        const baseValue = 20 + 60 * colorIntensity;
        const accentBlend = Math.pow(colorIntensity, 2) * 0.4;

        // Blue-purple gradient based on distortion
        const r = Math.floor((baseValue * (1 - accentBlend) + 59 * accentBlend + specular * 80) * shadeFactor);
        const g = Math.floor((baseValue * (1 - accentBlend) + 130 * accentBlend + specular * 120) * shadeFactor);
        const b = Math.floor((baseValue * (1 - accentBlend) + 246 * accentBlend + specular * 180) * shadeFactor);

        this.ctx.beginPath();
        this.ctx.moveTo(v1.x, v1.y);
        this.ctx.lineTo(v2.x, v2.y);
        this.ctx.lineTo(v3.x, v3.y);
        this.ctx.closePath();
        this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`; // More transparent for glass effect
        this.ctx.fill();

        // Add subtle stroke for definition
        this.ctx.strokeStyle = `rgba(${r + 20}, ${g + 30}, ${b + 40}, 0.08)`;
        this.ctx.lineWidth = 0.5;
        this.ctx.stroke();
    }

    drawMesh() {
        for (let y = 0; y < this.rows + 3; y++) {
            for (let x = 0; x < this.cols + 3; x++) {
                const i = y * this.totalCols + x;
                if (this.vertices[i] && this.vertices[i + 1] && this.vertices[i + this.totalCols]) {
                    this.drawTriangle(this.vertices[i], this.vertices[i + 1], this.vertices[i + this.totalCols]);
                }
                if (this.vertices[i + 1] && this.vertices[i + this.totalCols] && this.vertices[i + this.totalCols + 1]) {
                    this.drawTriangle(this.vertices[i + 1], this.vertices[i + this.totalCols + 1], this.vertices[i + this.totalCols]);
                }
            }
        }
    }

    animate() {
        if (!this.isRunning) return;

        const time = Date.now() * 0.001;

        // Draw background
        this.drawBackground();

        // Draw particles
        this.drawParticles();

        // Update and draw mesh
        this.updateVertices(time);
        this.drawMesh();

        // Modern subtle scan line effect with gradient
        const scanY = (time * 50) % this.canvas.height;
        const scanGradient = this.ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
        scanGradient.addColorStop(0, 'rgba(59, 130, 246, 0)');
        scanGradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.03)');
        scanGradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
        this.ctx.fillStyle = scanGradient;
        this.ctx.fillRect(0, scanY - 20, this.canvas.width, 40);

        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // Resize canvas and initialize on start (when element is in DOM)
        this.resizeCanvas();
        this.initVertices();
        this.initParticles();

        this.animate();
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    destroy() {
        this.stop();
        window.removeEventListener('resize', () => this.resizeCanvas());
    }
}

// Helper function to create a header with animated background
export function createAnimatedHeader(title, subtitle, options = {}) {
    const container = document.createElement('div');
    container.className = 'animated-header-container';
    container.style.cssText = `
        position: relative;
        width: 100%;
        height: ${options.height || '140px'};
        overflow: hidden;
        margin-bottom: 24px;
        border-radius: 16px;
        background: linear-gradient(135deg,
            rgba(15, 23, 42, 0.9) 0%,
            rgba(30, 41, 59, 0.85) 50%,
            rgba(51, 65, 85, 0.9) 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
    `;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 16px;
        opacity: 0.8;
    `;
    container.appendChild(canvas);

    // Glass overlay for extra depth
    const glassOverlay = document.createElement('div');
    glassOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg,
            rgba(59, 130, 246, 0.05) 0%,
            transparent 50%,
            rgba(147, 51, 234, 0.05) 100%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 16px;
        pointer-events: none;
    `;
    container.appendChild(glassOverlay);

    const content = document.createElement('div');
    content.className = 'animated-header-content';
    content.style.cssText = `
        position: relative;
        z-index: 10;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 32px 20px;
        text-align: center;
    `;

    if (title) {
        const titleEl = document.createElement('h1');
        titleEl.textContent = title;
        titleEl.style.cssText = `
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0 0 8px 0;
            letter-spacing: -0.5px;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        `;
        content.appendChild(titleEl);
    }

    if (subtitle) {
        const subtitleEl = document.createElement('p');
        subtitleEl.textContent = subtitle;
        subtitleEl.style.cssText = `
            font-size: 14px;
            color: rgba(203, 213, 225, 0.9);
            margin: 0;
            font-weight: 500;
            letter-spacing: 0.5px;
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        `;
        content.appendChild(subtitleEl);
    }

    container.appendChild(content);

    // Initialize animation
    const animation = new AnimatedBackground(canvas, {
        particleCount: options.particleCount || 30,
        waveIntensity: options.waveIntensity || 0.8,
        vertexDensity: options.vertexDensity || 35
    });
    animation.start();

    // Store animation instance for cleanup
    container._animationInstance = animation;

    return container;
}
