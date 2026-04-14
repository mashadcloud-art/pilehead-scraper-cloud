const noonScraper = require('./scraper/noon');
const helpers = require('./scraper/helpers');

// Override helpers.log to print to console
helpers.log = (msg) => console.log(`[LOG] ${msg}`);

async function run() {
    const url = 'https://www.noon.com/uae-en/men-s-s-cotton-solid-halfsleeve-polo-tshirt-wine/Z6D5579EF10F219C61CB3Z/p/?o=af2f3239dab914be&shareId=0bc7c110-6950-4ae6-b347-ab297fc6770e';
    
    console.log('Starting verification...');
    try {
        const result = await noonScraper.scrapeProduct(url, { timeout: 60000 });
        
        console.log('--------------------------------------------------');
        console.log('Scrape Result Summary:');
        console.log(`Title: ${result.name}`);
        console.log(`Parent SKU: ${result.sku}`);
        console.log(`Total Variations Found: ${result.variations.length}`);
        
        console.log('\nSample Variations (First 5):');
        result.variations.slice(0, 5).forEach((v, i) => {
            console.log(`#${i+1} SKU: ${v.sku} | Price: ${v.price} | Stock: ${v.stock_quantity}`);
            console.log(`   Attributes: ${JSON.stringify(v.attributes)}`);
        });

        // Check for specific attributes
        const colors = new Set();
        const sizes = new Set();
        
        result.variations.forEach(v => {
            const c = v.attributes.find(a => a.name === 'Color');
            if (c) colors.add(c.value);
            
            const s = v.attributes.find(a => a.name === 'Size');
            if (s) sizes.add(s.value);
        });
        
        console.log('\nUnique Colors Found:', Array.from(colors));
        console.log('Unique Sizes Found:', Array.from(sizes));
        
        if (colors.size > 5 && sizes.size > 0) {
            console.log('\n✅ SUCCESS: Found multiple colors and sizes!');
        } else {
            console.log('\n⚠️ WARNING: Low variation count. Check logic.');
        }

    } catch (error) {
        console.error('Scrape Failed:', error);
    }
}

run();
