/**
 * FEPY Bulk Upload Handler
 * 
 * Converts scraped FEPY product data into WordPress-ready formats:
 * - JSON for API upload
 * - CSV for bulk import
 * - HTML for manual entry
 * 
 * USAGE:
 *   node fepy_bulk_upload.js
 */

const fs = require('fs');
const path = require('path');
const fepyUpload = require('./fepy_upload_handler');

(async () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  FEPY PRODUCT → WORDPRESS UPLOAD CONVERTER     ║');
    console.log('║  (JSON, CSV, HTML formats)                     ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    try {
        const scraperDir = path.join(__dirname, 'scraped_data', 'fepy_products');
        
        // Find all FEPY product JSON files
        if (!fs.existsSync(scraperDir)) {
            console.log('⚠️  No scraped FEPY products found in: ' + scraperDir);
            console.log('\n📝 STEPS:');
            console.log('  1. Run: node scrape_fepy_complete.js');
            console.log('  2. Then run this script again\n');
            return;
        }

        const files = fs.readdirSync(scraperDir).filter(f => 
            f.endsWith('.json') && !f.includes('_full')
        );

        if (files.length === 0) {
            console.log('⚠️  No product JSON files found\n');
            return;
        }

        console.log(`📁 Found ${files.length} FEPY product(s)\n`);

        const uploadDir = path.join(__dirname, 'wp_uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const products = [];
        const results = {
            json: [],
            csv: [],
            html: [],
            errors: []
        };

        // Process each product file
        for (const file of files) {
            try {
                const filePath = path.join(scraperDir, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const productData = JSON.parse(fileContent);
                products.push(productData);

                console.log(`✅ Processing: ${file}`);

                // Generate upload formats
                const baseName = file.replace('.json', '');

                // 1. JSON format
                try {
                    const jsonPath = fepyUpload.saveForManualUpload(
                        productData,
                        path.join(uploadDir, baseName + '_wp.json')
                    );
                    results.json.push({
                        product: productData.title,
                        file: path.basename(jsonPath),
                        path: jsonPath,
                        size: fs.statSync(jsonPath).size + ' bytes'
                    });
                    console.log(`   ✓ JSON: ${baseName}_wp.json`);
                } catch (e) {
                    console.log(`   ✗ JSON Failed: ${e.message}`);
                    results.errors.push(`${file} (JSON): ${e.message}`);
                }

                // 2. HTML format
                try {
                    const htmlPath = fepyUpload.generateHTMLForManualEntry(
                        productData,
                        path.join(uploadDir, baseName + '_wp_manual.html')
                    );
                    results.html.push({
                        product: productData.title,
                        file: path.basename(htmlPath),
                        path: htmlPath,
                        size: fs.statSync(htmlPath).size + ' bytes'
                    });
                    console.log(`   ✓ HTML: ${baseName}_wp_manual.html`);
                } catch (e) {
                    console.log(`   ✗ HTML Failed: ${e.message}`);
                    results.errors.push(`${file} (HTML): ${e.message}`);
                }

                console.log('');

            } catch (error) {
                console.log(`❌ Error processing ${file}: ${error.message}\n`);
                results.errors.push(`${file}: ${error.message}`);
            }
        }

        // 3. Generate bulk CSV (combine all products)
        if (products.length > 0) {
            try {
                const csvPath = fepyUpload.generateBulkImportCSV(
                    products,
                    path.join(uploadDir, 'fepy_products_bulk_import.csv')
                );
                results.csv = {
                    products: products.length,
                    file: path.basename(csvPath),
                    path: csvPath,
                    size: fs.statSync(csvPath).size + ' bytes'
                };
                console.log(`✅ Bulk CSV: fepy_products_bulk_import.csv\n`);
            } catch (e) {
                console.log(`❌ CSV Generation Failed: ${e.message}\n`);
                results.errors.push(`Bulk CSV: ${e.message}`);
            }
        }

        // Summary
        console.log('╔════════════════════════════════════════════════╗');
        console.log('║              CONVERSION COMPLETE               ║');
        console.log('╚════════════════════════════════════════════════╝\n');

        console.log('📊 RESULTS:\n');
        console.log(`✅ Products Processed: ${products.length}`);
        console.log(`   - JSON files: ${results.json.length}`);
        console.log(`   - HTML files: ${results.html.length}`);
        if (results.csv.products) {
            console.log(`   - Bulk CSV: ${results.csv.products} products`);
        }

        if (results.errors.length > 0) {
            console.log(`\n⚠️  Errors: ${results.errors.length}`);
            results.errors.forEach(err => console.log(`   - ${err}`));
        }

        console.log(`\n📁 Upload Directory: ${uploadDir}\n`);

        // Detailed file listing
        console.log('📋 GENERATED FILES:\n');
        console.log('For Individual Upload (REST API):');
        results.json.forEach(item => {
            console.log(`  • ${item.file}`);
            console.log(`    Product: ${item.product}`);
            console.log(`    Size: ${item.size}`);
        });

        if (results.csv.products) {
            console.log('\nFor Bulk Import (CSV):');
            console.log(`  • ${results.csv.file}`);
            console.log(`    Products: ${results.csv.products}`);
            console.log(`    Size: ${results.csv.size}`);
        }

        console.log('\nFor Manual Entry (Copy-Paste):');
        results.html.forEach(item => {
            console.log(`  • ${item.file}`);
            console.log(`    Product: ${item.product}`);
            console.log(`    Size: ${item.size}`);
        });

        // Usage instructions
        console.log('\n\n📝 NEXT STEPS:\n');
        console.log('🔷 Option 1: Bulk Import (RECOMMENDED)');
        console.log('   1. Go to: WordPress Admin → Products → Import');
        console.log('   2. Upload the CSV file:');
        console.log(`      ${results.csv.file || 'fepy_products_bulk_import.csv'}`);
        console.log('   3. Follow the importer prompts\n');

        console.log('🔷 Option 2: REST API Upload');
        console.log('   1. Use your API client or plugin');
        console.log('   2. POST to: /wp-json/wc/v3/products');
        console.log('   3. With body from JSON files in: ' + uploadDir + '\n');

        console.log('🔷 Option 3: Manual Entry');
        console.log('   1. Open the HTML file:');
        console.log(`      ${uploadDir}`);
        console.log('   2. Copy product details from the HTML');
        console.log('   3. Paste into WordPress admin product editor\n');

        console.log('═════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Fatal Error:', error.message);
        process.exit(1);
    }
})();
