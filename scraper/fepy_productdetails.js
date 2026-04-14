const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

/**
 * Universal Product Details Scraper
 * Extracts comprehensive details (Title, Price, Brand, Specs, Description)
 * from almost any e-commerce product page using generic selectors.
 * @param {string} url - Product URL
 * @param {object} [options] - Optional puppeteer launch options
 * @returns {Promise<object>} - Scraped product data with a styled Product Details tab
 */
async function scrapeFepyProductWithDetails(url, options = {}) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], ...options });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (e) {
        // Fallback for timeout or restricted pages
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    
    await new Promise(r => setTimeout(r, 3000));

    const product = await page.evaluate((url) => {
        // --- 0. HELPERS ---
        const clean = txt => (txt || '').replace(/\s{2,}/g, ' ').trim();
        
        // --- 1. TITLE EXTRACTION (Universal) ---
        const titleSelectors = [
            'h1', '.product-title', '[itemprop="name"]', 
            '.page-title', '.product-info-main h1', 
            '.product-name', '#product-name', '.title'
        ];
        let title = '';
        for (const sel of titleSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                title = el.textContent.trim();
                break;
            }
        }
        if (!title) title = document.title.split('|')[0].split('-')[0].trim();

        // --- 2. PRICE EXTRACTION (Universal) ---
        const priceSelectors = [
            '.price', '[itemprop="price"]', '.product-price',
            '.price-box .price', '.price-container .price',
            '.product-info-main .price', '[data-price-type="finalPrice"]',
            '.special-price', '.regular-price', '.amount'
        ];
        let price = '';
        for (const sel of priceSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                const pText = el.textContent.trim();
                const match = pText.match(/[0-9.,]+/);
                if (match) {
                    price = match[0];
                    // Detect currency
                    if (pText.toLowerCase().includes('aed')) price = 'AED ' + price;
                    else if (pText.includes('$')) price = '$' + price;
                    else if (pText.toLowerCase().includes('sar')) price = 'SAR ' + price;
                    break;
                }
            }
        }
        // Fallback: Meta Tags
        if (!price) {
            price = document.querySelector('meta[property="product:price:amount"]')?.content || 
                    document.querySelector('meta[name="twitter:data1"]')?.content;
        }

        // --- 3. BRAND EXTRACTION (Universal) ---
        const brandSelectors = [
            '.brand', '[itemprop="brand"]', '.product-brand',
            '.manufacturer', '.vendor', '.brand-link',
            '[data-attribute="brand"]'
        ];
        let brand = '';
        for (const sel of brandSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                brand = el.textContent.trim();
                break;
            }
        }
        // Fallback: If title contains a common brand
        if (!brand && title) {
            const commonBrands = ['Makita', 'Jotun', 'Fosroc', 'Philips', 'Bosch', 'Dewalt', 'Karcher', 'Apple', 'Samsung', 'LG', 'Sony'];
            for (const b of commonBrands) {
                if (title.toLowerCase().includes(b.toLowerCase())) {
                    brand = b;
                    break;
                }
            }
        }

        // --- 4. CATEGORY EXTRACTION (Universal) ---
        let category = '';
        const bc = document.querySelector('.breadcrumb, .breadcrumbs, [class*="breadcrumb"], .items, .nav-links');
        if (bc) {
            const items = Array.from(bc.querySelectorAll('li, a, span'))
                .map(el => el.textContent.trim())
                .filter(Boolean);
            if (items.length > 1) {
                category = items[items.length - 2]; // Parent category
            }
        }

        // --- 5. OVERVIEW / DESCRIPTION EXTRACTION (Universal) ---
        let overview = '';
        const overviewSelectors = [
            '#description', '.product.attribute.description', 
            '.product-overview', '.product-description', 
            '.product-content', '[itemprop="description"]',
            '.details-content', '#product-details'
        ];
        for (const sel of overviewSelectors) {
            const el = document.querySelector(sel);
            if (el && el.innerHTML.trim().length > 30) {
                overview = el.innerHTML;
                break;
            }
        }

        // --- 6. SPECIFICATIONS EXTRACTION (Universal) ---
        let specs = [];
        const specContainers = [
            'table.additional-attributes', '#product-attribute-specs-table',
            'table.data.table', '.specs-table', '.specifications table',
            '.technical-details table', '.prod-specs table'
        ];
        let specFound = false;
        for (const sel of specContainers) {
            const table = document.querySelector(sel);
            if (table) {
                specs = Array.from(table.querySelectorAll('tr')).map(tr => {
                    const th = tr.querySelector('th, td:first-child');
                    const td = tr.querySelector('td:last-child');
                    if (th && td) return clean(th.textContent) + ': ' + clean(td.textContent);
                    return '';
                }).filter(Boolean);
                if (specs.length > 0) { specFound = true; break; }
            }
        }
        
        if (!specFound) {
            const bulletSpecs = Array.from(document.querySelectorAll('.product-description li, .tab-content li, .product-specs li'))
                .map(li => clean(li.textContent))
                .filter(txt => txt.includes(':') || txt.includes('-'));
            if (bulletSpecs.length > 0) specs = bulletSpecs;
        }

        // --- 7. ATTRIBUTES / OPTIONS (Universal) ---
        let attributes = [];
        const attrBlocks = document.querySelectorAll('.product-option, .swatch-attribute, .configurable-option, .size-chart');
        attrBlocks.forEach(block => {
            const name = block.querySelector('.label, label, .swatch-attribute-label')?.textContent.replace(':', '').trim();
            if (name) {
                const options = Array.from(block.querySelectorAll('button, .swatch-option, option'))
                    .map(opt => opt.textContent.trim())
                    .filter(opt => opt && !/select|choose/i.test(opt));
                if (options.length) attributes.push({ name, options });
            }
        });

        // --- 8. GALLERY IMAGES ---
        const gallery = Array.from(document.querySelectorAll('.fotorama__img, .product-gallery img, img[itemprop="image"], .main-image img'))
            .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-zoom-image'))
            .filter(Boolean);

        // --- 9. GENERATE PRODUCT DETAILS TAB HTML ---
        let detailsHtml = '<div class="product-details-container">';
        detailsHtml += '<table class="product-details-table"><tbody>';
        if (title) detailsHtml += `<tr><td class="label">Product Name:</td><td class="value">${title}</td></tr>`;
        if (category) detailsHtml += `<tr><td class="label">Category:</td><td class="value">${category}</td></tr>`;
        if (brand) detailsHtml += `<tr><td class="label">Brand:</td><td class="value">${brand}</td></tr>`;
        if (price) detailsHtml += `<tr><td class="label">Price:</td><td class="value">${price}</td></tr>`;
        if (attributes.length) attributes.forEach(attr => { detailsHtml += `<tr><td class="label">${attr.name}:</td><td class="value">${attr.options.join(', ')}</td></tr>`; });
        detailsHtml += '</tbody></table>';

        if (overview) {
            detailsHtml += '<div class="product-overview-section"><h3 class="section-title">Product Overview</h3>';
            detailsHtml += `<div class="overview-content">${overview}</div></div>`;
        }

        if (specs.length) {
            detailsHtml += '<div class="product-specs-section"><h3 class="section-title">Key Specifications</h3><ul>';
            specs.forEach(spec => { detailsHtml += `<li>${spec}</li>`; });
            detailsHtml += '</ul></div>';
        }

        detailsHtml += `<style>
            .product-details-container { font-family: 'Inter', sans-serif; padding: 20px; color: #333; line-height: 1.6; }
            .product-details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 1px solid #eee; }
            .product-details-table td { padding: 12px 15px; border-bottom: 1px solid #eee; font-size: 14px; }
            .product-details-table td.label { font-weight: 600; width: 30%; color: #666; background: #fafafa; }
            .section-title { font-size: 18px; font-weight: 700; margin: 25px 0 15px; color: #111; border-bottom: 2px solid #0a84ff; display: inline-block; }
            .product-specs-section ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
            .product-specs-section li { padding: 8px 12px; background: #f9f9f9; border-left: 3px solid #0a84ff; font-size: 13px; }
        </style></div>`;

        const finalData = {
            title, price, brand, category, overview, gallery, specs, attributes,
            tabs: { productDetails: detailsHtml },
            similarUrls: Array.from(new Set(Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h && h.includes('/product/') && h !== url)))
        };

        // --- 10. UNIVERSAL WHITE-LABELING ---
        const deepClean = (obj) => {
            if (typeof obj === 'string') {
                return obj
                    .replace(/fepy\.com/gi, '')
                    .replace(/fepy/gi, '')
                    .replace(/Fepy/g, '')
                    .replace(/noon\.com/gi, '')
                    .replace(/amazon\.[a-z.]+/gi, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
            }
            if (Array.isArray(obj)) return obj.map(deepClean);
            if (obj && typeof obj === 'object') {
                const cleaned = {};
                for (const k in obj) cleaned[k] = deepClean(obj[k]);
                return cleaned;
            }
            return obj;
        };

        return deepClean(finalData);
    }, url);
    await browser.close();
    return product;
}

// CLI usage example
if (require.main === module) {
    const url = process.argv[2];
    if (!url) {
        console.error('Usage: node fepy_productdetails.js <FEPY_PRODUCT_URL>');
        process.exit(1);
    }
    scrapeFepyProductWithDetails(url).then(product => {
        const outDir = path.join(__dirname, '../scraped_data/fepy_products_details');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const fileName = (product.title || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
        const outPath = path.join(outDir, fileName);
        fs.writeFileSync(outPath, JSON.stringify(product, null, 2));
        console.log('Scraped and saved:', outPath);
    }).catch(e => {
        console.error('Scraping failed:', e);
        process.exit(1);
    });
}

module.exports = { scrapeFepyProductWithDetails };
