const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { scrapeProduct } = require('./scraper/fosroc');

const SCRAPED_DATA_DIR = './scraped_data';
const BATCH_SIZE = 3; // Process 3 products at a time to avoid overwhelming

// WordPress credentials
const WP_URL = 'http://129.159.235.164';
const WP_CONSUMER_KEY = 'ck_4c65614a4a66316bf1504adeb50cc86a879732ae';
const WP_CONSUMER_SECRET = 'cs_86e4863c2b3bcbbb566849c977f43fc947df1497';
const WP_AUTH_HEADER = Buffer.from(`${WP_CONSUMER_KEY}:${WP_CONSUMER_SECRET}`).toString('base64');

async function findFosrocProductsWithNoDatasheets() {
  const files = fs.readdirSync(SCRAPED_DATA_DIR).filter(f => f.endsWith('.json'));
  const productsToUpdate = [];

  for (const file of files) {
    try {
      const filePath = path.join(SCRAPED_DATA_DIR, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Check if Fosroc product and has empty datasheets
      if (content.raw && content.raw.url && 
          content.raw.url.includes('buy.fosroc.ae') &&
          Array.isArray(content.raw.datasheets) &&
          content.raw.datasheets.length === 0) {
        
        productsToUpdate.push({
          file,
          url: content.raw.url,
          name: content.raw.name || 'Unknown',
          timestamp: Date.now()
        });
      }
    } catch (e) {
      // Skip invalid JSON files
    }
  }

  return productsToUpdate;
}

async function rescrapeProduct(productUrl) {
  try {
    const config = {
      headless: false,
      timeout: 60000
    };
    const scrapedData = await scrapeProduct(productUrl, config);
    return scrapedData;
  } catch (error) {
    console.error(`  ✗ Failed to scrape: ${error.message}`);
    return null;
  }
}

async function findWordpressProductByName(productName) {
  try {
    const response = await axios.get(`${WP_URL}/wp-json/wc/v3/products`, {
      headers: {
        'Authorization': `Basic ${WP_AUTH_HEADER}`,
        'X-Forwarded-Proto': 'https'
      },
      params: {
        search: productName,
        per_page: 1
      }
    });

    if (response.data && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch (error) {
    console.error(`  ✗ Failed to find product in WordPress: ${error.message}`);
    return null;
  }
}

async function updateWordpressProductDatsheets(wpProductId, datasheets) {
  try {
    const metaData = [];
    
    const tds = datasheets.find(d => d.type === 'TDS');
    const sds = datasheets.find(d => d.type === 'SDS');
    const ms = datasheets.find(d => d.type === 'MS');
    
    if (tds) metaData.push({ key: 'datasheet_url', value: tds.url });
    if (sds) metaData.push({ key: 'sds_url', value: sds.url });
    if (ms) metaData.push({ key: 'ms_url', value: ms.url });

    const response = await axios.post(
      `${WP_URL}/wp-json/wc/v3/products/${wpProductId}`,
      { meta_data: metaData },
      {
        headers: {
          'Authorization': `Basic ${WP_AUTH_HEADER}`,
          'X-Forwarded-Proto': 'https',
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error(`  ✗ Failed to update WordPress: ${error.message}`);
    return null;
  }
}

async function processBatch(products) {
  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(products.length / BATCH_SIZE)}`);
    console.log(`${'='.repeat(60)}\n`);

    for (const product of batch) {
      const idx = results.success.length + results.failed.length + results.skipped.length + 1;
      console.log(`[${idx}/${products.length}] ${product.name}`);
      
      try {
        // Re-scrape with enhanced scraper
        console.log(`  • Scraping from Fosroc...`);
        const scrapedData = await rescrapeProduct(product.url);
        
        if (!scrapedData) {
          results.failed.push({
            name: product.name,
            url: product.url,
            reason: 'Scrape failed'
          });
          console.log(`  ✗ Scrape failed\n`);
          continue;
        }

        // Check if datasheets were found
        if (!scrapedData.datasheets || scrapedData.datasheets.length === 0) {
          results.skipped.push({
            name: product.name,
            url: product.url,
            reason: 'No datasheets found in Fosroc'
          });
          console.log(`  ⊘ No datasheets found in Fosroc\n`);
          continue;
        }

        console.log(`  ✓ Found ${scrapedData.datasheets.length} datasheets`);
        scrapedData.datasheets.forEach(ds => {
          console.log(`    - [${ds.type}] ${ds.url}`);
        });

        // Find WordPress product
        console.log(`  • Looking for product in WordPress...`);
        const wpProduct = await findWordpressProductByName(scrapedData.name);
        
        if (!wpProduct) {
          results.failed.push({
            name: product.name,
            url: product.url,
            reason: 'Not found in WordPress'
          });
          console.log(`  ✗ Product not found in WordPress\n`);
          continue;
        }

        console.log(`  ✓ Found in WordPress (ID: ${wpProduct.id})`);

        // Update WordPress with datasheets
        console.log(`  • Updating WordPress...`);
        const updateResult = await updateWordpressProductDatsheets(wpProduct.id, scrapedData.datasheets);
        
        if (updateResult) {
          results.success.push({
            name: product.name,
            url: product.url,
            wpId: wpProduct.id,
            datasheetCount: scrapedData.datasheets.length,
            wpPermalink: updateResult.permalink
          });
          console.log(`  ✓ Updated in WordPress`);
          console.log(`  ✓ Visit: ${updateResult.permalink}\n`);
        } else {
          results.failed.push({
            name: product.name,
            url: product.url,
            reason: 'WordPress update failed'
          });
          console.log(`  ✗ WordPress update failed\n`);
        }

      } catch (error) {
        console.error(`  ✗ Unexpected error:`, error.message);
        results.failed.push({
          name: product.name,
          url: product.url,
          reason: error.message
        });
        console.log();
      }

      // Add delay between requests
      try {
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (e) {
        // ignore
      }
    }
  }

  return results;
}

function printReport(results) {
  console.log('\n\n╔════════════════════════════════════════════════════════╗');
  console.log('║         BATCH PROCESSING REPORT                       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log(`✓ Successfully Updated: ${results.success.length}`);
  if (results.success.length > 0) {
    results.success.forEach(item => {
      console.log(`  • ${item.name}`);
      console.log(`    ID: ${item.wpId} | Datasheets: ${item.datasheetCount}`);
      console.log(`    URL: ${item.wpPermalink}`);
    });
  }

  console.log(`\n✗ Failed: ${results.failed.length}`);
  if (results.failed.length > 0) {
    results.failed.forEach(item => {
      console.log(`  • ${item.name} - ${item.reason}`);
    });
  }

  console.log(`\n⊘ Skipped (No datasheets found): ${results.skipped.length}`);
  if (results.skipped.length > 0) {
    results.skipped.forEach(item => {
      console.log(`  • ${item.name}`);
    });
  }

  console.log(`\n${'═'.repeat(56)}`);
  console.log(`Total Processed: ${results.success.length + results.failed.length + results.skipped.length}`);
  console.log(`${'═'.repeat(56)}\n`);

  // Save report to file
  const reportDir = './reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportPath = path.join(reportDir, `datasheet-batch-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Report saved to: ${reportPath}\n`);
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  FOSROC DATASHEET BATCH RE-SCRAPER & UPLOADER         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    console.log('🔍 Scanning for Fosroc products with empty datasheets...\n');
    const products = await findFosrocProductsWithNoDatasheets();

    if (products.length === 0) {
      console.log('✓ No Fosroc products with empty datasheets found!');
      console.log('  All products appear to have datasheets already.\n');
      return;
    }

    console.log(`Found ${products.length} products that need updating:\n`);
    products.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name}`);
      console.log(`     URL: ${p.url}\n`);
    });

    console.log('⏳ Starting batch processing...\n');
    const results = await processBatch(products);
    
    printReport(results);

    process.exit(results.failed.length > 0 ? 1 : 0);

  } catch (error) {
    console.error('✗ Fatal error:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
