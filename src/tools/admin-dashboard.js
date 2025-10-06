// Admin Dashboard Module - User and Organization Management
import authManager, { ROLES, PERMISSIONS } from '../auth-manager.js';
import dataManager from '../data-manager.js';
import sharingManager from '../sharing-manager.js';
import supabase from '../supabase-client.js';

let container, dom = {};
let currentView = 'overview'; // 'overview', 'organizations', 'users', 'requests', 'sharing'

const HTML = `
<div class="h-full flex flex-col bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 overflow-hidden">
    <!-- Header -->
    <div class="p-6 bg-white dark:bg-gray-800 shadow-md flex-shrink-0">
        <div class="flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
                <p class="text-gray-600 dark:text-gray-400 mt-1">Manage users, organizations, and permissions</p>
            </div>
            <div id="pending-badge" class="hidden">
                <span class="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                    <span id="pending-count">0</span> Pending Requests
                </span>
            </div>
        </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div class="flex px-6">
            <button data-view="overview" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
                Overview
            </button>
            <button data-view="organizations" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Organizations
            </button>
            <button data-view="users" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Users
            </button>
            <button data-view="requests" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Account Requests
                <span id="requests-badge" class="hidden ml-2 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs">0</span>
            </button>
            <button data-view="sharing" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Asset Sharing
            </button>
        </div>
    </div>

    <!-- Content Area -->
    <div class="flex-grow overflow-y-auto p-6">
        <div id="overview-view"></div>
        <div id="organizations-view" class="hidden"></div>
        <div id="users-view" class="hidden"></div>
        <div id="requests-view" class="hidden"></div>
        <div id="sharing-view" class="hidden"></div>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        pendingBadge: q('#pending-badge'),
        pendingCount: q('#pending-count'),
        requestsBadge: q('#requests-badge'),
        overviewView: q('#overview-view'),
        organizationsView: q('#organizations-view'),
        usersView: q('#users-view'),
        requestsView: q('#requests-view'),
        sharingView: q('#sharing-view'),
        tabBtns: container.querySelectorAll('.tab-btn')
    };
}

async function switchView(view) {
    currentView = view;

    // Update tabs
    dom.tabBtns.forEach(btn => {
        const isActive = btn.dataset.view === view;
        btn.classList.toggle('border-blue-600', isActive);
        btn.classList.toggle('text-blue-600', isActive);
        btn.classList.toggle('dark:text-blue-400', isActive);
        btn.classList.toggle('border-transparent', !isActive);
        btn.classList.toggle('text-gray-600', !isActive);
        btn.classList.toggle('dark:text-gray-400', !isActive);
    });

    // Show/hide views
    dom.overviewView.classList.toggle('hidden', view !== 'overview');
    dom.organizationsView.classList.toggle('hidden', view !== 'organizations');
    dom.usersView.classList.toggle('hidden', view !== 'users');
    dom.requestsView.classList.toggle('hidden', view !== 'requests');
    dom.sharingView.classList.toggle('hidden', view !== 'sharing');

    // Render view
    if (view === 'overview') await renderOverview();
    else if (view === 'organizations') await renderOrganizations();
    else if (view === 'users') await renderUsers();
    else if (view === 'requests') await renderRequests();
    else if (view === 'sharing') await renderSharing();
}

async function renderOverview() {
    const orgStats = await dataManager.getAllOrganizationStats();
    const users = await authManager.getUsers();
    const pendingRequests = await authManager.getPendingAccountRequests();

    dom.overviewView.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div class="text-sm text-gray-500 dark:text-gray-400">Organizations</div>
                <div class="text-3xl font-bold text-gray-900 dark:text-white mt-2">${orgStats.length}</div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div class="text-sm text-gray-500 dark:text-gray-400">Total Users</div>
                <div class="text-3xl font-bold text-gray-900 dark:text-white mt-2">${users.length}</div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div class="text-sm text-gray-500 dark:text-gray-400">Total Assets</div>
                <div class="text-3xl font-bold text-gray-900 dark:text-white mt-2">${orgStats.reduce((sum, org) => sum + org.totalAssets, 0)}</div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div class="text-sm text-gray-500 dark:text-gray-400">Pending Requests</div>
                <div class="text-3xl font-bold text-gray-900 dark:text-white mt-2">${pendingRequests.length}</div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Organizations Table -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">Organizations</h2>
                </div>
                <div class="p-6">
                    <div class="space-y-3">
                        ${orgStats.map(org => `
                            <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                                <div>
                                    <div class="font-semibold text-gray-900 dark:text-white">${org.organizationName}</div>
                                    <div class="text-sm text-gray-600 dark:text-gray-400">${org.totalAssets} assets, ${org.totalScans} scans</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Recent Users -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">Recent Users</h2>
                </div>
                <div class="p-6">
                    <div class="space-y-3">
                        ${users.slice(-5).reverse().map(user => {
                            // Use embedded organization data from the join
                            const orgName = user.organizations?.name || 'Unknown';
                            const isActive = user.is_active ?? user.isActive;
                            return `
                                <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                                    <div>
                                        <div class="font-semibold text-gray-900 dark:text-white">${user.username}</div>
                                        <div class="text-sm text-gray-600 dark:text-gray-400">${orgName} - ${user.role}</div>
                                    </div>
                                    <span class="px-2 py-1 rounded text-xs font-medium ${
                                        isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                    }">
                                        ${isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function renderOrganizations() {
    const organizations = (await authManager.getOrganizations()).filter(org => org.name !== 'SYSTEM');
    const orgStats = await dataManager.getAllOrganizationStats();
    const allUsers = await authManager.getUsers();

    dom.organizationsView.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Organizations</h2>
            <button id="new-org-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                + New Organization
            </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${organizations.map(org => {
                const stats = orgStats.find(s => s.organizationId === org.id) || { totalAssets: 0, totalVessels: 0, totalScans: 0 };
                const users = allUsers.filter(u => u.organizationId === org.id || u.organization_id === org.id);

                return `
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                        <div class="p-6">
                            <div class="flex justify-between items-start mb-4">
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white">${org.name}</h3>
                                <button class="org-menu-btn text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" data-org-id="${org.id}" aria-label="Organization menu for ${org.name}">
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
                                    </svg>
                                </button>
                            </div>
                            <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <div>Users: ${users.length}</div>
                                <div>Assets: ${stats.totalAssets}</div>
                                <div>Scans: ${stats.totalScans}</div>
                            </div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 px-6 py-3">
                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                Created ${new Date(org.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Event listeners
    const newOrgBtn = dom.organizationsView.querySelector('#new-org-btn');
    if (newOrgBtn) {
        newOrgBtn.addEventListener('click', createOrganization);
    }

    dom.organizationsView.querySelectorAll('.org-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => showOrgMenu(e, btn.dataset.orgId));
    });
}

async function renderUsers() {
    const users = await authManager.getUsers();

    dom.usersView.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Users</h2>
            <button id="new-user-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                + New User
            </button>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Organization</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    ${users.map(user => {
                        // Handle both organizationId and organization_id
                        const orgId = user.organization_id || user.organizationId;
                        // Check if organizations data is embedded
                        const orgName = user.organizations?.name || 'Unknown';
                        return `
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="font-semibold text-gray-900 dark:text-white">${user.username}</div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400">${user.email}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                    ${orgName}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span class="px-2 py-1 rounded text-xs font-medium ${
                                        user.role === 'admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                        user.role === 'org_admin' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                        user.role === 'editor' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                    }">
                                        ${user.role}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span class="px-2 py-1 rounded text-xs font-medium ${
                                        (user.is_active ?? user.isActive) ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                    }">
                                        ${(user.is_active ?? user.isActive) ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm">
                                    <button class="user-edit-btn text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mr-3" data-user-id="${user.id}">
                                        Edit
                                    </button>
                                    <button class="user-delete-btn text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300" data-user-id="${user.id}">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Event listeners
    const newUserBtn = dom.usersView.querySelector('#new-user-btn');
    if (newUserBtn) {
        newUserBtn.addEventListener('click', createUser);
    }

    dom.usersView.querySelectorAll('.user-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => editUser(btn.dataset.userId));
    });

    dom.usersView.querySelectorAll('.user-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.userId));
    });
}

async function renderRequests() {
    const accountRequests = await authManager.getPendingAccountRequests();
    const allOrganizations = await authManager.getOrganizations();

    // Get permission requests if using Supabase
    let permissionRequests = [];
    if (authManager.isUsingSupabase()) {
        const { data, error } = await supabase
            .from('permission_requests')
            .select('*, profiles!permission_requests_user_id_fkey(username, email, organizations(name))')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (!error) {
            permissionRequests = data || [];
        }
    }

    dom.requestsView.innerHTML = `
        <!-- Permission Requests Section -->
        ${permissionRequests.length > 0 ? `
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">Pending Permission Requests</h2>
                <div class="space-y-4">
                    ${permissionRequests.map(request => `
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                            <div class="flex justify-between items-start">
                                <div class="flex-grow">
                                    <div class="flex items-center gap-3 mb-2">
                                        <h3 class="text-lg font-bold text-gray-900 dark:text-white">${request.profiles?.username || 'Unknown'}</h3>
                                        <span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                            ${request.user_current_role} → ${request.requested_role}
                                        </span>
                                    </div>
                                    <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                        <div>Email: ${request.profiles?.email || 'Unknown'}</div>
                                        <div>Organization: ${request.profiles?.organizations?.name || 'Unknown'}</div>
                                        <div>Requested: ${new Date(request.created_at).toLocaleString()}</div>
                                        ${request.message ? `<div class="mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded italic">"${request.message}"</div>` : ''}
                                    </div>
                                </div>
                                <div class="flex gap-2 ml-4">
                                    <button class="approve-permission-btn bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm" data-request-id="${request.id}">
                                        Approve
                                    </button>
                                    <button class="reject-permission-btn bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm" data-request-id="${request.id}">
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <!-- Account Requests Section -->
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Pending Account Requests</h2>
        </div>

        ${accountRequests.length === 0 && permissionRequests.length === 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">No pending requests</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">All requests have been processed.</p>
            </div>
        ` : accountRequests.length === 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                <p class="text-gray-500 dark:text-gray-400">No pending account requests</p>
            </div>
        ` : `
            <div class="space-y-4">
                ${accountRequests.map(request => {
                    const org = allOrganizations.find(o => o.id === (request.organizationId || request.organization_id));
                    return `
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                            <div class="flex justify-between items-start">
                                <div class="flex-grow">
                                    <div class="flex items-center gap-3 mb-2">
                                        <h3 class="text-lg font-bold text-gray-900 dark:text-white">${request.username}</h3>
                                        <span class="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                            ${request.requested_role || request.requestedRole}
                                        </span>
                                    </div>
                                    <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                        <div>Email: ${request.email}</div>
                                        <div>Organization: ${org?.name || 'Unknown'}</div>
                                        <div>Requested: ${new Date(request.created_at || request.createdAt).toLocaleString()}</div>
                                        ${request.message ? `<div class="mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded italic">"${request.message}"</div>` : ''}
                                    </div>
                                </div>
                                <div class="flex gap-2 ml-4">
                                    <button class="approve-request-btn bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm" data-request-id="${request.id}">
                                        Approve
                                    </button>
                                    <button class="reject-request-btn bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm" data-request-id="${request.id}">
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `}
    `;

    // Event listeners for account requests
    dom.requestsView.querySelectorAll('.approve-request-btn').forEach(btn => {
        btn.addEventListener('click', () => approveRequest(btn.dataset.requestId));
    });

    dom.requestsView.querySelectorAll('.reject-request-btn').forEach(btn => {
        btn.addEventListener('click', () => rejectRequest(btn.dataset.requestId));
    });

    // Event listeners for permission requests
    dom.requestsView.querySelectorAll('.approve-permission-btn').forEach(btn => {
        btn.addEventListener('click', () => approvePermissionRequest(btn.dataset.requestId));
    });

    dom.requestsView.querySelectorAll('.reject-permission-btn').forEach(btn => {
        btn.addEventListener('click', () => rejectPermissionRequest(btn.dataset.requestId));
    });
}

async function updatePendingBadges() {
    const pending = await authManager.getPendingAccountRequests();
    const count = pending.length;

    if (count > 0) {
        dom.pendingBadge.classList.remove('hidden');
        dom.pendingCount.textContent = count;
        dom.requestsBadge.classList.remove('hidden');
        dom.requestsBadge.textContent = count;
    } else {
        dom.pendingBadge.classList.add('hidden');
        dom.requestsBadge.classList.add('hidden');
    }
}

async function createOrganization() {
    const name = prompt('Enter organization name:');
    if (name && name.trim()) {
        const result = await authManager.createOrganization(name.trim());
        if (result.success) {
            await renderOrganizations();
        } else {
            alert('Error: ' + result.error);
        }
    }
}

function showOrgMenu(event, orgId) {
    const menu = document.createElement('div');
    menu.className = 'fixed bg-white dark:bg-gray-800 shadow-lg rounded-lg py-2 z-50 border border-gray-200 dark:border-gray-700';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.innerHTML = `
        <button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" data-action="rename">Rename</button>
        <button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-red-600" data-action="delete">Delete</button>
    `;

    document.body.appendChild(menu);

    menu.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (action === 'rename') {
            const org = await authManager.getOrganization(orgId);
            const newName = prompt('Enter new name:', org.name);
            if (newName && newName.trim()) {
                await authManager.updateOrganization(orgId, { name: newName.trim() });
                await renderOrganizations();
            }
        } else if (action === 'delete') {
            if (confirm('Delete this organization and all its users? This cannot be undone.')) {
                const result = await authManager.deleteOrganization(orgId);
                if (result.success) {
                    await renderOrganizations();
                } else {
                    alert('Error: ' + result.error);
                }
            }
        }
        document.body.removeChild(menu);
    });

    setTimeout(() => {
        document.addEventListener('click', () => {
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
        }, { once: true });
    }, 0);
}

async function createUser() {
    const organizations = (await authManager.getOrganizations()).filter(org => org.name !== 'SYSTEM');

    const username = prompt('Enter username:');
    if (!username) return;

    const email = prompt('Enter email:');
    if (!email) return;

    const password = prompt('Enter password:');
    if (!password) return;

    const orgList = organizations.map((org, i) => `${i + 1}. ${org.name}`).join('\n');
    const orgChoice = prompt(`Select organization:\n${orgList}\n\nEnter number:`);
    const orgIndex = parseInt(orgChoice) - 1;
    if (orgIndex < 0 || orgIndex >= organizations.length) {
        alert('Invalid organization selection');
        return;
    }

    const roleChoice = prompt('Select role:\n1. Viewer\n2. Editor\n3. Org Admin\n\nEnter number:');
    const roles = ['viewer', 'editor', 'org_admin'];
    const roleIndex = parseInt(roleChoice) - 1;
    if (roleIndex < 0 || roleIndex >= roles.length) {
        alert('Invalid role selection');
        return;
    }

    const result = await authManager.createUser({
        username: username.trim(),
        email: email.trim(),
        password: password,
        organizationId: organizations[orgIndex].id,
        role: roles[roleIndex]
    });

    if (result.success) {
        await renderUsers();
    } else {
        alert('Error: ' + result.error);
    }
}

async function editUser(userId) {
    const user = await authManager.getUser(userId);
    if (!user) return;

    const newRole = prompt(`Change role for ${user.username}:\n1. Viewer\n2. Editor\n3. Org Admin\n\nEnter number (or cancel):`);
    if (!newRole) return;

    const roles = ['viewer', 'editor', 'org_admin'];
    const roleIndex = parseInt(newRole) - 1;
    if (roleIndex < 0 || roleIndex >= roles.length) {
        alert('Invalid role selection');
        return;
    }

    const result = await authManager.updateUser(userId, { role: roles[roleIndex] });
    if (result.success) {
        await renderUsers();
    } else {
        alert('Error: ' + result.error);
    }
}

async function deleteUser(userId) {
    const user = await authManager.getUser(userId);
    if (!user) {
        alert('User not found');
        return;
    }

    if (confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
        console.log('Deleting user:', userId);
        const result = await authManager.deleteUser(userId);
        console.log('Delete result:', result);

        if (result.success) {
            // Verify deletion by trying to fetch the user
            const verifyUser = await authManager.getUser(userId);
            console.log('Verification - user after delete:', verifyUser);

            // Refresh the users view
            await renderUsers();

            if (!verifyUser) {
                alert('User deleted successfully');
            } else {
                alert('Warning: User appears to still exist in database. Please refresh and try again.');
            }
        } else {
            alert('Error: ' + result.error);
        }
    }
}

async function approveRequest(requestId) {
    if (!confirm('Approve this account request? The user will receive an email to set up their account.')) {
        return;
    }

    const result = await authManager.approveAccountRequest(requestId);
    if (result.success) {
        alert(result.message || 'Account request approved! User will receive a confirmation email to set their password.');
        await renderRequests();
        await updatePendingBadges();
    } else {
        alert('Error: ' + result.error);
    }
}

async function rejectRequest(requestId) {
    const reason = prompt('Reason for rejection (optional):');

    const result = await authManager.rejectAccountRequest(requestId, reason || '');
    if (result.success) {
        alert('Account request rejected');
        await renderRequests();
        await updatePendingBadges();
    } else {
        alert('Error: ' + result.error);
    }
}

async function approvePermissionRequest(requestId) {
    if (!confirm('Approve this permission request? The user\'s role will be updated immediately.')) {
        return;
    }

    const { data, error } = await supabase.rpc('approve_permission_request', {
        request_id: requestId
    });

    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert('Permission request approved successfully!');
        await renderRequests();
        await updatePendingBadges();
    }
}

async function rejectPermissionRequest(requestId) {
    const reason = prompt('Reason for rejection (optional):');

    const { data, error } = await supabase.rpc('reject_permission_request', {
        request_id: requestId,
        reason: reason || null
    });

    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert('Permission request rejected');
        await renderRequests();
        await updatePendingBadges();
    }
}

async function renderSharing() {
    const assets = dataManager.getAssets();
    const shares = await sharingManager.getAllShares();
    const organizations = (await authManager.getOrganizations()).filter(org => org.name !== 'SYSTEM');

    dom.sharingView.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Asset Sharing</h2>
            <button id="new-share-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                + Share Asset
            </button>
        </div>

        ${shares.length === 0 && assets.length === 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">No assets shared yet</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Start sharing assets with other organizations.</p>
            </div>
        ` : `
            <!-- Current Assets -->
            <div class="mb-8">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your Assets</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${assets.length === 0 ? `
                        <div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                            <p class="text-gray-500 dark:text-gray-400">No assets in current organization</p>
                        </div>
                    ` : assets.map(asset => `
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                            <div class="flex justify-between items-start mb-2">
                                <h4 class="font-semibold text-gray-900 dark:text-white">${asset.name}</h4>
                                <button class="share-asset-btn text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm" data-asset-id="${asset.id}">
                                    Share
                                </button>
                            </div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">
                                <div>${asset.vessels?.length || 0} vessels</div>
                                <div>${asset.vessels?.reduce((sum, v) => sum + (v.scans?.length || 0), 0) || 0} scans</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Active Shares -->
            <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Active Shares</h3>
                <div class="space-y-4">
                    ${shares.length === 0 ? `
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                            <p class="text-gray-500 dark:text-gray-400">No active shares</p>
                        </div>
                    ` : shares.map(share => {
                        const shareType = share.share_type || share.shareType;
                        const permission = share.permission;
                        const ownerOrg = share.owner_org || { name: 'Unknown' };
                        const sharedWithOrg = share.shared_with_org || { name: 'Unknown' };
                        const assetId = share.asset_id || share.assetId;
                        const vesselId = share.vessel_id || share.vesselId;
                        const scanId = share.scan_id || share.scanId;

                        return `
                            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <div class="flex justify-between items-start">
                                    <div class="flex-grow">
                                        <div class="flex items-center gap-3 mb-2">
                                            <h4 class="text-lg font-bold text-gray-900 dark:text-white">${assetId}</h4>
                                            <span class="px-2 py-1 rounded text-xs font-medium ${
                                                shareType === 'asset' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                                shareType === 'vessel' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                                'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                            }">
                                                ${shareType}
                                            </span>
                                            <span class="px-2 py-1 rounded text-xs font-medium ${
                                                permission === 'edit' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                            }">
                                                ${permission}
                                            </span>
                                        </div>
                                        <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                            <div>From: <span class="font-medium">${ownerOrg.name}</span></div>
                                            <div>To: <span class="font-medium">${sharedWithOrg.name}</span></div>
                                            ${vesselId ? `<div>Vessel: ${vesselId}</div>` : ''}
                                            ${scanId ? `<div>Scan: ${scanId}</div>` : ''}
                                            <div class="text-xs mt-2">Shared: ${new Date(share.created_at || share.createdAt).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div class="flex gap-2 ml-4">
                                        <button class="edit-share-btn text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm" data-share-id="${share.id}">
                                            Edit
                                        </button>
                                        <button class="remove-share-btn text-red-600 hover:text-red-800 dark:text-red-400 text-sm" data-share-id="${share.id}">
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `}
    `;

    // Event listeners
    const newShareBtn = dom.sharingView.querySelector('#new-share-btn');
    if (newShareBtn) {
        newShareBtn.addEventListener('click', createShare);
    }

    dom.sharingView.querySelectorAll('.share-asset-btn').forEach(btn => {
        btn.addEventListener('click', () => shareAsset(btn.dataset.assetId));
    });

    dom.sharingView.querySelectorAll('.edit-share-btn').forEach(btn => {
        btn.addEventListener('click', () => editShare(btn.dataset.shareId));
    });

    dom.sharingView.querySelectorAll('.remove-share-btn').forEach(btn => {
        btn.addEventListener('click', () => removeShare(btn.dataset.shareId));
    });
}

async function createShare() {
    const assets = dataManager.getAssets();
    if (assets.length === 0) {
        alert('No assets available to share in the current organization');
        return;
    }

    const organizations = (await authManager.getOrganizations()).filter(org =>
        org.name !== 'SYSTEM' && org.id !== authManager.getCurrentOrganizationId()
    );

    if (organizations.length === 0) {
        alert('No other organizations available to share with');
        return;
    }

    // Select asset
    const assetList = assets.map((a, i) => `${i + 1}. ${a.name}`).join('\n');
    const assetChoice = prompt(`Select asset to share:\n${assetList}\n\nEnter number:`);
    const assetIndex = parseInt(assetChoice) - 1;
    if (assetIndex < 0 || assetIndex >= assets.length) {
        alert('Invalid asset selection');
        return;
    }
    const selectedAsset = assets[assetIndex];

    // Select share level
    const shareLevel = prompt('Share level:\n1. Entire asset\n2. Specific vessel\n3. Specific scan\n\nEnter number:');
    let vesselId = null;
    let scanId = null;

    if (shareLevel === '2' || shareLevel === '3') {
        if (selectedAsset.vessels.length === 0) {
            alert('No vessels in this asset');
            return;
        }
        const vesselList = selectedAsset.vessels.map((v, i) => `${i + 1}. ${v.name}`).join('\n');
        const vesselChoice = prompt(`Select vessel:\n${vesselList}\n\nEnter number:`);
        const vesselIndex = parseInt(vesselChoice) - 1;
        if (vesselIndex < 0 || vesselIndex >= selectedAsset.vessels.length) {
            alert('Invalid vessel selection');
            return;
        }
        vesselId = selectedAsset.vessels[vesselIndex].id;

        if (shareLevel === '3') {
            const selectedVessel = selectedAsset.vessels[vesselIndex];
            if (selectedVessel.scans.length === 0) {
                alert('No scans in this vessel');
                return;
            }
            const scanList = selectedVessel.scans.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
            const scanChoice = prompt(`Select scan:\n${scanList}\n\nEnter number:`);
            const scanIndex = parseInt(scanChoice) - 1;
            if (scanIndex < 0 || scanIndex >= selectedVessel.scans.length) {
                alert('Invalid scan selection');
                return;
            }
            scanId = selectedVessel.scans[scanIndex].id;
        }
    }

    // Select organization
    const orgList = organizations.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
    const orgChoice = prompt(`Share with organization:\n${orgList}\n\nEnter number:`);
    const orgIndex = parseInt(orgChoice) - 1;
    if (orgIndex < 0 || orgIndex >= organizations.length) {
        alert('Invalid organization selection');
        return;
    }

    // Select permission
    const permission = prompt('Permission level:\n1. View only\n2. Edit\n\nEnter number:') === '2' ? 'edit' : 'view';

    const result = await sharingManager.shareAsset({
        assetId: selectedAsset.id,
        vesselId,
        scanId,
        sharedWithOrganizationId: organizations[orgIndex].id,
        permission
    });

    if (result.success) {
        alert('Asset shared successfully');
        await renderSharing();
    } else {
        alert('Error: ' + result.error);
    }
}

async function shareAsset(assetId) {
    const asset = dataManager.getAsset(assetId);
    if (!asset) return;

    const organizations = (await authManager.getOrganizations()).filter(org =>
        org.name !== 'SYSTEM' && org.id !== authManager.getCurrentOrganizationId()
    );

    if (organizations.length === 0) {
        alert('No other organizations available to share with');
        return;
    }

    const orgList = organizations.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
    const orgChoice = prompt(`Share "${asset.name}" with:\n${orgList}\n\nEnter number:`);
    const orgIndex = parseInt(orgChoice) - 1;
    if (orgIndex < 0 || orgIndex >= organizations.length) {
        return;
    }

    const permission = prompt('Permission level:\n1. View only\n2. Edit\n\nEnter number:') === '2' ? 'edit' : 'view';

    const result = await sharingManager.shareAsset({
        assetId: asset.id,
        sharedWithOrganizationId: organizations[orgIndex].id,
        permission
    });

    if (result.success) {
        alert('Asset shared successfully');
        await renderSharing();
    } else {
        alert('Error: ' + result.error);
    }
}

async function editShare(shareId) {
    const permission = prompt('Update permission level:\n1. View only\n2. Edit\n\nEnter number:') === '2' ? 'edit' : 'view';

    const result = await sharingManager.updateSharePermission(shareId, permission);
    if (result.success) {
        alert('Share updated successfully');
        await renderSharing();
    } else {
        alert('Error: ' + result.error);
    }
}

async function removeShare(shareId) {
    if (!confirm('Remove this share? The organization will no longer have access to this asset.')) {
        return;
    }

    const result = await sharingManager.removeShare(shareId);
    if (result.success) {
        alert('Share removed successfully');
        await renderSharing();
    } else {
        alert('Error: ' + result.error);
    }
}

function addEventListeners() {
    dom.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
}

export default {
    init: async (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        cacheDom();

        await authManager.ensureInitialized();
        await dataManager.ensureInitialized();
        await sharingManager.ensureInitialized();

        addEventListeners();
        await updatePendingBadges();
        await switchView('overview');
    },

    destroy: () => {
        if (container) {
            container.innerHTML = '';
        }
    },

    refresh: async () => {
        await updatePendingBadges();
        await switchView(currentView);
    }
};
