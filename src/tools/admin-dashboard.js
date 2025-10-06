// Admin Dashboard Module - User and Organization Management
import authManager, { ROLES, PERMISSIONS } from '../auth-manager.js';
import dataManager from '../data-manager.js';

let container, dom = {};
let currentView = 'overview'; // 'overview', 'organizations', 'users', 'requests'

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
        </div>
    </div>

    <!-- Content Area -->
    <div class="flex-grow overflow-y-auto p-6">
        <div id="overview-view"></div>
        <div id="organizations-view" class="hidden"></div>
        <div id="users-view" class="hidden"></div>
        <div id="requests-view" class="hidden"></div>
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

    // Render view
    if (view === 'overview') await renderOverview();
    else if (view === 'organizations') await renderOrganizations();
    else if (view === 'users') await renderUsers();
    else if (view === 'requests') await renderRequests();
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
                            const org = authManager.getOrganization(user.organizationId);
                            return `
                                <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                                    <div>
                                        <div class="font-semibold text-gray-900 dark:text-white">${user.username}</div>
                                        <div class="text-sm text-gray-600 dark:text-gray-400">${org?.name || 'Unknown'} - ${user.role}</div>
                                    </div>
                                    <span class="px-2 py-1 rounded text-xs font-medium ${
                                        user.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                    }">
                                        ${user.isActive ? 'Active' : 'Inactive'}
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
                        const org = authManager.getOrganization(user.organizationId);
                        return `
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="font-semibold text-gray-900 dark:text-white">${user.username}</div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400">${user.email}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                    ${org?.name || 'Unknown'}
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
                                        user.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                    }">
                                        ${user.isActive ? 'Active' : 'Inactive'}
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
    const requests = await authManager.getPendingAccountRequests();
    console.log('Pending requests:', requests);
    const allOrganizations = await authManager.getOrganizations();

    dom.requestsView.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Pending Account Requests</h2>
        </div>

        ${requests.length === 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">No pending requests</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">All account requests have been processed.</p>
            </div>
        ` : `
            <div class="space-y-4">
                ${requests.map(request => {
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

    // Event listeners
    dom.requestsView.querySelectorAll('.approve-request-btn').forEach(btn => {
        btn.addEventListener('click', () => approveRequest(btn.dataset.requestId));
    });

    dom.requestsView.querySelectorAll('.reject-request-btn').forEach(btn => {
        btn.addEventListener('click', () => rejectRequest(btn.dataset.requestId));
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
            const org = authManager.getOrganization(orgId);
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
    const user = authManager.getUser(userId);
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
    const user = authManager.getUser(userId);
    if (!user) return;

    if (confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
        const result = await authManager.deleteUser(userId);
        if (result.success) {
            await renderUsers();
        } else {
            alert('Error: ' + result.error);
        }
    }
}

async function approveRequest(requestId) {
    const password = prompt('Set password for new user:');
    if (!password) return;

    const result = await authManager.approveAccountRequest(requestId, password);
    if (result.success) {
        alert('Account request approved!');
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
