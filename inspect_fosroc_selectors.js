const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const helpers = require('./scraper/helpers');

puppeteer.use(StealthPlugin());

async function inspectSelectors() {
    let browser;
    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--start-maximized']
        });

        const page = await browser.newPage();
        await page.setUserAgent(helpers.getRandomUserAgent());
        
        // Test a real Fosroc product URL
        const testUrl = 'https://buy.fosroc.ae/nitomortar-fc';
        console.log(`\nInspecting: ${testUrl}\n`);
        
        await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Extract page structure and all potential selectors
        const analysis = await page.evaluate(() => {
            const result = {
                pageTitle: document.title,
                h1Tags: [],
                h2Tags: [],
                productNameCandidates: [],
                classCandidates: [],
                idCandidates: [],
                imageElements: [],
                datasheetLinks: [],
                priceElements: [],
                skuElements: []
            };

            // Collect all h1 tags
            document.querySelectorAll('h1').forEach((el, i) => {
                result.h1Tags.push({
                    index: i,
                    text: el.innerText?.trim().substring(0, 100) || '',
                    classes: el.className,
                    id: el.id
                });
            });

            // Collect all h2 tags
            document.querySelectorAll('h2').forEach((el, i) => {
                result.h2Tags.push({
                    index: i,
                    text: el.innerText?.trim().substring(0, 100) || '',
                    classes: el.className,
                    id: el.id
                });
            });

            // Find elements with product-related class names
            const productSelectors = [
                '.product-name', '.product-title', '.title', '.product-heading',
                '[data-product-name]', '[data-product-title]', 
                '.product-main-name', '.main-title',
                '.pname', '.p-name', '.productName'
            ];

            productSelectors.forEach(selector => {
                const els = document.querySelectorAll(selector);
                if (els.length > 0) {
                    els.forEach((el, i) => {
                        if (el.innerText?.trim()) {
                            result.productNameCandidates.push({
                                selector: selector,
                                index: i,
                                text: el.innerText.trim().substring(0, 100),
                                classes: el.className,
                                id: el.id
                            });
                        }
                    });
                }
            });

            // Find all image elements
            Array.from(document.querySelectorAll('img')).slice(0, 10).forEach((img, i) => {
                if (img.src || img.getAttribute('data-src')) {
                    result.imageElements.push({
                        index: i,
                        src: (img.src || img.getAttribute('data-src') || '').substring(0, 80),
                        alt: img.alt?.substring(0, 80) || '',
                        classes: img.className,
                        width: img.width,
                        height: img.height
                    });
                }
            });

            // Find all PDF/datasheet links
            document.querySelectorAll('a[href*=".pdf"], a[href*="download"], a[href*="datasheet"]').forEach((link, i) => {
                result.datasheetLinks.push({
                    index: i,
                    href: link.href?.substring(0, 100) || '',
                    text: link.innerText?.trim().substring(0, 50) || '',
                    classes: link.className
                });
            });

            // Find price-related elements
            const priceSelectors = [
                '.price', '.product-price', '[data-price]', 
                '.amount', '.cost', '.value', '.product-cost',
                '[data-amount]', '.price-tag'
            ];

            priceSelectors.forEach(selector => {
                const els = document.querySelectorAll(selector);
                els.forEach((el, i) => {
                    if (el.innerText?.trim() && /\d/.test(el.innerText)) {
                        result.priceElements.push({
                            selector: selector,
                            index: i,
                            text: el.innerText.trim().substring(0, 50),
                            classes: el.className
                        });
                    }
                });
            });

            // Find SKU/code elements
            const skuSelectors = [
                '.sku', '.product-code', '.product-sku', '[data-sku]',
                '[data-code]', '.code', '.item-code'
            ];

            skuSelectors.forEach(selector => {
                const els = document.querySelectorAll(selector);
                els.forEach((el, i) => {
                    if (el.innerText?.trim()) {
                        result.skuElements.push({
                            selector: selector,
                            index: i,
                            text: el.innerText.trim().substring(0, 50),
                            classes: el.className
                        });
                    }
                });
            });

            return result;
        });

        console.log('=== PAGE ANALYSIS ===\n');
        console.log(`Page Title: ${analysis.pageTitle}\n`);

        if (analysis.h1Tags.length > 0) {
            console.log('H1 Tags Found:');
            analysis.h1Tags.forEach(h1 => {
                console.log(`  - "${h1.text}"`);
                if (h1.classes) console.log(`    Classes: ${h1.classes}`);
                if (h1.id) console.log(`    ID: ${h1.id}`);
            });
            console.log();
        }

        if (analysis.productNameCandidates.length > 0) {
            console.log('Product Name Candidates:');
            analysis.productNameCandidates.forEach(candidate => {
                console.log(`  [${candidate.selector}] - "${candidate.text}"`);
            });
            console.log();
        }

        if (analysis.imageElements.length > 0) {
            console.log('Image Elements:');
            analysis.imageElements.forEach(img => {
                console.log(`  - ${img.src}`);
                if (img.alt) console.log(`    Alt: ${img.alt}`);
            });
            console.log();
        }

        if (analysis.datasheetLinks.length > 0) {
            console.log('Datasheet/PDF Links:');
            analysis.datasheetLinks.slice(0, 5).forEach(link => {
                console.log(`  - "${link.text}" → ${link.href}`);
            });
            console.log();
        }

        if (analysis.priceElements.length > 0) {
            console.log('Price Elements:');
            analysis.priceElements.forEach(price => {
                console.log(`  [${price.selector}] - "${price.text}"`);
            });
            console.log();
        }

        if (analysis.skuElements.length > 0) {
            console.log('SKU/Code Elements:');
            analysis.skuElements.forEach(sku => {
                console.log(`  [${sku.selector}] - "${sku.text}"`);
            });
            console.log();
        }

        // Raw HTML inspection - check meta tags
        const metaData = await page.evaluate(() => {
            return {
                ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
                ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content'),
                ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
                metaTitle: document.querySelector('meta[name="title"]')?.getAttribute('content'),
                metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content')
            };
        });

        if (Object.values(metaData).some(v => v)) {
            console.log('Meta Tags:');
            if (metaData.ogTitle) console.log(`  og:title: ${metaData.ogTitle}`);
            if (metaData.ogDescription) console.log(`  og:description: ${metaData.ogDescription}`);
            if (metaData.metaTitle) console.log(`  title: ${metaData.metaTitle}`);
        }

        console.log('\n=== RECOMMENDATION ===');
        console.log('Based on the analysis above, update fosroc.js selectors:');
        if (analysis.h1Tags.length > 0) {
            console.log('✓ Use h1 for product name (most likely selector)');
        }

    } catch (error) {
        console.error('Error during inspection:', error.message);
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (_) {}
        }
    }
}

inspectSelectors();
