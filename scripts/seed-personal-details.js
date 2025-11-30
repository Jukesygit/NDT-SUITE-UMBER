/**
 * Seed Personal Detail Competency Definitions
 * Run this script to add personal detail fields to the competency system
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env file manually
const envPath = join(__dirname, '..', '.env');
const envFile = readFileSync(envPath, 'utf8');
const envVars = {};

envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+?)\s*=\s*(.*)?\s*$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2] ? match[2].trim().replace(/^["']|["']$/g, '') : '';
        envVars[key] = value;
    }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env file');
    console.error('Found:', { supabaseUrl, hasKey: !!supabaseKey });
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedPersonalDetails() {
    console.log('Starting personal details seed...\n');

    try {
        // First, ensure the Personal Details category exists
        let { data: category, error: categoryError } = await supabase
            .from('competency_categories')
            .select('id, name')
            .eq('name', 'Personal Details')
            .single();

        if (categoryError && categoryError.code === 'PGRST116') {
            // Category doesn't exist, create it
            console.log('Creating Personal Details category...');
            const { data: newCategory, error: createError } = await supabase
                .from('competency_categories')
                .insert({ name: 'Personal Details', display_order: 1 })
                .select()
                .single();

            if (createError) {
                throw createError;
            }
            category = newCategory;
            console.log('✓ Category created\n');
        } else if (categoryError) {
            throw categoryError;
        } else {
            console.log('✓ Personal Details category found\n');
        }

        // Define personal detail fields
        const personalDetails = [
            { name: 'Date of Birth', field_type: 'date', requires_document: false, display_order: 1 },
            { name: 'Mobile Number', field_type: 'text', requires_document: false, display_order: 2 },
            { name: 'Email Address', field_type: 'text', requires_document: false, display_order: 3 },
            { name: 'Home Address', field_type: 'text', requires_document: false, display_order: 4 },
            { name: 'Nearest UK Train Station', field_type: 'text', requires_document: false, display_order: 5 },
            { name: 'Next of Kin / Emergency Contact Name', field_type: 'text', requires_document: false, display_order: 6 },
            { name: 'Next of Kin / Emergency Contact Number', field_type: 'text', requires_document: false, display_order: 7 }
        ];

        console.log('Adding personal detail fields...\n');

        for (const detail of personalDetails) {
            // Check if already exists
            const { data: existing } = await supabase
                .from('competency_definitions')
                .select('id, name')
                .eq('category_id', category.id)
                .eq('name', detail.name)
                .single();

            if (existing) {
                console.log(`  ⊘ ${detail.name} - already exists`);
            } else {
                const { error: insertError } = await supabase
                    .from('competency_definitions')
                    .insert({
                        category_id: category.id,
                        name: detail.name,
                        field_type: detail.field_type,
                        requires_document: detail.requires_document,
                        display_order: detail.display_order
                    });

                if (insertError) {
                    console.error(`  ✗ ${detail.name} - ERROR:`, insertError.message);
                } else {
                    console.log(`  ✓ ${detail.name} - added`);
                }
            }
        }

        console.log('\n✓ Personal details seed completed successfully!');
        console.log('\nYou can now add these fields on user profile pages.');

    } catch (error) {
        console.error('Error seeding personal details:', error.message);
        process.exit(1);
    }
}

seedPersonalDetails();
