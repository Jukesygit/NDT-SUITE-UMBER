// ========================================
// NDT Suite Data Diagnostic Script
// ========================================
// Copy and paste this entire script into your browser console
// when you have http://localhost:5173 open
// ========================================

(async function diagnosticCheck() {
    console.log('🔍 NDT Suite Data Diagnostic');
    console.log('================================\n');

    try {
        // Check IndexedDB directly
        console.log('📦 CHECKING INDEXEDDB...');
        const dbRequest = indexedDB.open('NDTSuiteDB', 1);

        dbRequest.onsuccess = async function(event) {
            const db = event.target.result;
            const transaction = db.transaction(['ndtData'], 'readonly');
            const objectStore = transaction.objectStore('ndtData');
            const request = objectStore.get('main_data');

            request.onsuccess = function() {
                const result = request.result;
                const data = result ? result.data : {};

                console.log('\n📊 DATA STRUCTURE:');
                console.log(JSON.stringify(data, null, 2));

                console.log('\n📈 SUMMARY:');

                if (Object.keys(data).length === 0) {
                    console.warn('⚠️  No data found in IndexedDB');
                } else if (data.assets) {
                    console.warn('⚠️  OLD FORMAT DETECTED (not organization-scoped)');
                    console.log('   Assets:', data.assets.length);

                    let totalVessels = 0;
                    let totalScans = 0;
                    for (const asset of data.assets) {
                        totalVessels += asset.vessels ? asset.vessels.length : 0;
                        for (const vessel of (asset.vessels || [])) {
                            totalScans += vessel.scans ? vessel.scans.length : 0;
                        }
                    }
                    console.log('   Vessels:', totalVessels);
                    console.log('   Scans:', totalScans);
                } else {
                    console.log('✅ Organization-scoped format');
                    const orgCount = Object.keys(data).length;
                    console.log('   Organizations in local data:', orgCount);

                    for (const orgId in data) {
                        const orgData = data[orgId];
                        const assetCount = orgData.assets ? orgData.assets.length : 0;
                        let totalScans = 0;
                        let totalVessels = 0;

                        if (orgData.assets) {
                            for (const asset of orgData.assets) {
                                totalVessels += asset.vessels ? asset.vessels.length : 0;
                                for (const vessel of (asset.vessels || [])) {
                                    totalScans += vessel.scans ? vessel.scans.length : 0;
                                }
                            }
                        }

                        console.log(`\n   📁 Organization: ${orgId}`);
                        console.log(`      Assets: ${assetCount}`);
                        console.log(`      Vessels: ${totalVessels}`);
                        console.log(`      Scans: ${totalScans}`);

                        if (assetCount > 0) {
                            console.log('      Asset Details:');
                            for (const asset of orgData.assets) {
                                console.log(`         - ${asset.name} (${asset.vessels?.length || 0} vessels)`);
                            }
                        }
                    }
                }

                // Check localStorage for session data
                console.log('\n🔐 CHECKING SESSION DATA...');
                const sessionUser = sessionStorage.getItem('currentUser');
                if (sessionUser) {
                    const user = JSON.parse(sessionUser);
                    console.log('Current User:', user.email);
                    console.log('User ID:', user.id);
                    console.log('Organization ID:', user.organizationId);
                } else {
                    console.warn('⚠️  No user in session storage');
                }

                // Check localStorage
                const localUser = localStorage.getItem('currentUser');
                if (localUser) {
                    const user = JSON.parse(localUser);
                    console.log('\nLocal Storage User:', user.email);
                    console.log('Local User Org ID:', user.organizationId);
                }

                console.log('\n================================');
                console.log('✅ Diagnostic complete!');
                console.log('\nTo export all data, run: exportAllData()');
                console.log('To view specific org, run: viewOrgData("ORG_ID")');
            };

            request.onerror = function() {
                console.error('❌ Error reading from IndexedDB:', request.error);
            };
        };

        dbRequest.onerror = function() {
            console.error('❌ Error opening IndexedDB:', dbRequest.error);
        };

    } catch (error) {
        console.error('❌ Diagnostic error:', error);
    }
})();

// Helper function to export all data
window.exportAllData = async function() {
    const dbRequest = indexedDB.open('NDTSuiteDB', 1);

    dbRequest.onsuccess = function(event) {
        const db = event.target.result;
        const transaction = db.transaction(['ndtData'], 'readonly');
        const objectStore = transaction.objectStore('ndtData');
        const request = objectStore.get('main_data');

        request.onsuccess = function() {
            const result = request.result;
            const data = result ? result.data : {};
            const json = JSON.stringify(data, null, 2);

            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ndt-suite-all-data-' + new Date().toISOString().split('T')[0] + '.json';
            a.click();

            console.log('✅ Data exported successfully!');
        };
    };
};

// Helper function to view specific org data
window.viewOrgData = function(orgId) {
    const dbRequest = indexedDB.open('NDTSuiteDB', 1);

    dbRequest.onsuccess = function(event) {
        const db = event.target.result;
        const transaction = db.transaction(['ndtData'], 'readonly');
        const objectStore = transaction.objectStore('ndtData');
        const request = objectStore.get('main_data');

        request.onsuccess = function() {
            const result = request.result;
            const data = result ? result.data : {};
            const orgData = data[orgId];

            if (orgData) {
                console.log(`\n📁 Organization: ${orgId}`);
                console.log(JSON.stringify(orgData, null, 2));
            } else {
                console.warn(`⚠️  No data found for organization: ${orgId}`);
                console.log('Available organizations:', Object.keys(data));
            }
        };
    };
};

console.log('\n💡 Helper functions loaded:');
console.log('   - exportAllData() - Download all data as JSON');
console.log('   - viewOrgData("ORG_ID") - View specific org data');
