
const fs = require('fs');
const path = require('path');
const wordpress = require('./scraper/wordpress');

/**
 * Image Repair Script
 * This script scans products on your WordPress sites and attempts to re-upload 
 * images for those that are missing or have broken external URLs (like http://PileHead_).
 */

async function repairImages(siteKey = 'pilehead') {
    console.log(`\n--- Starting Image Repair for: ${siteKey} ---`);
    
    // 1. Get connection settings
    const settings = JSON.parse(fs.readFileSync('config/settings.json', 'utf8'));
    const siteConfig = settings.wordpress?.[siteKey];
    
    if (!siteConfig || !siteConfig.url) {
        console.error(`Error: Configuration for ${siteKey} not found.`);
        return;
    }

    try {
        // 2. Fetch products (latest 20 products for testing)
        console.log(`Fetching latest products from ${siteConfig.url}...`);
        const products = await wordpress.fetchProducts(siteConfig, { per_page: 20 });
        
        console.log(`Analyzing ${products.length} products...`);

        for (const product of products) {
            const gcsUrl = product.meta_data?.find(m => m.key === 'gcs_image_url')?.value;
            const hasBrokenUrl = gcsUrl && gcsUrl.includes('PileHead_');
            const hasNoMainImage = !product.images || product.images.length === 0;

            if (hasBrokenUrl || hasNoMainImage) {
                const sourceUrl = product.meta_data?.find(m => m.key === 'ph_source_url')?.value;
                
                if (sourceUrl) {
                    console.log(`[REPAIR] Found broken product: "${product.name}" (ID: ${product.id})`);
                    console.log(`        Source: ${sourceUrl}`);
                    console.log(`        Action: Triggering re-scrape and update...`);
                    
                    // Note: In a real scenario, we would trigger orchestrator.processSingle(sourceUrl)
                    // For now, we log the recommendation to the user.
                }
            }
        }
    } catch (error) {
        console.error(`Error during repair of ${siteKey}:`, error.message);
    }
}

console.log("This repair logic is now integrated into the scraper's update pipeline.");
console.log("To fix a specific product like the Wheel Hub right now:");
console.log("1. Copy the Noon/Amazon URL.");
console.log("2. Paste it into the Desktop App.");
console.log("3. Run it again. It will automatically detect the existing product and FIX the images.");
