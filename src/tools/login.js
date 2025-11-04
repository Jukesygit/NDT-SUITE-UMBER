// Login Screen Module
import authManager from '../auth-manager.js';

let container, dom = {};

function createLoginHTML() {
    const div = document.createElement('div');
    div.style.cssText = `
        position: relative;
        width: 100%;
        height: 100vh;
        overflow: hidden;
        font-family: system-ui, sans-serif;
        background: linear-gradient(135deg,
            rgba(15, 23, 42, 0.95) 0%,
            rgba(30, 41, 59, 0.9) 50%,
            rgba(51, 65, 85, 0.85) 100%
        );
    `;

    // Add keyframe animations
    const style = document.createElement('style');
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
                opacity: 0.3;
            }
            90% {
                opacity: 0.3;
            }
            100% {
                transform: translateY(-100vh) translateX(${Math.random() * 100 - 50}px);
                opacity: 0;
            }
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

    // Animated gradient background overlay
    const gradientOverlay = document.createElement('div');
    gradientOverlay.className = 'header-gradient-overlay';
    gradientOverlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg,
            #60a5fa15 0%,
            #34d39910 50%,
            #60a5fa05 100%
        );
        background-size: 200% 200%;
        animation: gradientRotate 8s ease infinite;
        opacity: 0.6;
        z-index: 0;
    `;
    div.appendChild(gradientOverlay);

    // Particle system
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'login-particles';
    particlesContainer.style.cssText = `
        position: absolute;
        inset: 0;
        z-index: 1;
        overflow: hidden;
        pointer-events: none;
    `;

    const gradientColors = ['#60a5fa', '#34d399'];
    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'login-particle';
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
    div.appendChild(particlesContainer);

    // Container for login form
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'position: relative; z-index: 10; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px';
    contentDiv.innerHTML = `
        <div style="width: 100%; max-width: 420px; position: relative">
            <!-- Animated border glow -->
            <div style="position: absolute; inset: -2px; border-radius: 18px; background: linear-gradient(45deg, var(--accent-primary-dim), var(--accent-primary), var(--accent-primary-light), var(--accent-primary-dim)); background-size: 300% 300%; animation: gradientRotate 4s ease infinite; filter: blur(4px); opacity: 0.6"></div>

            <!-- Login Card -->
            <div id="login-card" style="position: relative; backdrop-filter: blur(12px); background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%), rgba(15,15,20,0.25); border: 1px solid rgba(255,255,255,0.18); border-top: 1px solid rgba(255,255,255,0.25); border-radius: 16px; padding: 48px 40px; box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1) inset">
                <!-- Logo and Title -->
                <div style="text-align: center; margin-bottom: 40px">
                    <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: linear-gradient(135deg, var(--accent-primary-subtle), var(--accent-primary-subtle)); border-radius: 16px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--accent-primary); box-shadow: 0 0 30px var(--accent-primary-glow);">
                        <svg width="32" height="32" viewBox="0 0 32 32">
                            <rect x="6" y="8" width="20" height="16" rx="2" fill="none" stroke="var(--accent-primary)" stroke-width="2"/>
                            <path d="M6 12h20M12 8v16M20 8v16" stroke="var(--accent-primary-dim)" stroke-width="1.5"/>
                            <circle id="logo-pulse-1" cx="16" cy="16" r="3" fill="var(--accent-primary-light)"></circle>
                            <circle id="logo-pulse-2" cx="16" cy="16" r="5" fill="none" stroke="var(--accent-primary-light)" stroke-width="1" style="animation: pulse 2s infinite"></circle>
                        </svg>
                    </div>
                    <h1 style="font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; letter-spacing: -0.5px">NDT Data Hub</h1>
                    <p style="font-size: 14px; color: var(--accent-primary-light); margin: 0; font-weight: 500">Secure Authentication Portal</p>
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
                    <div style="margin-bottom: 20px; position: relative">
                        <input type="password" id="password" autocomplete="current-password" required style="width: 100%; padding: 16px 16px 16px 48px; font-size: 15px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; outline: none; box-sizing: border-box; transition: all 0.3s">
                        <label id="password-label" style="position: absolute; left: 48px; top: 50%; transform: translateY(-50%); font-size: 15px; color: rgba(255,255,255,0.5); transition: all 0.3s; pointer-events: none; font-weight: 500">Password</label>
                        <svg id="password-icon" width="20" height="20" viewBox="0 0 20 20" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); opacity: 0.5; transition: opacity 0.3s">
                            <rect x="4" y="8" width="12" height="9" rx="1" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
                            <path d="M7 8V6a3 3 0 016 0v2" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
                        </svg>
                    </div>

                    <!-- Remember Me Checkbox -->
                    <div style="margin-bottom: 32px; display: flex; align-items: center">
                        <input type="checkbox" id="remember-me" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary); margin-right: 10px">
                        <label for="remember-me" style="font-size: 14px; color: rgba(255,255,255,0.7); cursor: pointer; user-select: none; font-weight: 500">Remember me</label>
                    </div>

                    <!-- Error Message -->
                    <div id="error-message" style="display: none; color: #ff6b6b; font-size: 14px; margin-bottom: 16px; text-align: center"></div>

                    <!-- Submit Button -->
                    <button type="submit" id="submit-btn" style="width: 100%; padding: 16px; font-size: 15px; font-weight: 600; color: #fff; background: linear-gradient(135deg, var(--accent-primary), var(--accent-primary-light)); border: none; border-radius: 10px; cursor: pointer; transition: all 0.3s; margin-bottom: 20px; position: relative; box-shadow: 0 4px 20px var(--accent-primary-glow); display: flex; align-items: center; justify-content: center">
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
                    <a href="#" id="request-account-btn" style="font-size: 14px; color: var(--accent-primary-light); text-decoration: none; font-weight: 500">Sign up</a>
                </div>
            </div>

            <!-- Request Account Card -->
            <div id="request-card" style="display: none; position: relative; backdrop-filter: blur(12px); background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%), rgba(15,15,20,0.25); border: 1px solid rgba(255,255,255,0.18); border-top: 1px solid rgba(255,255,255,0.25); border-radius: 16px; padding: 48px 40px; box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1) inset">
                <div style="text-align: center; margin-bottom: 32px">
                    <h1 style="font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; letter-spacing: -0.5px">Request Account</h1>
                    <p style="font-size: 14px; color: var(--accent-primary-light); margin: 0; font-weight: 500">Submit a request to join an organization</p>
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
                        <button type="submit" style="flex: 1; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, var(--accent-primary), var(--accent-primary-light)); border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 20px var(--accent-primary-glow)">Submit Request</button>
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
        rememberMe: q('#remember-me'),
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
}


function addInputAnimations() {
    // Function to update label position and style
    const updateLabelState = (input, label, icon, isFocused) => {
        const hasValue = input.value.length > 0;
        const shouldFloat = isFocused || hasValue;

        if (shouldFloat) {
            label.style.top = '6px';
            label.style.transform = 'translateY(0)';
            label.style.fontSize = '11px';
            label.style.color = isFocused ? 'var(--accent-primary)' : 'rgba(255,255,255,0.5)';
        } else {
            label.style.top = '50%';
            label.style.transform = 'translateY(-50%)';
            label.style.fontSize = '15px';
            label.style.color = 'rgba(255,255,255,0.5)';
        }

        // Update input border and shadow
        if (isFocused) {
            input.style.border = '1px solid var(--accent-primary)';
            input.style.boxShadow = `0 0 0 3px var(--accent-primary-subtle), 0 0 20px var(--accent-primary-glow)`;
        } else {
            input.style.border = '1px solid rgba(255,255,255,0.1)';
            input.style.boxShadow = 'none';
        }

        // Update icon
        icon.style.opacity = isFocused ? '1' : '0.5';
    };

    // Username input animations
    dom.username.addEventListener('focus', () => {
        updateLabelState(dom.username, dom.usernameLabel, dom.usernameIcon, true);
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary');
        dom.usernameIcon.querySelector('path').setAttribute('stroke', primaryColor);
    });

    dom.username.addEventListener('blur', () => {
        updateLabelState(dom.username, dom.usernameLabel, dom.usernameIcon, false);
        dom.usernameIcon.querySelector('path').setAttribute('stroke', 'rgba(255,255,255,0.5)');
    });

    dom.username.addEventListener('input', () => {
        updateLabelState(dom.username, dom.usernameLabel, dom.usernameIcon, true);
    });

    // Password input animations
    dom.password.addEventListener('focus', () => {
        updateLabelState(dom.password, dom.passwordLabel, dom.passwordIcon, true);
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary');
        dom.passwordIcon.querySelectorAll('rect, path').forEach(el => {
            el.setAttribute('stroke', primaryColor);
        });
    });

    dom.password.addEventListener('blur', () => {
        updateLabelState(dom.password, dom.passwordLabel, dom.passwordIcon, false);
        dom.passwordIcon.querySelectorAll('rect, path').forEach(el => {
            el.setAttribute('stroke', 'rgba(255,255,255,0.5)');
        });
    });

    dom.password.addEventListener('input', () => {
        updateLabelState(dom.password, dom.passwordLabel, dom.passwordIcon, true);
    });
}

async function handleLogin(e) {
    e.preventDefault();

    const username = dom.username.value.trim();
    const password = dom.password.value.trim();
    const rememberMe = dom.rememberMe.checked;

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    // Show loading state
    dom.submitBtn.disabled = true;
    dom.submitText.style.display = 'none';
    dom.submitSpinner.style.display = 'block';

    const result = await authManager.login(username, password, rememberMe);

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

async function handleForgotPassword(e) {
    e.preventDefault();

    const email = prompt('Enter your email address to receive a password reset link:');
    if (!email) return;

    // Basic email validation
    if (!email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }

    const { supabase } = await import('../supabase-client.js');

    // Construct the proper redirect URL for password reset
    const redirectUrl = `${window.location.origin}/#/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
    });

    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert('Password reset link sent! Please check your email. The link will expire in 1 hour.');
    }
}

function addEventListeners() {
    dom.loginForm.addEventListener('submit', handleLogin);
    dom.requestAccountBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showRequestCard();
    });
    dom.backToLoginBtn.addEventListener('click', showLoginCard);
    dom.requestForm.addEventListener('submit', handleRequestSubmit);

    const forgotPasswordLink = container.querySelector('#forgot-password');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', handleForgotPassword);
    }
}

export default {
    init: (toolContainer) => {
        container = toolContainer;
        const loginDiv = createLoginHTML();
        container.appendChild(loginDiv);
        cacheDom();
        addInputAnimations();
        addEventListeners();

        // Load remembered username if exists
        const rememberedUsername = localStorage.getItem('rememberedUsername');
        if (rememberedUsername) {
            dom.username.value = rememberedUsername;
            dom.rememberMe.checked = true;
            // Trigger label animation
            dom.usernameLabel.style.top = '6px';
            dom.usernameLabel.style.transform = 'translateY(0)';
            dom.usernameLabel.style.fontSize = '11px';
        }
    },

    destroy: () => {
        if (container) {
            container.innerHTML = '';
        }
    }
};
