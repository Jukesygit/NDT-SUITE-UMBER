// Login Screen Module
import authManager from '../auth-manager.js';

let container, dom = {};
let canvasRef, mouseRef, verticesRef, impactPointsRef, particlesRef, animationFrameId;

function createLoginHTML() {
    const div = document.createElement('div');
    div.style.cssText = 'position: relative; width: 100%; height: 100vh; overflow: hidden; font-family: system-ui, sans-serif';

    // Add keyframe animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes gradientRotate {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }
        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        @keyframes pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.8; }
        }
    `;
    div.appendChild(style);

    // Canvas for background animation
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100vh';
    div.appendChild(canvas);

    // Container for login form
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'position: relative; z-index: 10; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px';
    contentDiv.innerHTML = `
        <div style="width: 100%; max-width: 420px; position: relative">
            <!-- Animated border glow -->
            <div style="position: absolute; inset: -2px; border-radius: 18px; background: linear-gradient(45deg, rgba(80,140,255,0.5), rgba(100,160,255,0.5), rgba(100,180,255,0.5), rgba(80,140,255,0.5)); background-size: 300% 300%; animation: gradientRotate 4s ease infinite; filter: blur(4px); opacity: 0.6"></div>

            <!-- Login Card -->
            <div id="login-card" style="position: relative; backdrop-filter: blur(12px); background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%), rgba(15,15,20,0.25); border: 1px solid rgba(255,255,255,0.18); border-top: 1px solid rgba(255,255,255,0.25); border-radius: 16px; padding: 48px 40px; box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1) inset">
                <!-- Logo and Title -->
                <div style="text-align: center; margin-bottom: 40px">
                    <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: linear-gradient(135deg, rgba(100,150,255,0.2), rgba(120,170,255,0.2)); border-radius: 16px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(100,150,255,0.3); box-shadow: 0 0 30px rgba(100,150,255,0.3)">
                        <svg width="32" height="32" viewBox="0 0 32 32">
                            <rect x="6" y="8" width="20" height="16" rx="2" fill="none" stroke="rgba(100,150,255,0.8)" stroke-width="2"/>
                            <path d="M6 12h20M12 8v16M20 8v16" stroke="rgba(100,150,255,0.6)" stroke-width="1.5"/>
                            <circle id="logo-pulse-1" cx="16" cy="16" r="3" fill="rgba(150,200,255,0.6)"></circle>
                            <circle id="logo-pulse-2" cx="16" cy="16" r="5" fill="none" stroke="rgba(150,200,255,0.4)" stroke-width="1" style="animation: pulse 2s infinite"></circle>
                        </svg>
                    </div>
                    <h1 style="font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; letter-spacing: -0.5px">NDT Data Hub</h1>
                    <p style="font-size: 14px; color: rgba(150,180,255,0.7); margin: 0; font-weight: 500">Secure Authentication Portal</p>
                </div>

                <!-- Login Form -->
                <form id="login-form">
                    <!-- Email Input -->
                    <div style="margin-bottom: 24px; position: relative">
                        <input type="text" id="username" autocomplete="username" required style="width: 100%; padding: 16px 16px 16px 48px; font-size: 15px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; outline: none; box-sizing: border-box; transition: all 0.3s">
                        <label id="username-label" style="position: absolute; left: 48px; top: 50%; transform: translateY(-50%); font-size: 15px; color: rgba(255,255,255,0.5); transition: all 0.3s; pointer-events: none; font-weight: 500">Email Address</label>
                        <svg id="username-icon" width="20" height="20" viewBox="0 0 20 20" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); opacity: 0.5; transition: opacity 0.3s">
                            <path d="M2 4h16v12H2V4zm0 1l8 5 8-5M2 5v10" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
                        </svg>
                    </div>

                    <!-- Password Input -->
                    <div style="margin-bottom: 32px; position: relative">
                        <input type="password" id="password" autocomplete="current-password" required style="width: 100%; padding: 16px 16px 16px 48px; font-size: 15px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; outline: none; box-sizing: border-box; transition: all 0.3s">
                        <label id="password-label" style="position: absolute; left: 48px; top: 50%; transform: translateY(-50%); font-size: 15px; color: rgba(255,255,255,0.5); transition: all 0.3s; pointer-events: none; font-weight: 500">Password</label>
                        <svg id="password-icon" width="20" height="20" viewBox="0 0 20 20" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); opacity: 0.5; transition: opacity 0.3s">
                            <rect x="4" y="8" width="12" height="9" rx="1" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
                            <path d="M7 8V6a3 3 0 016 0v2" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
                        </svg>
                    </div>

                    <!-- Error Message -->
                    <div id="error-message" style="display: none; color: #ff6b6b; font-size: 14px; margin-bottom: 16px; text-align: center"></div>

                    <!-- Submit Button -->
                    <button type="submit" id="submit-btn" style="width: 100%; padding: 16px; font-size: 15px; font-weight: 600; color: #fff; background: linear-gradient(135deg, rgba(90,150,255,0.9), rgba(110,170,255,0.9)); border: none; border-radius: 10px; cursor: pointer; transition: all 0.3s; margin-bottom: 20px; position: relative; box-shadow: 0 4px 20px rgba(100,150,255,0.3); display: flex; align-items: center; justify-content: center">
                        <span id="submit-text">Sign In</span>
                        <div id="submit-spinner" style="display: none; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid #fff; border-radius: 50%; animation: spin 0.8s linear infinite"></div>
                    </button>

                    <div style="text-align: center">
                        <a href="#" id="forgot-password" style="font-size: 13px; color: rgba(255,255,255,0.5); text-decoration: none">Forgot password?</a>
                    </div>
                </form>

                <!-- Divider -->
                <div style="display: flex; align-items: center; margin: 32px 0">
                    <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1)"></div>
                    <span style="padding: 0 16px; font-size: 13px; color: rgba(255,255,255,0.4)">or</span>
                    <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1)"></div>
                </div>

                <!-- Sign Up Link -->
                <div style="text-align: center">
                    <span style="font-size: 14px; color: rgba(255,255,255,0.5)">Don't have an account? </span>
                    <a href="#" id="request-account-btn" style="font-size: 14px; color: rgba(120,160,220,0.9); text-decoration: none; font-weight: 500">Sign up</a>
                </div>
            </div>

            <!-- Request Account Card -->
            <div id="request-card" style="display: none; position: relative; backdrop-filter: blur(12px); background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%), rgba(15,15,20,0.25); border: 1px solid rgba(255,255,255,0.18); border-top: 1px solid rgba(255,255,255,0.25); border-radius: 16px; padding: 48px 40px; box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1) inset">
                <div style="text-align: center; margin-bottom: 32px">
                    <h1 style="font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; letter-spacing: -0.5px">Request Account</h1>
                    <p style="font-size: 14px; color: rgba(150,180,255,0.7); margin: 0; font-weight: 500">Submit a request to join an organization</p>
                </div>

                <form id="request-form">
                    <div style="margin-bottom: 20px">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7); margin-bottom: 8px">Username</label>
                        <input type="text" id="req-username" required style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box">
                    </div>

                    <div style="margin-bottom: 20px">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7); margin-bottom: 8px">Email</label>
                        <input type="email" id="req-email" required style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box">
                    </div>

                    <div style="margin-bottom: 20px">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7); margin-bottom: 8px">Organization</label>
                        <select id="req-organization" required style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box">
                            <option value="">Select an organization...</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 20px">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7); margin-bottom: 8px">Requested Role</label>
                        <select id="req-role" required style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box">
                            <option value="viewer">Viewer (Read-only)</option>
                            <option value="editor">Editor (Create/Edit)</option>
                            <option value="org_admin">Organization Admin</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 24px">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7); margin-bottom: 8px">Message (Optional)</label>
                        <textarea id="req-message" rows="3" style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box; resize: vertical"></textarea>
                    </div>

                    <div id="request-error-message" style="display: none; color: #ff6b6b; font-size: 14px; margin-bottom: 16px"></div>
                    <div id="request-success-message" style="display: none; color: #4ade80; font-size: 14px; margin-bottom: 16px"></div>

                    <div style="display: flex; gap: 12px">
                        <button type="button" id="back-to-login-btn" style="flex: 1; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; cursor: pointer">Back</button>
                        <button type="submit" style="flex: 1; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, rgba(90,150,255,0.9), rgba(110,170,255,0.9)); border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 20px rgba(100,150,255,0.3)">Submit Request</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    div.appendChild(contentDiv);

    return div;
}

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        loginCard: q('#login-card'),
        requestCard: q('#request-card'),
        loginForm: q('#login-form'),
        requestForm: q('#request-form'),
        username: q('#username'),
        password: q('#password'),
        usernameLabel: q('#username-label'),
        passwordLabel: q('#password-label'),
        usernameIcon: q('#username-icon'),
        passwordIcon: q('#password-icon'),
        errorMessage: q('#error-message'),
        submitBtn: q('#submit-btn'),
        submitText: q('#submit-text'),
        submitSpinner: q('#submit-spinner'),
        requestAccountBtn: q('#request-account-btn'),
        backToLoginBtn: q('#back-to-login-btn'),
        reqUsername: q('#req-username'),
        reqEmail: q('#req-email'),
        reqOrganization: q('#req-organization'),
        reqRole: q('#req-role'),
        reqMessage: q('#req-message'),
        requestErrorMessage: q('#request-error-message'),
        requestSuccessMessage: q('#request-success-message')
    };

    canvasRef = container.querySelector('canvas');
}

function initCanvasAnimation() {
    const ctx = canvasRef.getContext('2d');
    mouseRef = { x: 0, y: 0, prevX: 0, prevY: 0 };
    verticesRef = [];
    impactPointsRef = [];
    particlesRef = [];

    const resizeCanvas = () => {
        canvasRef.width = window.innerWidth;
        canvasRef.height = window.innerHeight;
        initVertices();
        initParticles();
    };

    const initVertices = () => {
        const cols = 50;
        const rows = 35;
        const spacing = Math.max(canvasRef.width / cols, canvasRef.height / rows);
        verticesRef = [];
        for (let y = -2; y <= rows + 2; y++) {
            for (let x = -2; x <= cols + 2; x++) {
                verticesRef.push({
                    x: x * spacing, y: y * spacing, ox: x * spacing, oy: y * spacing,
                    vx: 0, vy: 0, phase: Math.random() * Math.PI * 2
                });
            }
        }
    };

    const initParticles = () => {
        particlesRef = [];
        for (let i = 0; i < 40; i++) {
            particlesRef.push({
                x: Math.random() * canvasRef.width, y: Math.random() * canvasRef.height,
                vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
                size: Math.random() * 2 + 0.5, opacity: Math.random() * 0.5 + 0.2,
                hue: Math.random() * 60 + 180
            });
        }
    };

    const handleMouseMove = (e) => {
        const prevX = mouseRef.x;
        const prevY = mouseRef.y;
        const newX = e.clientX;
        const newY = e.clientY;
        const dx = newX - prevX;
        const dy = newY - prevY;
        const velocity = Math.sqrt(dx * dx + dy * dy);

        if (velocity > 2) {
            impactPointsRef.push({
                x: newX, y: newY, radius: 0, maxRadius: 150,
                strength: Math.min(velocity * 0.06, 6), life: 1.0
            });
        }
        mouseRef = { x: newX, y: newY, prevX, prevY };
    };

    const animate = () => {
        const gradient = ctx.createLinearGradient(0, 0, canvasRef.width, canvasRef.height);
        gradient.addColorStop(0, '#2a2a35');
        gradient.addColorStop(0.5, '#35353f');
        gradient.addColorStop(1, '#2d2d38');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);

        const time = Date.now() * 0.001;

        particlesRef.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = canvasRef.width;
            if (p.x > canvasRef.width) p.x = 0;
            if (p.y < 0) p.y = canvasRef.height;
            if (p.y > canvasRef.height) p.y = 0;

            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
            grad.addColorStop(0, `hsla(${p.hue}, 70%, 60%, ${p.opacity})`);
            grad.addColorStop(1, `hsla(${p.hue}, 70%, 60%, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fill();
        });

        impactPointsRef = impactPointsRef.filter(impact => {
            impact.radius += 3;
            impact.life -= 0.008;
            if (impact.life <= 0) return false;

            verticesRef.forEach(vertex => {
                const dx = vertex.ox - impact.x;
                const dy = vertex.oy - impact.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const influence = Math.exp(-Math.pow((distance - impact.radius) / 15, 2));

                if (influence > 0.01) {
                    const force = influence * impact.strength * impact.life;
                    const angle = Math.atan2(dy, dx);
                    const variation = Math.sin(angle * 3 + time * 2) * 0.1;
                    const finalForce = force * (1 + variation);
                    vertex.vx += Math.cos(angle) * finalForce * 0.08;
                    vertex.vy += Math.sin(angle) * finalForce * 0.08;
                }
            });
            return true;
        });

        verticesRef.forEach((vertex) => {
            const waveDirection = time * 1.2;
            const distanceFromEdge = Math.sqrt(
                Math.pow((vertex.ox - canvasRef.width / 2) / canvasRef.width, 2) +
                Math.pow((vertex.oy - canvasRef.height / 2) / canvasRef.height, 2)
            );
            const waveBend1 = Math.sin(vertex.ox * 0.004 + time * 0.3) * 40;
            const waveBend2 = Math.cos(vertex.ox * 0.007 - time * 0.2) * 30;
            const freqVariation = 1 + Math.sin(vertex.ox * 0.003) * 0.8;
            const wave1 = Math.sin((vertex.oy + waveBend1) * 0.005 * freqVariation + waveDirection) * 13.5;
            const wave2 = Math.sin((vertex.oy + waveBend2) * 0.009 * freqVariation + waveDirection * 1.5 + Math.PI / 3) * 9;
            const wave3 = Math.cos((vertex.ox + waveBend1 * 0.5) * 0.004 + waveDirection * 0.9) * 6.75;
            const randomFactor = Math.sin(vertex.phase + time * 2.0) * 0.3 + 1;
            const waveX = (wave1 * 0.3 + wave3) * (0.7 + distanceFromEdge * 0.3) * randomFactor;
            const waveY = (wave1 + wave2 * 0.5) * (0.8 + distanceFromEdge * 0.2) * randomFactor;

            vertex.vx += (vertex.ox + waveX - vertex.x) * 0.03;
            vertex.vy += (vertex.oy + waveY - vertex.y) * 0.03;
            vertex.vx *= 0.95;
            vertex.vy *= 0.95;

            const dx = vertex.x - vertex.ox;
            const dy = vertex.y - vertex.oy;
            const displacement = Math.sqrt(dx * dx + dy * dy);
            if (displacement > 40) {
                const factor = 40 / displacement;
                vertex.x = vertex.ox + dx * factor;
                vertex.y = vertex.oy + dy * factor;
                vertex.vx *= 0.5;
                vertex.vy *= 0.5;
            }
            vertex.x += vertex.vx;
            vertex.y += vertex.vy;
        });

        const cols = 50, rows = 35, totalCols = cols + 5;
        for (let y = 0; y < rows + 3; y++) {
            for (let x = 0; x < cols + 3; x++) {
                const i = y * totalCols + x;
                const vertices = verticesRef;
                if (vertices[i] && vertices[i + 1] && vertices[i + totalCols]) {
                    drawTriangle(ctx, vertices[i], vertices[i + 1], vertices[i + totalCols]);
                }
                if (vertices[i + 1] && vertices[i + totalCols] && vertices[i + totalCols + 1]) {
                    drawTriangle(ctx, vertices[i + 1], vertices[i + totalCols + 1], vertices[i + totalCols]);
                }
            }
        }

        ctx.fillStyle = 'rgba(100, 150, 200, 0.02)';
        ctx.fillRect(0, (time * 100) % canvasRef.height, canvasRef.width, 2);
        animationFrameId = requestAnimationFrame(animate);
    };

    const drawTriangle = (ctx, v1, v2, v3) => {
        const area = Math.abs((v2.x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (v2.y - v1.y)) / 2;
        if (area < 5) return;

        const normalZ = (v2.x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (v2.y - v1.y);
        const normalizedZ = normalZ / (Math.abs(normalZ) + 1000);
        const lightDotNormal = normalizedZ * 0.6 + 0.5;
        const shadeFactor = 0.4 + lightDotNormal * 0.6;
        const specular = Math.pow(Math.max(lightDotNormal, 0), 5) * 0.4;

        const distortion = (
            Math.sqrt(Math.pow(v1.x - v1.ox, 2) + Math.pow(v1.y - v1.oy, 2)) +
            Math.sqrt(Math.pow(v2.x - v2.ox, 2) + Math.pow(v2.y - v2.oy, 2)) +
            Math.sqrt(Math.pow(v3.x - v3.ox, 2) + Math.pow(v3.y - v3.oy, 2))
        ) / 3;

        const normalizedDistortion = Math.min(distortion / 40, 1);
        const colorIntensity = Math.pow(normalizedDistortion, 2.5);
        const greyValue = 15 + 65 * colorIntensity;
        const accentBlend = Math.pow(colorIntensity, 3) * 0.3;

        const r = Math.floor((greyValue * (1 - accentBlend) + 45 * accentBlend + specular * 50) * shadeFactor);
        const g = Math.floor((greyValue * (1 - accentBlend) + 50 * accentBlend + specular * 50) * shadeFactor);
        const b = Math.floor((greyValue * (1 - accentBlend) + 65 * accentBlend + specular * 50) * shadeFactor);

        ctx.beginPath();
        ctx.moveTo(v1.x, v1.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.lineTo(v3.x, v3.y);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
        ctx.fill();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    animate();
}

function addInputAnimations() {
    // Username input animations
    dom.username.addEventListener('focus', () => {
        dom.username.style.border = '1px solid rgba(100,150,255,0.5)';
        dom.username.style.boxShadow = '0 0 0 3px rgba(100,150,255,0.1), 0 0 20px rgba(100,150,255,0.2)';
        dom.usernameLabel.style.top = '6px';
        dom.usernameLabel.style.transform = 'translateY(0)';
        dom.usernameLabel.style.fontSize = '11px';
        dom.usernameLabel.style.color = 'rgba(100,150,255,0.9)';
        dom.usernameIcon.style.opacity = '1';
        dom.usernameIcon.querySelector('path').setAttribute('stroke', 'rgba(100,150,255,0.9)');
    });

    dom.username.addEventListener('blur', () => {
        if (!dom.username.value) {
            dom.usernameLabel.style.top = '50%';
            dom.usernameLabel.style.transform = 'translateY(-50%)';
            dom.usernameLabel.style.fontSize = '15px';
            dom.usernameLabel.style.color = 'rgba(255,255,255,0.5)';
        }
        dom.username.style.border = '1px solid rgba(255,255,255,0.1)';
        dom.username.style.boxShadow = 'none';
        dom.usernameIcon.style.opacity = '0.5';
        dom.usernameIcon.querySelector('path').setAttribute('stroke', 'rgba(255,255,255,0.5)');
    });

    dom.username.addEventListener('input', () => {
        if (dom.username.value) {
            dom.usernameLabel.style.top = '6px';
            dom.usernameLabel.style.transform = 'translateY(0)';
            dom.usernameLabel.style.fontSize = '11px';
        }
    });

    // Password input animations
    dom.password.addEventListener('focus', () => {
        dom.password.style.border = '1px solid rgba(100,150,255,0.5)';
        dom.password.style.boxShadow = '0 0 0 3px rgba(100,150,255,0.1), 0 0 20px rgba(100,150,255,0.2)';
        dom.passwordLabel.style.top = '6px';
        dom.passwordLabel.style.transform = 'translateY(0)';
        dom.passwordLabel.style.fontSize = '11px';
        dom.passwordLabel.style.color = 'rgba(100,150,255,0.9)';
        dom.passwordIcon.style.opacity = '1';
        dom.passwordIcon.querySelectorAll('rect, path').forEach(el => {
            el.setAttribute('stroke', 'rgba(100,150,255,0.9)');
        });
    });

    dom.password.addEventListener('blur', () => {
        if (!dom.password.value) {
            dom.passwordLabel.style.top = '50%';
            dom.passwordLabel.style.transform = 'translateY(-50%)';
            dom.passwordLabel.style.fontSize = '15px';
            dom.passwordLabel.style.color = 'rgba(255,255,255,0.5)';
        }
        dom.password.style.border = '1px solid rgba(255,255,255,0.1)';
        dom.password.style.boxShadow = 'none';
        dom.passwordIcon.style.opacity = '0.5';
        dom.passwordIcon.querySelectorAll('rect, path').forEach(el => {
            el.setAttribute('stroke', 'rgba(255,255,255,0.5)');
        });
    });

    dom.password.addEventListener('input', () => {
        if (dom.password.value) {
            dom.passwordLabel.style.top = '6px';
            dom.passwordLabel.style.transform = 'translateY(0)';
            dom.passwordLabel.style.fontSize = '11px';
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();

    const username = dom.username.value.trim();
    const password = dom.password.value.trim();

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    // Show loading state
    dom.submitBtn.disabled = true;
    dom.submitText.style.display = 'none';
    dom.submitSpinner.style.display = 'block';

    const result = await authManager.login(username, password, false);

    // Hide loading state
    dom.submitBtn.disabled = false;
    dom.submitText.style.display = 'block';
    dom.submitSpinner.style.display = 'none';

    if (result.success) {
        // Dispatch login event
        const event = new CustomEvent('userLoggedIn', {
            detail: { user: result.user }
        });
        window.dispatchEvent(event);
    } else {
        showError(result.error || 'Invalid credentials');
    }
}

function showError(message) {
    dom.errorMessage.textContent = message;
    dom.errorMessage.style.display = 'block';
}

function showRequestCard() {
    dom.loginCard.style.display = 'none';
    dom.requestCard.style.display = 'block';
    loadOrganizationsForRequest();
}

function showLoginCard() {
    dom.requestCard.style.display = 'none';
    dom.loginCard.style.display = 'block';
    dom.requestForm.reset();
    dom.requestErrorMessage.style.display = 'none';
    dom.requestSuccessMessage.style.display = 'none';
}

async function loadOrganizationsForRequest() {
    await authManager.ensureInitialized();
    const organizations = await authManager.getOrganizations();

    // Filter out SYSTEM organization
    const publicOrgs = organizations.filter(org => org.name !== 'SYSTEM');

    dom.reqOrganization.innerHTML = '<option value="">Select an organization...</option>';
    publicOrgs.forEach(org => {
        const option = document.createElement('option');
        option.value = org.id;
        option.textContent = org.name;
        dom.reqOrganization.appendChild(option);
    });
}

async function handleRequestSubmit(e) {
    e.preventDefault();

    const username = dom.reqUsername.value.trim();
    const email = dom.reqEmail.value.trim();
    const organizationId = dom.reqOrganization.value;
    const requestedRole = dom.reqRole.value;
    const message = dom.reqMessage.value.trim();

    if (!username || !email || !organizationId) {
        showRequestError('Please fill in all required fields');
        return;
    }

    const result = await authManager.requestAccount({
        username,
        email,
        organizationId,
        requestedRole,
        message
    });

    if (result.success) {
        showRequestSuccess('Account request submitted successfully! An administrator will review it shortly.');
        setTimeout(() => {
            showLoginCard();
        }, 3000);
    } else {
        showRequestError(result.error || 'Failed to submit request');
    }
}

function showRequestError(message) {
    dom.requestErrorMessage.textContent = message;
    dom.requestErrorMessage.style.display = 'block';
    dom.requestSuccessMessage.style.display = 'none';
}

function showRequestSuccess(message) {
    dom.requestSuccessMessage.textContent = message;
    dom.requestSuccessMessage.style.display = 'block';
    dom.requestErrorMessage.style.display = 'none';
}

function addEventListeners() {
    dom.loginForm.addEventListener('submit', handleLogin);
    dom.requestAccountBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showRequestCard();
    });
    dom.backToLoginBtn.addEventListener('click', showLoginCard);
    dom.requestForm.addEventListener('submit', handleRequestSubmit);
}

export default {
    init: (toolContainer) => {
        container = toolContainer;
        const loginDiv = createLoginHTML();
        container.appendChild(loginDiv);
        cacheDom();
        initCanvasAnimation();
        addInputAnimations();
        addEventListeners();
    },

    destroy: () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        window.removeEventListener('resize', () => {});
        window.removeEventListener('mousemove', () => {});
        if (container) {
            container.innerHTML = '';
        }
    }
};
