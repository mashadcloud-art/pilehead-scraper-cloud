const { scrapeProduct } = require('./scraper/fosroc');
const axios = require('axios');
const fs = require('fs');

async function reuploadNitotileGP() {
    try {
        console.log('🔄 Re-uploading NITOTILE GP with datasheets...\n');
        
        // 1. Scrape the updated product
        console.log('Step 1: Scraping NITOTILE GP...');
        const config = {
            headless: false,
            timeout: 60000
        };
        
        const product = await scrapeProduct('https://buy.fosroc.ae/nitotile-gp', config);
        
        console.log(`✓ Scraped: ${product.name}`);
        console.log(`✓ Datasheets found: ${product.datasheets.length}`);
        
        if (product.datasheets.length === 0) {
            console.error('✗ No datasheets found! Aborting...');
            process.exit(1);
        }
        
        product.datasheets.forEach((ds, i) => {
            console.log(`  ${i + 1}. [${ds.type}] ${ds.url}`);
        });
        
        // 2. Prepare WordPress credentials
        console.log('\nStep 2: Preparing for WordPress update...');
        const wpUrl = 'http://129.159.235.164';
        const consumerKey = 'ck_4c65614a4a66316bf1504adeb50cc86a879732ae';
        const consumerSecret = 'cs_86e4863c2b3bcbbb566849c977f43fc947df1497';
        
        // Find the existing product (NITOTILE GP)
        const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        
        console.log('\nStep 3: Finding existing NITOTILE GP product...');
        const searchRes = await axios.get(`${wpUrl}/wp-json/wc/v3/products`, {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'X-Forwarded-Proto': 'https'
            },
            params: {
                search: 'NITOTILE GP',
                per_page: 1
            }
        });
        
        if (!searchRes.data || searchRes.data.length === 0) {
            console.error('✗ NITOTILE GP product not found in WordPress!');
            process.exit(1);
        }
        
        const wpProduct = searchRes.data[0];
        const productId = wpProduct.id;
        console.log(`✓ Found existing product - ID: ${productId}`);
        
        // 3. Build meta data for datasheets
        console.log('\nStep 4: Adding datasheets to product meta...');
        const metaData = [];
        
        const tds = product.datasheets.find(d => d.type === 'TDS');
        const sds = product.datasheets.find(d => d.type === 'SDS');
        const ms = product.datasheets.find(d => d.type === 'MS');
        
        if (tds) {
            metaData.push({ key: 'datasheet_url', value: tds.url });
            console.log(`  ✓ TDS: ${tds.url}`);
        }
        if (sds) {
            metaData.push({ key: 'sds_url', value: sds.url });
            console.log(`  ✓ SDS: ${sds.url}`);
        }
        if (ms) {
            metaData.push({ key: 'ms_url', value: ms.url });
            console.log(`  ✓ MS: ${ms.url}`);
        }
        
        // 4. Update the product
        console.log('\nStep 5: Updating WordPress product...');
        const updateRes = await axios.post(
            `${wpUrl}/wp-json/wc/v3/products/${productId}`,
            {
                meta_data: metaData
            },
            {
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'X-Forwarded-Proto': 'https',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (updateRes.status === 200) {
            console.log(`\n✅ SUCCESS! NITOTILE GP product updated`);
            console.log(`   Product ID: ${productId}`);
            console.log(`   Permalink: ${updateRes.data.permalink}`);
            console.log(`\n📋 Datasheets added to meta fields:`);
            console.log(`   - datasheet_url (TDS)`);
            console.log(`   - sds_url (SDS)`);
            console.log(`   - ms_url (MS)`);
            console.log(`\n🌐 Visit the live page to see the datasheets:`);
            console.log(`   https://www.pilehead.com/nitotile-gp/`);
            process.exit(0);
        } else {
            console.error('✗ Update failed with status:', updateRes.status);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        process.exit(1);
    }
}

reuploadNitotileGP();
