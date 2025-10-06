// Profile Management Module
import authManager, { ROLES } from '../auth-manager.js';
import supabase, { isSupabaseConfigured } from '../supabase-client.js';

let container, dom = {};

const HTML = `
<div class="h-full w-full overflow-auto bg-gray-900 p-8">
    <div class="max-w-4xl mx-auto">
        <div class="mb-8">
            <h1 class="text-3xl font-bold text-white mb-2">Profile Settings</h1>
            <p class="text-gray-400">Manage your profile and permissions</p>
        </div>

        <!-- Profile Information Card -->
        <div class="bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 class="text-xl font-semibold text-white mb-4">Profile Information</h2>

            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1">Username</label>
                    <div id="profile-username" class="text-white text-lg"></div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1">Email</label>
                    <div id="profile-email" class="text-white text-lg"></div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1">Organization</label>
                    <div id="profile-organization" class="text-white text-lg"></div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1">Current Role</label>
                    <div id="profile-role" class="inline-block px-3 py-1 rounded text-sm font-medium"></div>
                </div>
            </div>
        </div>

        <!-- Request Permission Upgrade Card -->
        <div id="permission-request-card" class="bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 class="text-xl font-semibold text-white mb-4">Request Permission Upgrade</h2>

            <form id="permission-request-form" class="space-y-4">
                <div>
                    <label for="requested-role" class="block text-sm font-medium text-gray-400 mb-2">
                        Requested Role
                    </label>
                    <select
                        id="requested-role"
                        class="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-700 text-white"
                        required
                    >
                        <option value="">Select a role...</option>
                        <option value="viewer">Viewer (Read-only)</option>
                        <option value="editor">Editor (Create/Edit/Delete)</option>
                        <option value="org_admin">Organization Admin</option>
                        <option value="admin">Admin (Full Access)</option>
                    </select>
                </div>

                <div>
                    <label for="request-message" class="block text-sm font-medium text-gray-400 mb-2">
                        Reason for Request
                    </label>
                    <textarea
                        id="request-message"
                        rows="4"
                        class="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-700 text-white"
                        placeholder="Explain why you need this permission level..."
                        required
                    ></textarea>
                </div>

                <div id="request-error" class="hidden text-red-400 text-sm"></div>
                <div id="request-success" class="hidden text-green-400 text-sm"></div>

                <button
                    type="submit"
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                    Submit Request
                </button>
            </form>
        </div>

        <!-- My Permission Requests Card -->
        <div class="bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 class="text-xl font-semibold text-white mb-4">My Permission Requests</h2>

            <div id="requests-list" class="space-y-3">
                <!-- Requests will be loaded here -->
            </div>

            <div id="no-requests" class="text-gray-400 text-center py-4 hidden">
                No permission requests found
            </div>
        </div>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        profileUsername: q('#profile-username'),
        profileEmail: q('#profile-email'),
        profileOrganization: q('#profile-organization'),
        profileRole: q('#profile-role'),
        permissionRequestCard: q('#permission-request-card'),
        permissionRequestForm: q('#permission-request-form'),
        requestedRole: q('#requested-role'),
        requestMessage: q('#request-message'),
        requestError: q('#request-error'),
        requestSuccess: q('#request-success'),
        requestsList: q('#requests-list'),
        noRequests: q('#no-requests')
    };
}

async function loadProfileData() {
    const user = authManager.getCurrentUser();
    const profile = authManager.getCurrentProfile();

    if (!user) return;

    // Display user information
    dom.profileUsername.textContent = user.username || 'N/A';
    dom.profileEmail.textContent = user.email || 'N/A';

    // Get organization name
    if (isSupabaseConfigured()) {
        if (profile?.organizations) {
            dom.profileOrganization.textContent = profile.organizations.name || 'N/A';
        } else {
            dom.profileOrganization.textContent = 'N/A';
        }
    } else {
        const orgId = user.organizationId || user.organization_id;
        if (orgId) {
            const org = await authManager.getOrganization(orgId);
            dom.profileOrganization.textContent = org?.name || 'N/A';
        } else {
            dom.profileOrganization.textContent = 'N/A';
        }
    }

    // Display role with color coding
    const roleColors = {
        [ROLES.ADMIN]: 'bg-purple-900 text-purple-200',
        [ROLES.ORG_ADMIN]: 'bg-blue-900 text-blue-200',
        [ROLES.EDITOR]: 'bg-green-900 text-green-200',
        [ROLES.VIEWER]: 'bg-gray-700 text-gray-200'
    };

    dom.profileRole.textContent = user.role || 'N/A';
    dom.profileRole.className = `inline-block px-3 py-1 rounded text-sm font-medium ${roleColors[user.role] || 'bg-gray-700 text-gray-200'}`;

    // Hide permission request form if user is already admin
    if (user.role === ROLES.ADMIN) {
        dom.permissionRequestCard.classList.add('hidden');
    }

    // Filter available roles based on current role
    updateAvailableRoles(user.role);

    // Load permission requests
    await loadPermissionRequests();
}

function updateAvailableRoles(currentRole) {
    const roleHierarchy = {
        [ROLES.VIEWER]: ['editor', 'org_admin', 'admin'],
        [ROLES.EDITOR]: ['org_admin', 'admin'],
        [ROLES.ORG_ADMIN]: ['admin'],
        [ROLES.ADMIN]: [] // Admins can't request upgrades
    };

    const availableRoles = roleHierarchy[currentRole] || [];

    // Clear and rebuild options
    dom.requestedRole.innerHTML = '<option value="">Select a role...</option>';

    if (availableRoles.includes('editor')) {
        dom.requestedRole.innerHTML += '<option value="editor">Editor (Create/Edit/Delete)</option>';
    }
    if (availableRoles.includes('org_admin')) {
        dom.requestedRole.innerHTML += '<option value="org_admin">Organization Admin</option>';
    }
    if (availableRoles.includes('admin')) {
        dom.requestedRole.innerHTML += '<option value="admin">Admin (Full Access)</option>';
    }
}

async function loadPermissionRequests() {
    const user = authManager.getCurrentUser();
    if (!user) return;

    try {
        if (isSupabaseConfigured()) {
            const { data: requests, error } = await supabase
                .from('permission_requests')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading permission requests:', error);
                return;
            }

            displayRequests(requests || []);
        } else {
            // Local mode - not implemented for permission requests
            dom.requestsList.innerHTML = '<p class="text-gray-400">Permission requests are only available with Supabase backend.</p>';
        }
    } catch (error) {
        console.error('Error loading permission requests:', error);
    }
}

function displayRequests(requests) {
    if (!requests || requests.length === 0) {
        dom.requestsList.classList.add('hidden');
        dom.noRequests.classList.remove('hidden');
        return;
    }

    dom.requestsList.classList.remove('hidden');
    dom.noRequests.classList.add('hidden');

    dom.requestsList.innerHTML = requests.map(request => {
        const statusColors = {
            pending: 'bg-yellow-900 text-yellow-200',
            approved: 'bg-green-900 text-green-200',
            rejected: 'bg-red-900 text-red-200'
        };

        const formattedDate = new Date(request.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="bg-gray-700 rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="text-white font-medium">
                            ${request.user_current_role} → ${request.requested_role}
                        </div>
                        <div class="text-gray-400 text-sm">${formattedDate}</div>
                    </div>
                    <span class="px-3 py-1 rounded text-xs font-medium ${statusColors[request.status] || 'bg-gray-600 text-gray-200'}">
                        ${request.status}
                    </span>
                </div>
                ${request.message ? `
                    <div class="text-gray-300 text-sm mt-2">
                        <span class="font-medium">Reason:</span> ${request.message}
                    </div>
                ` : ''}
                ${request.rejection_reason ? `
                    <div class="text-red-400 text-sm mt-2">
                        <span class="font-medium">Rejection reason:</span> ${request.rejection_reason}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

async function handlePermissionRequest(e) {
    e.preventDefault();

    const user = authManager.getCurrentUser();
    if (!user) return;

    const requestedRole = dom.requestedRole.value;
    const message = dom.requestMessage.value.trim();

    if (!requestedRole) {
        showError('Please select a role');
        return;
    }

    if (!message) {
        showError('Please provide a reason for your request');
        return;
    }

    // Check if user already has a pending request
    if (isSupabaseConfigured()) {
        const { data: existingRequests } = await supabase
            .from('permission_requests')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'pending');

        if (existingRequests && existingRequests.length > 0) {
            showError('You already have a pending permission request');
            return;
        }

        // Create permission request
        const { data, error } = await supabase
            .from('permission_requests')
            .insert({
                user_id: user.id,
                requested_role: requestedRole,
                user_current_role: user.role,
                message: message
            })
            .select()
            .single();

        if (error) {
            showError(error.message);
            return;
        }

        showSuccess('Permission request submitted successfully! An admin will review it shortly.');
        dom.permissionRequestForm.reset();

        // Reload requests
        setTimeout(() => {
            loadPermissionRequests();
        }, 1000);
    } else {
        showError('Permission requests are only available with Supabase backend');
    }
}

function showError(message) {
    dom.requestError.textContent = message;
    dom.requestError.classList.remove('hidden');
    dom.requestSuccess.classList.add('hidden');
}

function showSuccess(message) {
    dom.requestSuccess.textContent = message;
    dom.requestSuccess.classList.remove('hidden');
    dom.requestError.classList.add('hidden');
}

function addEventListeners() {
    dom.permissionRequestForm.addEventListener('submit', handlePermissionRequest);
}

export default {
    init: async (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        cacheDom();
        addEventListeners();
        await loadProfileData();
    },

    destroy: () => {
        if (container) {
            container.innerHTML = '';
        }
    }
};
