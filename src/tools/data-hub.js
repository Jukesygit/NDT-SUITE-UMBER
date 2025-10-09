// Data Hub Tool Module - Home page with asset/vessel/scan management
import dataManager from '../data-manager.js';
import { createAnimatedHeader } from '../animated-background.js';

let container, dom = {};
let currentView = 'assets'; // 'assets', 'vessel-detail', 'scan-detail'
let currentAssetId = null;
let currentVesselId = null;

const HTML = `
<div class="h-full flex flex-col overflow-hidden">
    <div id="datahub-header-container" style="flex-shrink: 0;"></div>

    <div class="glass-panel" style="padding: 16px 24px; flex-shrink: 0; border-radius: 0;">
        <div class="flex justify-between items-center mb-4">
            <div id="stats-bar" class="grid grid-cols-2 md:grid-cols-4 gap-4 flex-grow mr-4"></div>
            <div class="flex gap-2">
                <button id="import-btn" class="btn-secondary text-sm px-3 py-2">
                    Import Data
                </button>
                <button id="export-all-btn" class="btn-secondary text-sm px-3 py-2">
                    Export All
                </button>
                <button id="new-asset-btn" class="btn-primary text-sm px-3 py-2">
                    + New Asset
                </button>
            </div>
        </div>
    </div>

    <div id="breadcrumb" class="px-6 py-3 flex items-center gap-2 text-sm flex-shrink-0" style="background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
        <button id="breadcrumb-home" class="text-blue-400 hover:underline">Home</button>
    </div>

    <div class="flex-grow overflow-y-auto glass-scrollbar p-6">
        <div id="assets-view"></div>
        <div id="vessel-detail-view" class="hidden"></div>
        <div id="scan-detail-view" class="hidden"></div>
    </div>
</div>

<input type="file" id="import-file-input" accept=".json" class="hidden">
`;

function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#datahub-header-container'),
        statsBar: q('#stats-bar'),
        breadcrumb: q('#breadcrumb'),
        breadcrumbHome: q('#breadcrumb-home'),
        assetsView: q('#assets-view'),
        vesselDetailView: q('#vessel-detail-view'),
        scanDetailView: q('#scan-detail-view'),
        newAssetBtn: q('#new-asset-btn'),
        exportAllBtn: q('#export-all-btn'),
        importBtn: q('#import-btn'),
        importFileInput: q('#import-file-input')
    };

    // Initialize animated header
    const header = createAnimatedHeader(
        'NDT Data Hub',
        'Organize and manage your inspection scans',
        { height: '180px', particleCount: 15, waveIntensity: 0.4 }
    );
    dom.headerContainer.appendChild(header);
}

function renderStats() {
    const stats = dataManager.getStats();
    dom.statsBar.innerHTML = `
        <div class="glass-panel" style="padding: 12px; text-align: center;">
            <div class="text-xs" style="color: rgba(255, 255, 255, 0.6);">Assets</div>
            <div class="text-2xl font-bold text-white">${stats.totalAssets}</div>
        </div>
        <div class="glass-panel" style="padding: 12px; text-align: center;">
            <div class="text-xs" style="color: rgba(255, 255, 255, 0.6);">Vessels</div>
            <div class="text-2xl font-bold text-white">${stats.totalVessels}</div>
        </div>
        <div class="glass-panel" style="padding: 12px; text-align: center;">
            <div class="text-xs" style="color: rgba(255, 255, 255, 0.6);">Total Scans</div>
            <div class="text-2xl font-bold text-white">${stats.totalScans}</div>
        </div>
        <div class="glass-panel" style="padding: 12px; text-align: center;">
            <div class="text-xs" style="color: rgba(255, 255, 255, 0.6);">PEC / C-Scan / 3D</div>
            <div class="text-lg font-bold text-white">
                ${stats.scansByType.pec || 0} / ${stats.scansByType.cscan || 0} / ${stats.scansByType['3dview'] || 0}
            </div>
        </div>
    `;
}

function updateBreadcrumb() {
    let breadcrumbHTML = '<button id="breadcrumb-home" class="text-blue-600 dark:text-blue-400 hover:underline">Home</button>';

    if (currentAssetId) {
        const asset = dataManager.getAsset(currentAssetId);
        if (asset) {
            breadcrumbHTML += ` <span class="text-gray-400">/</span> <button id="breadcrumb-asset" class="text-blue-600 dark:text-blue-400 hover:underline">${asset.name}</button>`;
        }
    }

    if (currentVesselId && currentAssetId) {
        const vessel = dataManager.getVessel(currentAssetId, currentVesselId);
        if (vessel) {
            breadcrumbHTML += ` <span class="text-gray-400">/</span> <span class="text-gray-600 dark:text-gray-300">${vessel.name}</span>`;
        }
    }

    dom.breadcrumb.innerHTML = breadcrumbHTML;

    // Add event listeners
    const homeBtn = dom.breadcrumb.querySelector('#breadcrumb-home');
    if (homeBtn) homeBtn.addEventListener('click', () => showAssetsView());

    const assetBtn = dom.breadcrumb.querySelector('#breadcrumb-asset');
    if (assetBtn) assetBtn.addEventListener('click', () => showVesselDetailView(currentAssetId));
}

function showAssetsView() {
    currentView = 'assets';
    currentAssetId = null;
    currentVesselId = null;

    dom.assetsView.classList.remove('hidden');
    dom.vesselDetailView.classList.add('hidden');
    dom.scanDetailView.classList.add('hidden');

    renderAssetsView();
    updateBreadcrumb();
}

function renderAssetsView() {
    const assets = dataManager.getAssets();

    if (assets.length === 0) {
        dom.assetsView.innerHTML = `
            <div class="text-center py-12">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">No assets yet</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Get started by creating an asset to organize your scans.</p>
                <button id="empty-new-asset-btn" class="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                    Create First Asset
                </button>
            </div>
        `;

        const btn = dom.assetsView.querySelector('#empty-new-asset-btn');
        btn.addEventListener('click', createNewAsset);
        return;
    }

    dom.assetsView.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${assets.map(asset => {
                const vesselCount = asset.vessels.length;
                const scanCount = asset.vessels.reduce((sum, v) => sum + v.scans.length, 0);
                return `
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden" data-asset-id="${asset.id}">
                        <div class="p-6">
                            <div class="flex justify-between items-start mb-2">
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white">${asset.name}</h3>
                                <button class="asset-menu-btn text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" data-asset-id="${asset.id}" aria-label="Menu for ${asset.name}">
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
                                    </svg>
                                </button>
                            </div>
                            <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                <div>Vessels: ${vesselCount}</div>
                                <div>Scans: ${scanCount}</div>
                            </div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 px-6 py-3">
                            <button class="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium view-asset-btn" data-asset-id="${asset.id}">
                                View Details →
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Add event listeners
    dom.assetsView.querySelectorAll('.view-asset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showVesselDetailView(btn.dataset.assetId);
        });
    });

    dom.assetsView.querySelectorAll('.asset-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showAssetMenu(e, btn.dataset.assetId);
        });
    });
}

function showVesselDetailView(assetId) {
    currentView = 'vessel-detail';
    currentAssetId = assetId;
    currentVesselId = null;

    dom.assetsView.classList.add('hidden');
    dom.vesselDetailView.classList.remove('hidden');
    dom.scanDetailView.classList.add('hidden');

    renderVesselDetailView(assetId);
    updateBreadcrumb();
}

function renderVesselDetailView(assetId) {
    const asset = dataManager.getAsset(assetId);
    if (!asset) {
        showAssetsView();
        return;
    }

    if (asset.vessels.length === 0) {
        dom.vesselDetailView.innerHTML = `
            <div class="text-center py-12">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">No vessels in this asset</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Add a vessel to start organizing scans.</p>
                <button id="empty-new-vessel-btn" class="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                    Create First Vessel
                </button>
            </div>
        `;

        const btn = dom.vesselDetailView.querySelector('#empty-new-vessel-btn');
        btn.addEventListener('click', () => createNewVessel(assetId));
        return;
    }

    dom.vesselDetailView.innerHTML = `
        <div class="mb-4 flex justify-between items-center">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">${asset.name} - Vessels</h2>
            <button id="new-vessel-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm">
                + New Vessel
            </button>
        </div>
        <div class="space-y-6">
            ${asset.vessels.map(vessel => {
                const scanCount = vessel.scans.length;
                const images = vessel.images || [];
                const imageCount = images.length;
                return `
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                        <div class="p-6">
                            <div class="flex gap-4 items-start mb-4">
                                <div class="flex-shrink-0 w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center relative overflow-hidden border-2 border-gray-200 dark:border-gray-600 ${vessel.model3d ? 'cursor-pointer hover:border-blue-500 transition-colors' : ''}">
                                    ${vessel.model3d ? `
                                        <canvas class="vessel-3d-preview" data-vessel-id="${vessel.id}" data-asset-id="${assetId}" style="width: 96px; height: 96px; display: block;"></canvas>
                                    ` : `
                                        <button class="upload-model-btn text-gray-400 hover:text-blue-500 flex flex-col items-center gap-1" data-vessel-id="${vessel.id}" aria-label="Upload 3D model for ${vessel.name}">
                                            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                            </svg>
                                            <span class="text-xs">Add 3D</span>
                                        </button>
                                    `}
                                </div>
                                <div class="flex-grow min-w-0">
                                    <div class="flex justify-between items-start mb-2">
                                        <h3 class="text-xl font-bold text-gray-900 dark:text-white truncate">${vessel.name}</h3>
                                        <button class="vessel-menu-btn text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" data-vessel-id="${vessel.id}" aria-label="Menu for ${vessel.name}">
                                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
                                            </svg>
                                        </button>
                                    </div>
                                    <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                        <div>Scans: ${scanCount}</div>
                                        <div>Images: ${imageCount}</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Vessel Images Section -->
                            <div class="mb-4">
                                <div class="flex justify-between items-center mb-2">
                                    <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Vessel Images</div>
                                    <button class="upload-image-btn text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors" data-vessel-id="${vessel.id}" data-asset-id="${assetId}">
                                        + Add Images
                                    </button>
                                </div>
                                ${images.length > 0 ? `
                                    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                        ${images.map(img => `
                                            <div class="vessel-image-card relative group cursor-pointer rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-colors aspect-square" data-image-id="${img.id}">
                                                <img src="${img.dataUrl}" alt="${img.name}" class="w-full h-full object-cover">
                                                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                                                    <button class="delete-image-btn opacity-0 group-hover:opacity-100 bg-red-600 text-white p-1.5 rounded-full hover:bg-red-700 transition-all" data-vessel-id="${vessel.id}" data-asset-id="${assetId}" data-image-id="${img.id}" aria-label="Delete image">
                                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <p class="text-sm text-gray-500 dark:text-gray-400 italic">No images uploaded yet</p>
                                `}
                            </div>
                            ${vessel.scans.length > 0 ? `
                                <div class="space-y-2">
                                    <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Scans</div>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        ${vessel.scans.map(scan => `
                                            <div class="scan-card-compact cursor-pointer bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all" data-scan-id="${scan.id}" data-asset-id="${assetId}" data-vessel-id="${vessel.id}">
                                                ${scan.thumbnail ? `
                                                    <div class="aspect-video bg-gray-200 dark:bg-gray-600">
                                                        <img src="${scan.thumbnail}" alt="${scan.name}" class="w-full h-full object-cover">
                                                    </div>
                                                ` : `
                                                    <div class="aspect-video bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                                                        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                                        </svg>
                                                    </div>
                                                `}
                                                <div class="p-2">
                                                    <div class="text-xs font-semibold text-gray-900 dark:text-white truncate mb-1" title="${scan.name}">${scan.name}</div>
                                                    <span class="px-1.5 py-0.5 rounded text-xs font-medium ${
                                                        scan.toolType === 'pec' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                                        scan.toolType === 'cscan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                                        'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                                    }">${scan.toolType.toUpperCase()}</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : '<p class="text-sm text-gray-500 dark:text-gray-400 italic">No scans yet</p>'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Add event listeners
    const newVesselBtn = dom.vesselDetailView.querySelector('#new-vessel-btn');
    if (newVesselBtn) {
        newVesselBtn.addEventListener('click', () => createNewVessel(assetId));
    }

    dom.vesselDetailView.querySelectorAll('.vessel-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showVesselMenu(e, assetId, btn.dataset.vesselId);
        });
    });

    dom.vesselDetailView.querySelectorAll('.upload-model-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleModelUploadClick(assetId, btn.dataset.vesselId);
        });
    });

    // Add click handlers for compact scan cards
    dom.vesselDetailView.querySelectorAll('.scan-card-compact').forEach(card => {
        card.addEventListener('click', () => {
            const scanId = card.dataset.scanId;
            const assetId = card.dataset.assetId;
            const vesselId = card.dataset.vesselId;
            const scan = dataManager.getScan(assetId, vesselId, scanId);
            if (scan) {
                openScanInTool(scan);
            }
        });
    });

    // Render 3D previews for vessels that have models
    renderVessel3DPreviews(assetId);

    // Add click handlers to 3D model previews
    dom.vesselDetailView.querySelectorAll('.vessel-3d-preview').forEach(canvas => {
        canvas.addEventListener('click', (e) => {
            e.stopPropagation();
            const vesselId = canvas.dataset.vesselId;
            const assetId = canvas.dataset.assetId;
            const vessel = dataManager.getVessel(assetId, vesselId);
            if (vessel && vessel.model3d) {
                open3DModel(vessel.model3d, vessel.name);
            }
        });
    });

    // Add event listeners for image upload buttons
    dom.vesselDetailView.querySelectorAll('.upload-image-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleImageUploadClick(btn.dataset.assetId, btn.dataset.vesselId);
        });
    });

    // Add event listeners for image delete buttons
    dom.vesselDetailView.querySelectorAll('.delete-image-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete this image?')) {
                await dataManager.deleteVesselImage(btn.dataset.assetId, btn.dataset.vesselId, btn.dataset.imageId);
                renderStats();
                renderVesselDetailView(assetId);
            }
        });
    });

    // Add event listeners for viewing images
    dom.vesselDetailView.querySelectorAll('.vessel-image-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-image-btn')) {
                const imageId = card.dataset.imageId;
                // Find the vessel by searching through all vessels in the asset
                const asset = dataManager.getAsset(assetId);
                if (asset) {
                    for (const vessel of asset.vessels) {
                        const image = vessel?.images?.find(img => img.id === imageId);
                        if (image) {
                            showImageModal(image);
                            break;
                        }
                    }
                }
            }
        });
    });
}

function open3DModel(modelData, vesselName) {
    // Dispatch custom event to switch to 3D viewer tool and load the model
    const event = new CustomEvent('load3DModel', {
        detail: {
            modelData: modelData,
            fileName: vesselName
        }
    });
    window.dispatchEvent(event);
}

function showScanDetailView(assetId, vesselId) {
    currentView = 'scan-detail';
    currentAssetId = assetId;
    currentVesselId = vesselId;

    dom.assetsView.classList.add('hidden');
    dom.vesselDetailView.classList.add('hidden');
    dom.scanDetailView.classList.remove('hidden');

    renderScanDetailView(assetId, vesselId);
    updateBreadcrumb();
}

function renderScanDetailView(assetId, vesselId) {
    const vessel = dataManager.getVessel(assetId, vesselId);
    if (!vessel) {
        showVesselDetailView(assetId);
        return;
    }

    if (vessel.scans.length === 0) {
        dom.scanDetailView.innerHTML = `
            <div class="text-center py-12">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">No scans in this vessel</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Export a scan from one of the NDT tools to add it here.</p>
            </div>
        `;
        return;
    }

    dom.scanDetailView.innerHTML = `
        <div class="mb-4">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">${vessel.name} - Scans</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${vessel.scans.length} scan(s)</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${vessel.scans.map(scan => `
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden cursor-pointer scan-card" data-scan-id="${scan.id}">
                    ${scan.thumbnail ? `
                        <div class="h-40 bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <img src="${scan.thumbnail}" alt="${scan.name}" class="w-full h-full object-contain">
                        </div>
                    ` : `
                        <div class="h-40 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                            <svg class="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                            </svg>
                        </div>
                    `}
                    <div class="p-4">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="text-lg font-bold text-gray-900 dark:text-white flex-grow">${scan.name}</h3>
                            <button class="scan-menu-btn text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" data-scan-id="${scan.id}" aria-label="Menu for ${scan.name}">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 rounded font-medium ${
                                    scan.toolType === 'pec' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                    scan.toolType === 'cscan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                }">${scan.toolType.toUpperCase()}</span>
                            </div>
                            <div>${new Date(scan.timestamp).toLocaleString()}</div>
                        </div>
                        <button class="mt-3 w-full bg-blue-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors open-scan-btn" data-scan-id="${scan.id}">
                            Open in ${scan.toolType === 'pec' ? 'PEC Visualizer' : scan.toolType === 'cscan' ? 'C-Scan Visualizer' : '3D Viewer'}
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Add event listeners
    dom.scanDetailView.querySelectorAll('.scan-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showScanMenu(e, assetId, vesselId, btn.dataset.scanId);
        });
    });

    dom.scanDetailView.querySelectorAll('.open-scan-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const scan = dataManager.getScan(assetId, vesselId, btn.dataset.scanId);
            if (scan) {
                openScanInTool(scan);
            }
        });
    });

    dom.scanDetailView.querySelectorAll('.scan-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.scan-menu-btn') && !e.target.closest('.open-scan-btn')) {
                const scan = dataManager.getScan(assetId, vesselId, card.dataset.scanId);
                if (scan) {
                    openScanInTool(scan);
                }
            }
        });
    });
}

function openScanInTool(scan) {
    // Dispatch custom event to switch to the appropriate tool and load the scan
    const event = new CustomEvent('loadScan', {
        detail: {
            toolType: scan.toolType,
            scanData: scan
        }
    });
    window.dispatchEvent(event);
}

async function createNewAsset() {
    const name = prompt('Enter asset name:');
    if (name && name.trim()) {
        await dataManager.createAsset(name.trim());
        renderStats();
        renderAssetsView();
    }
}

async function createNewVessel(assetId) {
    const name = prompt('Enter vessel name:');
    if (name && name.trim()) {
        await dataManager.createVessel(assetId, name.trim());
        renderStats();
        renderVesselDetailView(assetId);
    }
}

function showAssetMenu(event, assetId) {
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
            const asset = dataManager.getAsset(assetId);
            const newName = prompt('Enter new name:', asset.name);
            if (newName && newName.trim()) {
                await dataManager.updateAsset(assetId, { name: newName.trim() });
                renderStats();
                renderAssetsView();
            }
        } else if (action === 'delete') {
            if (confirm('Delete this asset and all its vessels and scans?')) {
                await dataManager.deleteAsset(assetId);
                renderStats();
                renderAssetsView();
            }
        }
        document.body.removeChild(menu);
    });

    const closeMenu = () => {
        if (document.body.contains(menu)) {
            document.body.removeChild(menu);
        }
    };

    setTimeout(() => {
        document.addEventListener('click', closeMenu, { once: true });
    }, 0);
}

function handleModelUploadClick(assetId, vesselId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.obj';
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const modelData = event.target.result;
            await dataManager.updateVessel(assetId, vesselId, { model3d: modelData });
            renderVesselDetailView(assetId);
        };
        reader.readAsDataURL(file);
    });
    input.click();
}

function handleImageUploadClick(assetId, vesselId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Process each file
        for (const file of files) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const imageData = {
                    name: file.name,
                    dataUrl: event.target.result
                };
                await dataManager.addVesselImage(assetId, vesselId, imageData);
                renderStats();
                renderVesselDetailView(assetId);
            };
            reader.readAsDataURL(file);
        }
    });
    input.click();
}

function showImageModal(image) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4';
    modal.style.zIndex = '9999';

    modal.innerHTML = `
        <div class="relative max-w-5xl max-h-full">
            <button class="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75 transition-all z-10" aria-label="Close">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
            <div class="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-2xl">
                <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">${image.name}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${new Date(image.timestamp).toLocaleString()}</p>
                </div>
                <div class="p-4 flex items-center justify-center bg-gray-100 dark:bg-gray-900" style="max-height: 80vh;">
                    <img src="${image.dataUrl}" alt="${image.name}" class="max-w-full max-h-full object-contain">
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close on click outside or close button
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('button[aria-label="Close"]')) {
            document.body.removeChild(modal);
        }
    });

    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape' && document.body.contains(modal)) {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

async function renderVessel3DPreviews(assetId) {
    const canvases = dom.vesselDetailView.querySelectorAll('.vessel-3d-preview');

    if (canvases.length === 0) return;

    // Dynamically import Three.js modules
    const THREE = await import('three');
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');

    canvases.forEach(canvas => {
        const vesselId = canvas.dataset.vesselId;
        const vessel = dataManager.getVessel(assetId, vesselId);

        if (!vessel || !vessel.model3d) {
            console.log('No model data for vessel:', vesselId);
            return;
        }

        const modelData = vessel.model3d;
        console.log('Loading 3D preview for vessel:', vesselId, 'Model data length:', modelData.length);

        // Set canvas size explicitly
        const width = 96;
        const height = 96;
        canvas.width = width;
        canvas.height = height;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xe5e7eb); // Light gray background

        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false
        });
        renderer.setSize(width, height, false);
        renderer.setPixelRatio(1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Add better lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const light1 = new THREE.DirectionalLight(0xffffff, 0.6);
        light1.position.set(50, 50, 50);
        scene.add(light1);
        const light2 = new THREE.DirectionalLight(0xffffff, 0.4);
        light2.position.set(-50, -50, -50);
        scene.add(light2);

        // Load the model
        const loader = new OBJLoader();

        // Convert data URL to text
        fetch(modelData)
            .then(response => response.text())
            .then(objText => {
                console.log('OBJ text loaded, length:', objText.length);
                const object = loader.parse(objText);
                console.log('OBJ parsed successfully');

                // Apply visible material
                object.traverse(child => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshPhongMaterial({
                            color: 0x6b7280,
                            shininess: 30,
                            flatShading: false
                        });
                        console.log('Mesh found and material applied');
                    }
                });

                // Center the model at origin
                const box = new THREE.Box3().setFromObject(object);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                object.position.sub(center);

                // Calculate proper camera distance to fit entire model
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.7;

                // Position camera at 45-degree angle for good view
                const distance = cameraDistance;
                camera.position.set(
                    distance * 0.7,  // X - to the side
                    distance * 0.5,  // Y - slightly above
                    distance * 0.7   // Z - back
                );
                camera.lookAt(0, 0, 0);

                // Update camera near/far planes
                camera.near = cameraDistance * 0.1;
                camera.far = cameraDistance * 10;
                camera.updateProjectionMatrix();

                console.log('Model size:', size, 'Max dim:', maxDim, 'Camera distance:', cameraDistance);

                scene.add(object);

                // Initial render
                renderer.render(scene, camera);
                console.log('Initial render complete');

                // Render with slow rotation
                let rotation = 0;
                let animationId;
                function animate() {
                    rotation += 0.008;
                    object.rotation.y = rotation;
                    renderer.render(scene, camera);
                    animationId = requestAnimationFrame(animate);
                }
                animate();

                // Store animation ID for cleanup
                canvas.dataset.animationId = animationId;
            })
            .catch(err => {
                console.error('Error loading 3D model preview:', err);
                // Show error state
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ef4444';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Load Error', width / 2, height / 2);
            });
    });
}

function showVesselMenu(event, assetId, vesselId) {
    const vessel = dataManager.getVessel(assetId, vesselId);
    const menu = document.createElement('div');
    menu.className = 'fixed bg-white dark:bg-gray-800 shadow-lg rounded-lg py-2 z-50 border border-gray-200 dark:border-gray-700';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.innerHTML = `
        ${vessel.model3d ? '<button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" data-action="change-model">Change 3D Model</button>' : ''}
        ${vessel.model3d ? '<button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" data-action="remove-model">Remove 3D Model</button>' : ''}
        <button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" data-action="rename">Rename</button>
        <button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-red-600" data-action="delete">Delete</button>
    `;

    document.body.appendChild(menu);

    menu.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (action === 'rename') {
            const vessel = dataManager.getVessel(assetId, vesselId);
            const newName = prompt('Enter new name:', vessel.name);
            if (newName && newName.trim()) {
                await dataManager.updateVessel(assetId, vesselId, { name: newName.trim() });
                renderStats();
                renderVesselDetailView(assetId);
            }
        } else if (action === 'delete') {
            if (confirm('Delete this vessel and all its scans?')) {
                await dataManager.deleteVessel(assetId, vesselId);
                renderStats();
                renderVesselDetailView(assetId);
            }
        } else if (action === 'change-model') {
            handleModelUploadClick(assetId, vesselId);
        } else if (action === 'remove-model') {
            if (confirm('Remove the 3D model from this vessel?')) {
                await dataManager.updateVessel(assetId, vesselId, { model3d: null });
                renderStats();
                renderVesselDetailView(assetId);
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

function showScanMenu(event, assetId, vesselId, scanId) {
    const menu = document.createElement('div');
    menu.className = 'fixed bg-white dark:bg-gray-800 shadow-lg rounded-lg py-2 z-50 border border-gray-200 dark:border-gray-700';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.innerHTML = `
        <button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" data-action="open">Open in Tool</button>
        <button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" data-action="rename">Rename</button>
        <button class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-red-600" data-action="delete">Delete</button>
    `;

    document.body.appendChild(menu);

    menu.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (action === 'open') {
            const scan = dataManager.getScan(assetId, vesselId, scanId);
            if (scan) {
                openScanInTool(scan);
            }
        } else if (action === 'rename') {
            const scan = dataManager.getScan(assetId, vesselId, scanId);
            const newName = prompt('Enter new name:', scan.name);
            if (newName && newName.trim()) {
                await dataManager.updateScan(assetId, vesselId, scanId, { name: newName.trim() });
                renderScanDetailView(assetId, vesselId);
            }
        } else if (action === 'delete') {
            if (confirm('Delete this scan?')) {
                await dataManager.deleteScan(assetId, vesselId, scanId);
                renderStats();
                renderScanDetailView(assetId, vesselId);
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

function exportAllData() {
    const data = dataManager.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ndt-data-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function importData() {
    dom.importFileInput.click();
}

async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const success = await dataManager.importData(e.target.result);
            if (success) {
                alert('Data imported successfully!');
                renderStats();
                showAssetsView();
            } else {
                alert('Failed to import data. Invalid file format.');
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('Error importing data: ' + error.message);
        }
    };
    reader.readAsText(file);

    // Reset input
    event.target.value = '';
}

function addEventListeners() {
    dom.newAssetBtn.addEventListener('click', createNewAsset);
    dom.exportAllBtn.addEventListener('click', exportAllData);
    dom.importBtn.addEventListener('click', importData);
    dom.importFileInput.addEventListener('change', handleImportFile);
}

export default {
    init: async (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        cacheDom();
        addEventListeners();

        // Wait for data manager to initialize
        await dataManager.ensureInitialized();

        renderStats();
        showAssetsView();
    },

    destroy: () => {
        // Destroy animated background
        const headerContainer = container?.querySelector('#datahub-header-container');
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

    refresh: () => {
        renderStats();
        if (currentView === 'assets') {
            renderAssetsView();
        } else if (currentView === 'vessel-detail' && currentAssetId) {
            renderVesselDetailView(currentAssetId);
        } else if (currentView === 'scan-detail' && currentAssetId && currentVesselId) {
            renderScanDetailView(currentAssetId, currentVesselId);
        }
    }
};
