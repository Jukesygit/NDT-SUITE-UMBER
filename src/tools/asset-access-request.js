// Asset Access Request Tool - Allows users to request access to assets from other organizations
import sharingManager from '../sharing-manager.js';
import authManager from '../auth-manager.js';
import { createAnimatedHeader } from '../animated-background.js';

let container, dom = {};

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div id="access-header-container" style="flex-shrink: 0;"></div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto;">
    <!-- Header -->
    <div class="p-6 bg-white dark:bg-gray-800 shadow-md flex-shrink-0" style="display: none;">
        <div class="flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Asset Access Requests</h1>
                <p class="text-gray-600 dark:text-gray-400 mt-1">Request access to assets from other organizations</p>
            </div>
            <button id="new-request-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                + New Request
            </button>
        </div>
    </div>

    <!-- Toolbar -->
    <div class="p-6 flex justify-end flex-shrink-0">
        <button id="new-request-btn2" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            + New Request
        </button>
    </div>

    <!-- Content Area -->
    <div class="flex-grow overflow-y-auto p-6">
        <div id="requests-container"></div>
    </div>
    </div>
</div>
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#access-header-container'),
        newRequestBtn: q('#new-request-btn2'),
        requestsContainer: q('#requests-container')
    };

    // Initialize animated header
    const header = createAnimatedHeader(
        'Asset Access Requests',
        'Request access to assets from other organizations',
        { height: '100px', particleCount: 15, waveIntensity: 0.4 }
    );
    dom.headerContainer.appendChild(header);
}

async function renderRequests() {
    const requests = await sharingManager.getUserAccessRequests();

    if (requests.length === 0) {
        dom.requestsContainer.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">No access requests yet</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Click "New Request" to request access to assets from other organizations.</p>
            </div>
        `;
        return;
    }

    // Group requests by status
    const pending = requests.filter(r => r.status === 'pending');
    const approved = requests.filter(r => r.status === 'approved');
    const rejected = requests.filter(r => r.status === 'rejected');

    dom.requestsContainer.innerHTML = `
        <!-- Pending Requests -->
        ${pending.length > 0 ? `
            <div class="mb-8">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Pending Requests</h2>
                <div class="space-y-4">
                    ${pending.map(request => renderRequestCard(request)).join('')}
                </div>
            </div>
        ` : ''}

        <!-- Approved Requests -->
        ${approved.length > 0 ? `
            <div class="mb-8">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Approved Requests</h2>
                <div class="space-y-4">
                    ${approved.map(request => renderRequestCard(request)).join('')}
                </div>
            </div>
        ` : ''}

        <!-- Rejected Requests -->
        ${rejected.length > 0 ? `
            <div class="mb-8">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Rejected Requests</h2>
                <div class="space-y-4">
                    ${rejected.map(request => renderRequestCard(request)).join('')}
                </div>
            </div>
        ` : ''}
    `;

    // Add event listeners for cancel buttons
    dom.requestsContainer.querySelectorAll('.cancel-request-btn').forEach(btn => {
        btn.addEventListener('click', () => cancelRequest(btn.dataset.requestId));
    });
}

function renderRequestCard(request) {
    const statusColor = {
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };

    const permissionColor = request.requested_permission === 'edit'
        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
        : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';

    return `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex justify-between items-start">
                <div class="flex-grow">
                    <div class="flex items-center gap-3 mb-2">
                        <h3 class="text-lg font-bold text-gray-900 dark:text-white">${request.owner_org_name}</h3>
                        <span class="px-2 py-1 rounded text-xs font-medium ${statusColor[request.status]}">
                            ${request.status}
                        </span>
                        <span class="px-2 py-1 rounded text-xs font-medium ${permissionColor}">
                            ${request.requested_permission}
                        </span>
                    </div>
                    <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        <div>Asset: <span class="font-medium">${request.asset_id}</span></div>
                        ${request.vessel_id ? `<div>Vessel: ${request.vessel_id}</div>` : ''}
                        ${request.scan_id ? `<div>Scan: ${request.scan_id}</div>` : ''}
                        ${request.message ? `<div class="mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Your message:</div>
                            <div class="italic">"${request.message}"</div>
                        </div>` : ''}
                        ${request.rejection_reason ? `<div class="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                            <div class="text-xs text-red-600 dark:text-red-400 font-semibold mb-1">Rejection reason:</div>
                            <div class="text-red-700 dark:text-red-300">"${request.rejection_reason}"</div>
                        </div>` : ''}
                        <div class="text-xs mt-2 space-y-1">
                            <div>Requested: ${new Date(request.created_at).toLocaleString()}</div>
                            ${request.approved_at ? `<div>Approved: ${new Date(request.approved_at).toLocaleString()}</div>` : ''}
                            ${request.rejected_at ? `<div>Rejected: ${new Date(request.rejected_at).toLocaleString()}</div>` : ''}
                        </div>
                    </div>
                </div>
                ${request.status === 'pending' ? `
                    <div class="ml-4">
                        <button class="cancel-request-btn text-red-600 hover:text-red-800 dark:text-red-400 text-sm" data-request-id="${request.request_id}">
                            Cancel
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

async function createNewRequest() {
    const organizations = (await authManager.getOrganizations()).filter(org =>
        org.name !== 'SYSTEM' && org.id !== authManager.getCurrentOrganizationId()
    );

    if (organizations.length === 0) {
        alert('No other organizations available');
        return;
    }

    // Select organization
    const orgList = organizations.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
    const orgChoice = prompt(`Request access from organization:\n${orgList}\n\nEnter number:`);
    const orgIndex = parseInt(orgChoice) - 1;
    if (orgIndex < 0 || orgIndex >= organizations.length) {
        return;
    }
    const selectedOrg = organizations[orgIndex];

    // Enter asset ID
    const assetId = prompt('Enter Asset ID:');
    if (!assetId || !assetId.trim()) {
        return;
    }

    // Optional: vessel and scan IDs
    const includeVessel = confirm('Request access to a specific vessel? (Cancel for entire asset)');
    let vesselId = null;
    let scanId = null;

    if (includeVessel) {
        vesselId = prompt('Enter Vessel ID:');
        if (vesselId && vesselId.trim()) {
            const includeScan = confirm('Request access to a specific scan? (Cancel for entire vessel)');
            if (includeScan) {
                scanId = prompt('Enter Scan ID:');
                if (!scanId || !scanId.trim()) {
                    scanId = null;
                }
            }
        } else {
            vesselId = null;
        }
    }

    // Permission level
    const permission = confirm('Request edit permission? (Cancel for view-only)') ? 'edit' : 'view';

    // Optional message
    const message = prompt('Optional message to the administrator:') || '';

    // Create request
    const result = await sharingManager.requestAssetAccess({
        ownerOrganizationId: selectedOrg.id,
        assetId: assetId.trim(),
        vesselId,
        scanId,
        permission,
        message
    });

    if (result.success) {
        alert('Access request submitted successfully!');
        await renderRequests();
    } else {
        alert('Error: ' + result.error);
    }
}

async function cancelRequest(requestId) {
    if (!confirm('Cancel this access request?')) {
        return;
    }

    const result = await sharingManager.cancelAccessRequest(requestId);
    if (result.success) {
        alert('Request canceled successfully');
        await renderRequests();
    } else {
        alert('Error: ' + result.error);
    }
}

function addEventListeners() {
    if (dom.newRequestBtn) {
        dom.newRequestBtn.addEventListener('click', createNewRequest);
    }
}

export default {
    init: async (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        cacheDom();

        await authManager.ensureInitialized();
        await sharingManager.ensureInitialized();

        addEventListeners();
        await renderRequests();
    },

    destroy: () => {
        // Destroy animated background
        const headerContainer = container?.querySelector('#access-header-container');
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
        await renderRequests();
    }
};
