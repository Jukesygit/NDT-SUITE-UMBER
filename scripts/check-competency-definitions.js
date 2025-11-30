import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mhqfxmxymlchfgcrgsfj.supabase.co';
const supabaseKey = '***REDACTED_ANON_KEY***';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDefinitions() {
    console.log('Checking competency definitions...\n');

    const { data: definitions, error } = await supabase
        .from('competency_definitions')
        .select('id, name, field_type')
        .order('name');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Total definitions: ${definitions.length}\n`);

    // Check NDT
    const ndtDefs = definitions.filter(d =>
        d.name.includes('9712') ||
        d.name.includes('PCN Number') ||
        d.name.includes('PAUT') ||
        d.name.includes('TOFD') ||
        d.name.includes('MUT') ||
        d.name.includes('RAD') ||
        d.name.includes('ECI') ||
        d.name.includes('MPI') ||
        d.name.includes('LPI') ||
        d.name.includes('VIS')
    );
    console.log('NDT Certifications:', ndtDefs.length);
    ndtDefs.forEach(d => console.log(`  - ${d.name} (${d.field_type})`));

    // Check Plant/API
    const plantDefs = definitions.filter(d =>
        d.name.includes('API') ||
        d.name.includes('ASME') ||
        d.name.includes('CSWIP') ||
        d.name.includes('Plant Inspector')
    );
    console.log('\nPlant/API Qualifications:', plantDefs.length);
    plantDefs.forEach(d => console.log(`  - ${d.name} (${d.field_type})`));

    // Check Management
    const mgmtDefs = definitions.filter(d => d.name.includes('ISO'));
    console.log('\nManagement Training:', mgmtDefs.length);
    mgmtDefs.forEach(d => console.log(`  - ${d.name} (${d.field_type})`));

    // Check for a specific user's competencies
    console.log('\n\nChecking Michael McLaren\'s competencies...');
    const { data: users } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', '%michael%mclaren%')
        .limit(1);

    if (users && users.length > 0) {
        const { data: comps, error: compError } = await supabase
            .from('employee_competencies')
            .select(`
                id,
                value,
                expiry_date,
                issuing_body,
                certificate_number,
                competency_definitions (name, field_type)
            `)
            .eq('user_id', users[0].id);

        if (compError) {
            console.error('Error fetching competencies:', compError);
        } else {
            console.log(`Found ${comps.length} competencies for Michael McLaren`);
            const ndtComps = comps.filter(c =>
                c.competency_definitions.name.includes('9712') ||
                c.competency_definitions.name.includes('PCN')
            );
            const plantComps = comps.filter(c =>
                c.competency_definitions.name.includes('API') ||
                c.competency_definitions.name.includes('CSWIP')
            );
            const mgmtComps = comps.filter(c => c.competency_definitions.name.includes('ISO'));

            console.log(`  - NDT: ${ndtComps.length}`);
            console.log(`  - Plant/API: ${plantComps.length}`);
            console.log(`  - Management: ${mgmtComps.length}`);

            if (ndtComps.length > 0) {
                console.log('\nSample NDT competency:');
                console.log(JSON.stringify(ndtComps[0], null, 2));
            }
        }
    }
}

checkDefinitions();
