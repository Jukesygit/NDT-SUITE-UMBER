// INSTRUCTIONS:
// 1. Open your app in the browser and log in
// 2. Go to Personnel Management page
// 3. Open browser console (F12)
// 4. Copy and paste this entire script into the console
// 5. It will download a file called "database-competencies.txt"

(async function exportCompetencies() {
  try {
    console.log('Fetching competencies from database...');

    // Import the competency service from your app
    const { default: competencyService } = await import('/src/services/competency-service.js');

    // Get all competency definitions
    const competencies = await competencyService.getAllCompetencyDefinitions();

    console.log(`Found ${competencies.length} competencies in database`);

    // Group by category
    const byCategory = {};
    competencies.forEach(comp => {
      const cat = comp.category?.name || 'Uncategorized';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(comp.name);
    });

    // Create output
    let output = `=== DATABASE COMPETENCIES ===\n`;
    output += `Total: ${competencies.length}\n\n`;

    Object.keys(byCategory).sort().forEach(category => {
      output += `\n${category} (${byCategory[category].length}):\n`;
      byCategory[category].sort().forEach(name => {
        output += `  - ${name}\n`;
      });
    });

    // Also list alphabetically
    output += `\n\n=== ALPHABETICAL LIST ===\n\n`;
    const allNames = competencies.map(c => c.name).sort();
    allNames.forEach(name => output += `${name}\n`);

    // Download as text file
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'database-competencies.txt';
    a.click();
    URL.revokeObjectURL(url);

    console.log('✅ Downloaded database-competencies.txt');
    console.log(`Total competencies: ${competencies.length}`);

  } catch (error) {
    console.error('Error:', error);
  }
})();
