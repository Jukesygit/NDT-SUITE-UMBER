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
        this.resizeCanvas();
        this.initVertices();
        this.initParticles();

        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

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
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.5) * 0.2,
                size: Math.random() * 1.5 + 0.5,
                opacity: Math.random() * 0.3 + 0.1,
                hue: Math.random() * 60 + 180
            });
        }
    }

    drawBackground() {
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, '#2a2a35');
        gradient.addColorStop(0.5, '#35353f');
        gradient.addColorStop(1, '#2d2d38');
        this.ctx.fillStyle = gradient;
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

            // Draw particle with glow
            const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
            grad.addColorStop(0, `hsla(${p.hue}, 70%, 60%, ${p.opacity})`);
            grad.addColorStop(1, `hsla(${p.hue}, 70%, 60%, 0)`);
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    updateVertices(time) {
        const waveDirection = time * 0.8;
        const intensity = this.options.waveIntensity;

        this.vertices.forEach(vertex => {
            const distanceFromEdge = Math.sqrt(
                Math.pow((vertex.ox - this.canvas.width / 2) / this.canvas.width, 2) +
                Math.pow((vertex.oy - this.canvas.height / 2) / this.canvas.height, 2)
            );

            const waveBend1 = Math.sin(vertex.ox * 0.004 + time * 0.3) * 30 * intensity;
            const waveBend2 = Math.cos(vertex.ox * 0.007 - time * 0.2) * 20 * intensity;
            const freqVariation = 1 + Math.sin(vertex.ox * 0.003) * 0.6;

            const wave1 = Math.sin((vertex.oy + waveBend1) * 0.005 * freqVariation + waveDirection) * 10 * intensity;
            const wave2 = Math.sin((vertex.oy + waveBend2) * 0.009 * freqVariation + waveDirection * 1.5 + Math.PI / 3) * 6 * intensity;
            const wave3 = Math.cos((vertex.ox + waveBend1 * 0.5) * 0.004 + waveDirection * 0.9) * 5 * intensity;

            const randomFactor = Math.sin(vertex.phase + time * 1.5) * 0.3 + 1;
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
        const colorIntensity = Math.pow(normalizedDistortion, 2);
        const greyValue = 15 + 50 * colorIntensity;
        const accentBlend = Math.pow(colorIntensity, 3) * 0.2;

        const r = Math.floor((greyValue * (1 - accentBlend) + 45 * accentBlend + specular * 40) * shadeFactor);
        const g = Math.floor((greyValue * (1 - accentBlend) + 50 * accentBlend + specular * 40) * shadeFactor);
        const b = Math.floor((greyValue * (1 - accentBlend) + 65 * accentBlend + specular * 40) * shadeFactor);

        this.ctx.beginPath();
        this.ctx.moveTo(v1.x, v1.y);
        this.ctx.lineTo(v2.x, v2.y);
        this.ctx.lineTo(v3.x, v3.y);
        this.ctx.closePath();
        this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
        this.ctx.fill();
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

        // Subtle scan line effect
        this.ctx.fillStyle = 'rgba(100, 150, 200, 0.015)';
        this.ctx.fillRect(0, (time * 80) % this.canvas.height, this.canvas.width, 2);

        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
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
        height: ${options.height || '200px'};
        overflow: hidden;
        margin-bottom: 24px;
    `;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
    container.appendChild(canvas);

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
        padding: 40px 20px;
        text-align: center;
    `;

    if (title) {
        const titleEl = document.createElement('h1');
        titleEl.textContent = title;
        titleEl.style.cssText = `
            font-size: 32px;
            font-weight: 700;
            color: #ffffff;
            margin: 0 0 12px 0;
            letter-spacing: -0.5px;
        `;
        content.appendChild(titleEl);
    }

    if (subtitle) {
        const subtitleEl = document.createElement('p');
        subtitleEl.textContent = subtitle;
        subtitleEl.style.cssText = `
            font-size: 16px;
            color: rgba(150, 180, 255, 0.8);
            margin: 0;
            font-weight: 500;
        `;
        content.appendChild(subtitleEl);
    }

    container.appendChild(content);

    // Initialize animation
    const animation = new AnimatedBackground(canvas, {
        particleCount: options.particleCount || 15,
        waveIntensity: options.waveIntensity || 0.4,
        vertexDensity: options.vertexDensity || 40
    });
    animation.start();

    // Store animation instance for cleanup
    container._animationInstance = animation;

    return container;
}
