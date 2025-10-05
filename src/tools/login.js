// Login Screen Module
import authManager from '../auth-manager.js';

let container, dom = {};

const HTML = `
<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-gray-900 to-gray-800">
    <div class="max-w-md w-full mx-4">
        <!-- Login Card -->
        <div id="login-card" class="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8">
            <div class="text-center mb-8">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">NDT Suite</h1>
                <p class="text-gray-600 dark:text-gray-400">Sign in to your account</p>
            </div>

            <form id="login-form" class="space-y-6">
                <div>
                    <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Username
                    </label>
                    <input
                        type="text"
                        id="username"
                        name="username"
                        autocomplete="username"
                        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Enter your username"
                        required
                    >
                </div>

                <div>
                    <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Password
                    </label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        autocomplete="current-password"
                        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Enter your password"
                        required
                    >
                </div>

                <div class="flex items-center">
                    <input
                        type="checkbox"
                        id="remember-me"
                        class="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                    >
                    <label for="remember-me" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        Remember me
                    </label>
                </div>

                <div id="error-message" class="hidden text-red-600 dark:text-red-400 text-sm"></div>

                <button
                    type="submit"
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                    Sign In
                </button>
            </form>

            <div class="mt-6 text-center">
                <button
                    id="request-account-btn"
                    class="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                >
                    Request an account
                </button>
            </div>

            <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p class="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Demo credentials: <strong>admin / admin123</strong>
                </p>
            </div>
        </div>

        <!-- Account Request Card -->
        <div id="request-card" class="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 hidden">
            <div class="text-center mb-8">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Request Account</h1>
                <p class="text-gray-600 dark:text-gray-400">Submit a request to join an organization</p>
            </div>

            <form id="request-form" class="space-y-6">
                <div>
                    <label for="req-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Username
                    </label>
                    <input
                        type="text"
                        id="req-username"
                        name="username"
                        autocomplete="username"
                        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Choose a username"
                        required
                    >
                </div>

                <div>
                    <label for="req-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Email
                    </label>
                    <input
                        type="email"
                        id="req-email"
                        name="email"
                        autocomplete="email"
                        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="your@email.com"
                        required
                    >
                </div>

                <div>
                    <label for="req-organization" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Organization
                    </label>
                    <select
                        id="req-organization"
                        name="organization"
                        autocomplete="organization"
                        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                    >
                        <option value="">Select an organization...</option>
                    </select>
                </div>

                <div>
                    <label for="req-role" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Requested Role
                    </label>
                    <select
                        id="req-role"
                        name="role"
                        autocomplete="off"
                        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                    >
                        <option value="viewer">Viewer (Read-only)</option>
                        <option value="editor">Editor (Create/Edit)</option>
                        <option value="org_admin">Organization Admin</option>
                    </select>
                </div>

                <div>
                    <label for="req-message" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Message (Optional)
                    </label>
                    <textarea
                        id="req-message"
                        name="message"
                        autocomplete="off"
                        rows="3"
                        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Tell us why you need access..."
                    ></textarea>
                </div>

                <div id="request-error-message" class="hidden text-red-600 dark:text-red-400 text-sm"></div>
                <div id="request-success-message" class="hidden text-green-600 dark:text-green-400 text-sm"></div>

                <div class="flex gap-3">
                    <button
                        type="button"
                        id="back-to-login-btn"
                        class="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors"
                    >
                        Back
                    </button>
                    <button
                        type="submit"
                        class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                    >
                        Submit Request
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
`;

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
        errorMessage: q('#error-message'),
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

async function handleLogin(e) {
    e.preventDefault();

    const username = dom.username.value.trim();
    const password = dom.password.value.trim();
    const rememberMe = dom.rememberMe.checked;

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    const result = await authManager.login(username, password, rememberMe);

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
    dom.errorMessage.classList.remove('hidden');
}

function showRequestCard() {
    dom.loginCard.classList.add('hidden');
    dom.requestCard.classList.remove('hidden');
    loadOrganizationsForRequest();
}

function showLoginCard() {
    dom.requestCard.classList.add('hidden');
    dom.loginCard.classList.remove('hidden');
    dom.requestForm.reset();
    dom.requestErrorMessage.classList.add('hidden');
    dom.requestSuccessMessage.classList.add('hidden');
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
    dom.requestErrorMessage.classList.remove('hidden');
    dom.requestSuccessMessage.classList.add('hidden');
}

function showRequestSuccess(message) {
    dom.requestSuccessMessage.textContent = message;
    dom.requestSuccessMessage.classList.remove('hidden');
    dom.requestErrorMessage.classList.add('hidden');
}

function addEventListeners() {
    dom.loginForm.addEventListener('submit', handleLogin);
    dom.requestAccountBtn.addEventListener('click', showRequestCard);
    dom.backToLoginBtn.addEventListener('click', showLoginCard);
    dom.requestForm.addEventListener('submit', handleRequestSubmit);
}

export default {
    init: (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        cacheDom();
        addEventListeners();
        loadSavedCredentials();
    },

    destroy: () => {
        if (container) {
            container.innerHTML = '';
        }
    }
};

function loadSavedCredentials() {
    const savedUsername = localStorage.getItem('rememberedUsername');
    if (savedUsername) {
        dom.username.value = savedUsername;
        dom.rememberMe.checked = true;
    }
}
