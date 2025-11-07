// Profile Management Module
import authManager, { ROLES } from '../auth-manager.js';
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import { createModernHeader } from '../components/modern-header.js';
import { themes, saveTheme, getCurrentTheme } from '../themes.js';
import competencyService from '../services/competency-service.js';
import { filterOutPersonalDetails, getPersonalDetails, formatValue } from '../utils/competency-field-utils.js';

let container, dom = {};

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div id="profile-header-container" style="flex-shrink: 0;"></div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
        <div class="max-w-4xl mx-auto" style="padding-bottom: 40px;">

        <!-- Theme Settings Card -->
        <div class="glass-card" style="padding: 24px; margin-bottom: 24px;">
            <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Theme Settings</h2>

            <p style="color: rgba(255, 255, 255, 0.6); font-size: 14px; margin-bottom: 20px;">
                Choose your preferred color scheme
            </p>

            <div id="theme-selector" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px;">
                <!-- Theme options will be populated here -->
            </div>
        </div>

        <!-- Profile Information Card -->
        <div class="glass-card" style="padding: 24px; margin-bottom: 24px;">
            <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Profile Information</h2>

            <div id="profile-info-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
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

                <!-- Personal Details will be dynamically added here -->
            </div>
        </div>

        <!-- Request Permission Upgrade Card -->
        <div id="permission-request-card" class="glass-card" style="padding: 24px; margin-bottom: 24px;">
            <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Request Permission Upgrade</h2>

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
        <div class="glass-card" style="padding: 24px; margin-bottom: 24px;">
            <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">My Permission Requests</h2>

            <div id="requests-list" class="space-y-3">
                <!-- Requests will be loaded here -->
            </div>

            <div id="no-requests" class="hidden" style="color: rgba(255, 255, 255, 0.5); text-align: center; padding: 16px;">
                No permission requests found
            </div>
        </div>

        <!-- Certifications & Qualifications Card -->
        <div class="glass-card" style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0;">Certifications & Qualifications</h2>
                <div style="display: flex; gap: 12px;">
                    <button id="browse-competencies-btn" class="btn-primary" style="padding: 8px 16px; font-size: 14px;">
                        <svg style="width: 16px; height: 16px; display: inline-block; margin-right: 6px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                        Browse & Add
                    </button>
                </div>
            </div>

            <div id="competency-categories" class="space-y-4">
                <!-- Categories and competencies will be loaded here -->
            </div>

            <div id="no-competencies" class="hidden" style="color: rgba(255, 255, 255, 0.5); text-align: center; padding: 32px;">
                <svg style="width: 48px; height: 48px; margin: 0 auto 12px; opacity: 0.3;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <p style="margin-bottom: 8px; font-size: 16px;">No competencies or certifications added yet</p>
                <p style="font-size: 14px; opacity: 0.7; margin-bottom: 16px;">Browse available competencies to quickly add yours</p>
                <button id="browse-first-competency-btn" class="btn-primary" style="margin-top: 16px;">Browse Competencies</button>
            </div>

            <div id="competency-loading" class="hidden" style="text-align: center; padding: 32px; color: rgba(255, 255, 255, 0.6);">
                Loading competencies...
            </div>
        </div>
    </div>
    </div>
</div>

<!-- Browse Competencies Modal -->
<div id="browse-modal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow-y: auto; padding: 32px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h3 style="font-size: 20px; font-weight: 600; color: #ffffff; margin: 0 0 6px 0;">Browse Competencies</h3>
                <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin: 0;">Click to quickly add competencies to your profile</p>
            </div>
            <button id="close-browse-modal-btn" style="background: none; border: none; color: rgba(255, 255, 255, 0.6); cursor: pointer; font-size: 24px; padding: 0; width: 32px; height: 32px;">&times;</button>
        </div>

        <!-- Search Bar -->
        <div style="margin-bottom: 24px;">
            <input
                type="text"
                id="competency-search"
                class="glass-input"
                placeholder="Search competencies..."
                style="width: 100%; font-size: 15px;"
            />
        </div>

        <!-- Category Tabs -->
        <div id="category-tabs" style="display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 16px;">
            <!-- Tabs will be populated here -->
        </div>

        <!-- Competency Grid -->
        <div id="competency-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; max-height: 500px; overflow-y: auto;" class="glass-scrollbar">
            <!-- Competency cards will be populated here -->
        </div>

        <div id="browse-loading" class="hidden" style="text-align: center; padding: 48px; color: rgba(255, 255, 255, 0.6);">
            <div class="spinner" style="margin: 0 auto 12px;"></div>
            Loading competencies...
        </div>
    </div>
</div>

<!-- Quick Edit Modal (for editing details after adding) -->
<div id="edit-modal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h3 style="font-size: 20px; font-weight: 600; color: #ffffff; margin: 0;" id="edit-modal-title">Edit Competency Details</h3>
            <button id="close-edit-modal-btn" style="background: none; border: none; color: rgba(255, 255, 255, 0.6); cursor: pointer; font-size: 24px; padding: 0; width: 32px; height: 32px;">&times;</button>
        </div>

        <form id="edit-competency-form" class="space-y-4">
            <input type="hidden" id="edit-competency-id" />
            <input type="hidden" id="edit-competency-definition-id" />

            <div id="edit-value-container">
                <!-- Dynamic input field based on competency type -->
            </div>

            <div id="edit-expiry-container" class="hidden">
                <label for="edit-expiry-date" style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                    Expiry Date
                </label>
                <input type="date" id="edit-expiry-date" class="glass-input" />
            </div>

            <div>
                <label for="edit-notes" style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                    Notes
                </label>
                <textarea id="edit-notes" rows="3" class="glass-textarea" placeholder="Additional notes or details..."></textarea>
            </div>

            <div id="edit-document-container" class="hidden">
                <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                    Supporting Document
                </label>
                <input type="file" id="edit-document" class="glass-input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
                <div id="edit-current-document" class="hidden" style="margin-top: 8px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; font-size: 13px;">
                    <span style="color: rgba(255, 255, 255, 0.6);">Current: </span>
                    <a id="edit-current-document-link" href="#" target="_blank" style="color: var(--accent-primary);">View Document</a>
                </div>
            </div>

            <div id="edit-form-error" class="hidden" style="color: #ff6b6b; font-size: 14px;"></div>

            <div style="display: flex; gap: 12px; margin-top: 24px;">
                <button type="submit" class="btn-primary" style="flex: 1;">
                    Save Changes
                </button>
                <button type="button" id="cancel-edit-modal-btn" class="btn-secondary" style="flex: 1;">
                    Cancel
                </button>
            </div>
        </form>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#profile-header-container'),
        themeSelector: q('#theme-selector'),
        profileInfoGrid: q('#profile-info-grid'),
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
        noRequests: q('#no-requests'),
        // Competency elements
        competencyCategories: q('#competency-categories'),
        noCompetencies: q('#no-competencies'),
        competencyLoading: q('#competency-loading'),
        browseCompetenciesBtn: q('#browse-competencies-btn'),
        browseFirstCompetencyBtn: q('#browse-first-competency-btn'),
        // Browse modal
        browseModal: q('#browse-modal'),
        closeBrowseModalBtn: q('#close-browse-modal-btn'),
        competencySearch: q('#competency-search'),
        categoryTabs: q('#category-tabs'),
        competencyGrid: q('#competency-grid'),
        browseLoading: q('#browse-loading'),
        // Edit modal
        editModal: q('#edit-modal'),
        closeEditModalBtn: q('#close-edit-modal-btn'),
        cancelEditModalBtn: q('#cancel-edit-modal-btn'),
        editCompetencyForm: q('#edit-competency-form'),
        editCompetencyId: q('#edit-competency-id'),
        editCompetencyDefinitionId: q('#edit-competency-definition-id'),
        editValueContainer: q('#edit-value-container'),
        editExpiryContainer: q('#edit-expiry-container'),
        editExpiryDate: q('#edit-expiry-date'),
        editNotes: q('#edit-notes'),
        editDocumentContainer: q('#edit-document-container'),
        editDocument: q('#edit-document'),
        editCurrentDocument: q('#edit-current-document'),
        editCurrentDocumentLink: q('#edit-current-document-link'),
        editFormError: q('#edit-form-error')
    };

    // Initialize modern header
    const header = createModernHeader(
        'Profile Settings',
        'Manage your profile, theme preferences, and permission requests',
        {
            showParticles: true,
            particleCount: 20,
            gradientColors: ['#34d399', '#60a5fa'], // Emerald to blue
            height: '100px'
        }
    );
    dom.headerContainer.appendChild(header);
}

function renderThemeSelector() {
    const currentTheme = getCurrentTheme();

    dom.themeSelector.innerHTML = Object.entries(themes).map(([themeId, theme]) => {
        const isActive = themeId === currentTheme;
        const primaryColor = theme.colors['accent-primary'];

        return `
            <button
                class="theme-option ${isActive ? 'active' : ''}"
                data-theme-id="${themeId}"
                style="
                    position: relative;
                    padding: 16px;
                    border-radius: var(--radius-md);
                    border: 2px solid ${isActive ? primaryColor : 'rgba(255, 255, 255, 0.15)'};
                    background: ${isActive ? `linear-gradient(135deg, ${theme.colors['bg-dark-2']} 0%, ${theme.colors['bg-dark-3']} 100%)` : 'rgba(255, 255, 255, 0.05)'};
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-align: left;
                    ${isActive ? `box-shadow: 0 0 20px ${theme.colors['accent-primary-glow']}, 0 4px 12px rgba(0,0,0,0.3);` : ''}
                "
                onmouseover="this.style.transform='translateY(-2px)'; this.style.borderColor='${primaryColor}';"
                onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='${isActive ? primaryColor : 'rgba(255, 255, 255, 0.15)'}';"
            >
                ${isActive ? `
                    <div style="position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; background: ${primaryColor}; display: flex; align-items: center; justify-content: center;">
                        <svg style="width: 12px; height: 12px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                ` : ''}

                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <div style="
                        width: 24px;
                        height: 24px;
                        border-radius: 6px;
                        background: ${primaryColor};
                        box-shadow: 0 0 12px ${theme.colors['accent-primary-glow']};
                    "></div>
                    <div style="
                        font-size: 15px;
                        font-weight: 600;
                        color: ${isActive ? primaryColor : '#ffffff'};
                    ">${theme.name}</div>
                </div>

                <div style="display: flex; gap: 4px;">
                    <div style="flex: 1; height: 4px; border-radius: 2px; background: ${theme.colors['accent-primary']};"></div>
                    <div style="flex: 1; height: 4px; border-radius: 2px; background: ${theme.colors['accent-secondary']};"></div>
                    <div style="flex: 1; height: 4px; border-radius: 2px; background: ${theme.colors['accent-tertiary']};"></div>
                </div>
            </button>
        `;
    }).join('');
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

function handleThemeChange(e) {
    const themeButton = e.target.closest('.theme-option');
    if (!themeButton) return;

    const themeId = themeButton.dataset.themeId;
    if (!themeId) return;

    // Save and apply the new theme
    saveTheme(themeId);

    // Re-render the theme selector to update active states
    renderThemeSelector();

    // Re-attach event listeners after re-render
    attachThemeListeners();
}

function attachThemeListeners() {
    const themeButtons = dom.themeSelector.querySelectorAll('.theme-option');
    themeButtons.forEach(button => {
        button.addEventListener('click', handleThemeChange);
    });
}

// Competency Management Functions
let competencyCategories = [];
let competencyDefinitions = [];
let userCompetencies = []; // Track user's current competencies
let selectedCategoryId = 'all';
let editingCompetency = null;

async function loadCompetencies() {
    if (!isSupabaseConfigured()) {
        dom.competencyCategories.classList.add('hidden');
        dom.noCompetencies.classList.remove('hidden');
        dom.noCompetencies.innerHTML = '<p style="color: rgba(255, 255, 255, 0.5);">Competency management requires Supabase backend.</p>';
        return;
    }

    const user = authManager.getCurrentUser();
    if (!user) return;

    try {
        dom.competencyLoading.classList.remove('hidden');
        dom.competencyCategories.classList.add('hidden');
        dom.noCompetencies.classList.add('hidden');

        const competencies = await competencyService.getUserCompetenciesByCategory(user.id);

        // Separate personal details from actual competencies/certifications
        const personalDetailsCategories = [];
        const certificationCategories = [];

        competencies.forEach(category => {
            const personalDetails = getPersonalDetails(category.competencies);
            const certifications = filterOutPersonalDetails(category.competencies);

            if (personalDetails.length > 0) {
                personalDetailsCategories.push({
                    ...category,
                    competencies: personalDetails
                });
            }

            if (certifications.length > 0) {
                certificationCategories.push({
                    ...category,
                    competencies: certifications
                });
            }
        });

        // Add personal details to the profile info grid
        if (personalDetailsCategories.length > 0 && personalDetailsCategories.some(cat => cat.competencies.length > 0)) {
            appendPersonalDetailsToProfile(personalDetailsCategories);
        }

        // Render certifications
        if (certificationCategories.length === 0 || certificationCategories.every(cat => cat.competencies.length === 0)) {
            dom.noCompetencies.classList.remove('hidden');
        } else {
            renderCompetencies(certificationCategories);
            dom.competencyCategories.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading competencies:', error);
        dom.competencyCategories.innerHTML = '<p style="color: #ff6b6b;">Error loading competencies. Please try again.</p>';
        dom.competencyCategories.classList.remove('hidden');
    } finally {
        dom.competencyLoading.classList.add('hidden');
    }
}

function appendPersonalDetailsToProfile(categoryGroups) {
    // Flatten all personal details from all categories
    const allPersonalDetails = categoryGroups
        .filter(group => group.competencies.length > 0)
        .flatMap(group => group.competencies);

    // Append each detail to the profile info grid
    allPersonalDetails.forEach(detail => {
        const fieldType = detail.competency?.field_type || 'text';
        const value = detail.value || '-';
        const formattedValue = formatValue(value, fieldType);

        const detailElement = document.createElement('div');
        detailElement.innerHTML = `
            <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px;">
                ${detail.competency.name}
            </label>
            <div style="color: #ffffff; font-size: 16px;">
                ${formattedValue}
            </div>
        `;

        dom.profileInfoGrid.appendChild(detailElement);
    });
}

function renderCompetencies(categoryGroups) {
    dom.competencyCategories.innerHTML = categoryGroups
        .filter(group => group.competencies.length > 0)
        .map(group => {
            const categoryHtml = `
                <div class="glass-panel" style="padding: 16px;">
                    <h3 style="font-size: 15px; font-weight: 600; color: var(--accent-primary); margin: 0 0 12px 0;">
                        ${group.category.name}
                    </h3>
                    <div class="space-y-2">
                        ${group.competencies.map(comp => renderCompetencyItem(comp)).join('')}
                    </div>
                </div>
            `;
            return categoryHtml;
        }).join('');
}

function renderCompetencyItem(competency) {
    const isExpiring = competency.expiry_date && new Date(competency.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const isExpired = competency.status === 'expired' || (competency.expiry_date && new Date(competency.expiry_date) < new Date());

    const statusBadge = competency.status === 'pending_approval'
        ? '<span class="glass-badge" style="background: rgba(251, 191, 36, 0.2); color: rgba(253, 224, 71, 1); border-color: rgba(251, 191, 36, 0.4);">pending approval</span>'
        : isExpired
        ? '<span class="glass-badge badge-red">expired</span>'
        : isExpiring
        ? '<span class="glass-badge" style="background: rgba(251, 146, 60, 0.2); color: rgba(251, 146, 60, 1); border-color: rgba(251, 146, 60, 0.4);">expiring soon</span>'
        : '';

    const expiryDisplay = competency.expiry_date
        ? `<span style="color: ${isExpired ? '#ff6b6b' : isExpiring ? '#fb923c' : 'rgba(255, 255, 255, 0.5)'}; font-size: 12px;">
            Expires: ${new Date(competency.expiry_date).toLocaleDateString()}
           </span>`
        : '';

    return `
        <div class="glass-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 8px;">
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="color: #ffffff; font-size: 14px; font-weight: 500;">${competency.competency.name}</span>
                    ${statusBadge}
                </div>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 13px;">
                    ${competency.value ? `<span style="color: rgba(255, 255, 255, 0.7);">${competency.value}</span>` : ''}
                    ${expiryDisplay}
                    ${competency.document_url ? '<span style="color: var(--accent-primary); font-size: 12px;">📄 Has document</span>' : ''}
                </div>
                ${competency.notes ? `<div style="color: rgba(255, 255, 255, 0.5); font-size: 12px; margin-top: 6px;">${competency.notes}</div>` : ''}
            </div>
            <div style="display: flex; gap: 8px;">
                ${competency.document_url ? `
                    <button class="btn-icon" data-competency-id="${competency.id}" data-action="view-document" data-document-path="${competency.document_url}" title="View document">
                        <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                        </svg>
                    </button>
                ` : ''}
                <button class="btn-icon" data-competency-id="${competency.id}" data-action="edit" title="Edit">
                    <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                </button>
                <button class="btn-icon" data-competency-id="${competency.id}" data-action="delete" title="Delete" style="color: #ff6b6b;">
                    <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// Open browse modal
async function openBrowseModal() {
    try {
        dom.browseLoading.classList.remove('hidden');
        dom.categoryTabs.innerHTML = '';
        dom.competencyGrid.innerHTML = '';
        dom.browseModal.classList.remove('hidden');

        // Load data
        if (!competencyCategories.length) {
            const allCategories = await competencyService.getCategories();
            // Filter out "Personal Details" category
            competencyCategories = allCategories.filter(cat =>
                !cat.name.toLowerCase().includes('personal details')
            );
        }
        if (!competencyDefinitions.length) {
            const allDefinitions = await competencyService.getCompetencyDefinitions();
            // Filter out personal details - only show certifications/qualifications
            competencyDefinitions = filterOutPersonalDetails(allDefinitions);
        }

        const user = authManager.getCurrentUser();
        if (user) {
            userCompetencies = await competencyService.getUserCompetencies(user.id);
        }

        // Render category tabs
        renderCategoryTabs();

        // Render competency grid
        renderCompetencyGrid();

        dom.browseLoading.classList.add('hidden');
    } catch (error) {
        console.error('Error loading browse modal:', error);
        alert('Error loading competencies: ' + error.message);
        dom.browseModal.classList.add('hidden');
    }
}

function renderCategoryTabs() {
    const allTab = `
        <button class="category-tab ${selectedCategoryId === 'all' ? 'active' : ''}" data-category-id="all"
            style="padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);
                   background: ${selectedCategoryId === 'all' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.05)'};
                   color: ${selectedCategoryId === 'all' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'};
                   cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;">
            All
        </button>
    `;

    const categoryTabs = competencyCategories.map(cat => `
        <button class="category-tab ${selectedCategoryId === cat.id ? 'active' : ''}" data-category-id="${cat.id}"
            style="padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);
                   background: ${selectedCategoryId === cat.id ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.05)'};
                   color: ${selectedCategoryId === cat.id ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'};
                   cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;">
            ${cat.name}
        </button>
    `).join('');

    dom.categoryTabs.innerHTML = allTab + categoryTabs;
}

function renderCompetencyGrid(searchTerm = '') {
    let filteredDefinitions = competencyDefinitions;

    // Filter by category
    if (selectedCategoryId !== 'all') {
        filteredDefinitions = filteredDefinitions.filter(def => def.category_id === selectedCategoryId);
    }

    // Filter by search
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredDefinitions = filteredDefinitions.filter(def =>
            def.name.toLowerCase().includes(term) ||
            (def.description && def.description.toLowerCase().includes(term))
        );
    }

    if (filteredDefinitions.length === 0) {
        dom.competencyGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: rgba(255, 255, 255, 0.5);">
                No competencies found
            </div>
        `;
        return;
    }

    dom.competencyGrid.innerHTML = filteredDefinitions.map(def => {
        const userHasCompetency = userCompetencies.some(uc => uc.competency_id === def.id);
        const isRequired = def.is_required || false;

        return `
            <div class="competency-card ${userHasCompetency ? 'has-competency' : ''}" data-definition-id="${def.id}"
                style="position: relative; padding: 16px; border-radius: 12px;
                       background: ${userHasCompetency ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
                       border: 2px solid ${userHasCompetency ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255, 255, 255, 0.1)'};
                       cursor: pointer; transition: all 0.2s;">

                ${isRequired ? '<span style="position: absolute; top: 12px; right: 12px; padding: 4px 8px; border-radius: 6px; background: rgba(251, 191, 36, 0.2); color: rgba(253, 224, 71, 1); font-size: 11px; font-weight: 600;">REQUIRED</span>' : ''}

                <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px;">
                    <div style="flex: 1;">
                        <h4 style="font-size: 15px; font-weight: 600; color: #ffffff; margin: 0 0 4px 0;">${def.name}</h4>
                        ${def.description ? `<p style="font-size: 13px; color: rgba(255, 255, 255, 0.6); margin: 0; line-height: 1.4;">${def.description}</p>` : ''}
                    </div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px;">
                    <span style="font-size: 12px; color: rgba(255, 255, 255, 0.5);">
                        ${def.category?.name || ''}
                    </span>

                    ${userHasCompetency
                        ? '<span style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(34, 197, 94, 1); font-weight: 600;"><svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Added</span>'
                        : '<span style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--accent-primary); font-weight: 600;"><svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>Add</span>'
                    }
                </div>
            </div>
        `;
    }).join('');
}

function closeBrowseModal() {
    dom.browseModal.classList.add('hidden');
    selectedCategoryId = 'all';
    dom.competencySearch.value = '';
}

// Open edit modal for a specific competency
async function openEditModal(competency, definition) {
    editingCompetency = competency;

    dom.editCompetencyId.value = competency?.id || '';
    dom.editCompetencyDefinitionId.value = definition.id;

    // Create appropriate input based on field type
    createValueInput(definition, dom.editValueContainer, competency?.value);

    // Handle expiry date
    if (definition.field_type === 'expiry_date') {
        dom.editExpiryContainer.classList.remove('hidden');
        if (competency?.expiry_date) {
            dom.editExpiryDate.value = new Date(competency.expiry_date).toISOString().split('T')[0];
        }
    } else {
        dom.editExpiryContainer.classList.add('hidden');
    }

    // Handle notes
    dom.editNotes.value = competency?.notes || '';

    // Handle document upload
    if (definition.requires_document) {
        dom.editDocumentContainer.classList.remove('hidden');
        if (competency?.document_url) {
            dom.editCurrentDocument.classList.remove('hidden');
            dom.editCurrentDocumentLink.textContent = competency.document_name || 'View Document';
            dom.editCurrentDocumentLink.onclick = async (e) => {
                e.preventDefault();
                try {
                    const signedUrl = await competencyService.getDocumentUrl(competency.document_url);
                    window.open(signedUrl, '_blank');
                } catch (error) {
                    console.error('Error viewing document:', error);
                    alert('Failed to load document: ' + error.message);
                }
            };
        } else {
            dom.editCurrentDocument.classList.add('hidden');
        }
    } else {
        dom.editDocumentContainer.classList.add('hidden');
    }

    dom.editModal.classList.remove('hidden');
}

function createValueInput(definition, container, currentValue = '') {
    let inputHtml = '';
    switch (definition.field_type) {
        case 'text':
            inputHtml = `
                <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                    ${definition.name}
                </label>
                <input type="text" id="value-input" class="glass-input" value="${currentValue}" />
            `;
            break;
        case 'number':
            inputHtml = `
                <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                    ${definition.name}
                </label>
                <input type="number" id="value-input" class="glass-input" value="${currentValue}" />
            `;
            break;
        case 'date':
            inputHtml = `
                <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                    ${definition.name}
                </label>
                <input type="date" id="value-input" class="glass-input" value="${currentValue}" />
            `;
            break;
        case 'expiry_date':
            inputHtml = `
                <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                    Certification Number / ID
                </label>
                <input type="text" id="value-input" class="glass-input" placeholder="Optional" value="${currentValue}" />
            `;
            break;
        case 'boolean':
            inputHtml = `
                <label style="display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                    ${definition.name}
                </label>
                <select id="value-input" class="glass-select">
                    <option value="yes" ${currentValue === 'yes' ? 'selected' : ''}>Yes</option>
                    <option value="no" ${currentValue === 'no' ? 'selected' : ''}>No</option>
                </select>
            `;
            break;
    }
    container.innerHTML = inputHtml;
}

function closeEditModal() {
    dom.editModal.classList.add('hidden');
    editingCompetency = null;
    dom.editCompetencyForm.reset();
    dom.editFormError.classList.add('hidden');
}

// Handle click on competency card in browse modal
async function handleCompetencyCardClick(e) {
    const card = e.target.closest('.competency-card');
    if (!card) return;

    const definitionId = card.dataset.definitionId;
    const definition = competencyDefinitions.find(def => def.id === definitionId);
    if (!definition) return;

    const user = authManager.getCurrentUser();
    if (!user) return;

    // Check if user already has this competency
    const existingCompetency = userCompetencies.find(uc => uc.competency_id === definitionId);

    if (existingCompetency) {
        // Open edit modal
        await openEditModal(existingCompetency, definition);
    } else {
        // Quick add with default values
        await quickAddCompetency(user.id, definitionId, definition);
    }
}

// Quick add competency (used when clicking "Add" on a card)
async function quickAddCompetency(userId, definitionId, definition) {
    try {
        // For simple boolean types, add immediately with default value
        if (definition.field_type === 'boolean') {
            await competencyService.upsertCompetency(userId, definitionId, {
                value: 'yes',
                expiryDate: null,
                notes: null,
                documentUrl: null,
                documentName: null
            });

            // Refresh user competencies and grid
            userCompetencies = await competencyService.getUserCompetencies(userId);
            renderCompetencyGrid(dom.competencySearch.value);
            await loadCompetencies();
            return;
        }

        // For other types, open edit modal to collect details
        await openEditModal(null, definition);
    } catch (error) {
        console.error('Error adding competency:', error);
        alert('Failed to add competency: ' + error.message);
    }
}

// Handle form submission from edit modal
async function handleEditFormSubmit(e) {
    e.preventDefault();

    const user = authManager.getCurrentUser();
    if (!user) return;

    const competencyId = dom.editCompetencyId.value;
    const definitionId = dom.editCompetencyDefinitionId.value;
    const valueInput = dom.editValueContainer.querySelector('#value-input');
    const value = valueInput?.value || '';
    const expiryDate = dom.editExpiryDate.value || null;
    const notes = dom.editNotes.value.trim();
    const documentFile = dom.editDocument.files[0];

    try {
        let documentUrl = editingCompetency?.document_url;
        let documentName = editingCompetency?.document_name;

        // Upload document if provided
        if (documentFile) {
            const definition = competencyDefinitions.find(def => def.id === definitionId);
            const uploadResult = await competencyService.uploadDocument(documentFile, user.id, definition.name);
            documentUrl = uploadResult.url;
            documentName = uploadResult.name;
        }

        // Save competency
        await competencyService.upsertCompetency(user.id, definitionId, {
            value,
            expiryDate,
            notes,
            documentUrl,
            documentName
        });

        // Refresh data
        userCompetencies = await competencyService.getUserCompetencies(user.id);
        closeEditModal();
        renderCompetencyGrid(dom.competencySearch.value);
        await loadCompetencies();
    } catch (error) {
        console.error('Error saving competency:', error);
        dom.editFormError.textContent = error.message || 'Failed to save competency';
        dom.editFormError.classList.add('hidden');
    }
}

async function handleCompetencyAction(e) {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const competencyId = button.dataset.competencyId;

    if (action === 'view-document') {
        const documentPath = button.dataset.documentPath;
        try {
            // Generate signed URL for secure access
            const signedUrl = await competencyService.getDocumentUrl(documentPath);
            window.open(signedUrl, '_blank');
        } catch (error) {
            console.error('Error viewing document:', error);
            alert('Failed to load document: ' + error.message);
        }
    } else if (action === 'edit') {
        const user = authManager.getCurrentUser();
        const competencies = await competencyService.getUserCompetencies(user.id);
        const competency = competencies.find(c => c.id === competencyId);
        if (competency) {
            openCompetencyModal(competency);
        }
    } else if (action === 'delete') {
        if (confirm('Are you sure you want to delete this competency?')) {
            try {
                await competencyService.deleteCompetency(competencyId);
                await loadCompetencies();
            } catch (error) {
                console.error('Error deleting competency:', error);
                alert('Failed to delete competency: ' + error.message);
            }
        }
    }
}

function addEventListeners() {
    dom.permissionRequestForm.addEventListener('submit', handlePermissionRequest);
    attachThemeListeners();

    // Browse modal listeners
    dom.browseCompetenciesBtn.addEventListener('click', openBrowseModal);
    dom.browseFirstCompetencyBtn.addEventListener('click', openBrowseModal);
    dom.closeBrowseModalBtn.addEventListener('click', closeBrowseModal);

    // Search functionality
    dom.competencySearch.addEventListener('input', (e) => {
        renderCompetencyGrid(e.target.value);
    });

    // Category tab clicks
    dom.categoryTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.category-tab');
        if (!tab) return;
        selectedCategoryId = tab.dataset.categoryId;
        renderCategoryTabs();
        renderCompetencyGrid(dom.competencySearch.value);
    });

    // Competency card clicks
    dom.competencyGrid.addEventListener('click', handleCompetencyCardClick);

    // Edit modal listeners
    dom.closeEditModalBtn.addEventListener('click', closeEditModal);
    dom.cancelEditModalBtn.addEventListener('click', closeEditModal);
    dom.editCompetencyForm.addEventListener('submit', handleEditFormSubmit);

    // Existing competency actions (edit/delete from profile view)
    dom.competencyCategories.addEventListener('click', handleCompetencyAction);

    // Close modals on backdrop click
    dom.browseModal.addEventListener('click', (e) => {
        if (e.target === dom.browseModal || e.target.classList.contains('modal-backdrop')) {
            closeBrowseModal();
        }
    });

    dom.editModal.addEventListener('click', (e) => {
        if (e.target === dom.editModal || e.target.classList.contains('modal-backdrop')) {
            closeEditModal();
        }
    });
}

export default {
    init: async (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        cacheDom();
        renderThemeSelector();
        addEventListeners();
        await loadProfileData();
        await loadCompetencies();
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
