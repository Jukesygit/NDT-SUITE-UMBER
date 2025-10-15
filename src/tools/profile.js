// Profile Management Module
import authManager, { ROLES } from '../auth-manager.js';
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import { createAnimatedHeader } from '../animated-background.js';

let container, dom = {};

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div id="profile-header-container" style="flex-shrink: 0;"></div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
        <div class="max-w-4xl mx-auto" style="padding-bottom: 40px;">

        <!-- Profile Information Card -->
        <div class="glass-card" style="padding: 24px; margin-bottom: 24px;">
            <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Profile Information</h2>

            <div class="space-y-4">
                <div>
                    <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px;">Username</label>
                    <div id="profile-username" style="color: #ffffff; font-size: 16px;"></div>
                </div>

                <div>
                    <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px;">Email</label>
                    <div id="profile-email" style="color: #ffffff; font-size: 16px;"></div>
                </div>

                <div>
                    <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px;">Organization</label>
                    <div id="profile-organization" style="color: #ffffff; font-size: 16px;"></div>
                </div>

                <div>
                    <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px;">Current Role</label>
                    <div id="profile-role" class="glass-badge"></div>
                </div>
            </div>
        </div>

        <!-- Request Permission Upgrade Card -->
        <div id="permission-request-card" class="glass-card" style="padding: 24px; margin-bottom: 24px;">
            <h2 style="font-size: 18px; font-weight: 600; color
            
            
            <form id="permission-request-form" class="space-y-4">
                <div>
                    <label for="requested-role" style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                        Requested Role
                    </label>
                    <select
                        id="requested-role"
                        class="glass-select"
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
                    <label for="request-message" style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                        Reason for Request
                    </label>
                    <textarea
                        id="request-message"
                        rows="4"
                        class="glass-textarea"
                        placeholder="Explain why you need this permission level..."
                        required
                    ></textarea>
                </div>

                <div id="request-error" class="hidden" style="color: #ff6b6b; font-size: 14px;"></div>
                <div id="request-success" class="hidden" style="color: #4ade80; font-size: 14px;"></div>

                <button
                    type="submit"
                    class="btn-primary"
                    style="width: 100%; padding: 14px;"
                >
                    Submit Request
                </button>
            </form>
        </div>

        <!-- My Permission Requests Card -->
        <div class="glass-card" style="padding: 24px;">
            <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">My Permission Requests</h2>

            <div id="requests-list" class="space-y-3">
                <!-- Requests will be loaded here -->
            </div>

            <div id="no-requests" class="hidden" style="color: rgba(255, 255, 255, 0.5); text-align: center; padding: 16px;">
                No permission requests found
            </div>
        </div>
    </div>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#profile-header-container'),
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

    // Initialize animated header
    const header = createAnimatedHeader(
        'Profile Settings',
        'Manage your profile and permissions',
        { height: '180px', particleCount: 15, waveIntensity: 0.4 }
    );
    dom.headerContainer.appendChild(header);
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
        [ROLES.ADMIN]: 'badge-purple',
        [ROLES.ORG_ADMIN]: 'badge-blue',
        [ROLES.EDITOR]: 'badge-green',
        [ROLES.VIEWER]: 'glass-badge'
    };

    dom.profileRole.textContent = user.role || 'N/A';
    dom.profileRole.className = `glass-badge ${roleColors[user.role] || ''}`;

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
        const statusBadges = {
            pending: '<span class="glass-badge" style="background: rgba(251, 191, 36, 0.2); color: rgba(253, 224, 71, 1); border-color: rgba(251, 191, 36, 0.4);">pending</span>',
            approved: '<span class="glass-badge badge-green">approved</span>',
            rejected: '<span class="glass-badge badge-red">rejected</span>'
        };

        const formattedDate = new Date(request.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="glass-panel" style="padding: 16px;">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div style="color: #ffffff; font-weight: 500; font-size: 14px;">
                            ${request.user_current_role} → ${request.requested_role}
                        </div>
                        <div style="color: rgba(255, 255, 255, 0.5); font-size: 13px; margin-top: 4px;">${formattedDate}</div>
                    </div>
                    ${statusBadges[request.status] || '<span class="glass-badge">unknown</span>'}
                </div>
                ${request.message ? `
                    <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px; margin-top: 12px;">
                        <span style="font-weight: 500;">Reason:</span> ${request.message}
                    </div>
                ` : ''}
                ${request.rejection_reason ? `
                    <div style="color: #ff6b6b; font-size: 13px; margin-top: 12px;">
                        <span style="font-weight: 500;">Rejection reason:</span> ${request.rejection_reason}
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
        // Destroy animated background
        const headerContainer = container?.querySelector('#profile-header-container');
        if (headerContainer) {
            const animContainer = headerContainer.querySelector('.animated-header-container');
            if (animContainer && animContainer._animationInstance) {
                animContainer._animationInstance.destroy();
            }
        }

        if (container) {
            container.innerHTML = '';
        }
    }
};
