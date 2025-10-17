// Admin Dashboard Module - User and Organization Management
import authManager, { ROLES, PERMISSIONS } from '../auth-manager.js';
import dataManager from '../data-manager.js';
import sharingManager from '../sharing-manager.js';
import supabase from '../supabase-client.js';
import { createAnimatedHeader } from '../animated-background.js';
import adminConfig from '../admin-config.js';

let container, dom = {};
let currentView = 'overview'; // 'overview', 'organizations', 'users', 'assets', 'requests', 'sharing', 'configuration'

const HTML = `
<div class="h-full flex flex-col overflow-hidden">
    <!-- Animated Header -->
    <div id="admin-header-container" style="flex-shrink: 0;"></div>

    <!-- Navigation Tabs -->
    <div class="glass-panel" style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); border-radius: 0; flex-shrink: 0; padding: 0;">
        <div class="flex px-6">
            <button data-view="overview" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
                Overview
            </button>
            <button data-view="organizations" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:text-white" style="color: rgba(255, 255, 255, 0.6);">
                Organizations
            </button>
            <button data-view="users" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:text-white" style="color: rgba(255, 255, 255, 0.6);">
                Users
            </button>
            <button data-view="assets" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:text-white" style="color: rgba(255, 255, 255, 0.6);">
                Assets
            </button>
            <button data-view="requests" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:text-white" style="color: rgba(255, 255, 255, 0.6);">
                Account Requests
                <span id="requests-badge" class="hidden ml-2 glass-badge badge-red text-xs">0</span>
            </button>
            <button data-view="sharing" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:text-white" style="color: rgba(255, 255, 255, 0.6);">
                Asset Sharing
            </button>
            <button data-view="configuration" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:text-white" style="color: rgba(255, 255, 255, 0.6);">
                Configuration
            </button>
        </div>
    </div>

    <!-- Content Area -->
    <div class="flex-grow overflow-y-auto glass-scrollbar p-6">
        <div id="overview-view"></div>
        <div id="organizations-view" class="hidden"></div>
        <div id="users-view" class="hidden"></div>
        <div id="assets-view" class="hidden"></div>
        <div id="requests-view" class="hidden"></div>
        <div id="sharing-view" class="hidden"></div>
        <div id="configuration-view" class="hidden"></div>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#admin-header-container'),
        requestsBadge: q('#requests-badge'),
        overviewView: q('#overview-view'),
        organizationsView: q('#organizations-view'),
        usersView: q('#users-view'),
        assetsView: q('#assets-view'),
        requestsView: q('#requests-view'),
        sharingView: q('#sharing-view'),
        configurationView: q('#configuration-view'),
        tabBtns: container.querySelectorAll('.tab-btn')
    };

    // Initialize animated header
    const header = createAnimatedHeader(
        'Admin Dashboard',
        'Manage users, organizations, and permissions',
        { height: '180px', particleCount: 15, waveIntensity: 0.4 }
    );
    dom.headerContainer.appendChild(header);
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
    dom.assetsView.classList.toggle('hidden', view !== 'assets');
    dom.requestsView.classList.toggle('hidden', view !== 'requests');
    dom.sharingView.classList.toggle('hidden', view !== 'sharing');
    dom.configurationView.classList.toggle('hidden', view !== 'configuration');

    // Render view
    if (view === 'overview') await renderOverview();
    else if (view === 'organizations') await renderOrganizations();
    else if (view === 'users') await renderUsers();
    else if (view === 'assets') await renderAssets();
    else if (view === 'requests') await renderRequests();
    else if (view === 'sharing') await renderSharing();
    else if (view === 'configuration') await renderConfiguration();
}

async function renderOverview() {
    try {
        const orgStats = await dataManager.getAllOrganizationStats();
        const users = await authManager.getUsers();
        const pendingRequests = await authManager.getPendingAccountRequests();

        console.log('Overview data:', { orgStats, users: users.length, pendingRequests: pendingRequests.length });

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
    } catch (error) {
        console.error('Error rendering overview:', error);
        dom.overviewView.innerHTML = `
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Error Loading Overview</h3>
                <p class="text-red-700 dark:text-red-300">${error.message || 'Unknown error occurred'}</p>
            </div>
        `;
    }
}

async function renderOrganizations() {
    try {
        const organizations = (await authManager.getOrganizations()).filter(org => org.name !== 'SYSTEM');
        const orgStats = await dataManager.getAllOrganizationStats();
        const allUsers = await authManager.getUsers();

        console.log('Organizations data:', { orgs: organizations.length, stats: orgStats.length, users: allUsers.length });

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
    } catch (error) {
        console.error('Error rendering organizations:', error);
        dom.organizationsView.innerHTML = `
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Error Loading Organizations</h3>
                <p class="text-red-700 dark:text-red-300">${error.message || 'Unknown error occurred'}</p>
            </div>
        `;
    }
}

async function renderUsers() {
    try {
        const users = await authManager.getUsers();

        console.log('Users data:', { users: users.length });

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
    } catch (error) {
        console.error('Error rendering users:', error);
        dom.usersView.innerHTML = `
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Error Loading Users</h3>
                <p class="text-red-700 dark:text-red-300">${error.message || 'Unknown error occurred'}</p>
            </div>
        `;
    }
}

async function renderAssets() {
    try {
        const allAssets = dataManager.getAssets();
        const organizations = await authManager.getOrganizations();
        const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

        if (!isSystemOrg) {
            dom.assetsView.innerHTML = `
                <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
                    <h3 class="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-2">Restricted Access</h3>
                    <p class="text-yellow-700 dark:text-yellow-300">Asset management is only available to SYSTEM organization users.</p>
                </div>
            `;
            return;
        }

        // Group assets by organization
        const assetsByOrg = {};
        allAssets.forEach(asset => {
            const orgId = asset.organizationId || asset.organization_id;
            if (!assetsByOrg[orgId]) {
                assetsByOrg[orgId] = [];
            }
            assetsByOrg[orgId].push(asset);
        });

        dom.assetsView.innerHTML = `
            <div class="mb-6 flex justify-between items-center">
                <div>
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Asset Management</h2>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Manage assets across all organizations (${allAssets.length} total assets)
                    </p>
                </div>
                <button id="bulk-transfer-btn" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                    Bulk Transfer
                </button>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead class="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th class="px-6 py-3 text-left">
                                <input type="checkbox" id="select-all-assets" class="rounded border-gray-300 dark:border-gray-600" aria-label="Select all assets">
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Asset Name</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Organization</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vessels</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        ${allAssets.length === 0 ? `
                            <tr>
                                <td colspan="6" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                    No assets found in the system
                                </td>
                            </tr>
                        ` : allAssets.map(asset => {
                            const orgId = asset.organizationId || asset.organization_id;
                            const org = organizations.find(o => o.id === orgId);
                            const vesselCount = asset.vessels?.length || 0;
                            const createdDate = new Date(asset.createdAt || asset.created_at).toLocaleDateString();

                            return `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <input type="checkbox" class="asset-checkbox rounded border-gray-300 dark:border-gray-600" data-asset-id="${asset.id}" aria-label="Select asset ${asset.name}">
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="font-semibold text-gray-900 dark:text-white">${asset.name}</div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">${asset.id}</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                            ${org?.name || 'Unknown'}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        ${vesselCount} vessel${vesselCount !== 1 ? 's' : ''}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${createdDate}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <button class="transfer-asset-btn text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 mr-3" data-asset-id="${asset.id}">
                                            Transfer
                                        </button>
                                        <button class="view-asset-btn text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300" data-asset-id="${asset.id}">
                                            View
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Organization Summary -->
            <div class="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${organizations.filter(org => org.name !== 'SYSTEM').map(org => {
                    const orgAssets = assetsByOrg[org.id] || [];
                    return `
                        <div class="glass-panel p-4">
                            <div class="font-semibold text-gray-900 dark:text-white mb-2">${org.name}</div>
                            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">${orgAssets.length}</div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">asset${orgAssets.length !== 1 ? 's' : ''}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // Event listeners
        const selectAllCheckbox = dom.assetsView.querySelector('#select-all-assets');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                dom.assetsView.querySelectorAll('.asset-checkbox').forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });
        }

        dom.assetsView.querySelectorAll('.transfer-asset-btn').forEach(btn => {
            btn.addEventListener('click', () => transferSingleAsset(btn.dataset.assetId));
        });

        dom.assetsView.querySelectorAll('.view-asset-btn').forEach(btn => {
            btn.addEventListener('click', () => viewAssetDetails(btn.dataset.assetId));
        });

        const bulkTransferBtn = dom.assetsView.querySelector('#bulk-transfer-btn');
        if (bulkTransferBtn) {
            bulkTransferBtn.addEventListener('click', bulkTransferAssets);
        }

    } catch (error) {
        console.error('Error rendering assets:', error);
        dom.assetsView.innerHTML = `
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Error Loading Assets</h3>
                <p class="text-red-700 dark:text-red-300">${error.message || 'Unknown error occurred'}</p>
            </div>
        `;
    }
}

async function renderRequests() {
    try {
        const accountRequests = await authManager.getPendingAccountRequests();
        const allOrganizations = await authManager.getOrganizations();

        // Get permission requests if using Supabase
        let permissionRequests = [];
        if (authManager.isUsingSupabase()) {
            const { data, error } = await supabase
                .from('permission_requests')
                .select('*, profiles!user_id(username, email, organizations(name))')
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching permission requests:', error);
            } else {
                permissionRequests = data || [];
            }
        }

        console.log('Requests data:', { accountRequests: accountRequests.length, permissionRequests: permissionRequests.length });

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
    } catch (error) {
        console.error('Error rendering requests:', error);
        dom.requestsView.innerHTML = `
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Error Loading Requests</h3>
                <p class="text-red-700 dark:text-red-300">${error.message || 'Unknown error occurred'}</p>
            </div>
        `;
    }
}

async function updatePendingBadges() {
    const pending = await authManager.getPendingAccountRequests();
    const count = pending.length;

    if (count > 0) {
        if (dom.pendingBadge) {
            dom.pendingBadge.classList.remove('hidden');
            if (dom.pendingCount) dom.pendingCount.textContent = count;
        }
        if (dom.requestsBadge) {
            dom.requestsBadge.classList.remove('hidden');
            dom.requestsBadge.textContent = count;
        }
    } else {
        if (dom.pendingBadge) dom.pendingBadge.classList.add('hidden');
        if (dom.requestsBadge) dom.requestsBadge.classList.add('hidden');
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
        if (document.body.contains(menu)) {
            document.body.removeChild(menu);
        }
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
        const result = await authManager.deleteUser(userId);

        if (result.success) {
            alert('User deleted successfully');
            await renderUsers();
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
    try {
        const assets = dataManager.getAssets();
        const shares = await sharingManager.getAllShares();
        const accessRequests = await sharingManager.getPendingAccessRequests();
        const organizations = (await authManager.getOrganizations()).filter(org => org.name !== 'SYSTEM');

        console.log('Sharing data:', { assets: assets.length, shares: shares.length, accessRequests: accessRequests.length, orgs: organizations.length });

        dom.sharingView.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Asset Sharing</h2>
                ${accessRequests.length > 0 ? `
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        <span class="text-red-600 font-semibold">${accessRequests.length}</span> pending access request${accessRequests.length > 1 ? 's' : ''}
                    </p>
                ` : ''}
            </div>
            <button id="new-share-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                + Share Asset
            </button>
        </div>

        ${shares.length === 0 && assets.length === 0 && accessRequests.length === 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">No assets shared yet</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Start sharing assets with other organizations.</p>
            </div>
        ` : `
            <!-- Pending Access Requests -->
            ${accessRequests.length > 0 ? `
                <div class="mb-8">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pending Access Requests</h3>
                    <div class="space-y-4">
                        ${accessRequests.map(request => `
                            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <div class="flex justify-between items-start">
                                    <div class="flex-grow">
                                        <div class="flex items-center gap-3 mb-2">
                                            <h4 class="text-lg font-bold text-gray-900 dark:text-white">${request.username}</h4>
                                            <span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                                ${request.user_org_name}
                                            </span>
                                            <span class="px-2 py-1 rounded text-xs font-medium ${
                                                request.requested_permission === 'edit' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                            }">
                                                ${request.requested_permission}
                                            </span>
                                        </div>
                                        <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                            <div>Email: ${request.user_email}</div>
                                            <div>Asset: <span class="font-medium">${request.asset_id}</span></div>
                                            ${request.vessel_id ? `<div>Vessel: ${request.vessel_id}</div>` : ''}
                                            ${request.scan_id ? `<div>Scan: ${request.scan_id}</div>` : ''}
                                            ${request.message ? `<div class="mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded italic">"${request.message}"</div>` : ''}
                                            <div class="text-xs mt-2">Requested: ${new Date(request.created_at).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div class="flex gap-2 ml-4">
                                        <button class="approve-access-request-btn bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm" data-request-id="${request.request_id}">
                                            Approve
                                        </button>
                                        <button class="reject-access-request-btn bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm" data-request-id="${request.request_id}">
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

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

    dom.sharingView.querySelectorAll('.approve-access-request-btn').forEach(btn => {
        btn.addEventListener('click', () => approveAccessRequest(btn.dataset.requestId));
    });

    dom.sharingView.querySelectorAll('.reject-access-request-btn').forEach(btn => {
        btn.addEventListener('click', () => rejectAccessRequest(btn.dataset.requestId));
    });
    } catch (error) {
        console.error('Error rendering sharing:', error);
        dom.sharingView.innerHTML = `
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Error Loading Sharing</h3>
                <p class="text-red-700 dark:text-red-300">${error.message || 'Unknown error occurred'}</p>
            </div>
        `;
    }
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

async function approveAccessRequest(requestId) {
    if (!confirm('Approve this access request? This will automatically create a share for the requesting organization.')) {
        return;
    }

    const result = await sharingManager.approveAccessRequest(requestId);
    if (result.success) {
        alert(result.message || 'Access request approved and share created');
        await renderSharing();
    } else {
        alert('Error: ' + result.error);
    }
}

async function rejectAccessRequest(requestId) {
    const reason = prompt('Reason for rejection (optional):');

    const result = await sharingManager.rejectAccessRequest(requestId, reason || '');
    if (result.success) {
        alert('Access request rejected');
        await renderSharing();
    } else {
        alert('Error: ' + result.error);
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function renderConfiguration() {
    try {
        await adminConfig.ensureInitialized();
        const config = adminConfig.getAllConfig();
        const metadata = adminConfig.getListMetadata();

        console.log('Configuration data:', { config, metadata });

        dom.configurationView.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Report Field Configuration</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Manage suggested values for report fields across the system
                </p>
            </div>
            <div class="flex gap-2">
                <button id="export-config-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    Export Config
                </button>
                <button id="import-config-btn" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm">
                    Import Config
                </button>
                <button id="reset-all-config-btn" class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm">
                    Reset All
                </button>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            ${Object.keys(metadata).map(listName => {
                const list = config[listName] || [];
                const meta = metadata[listName];
                return `
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
                        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                            <div class="flex justify-between items-center">
                                <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                                    ${meta.icon} ${meta.label}
                                </h3>
                                <div class="flex gap-2">
                                    <button class="add-item-btn text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium" data-list="${listName}">
                                        + Add
                                    </button>
                                    <button class="reset-list-btn text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-medium" data-list="${listName}">
                                        Reset
                                    </button>
                                </div>
                            </div>
                            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                ${list.length} item${list.length !== 1 ? 's' : ''}
                            </div>
                        </div>
                        <div class="p-4 max-h-80 overflow-y-auto">
                            ${list.length === 0 ? `
                                <div class="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                                    No items configured
                                </div>
                            ` : `
                                <div class="space-y-2">
                                    ${list.map((item, index) => `
                                        <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            <span class="text-sm text-gray-900 dark:text-white flex-grow">${escapeHtml(item)}</span>
                                            <div class="flex gap-2 ml-4">
                                                <button class="edit-item-btn text-blue-600 hover:text-blue-800 dark:text-blue-400 text-xs" data-list="${listName}" data-index="${index}">
                                                    Edit
                                                </button>
                                                <button class="delete-item-btn text-red-600 hover:text-red-800 dark:text-red-400 text-xs" data-list="${listName}" data-index="${index}">
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Event listeners
    const exportBtn = dom.configurationView.querySelector('#export-config-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportConfiguration);
    }

    const importBtn = dom.configurationView.querySelector('#import-config-btn');
    if (importBtn) {
        importBtn.addEventListener('click', importConfiguration);
    }

    const resetAllBtn = dom.configurationView.querySelector('#reset-all-config-btn');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', resetAllConfiguration);
    }

    // Add item buttons
    dom.configurationView.querySelectorAll('.add-item-btn').forEach(btn => {
        btn.addEventListener('click', () => addConfigItem(btn.dataset.list));
    });

    // Reset list buttons
    dom.configurationView.querySelectorAll('.reset-list-btn').forEach(btn => {
        btn.addEventListener('click', () => resetConfigList(btn.dataset.list));
    });

    // Edit item buttons
    dom.configurationView.querySelectorAll('.edit-item-btn').forEach(btn => {
        btn.addEventListener('click', () => editConfigItem(btn.dataset.list, parseInt(btn.dataset.index)));
    });

    // Delete item buttons
    dom.configurationView.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteConfigItem(btn.dataset.list, parseInt(btn.dataset.index)));
    });
    } catch (error) {
        console.error('Error rendering configuration:', error);
        dom.configurationView.innerHTML = `
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Error Loading Configuration</h3>
                <p class="text-red-700 dark:text-red-300">${error.message || 'Unknown error occurred'}</p>
            </div>
        `;
    }
}

async function addConfigItem(listName) {
    const metadata = adminConfig.getListMetadata();
    const meta = metadata[listName];

    const newItem = prompt(`Add new ${meta.label.toLowerCase()} item:`);
    if (newItem && newItem.trim()) {
        const result = await adminConfig.addItem(listName, newItem);
        if (result.success) {
            await renderConfiguration();
        } else {
            alert('Error: ' + result.error);
        }
    }
}

async function editConfigItem(listName, itemIndex) {
    const metadata = adminConfig.getListMetadata();
    const meta = metadata[listName];
    const list = adminConfig.getList(listName);
    const oldItem = list[itemIndex];

    if (!oldItem) {
        alert('Error: Item not found');
        return;
    }

    const newItem = prompt(`Edit ${meta.label.toLowerCase()} item:`, oldItem);
    if (newItem && newItem.trim() && newItem !== oldItem) {
        const result = await adminConfig.updateItem(listName, oldItem, newItem);
        if (result.success) {
            await renderConfiguration();
        } else {
            alert('Error: ' + result.error);
        }
    }
}

async function deleteConfigItem(listName, itemIndex) {
    const metadata = adminConfig.getListMetadata();
    const meta = metadata[listName];
    const list = adminConfig.getList(listName);
    const item = list[itemIndex];

    if (!item) {
        alert('Error: Item not found');
        return;
    }

    if (confirm(`Delete "${item}" from ${meta.label.toLowerCase()}?`)) {
        const result = await adminConfig.removeItem(listName, item);
        if (result.success) {
            await renderConfiguration();
        } else {
            alert('Error: ' + result.error);
        }
    }
}

async function resetConfigList(listName) {
    const metadata = adminConfig.getListMetadata();
    const meta = metadata[listName];

    if (confirm(`Reset ${meta.label} to default values? This will overwrite all custom items.`)) {
        const result = await adminConfig.resetList(listName);
        if (result.success) {
            await renderConfiguration();
        } else {
            alert('Error: ' + result.error);
        }
    }
}

async function exportConfiguration() {
    try {
        const config = adminConfig.exportConfig();
        const blob = new Blob([config], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ndt-suite-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        alert('Error exporting configuration: ' + error.message);
    }
}

async function importConfiguration() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const result = await adminConfig.importConfig(text);
            if (result.success) {
                alert('Configuration imported successfully!');
                await renderConfiguration();
            } else {
                alert('Error importing configuration: ' + result.error);
            }
        } catch (error) {
            alert('Error reading file: ' + error.message);
        }
    };

    input.click();
}

async function resetAllConfiguration() {
    if (confirm('Reset ALL configuration lists to defaults? This will overwrite all custom values across all lists.')) {
        const result = await adminConfig.resetAllToDefaults();
        if (result.success) {
            alert('All configuration lists reset to defaults');
            await renderConfiguration();
        } else {
            alert('Error: ' + result.error);
        }
    }
}

function showTransferModal(assetId, assetName, organizations, onConfirm) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">Transfer Asset</h3>
            </div>
            <div class="p-6">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Asset: <span class="font-semibold">${assetName}</span>
                    </label>
                </div>
                <div class="mb-4">
                    <label for="target-org-select" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Transfer to Organization:
                    </label>
                    <select id="target-org-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">Select an organization...</option>
                        ${organizations.map(org => `
                            <option value="${org.id}">${org.name}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
                    <p class="text-sm text-yellow-800 dark:text-yellow-200">
                        ⚠️ This will move the asset and all its vessels, scans, and data to the selected organization.
                    </p>
                </div>
            </div>
            <div class="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button id="cancel-transfer-btn" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    Cancel
                </button>
                <button id="confirm-transfer-btn" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Transfer Asset
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const select = modal.querySelector('#target-org-select');
    const confirmBtn = modal.querySelector('#confirm-transfer-btn');
    const cancelBtn = modal.querySelector('#cancel-transfer-btn');

    // Enable/disable confirm button based on selection
    select.addEventListener('change', () => {
        confirmBtn.disabled = !select.value;
    });

    // Initially disable confirm button
    confirmBtn.disabled = true;

    // Close modal function
    const closeModal = () => {
        document.body.removeChild(modal);
    };

    // Cancel button
    cancelBtn.addEventListener('click', closeModal);

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Confirm button
    confirmBtn.addEventListener('click', () => {
        const targetOrgId = select.value;
        if (targetOrgId) {
            const targetOrg = organizations.find(org => org.id === targetOrgId);
            closeModal();
            onConfirm(targetOrgId, targetOrg.name);
        }
    });
}

async function transferSingleAsset(assetId) {
    const asset = dataManager.getAsset(assetId);
    if (!asset) {
        alert('Asset not found');
        return;
    }

    const organizations = (await authManager.getOrganizations()).filter(org => {
        const orgId = asset.organizationId || asset.organization_id;
        return org.name !== 'SYSTEM' && org.id !== orgId;
    });

    if (organizations.length === 0) {
        alert('No other organizations available for transfer');
        return;
    }

    showTransferModal(assetId, asset.name, organizations, async (targetOrgId, targetOrgName) => {
        try {
            await dataManager.transferAsset(assetId, targetOrgId);
            alert(`✓ Asset "${asset.name}" successfully transferred to ${targetOrgName}`);
            await renderAssets();
        } catch (error) {
            alert('✗ Transfer failed: ' + error.message);
        }
    });
}

function showBulkTransferModal(assetCount, organizations, onConfirm) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">Bulk Transfer Assets</h3>
            </div>
            <div class="p-6">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Selected Assets: <span class="font-semibold text-blue-600 dark:text-blue-400">${assetCount}</span>
                    </label>
                </div>
                <div class="mb-4">
                    <label for="bulk-target-org-select" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Transfer all to Organization:
                    </label>
                    <select id="bulk-target-org-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">Select an organization...</option>
                        ${organizations.map(org => `
                            <option value="${org.id}">${org.name}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
                    <p class="text-sm text-yellow-800 dark:text-yellow-200">
                        ⚠️ This will move all ${assetCount} selected asset(s) and their associated data to the selected organization.
                    </p>
                </div>
            </div>
            <div class="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button id="cancel-bulk-transfer-btn" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    Cancel
                </button>
                <button id="confirm-bulk-transfer-btn" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Transfer ${assetCount} Asset${assetCount !== 1 ? 's' : ''}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const select = modal.querySelector('#bulk-target-org-select');
    const confirmBtn = modal.querySelector('#confirm-bulk-transfer-btn');
    const cancelBtn = modal.querySelector('#cancel-bulk-transfer-btn');

    // Enable/disable confirm button based on selection
    select.addEventListener('change', () => {
        confirmBtn.disabled = !select.value;
    });

    // Initially disable confirm button
    confirmBtn.disabled = true;

    // Close modal function
    const closeModal = () => {
        document.body.removeChild(modal);
    };

    // Cancel button
    cancelBtn.addEventListener('click', closeModal);

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Confirm button
    confirmBtn.addEventListener('click', () => {
        const targetOrgId = select.value;
        if (targetOrgId) {
            const targetOrg = organizations.find(org => org.id === targetOrgId);
            closeModal();
            onConfirm(targetOrgId, targetOrg.name);
        }
    });
}

async function bulkTransferAssets() {
    const selectedCheckboxes = dom.assetsView.querySelectorAll('.asset-checkbox:checked');
    const selectedAssetIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.assetId);

    if (selectedAssetIds.length === 0) {
        alert('Please select at least one asset to transfer');
        return;
    }

    const organizations = (await authManager.getOrganizations()).filter(org => org.name !== 'SYSTEM');

    if (organizations.length === 0) {
        alert('No organizations available for transfer');
        return;
    }

    showBulkTransferModal(selectedAssetIds.length, organizations, async (targetOrgId, targetOrgName) => {
        try {
            const results = await dataManager.bulkTransferAssets(selectedAssetIds, targetOrgId);

            let message = '';
            if (results.success.length > 0) {
                message += `✓ Successfully transferred ${results.success.length} asset(s) to ${targetOrgName}\n`;
            }
            if (results.failed.length > 0) {
                message += `\n✗ Failed to transfer ${results.failed.length} asset(s):\n`;
                results.failed.forEach(f => {
                    const asset = dataManager.getAsset(f.assetId);
                    const assetName = asset?.name || f.assetId;
                    message += `  - ${assetName}: ${f.error}\n`;
                });
            }

            alert(message);
            await renderAssets();
        } catch (error) {
            alert('✗ Bulk transfer failed: ' + error.message);
        }
    });
}

async function viewAssetDetails(assetId) {
    // Switch to Data Hub and navigate to the asset
    const event = new CustomEvent('navigate-to-tool', {
        detail: {
            toolName: 'data-hub',
            assetId: assetId
        }
    });
    window.dispatchEvent(event);
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
        await adminConfig.ensureInitialized();

        addEventListeners();
        await updatePendingBadges();
        await switchView('overview');
    },

    destroy: () => {
        // Destroy animated background
        const headerContainer = container?.querySelector('#admin-header-container');
        if (headerContainer) {
            const animContainer = headerContainer.querySelector('.animated-header-container');
            if (animContainer && animContainer._animationInstance) {
                animContainer._animationInstance.destroy();
            }
        }

        if (container) {
            container.innerHTML = '';
        }
    },

    refresh: async () => {
        await updatePendingBadges();
        await switchView(currentView);
    }
};
