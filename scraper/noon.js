const puppeteer = require('puppeteer');
const helpers = require('./helpers');

/**
 * Scrapes a single Noon product page to extract data.
 * This function assumes the page is already loaded.
 */
async function scrapeSinglePage(page, url) {
    return await page.evaluate((currentUrl) => {
        const normalizeImageUrl = (src) => {
            if (!src) return null;
            let u = src.split('?')[0].trim();
            if (!u) return null;
            return u;
        };
        const isReasonableProductImageShape = (img) => {
            if (!img) return false;
            const rect = img.getBoundingClientRect ? img.getBoundingClientRect() : null;
            const w = rect && rect.width ? rect.width : (img.naturalWidth || 0);
            const h = rect && rect.height ? rect.height : (img.naturalHeight || 0);
            if (!w || !h) return false;
            const area = w * h;
            if (area < 40000) return false;
            const ratio = w / h;
            if (ratio > 3 || ratio < 0.3) return false;
            return true;
        };
        const titleEl = document.querySelector('h1');
        const title = titleEl ? titleEl.innerText.trim() : '';
        
        // --- PRICE EXTRACTION ---
        let price = '';
        const readPriceFromElement = (el) => {
            if (!el) return '';
            const text = el.innerText ? el.innerText.trim() : '';
            if (!text) return '';
            if (/\d/.test(text)) return text;
            return '';
        };

        // Strategy 1: Specific DOM Selectors
        const priceNowText = document.querySelector('[class*="priceNowText"]');
        if (priceNowText && priceNowText.innerText && /\d/.test(priceNowText.innerText)) {
            const t = priceNowText.innerText.trim();
            if (parseFloat(t) > 0) price = t;
        }

        // Strategy 2: Common containers
        if (!price || parseFloat(price) === 0) {
            const directSelectors = [
                '.priceNow', '[data-qa="div-price-now"]', '.price',
                '[data-qa*="price-current"]', '[data-qa*="pdp-price"]', '[data-qa*="selling-price"]'
            ];
            for (const sel of directSelectors) {
                const el = document.querySelector(sel);
                const val = readPriceFromElement(el);
                if (val && parseFloat(val) > 0) {
                    price = val;
                    break;
                }
            }
        }

        // Strategy 3: Delivery Options Fallback
        if (!price || parseFloat(price) === 0) {
            const allDivs = Array.from(document.querySelectorAll('div, span, p, strong, b'));
            for (const el of allDivs) {
                const txt = el.innerText ? el.innerText.trim() : '';
                if (!txt || txt.length > 50) continue;
                if (txt.includes('0.00') || txt.includes('0.0')) continue;
                if (!/\d/.test(txt)) continue;
                
                const priceMatch = txt.match(/(?:AED|SAR|EGP|QAR|OMR|KWD|BHD|USD)\s*([\d,.]+)/i);
                if (priceMatch) {
                    const val = parseFloat(priceMatch[1].replace(/,/g, ''));
                    if (val > 0) {
                        const style = window.getComputedStyle(el);
                        if (!style.textDecorationLine.includes('line-through')) {
                            price = val.toString();
                            break; // Take first valid found
                        }
                    }
                }
            }
        }

        if (price) {
            const cleanMatch = price.match(/[\d,.]+/);
            if (cleanMatch) {
                const numeric = parseFloat(cleanMatch[0].replace(/,/g, ''));
                if (Number.isFinite(numeric) && numeric > 0) {
                    price = numeric.toString();
                } else {
                    price = '';
                }
            } else {
                price = '';
            }
        } else {
            price = '';
        }

        // --- IMAGE EXTRACTION ---
        const galleryImages = [];
        const galleryEls = document.querySelectorAll('div[data-qa="product-image-gallery"] img, .swiper-slide img, [data-qa^="product-image"] img');
        galleryEls.forEach(img => {
            const src = img && img.src ? img.src : '';
            if (!src || src.includes('data:image')) return;
            if (!isReasonableProductImageShape(img)) return;
            const fullRes = normalizeImageUrl(src);
            if (!fullRes) return;
            if (!galleryImages.includes(fullRes)) galleryImages.push(fullRes);
        });

        // Fallback images
        if (galleryImages.length <= 1) {
            const allImgs = document.querySelectorAll('img');
            allImgs.forEach(img => {
                const src = img && img.src ? img.src : '';
                if (!src) return;
                if (!isReasonableProductImageShape(img)) return;
                const hasProductPath = src.includes('nooncdn.com/p/') || (src.includes('f.nooncdn.com') && src.includes('/p/'));
                if (!hasProductPath) return;
                if (src.includes('/s/app/') || src.endsWith('.svg')) return;
                const fullRes = normalizeImageUrl(src);
                if (!fullRes) return;
                if (!galleryImages.includes(fullRes)) galleryImages.push(fullRes);
            });
        }
        const image = galleryImages.length > 0 ? galleryImages[0] : null;

        // --- ATTRIBUTES (Selected) ---
        const attributes = [];
        const varHeaders = Array.from(document.querySelectorAll('div, h3, span')).filter(el => 
            ['size', 'colour', 'color', 'model'].some(k => el.innerText.trim().toLowerCase().includes(k)) &&
            el.innerText.trim().length < 20
        );

        varHeaders.forEach(header => {
            const headerText = header.innerText.trim();
            let attrName = 'Unknown';
            if (headerText.toLowerCase().includes('size')) attrName = 'Size';
            else if (headerText.toLowerCase().includes('colo')) attrName = 'Color';
            else if (headerText.toLowerCase().includes('model')) attrName = 'Model';
            
            // Look for selected value in sibling/child
            let container = header.closest('div[class*="sc-"]') || header.parentElement;
            if (container) {
                const activeOpt = container.querySelector('[class*="active"], [class*="selected"], [aria-selected="true"], button[disabled]');
                if (activeOpt) {
                    let val = activeOpt.innerText.trim();
                    if (!val && activeOpt.title) val = activeOpt.title;
                    // Check for img alt
                    const img = activeOpt.querySelector('img');
                    if (!val && img) val = img.alt;
                    
                    if (val) {
                        // Check if we already have this attribute
                        if (!attributes.find(a => a.name === attrName)) {
                            attributes.push({ name: attrName, value: val });
                        }
                    }
                }
            }
        });

        // --- DESCRIPTION & SPECS ---
        const descriptionEl = document.querySelector('[data-qa="div-product-description"]') || document.querySelector('.description');
        const description = descriptionEl ? descriptionEl.innerText.trim() : '';

        // Collect specs
        const specs = [];
        const specTables = document.querySelectorAll('table');
        specTables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    specs.push(`${cells[0].innerText.trim()}: ${cells[1].innerText.trim()}`);
                }
            });
        });
        // --- JSON-LD EXTRACTION (Priority) ---
        let jsonLdBrand = '';
        let jsonLdCategory = '';
        let jsonLdPath = [];

        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const s of scripts) {
                try {
                    const data = JSON.parse(s.innerText);
                    const items = Array.isArray(data) ? data : [data];
                    
                    for (const item of items) {
                        // Brand from Product
                        if (item['@type'] === 'Product') {
                            if (item.brand) {
                                jsonLdBrand = typeof item.brand === 'object' ? item.brand.name : item.brand;
                            }
                            if (item.category) {
                                jsonLdCategory = item.category;
                            }
                        }
                        
                        // Category from BreadcrumbList
                        if (item['@type'] === 'BreadcrumbList' && item.itemListElement) {
                            const list = item.itemListElement.sort((a, b) => parseInt(a.position) - parseInt(b.position));
                            jsonLdPath = list.map(i => i.item && i.item.name ? i.item.name : i.name).filter(n => n && n.toLowerCase() !== 'home');
                        }
                    }
                } catch (e) { }
            }
        } catch (e) { }

        // --- CATEGORY EXTRACTION (Breadcrumbs) ---
        let breadcrumbs = [];
        
        // Strategy 1: JSON-LD
        if (jsonLdPath.length > 0) {
            breadcrumbs = jsonLdPath;
        } else {
            // Strategy 2: DOM
            const breadcrumbEls = document.querySelectorAll('[data-qa="breadcrumbs"] a, .breadcrumb a, nav[aria-label="breadcrumb"] ol li a, [class*="breadcrumb"] a');
            breadcrumbEls.forEach(el => {
                const text = el.innerText ? el.innerText.trim() : '';
                if (text && text.toLowerCase() !== 'home') {
                    breadcrumbs.push(text);
                }
            });
        }

        let category = 'Uncategorized';
        let subcategory = 'General';
        let categoryPath = [];

        if (breadcrumbs.length > 0) {
            categoryPath = breadcrumbs;
            // Noon structure: Home > Category > Subcat > ...
            // Use the first meaningful category as main Category
            if (breadcrumbs.length >= 1) category = breadcrumbs[0];
            // Use the last one (before product) as Subcategory
            if (breadcrumbs.length >= 2) subcategory = breadcrumbs[breadcrumbs.length - 1];
        } else if (jsonLdCategory) {
            category = jsonLdCategory;
        }

        let brand = '';
        
        // Strategy 0: JSON-LD
        if (jsonLdBrand) {
            brand = jsonLdBrand;
        }

        // Strategy 1: Brand Link (e.g. "Aromatic >")
        if (!brand) {
            const brandEl =
                document.querySelector('a[href*="/brand/"]') ||
                document.querySelector('span[class*="BrandStoreCtaV2"][class*="textContent"]') ||
                document.querySelector('[data-qa="brand-name"]');
                
            if (brandEl && brandEl.textContent) {
                brand = brandEl.textContent.trim();
            }
        }

        // Strategy 2: "Sold by" section
        if (!brand) {
            const sellerEl = document.querySelector('[data-qa="seller-name"] a, .seller-name a');
            if (sellerEl) {
                const sellerText = sellerEl.innerText.trim();
                // Sometimes seller is the brand
                if (sellerText) brand = sellerText;
            }
        }
        
        // Strategy 3: Specs table
        if (!brand) {
            for (const row of specs) {
                const idx = row.indexOf(':');
                if (idx !== -1) {
                    const key = row.slice(0, idx).trim().toLowerCase();
                    const val = row.slice(idx + 1).trim();
                    if (key.includes('brand') && val) {
                        brand = val;
                        break;
                    }
                }
            }
        }

        // Extract SKU from URL
        const skuMatch = currentUrl.match(/\/([A-Z0-9]+)\/p\/?/);
        const sku = skuMatch ? skuMatch[1] : '';

        // --- EXTRACT SIZE VARIATIONS (JSON) ---
        const sizeVariations = [];
        try {
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const s of scripts) {
                const content = s.textContent; // Use textContent for raw script
                if (content.includes('self.__next_f.push') && content.includes('variants')) {
                    const startMarker = 'self.__next_f.push([1,"';
                    const startIndex = content.indexOf(startMarker);
                    if (startIndex !== -1) {
                        let rawString = content.substring(startIndex + startMarker.length);
                        const lastIndex = rawString.lastIndexOf('"])');
                        if (lastIndex !== -1) {
                            rawString = rawString.substring(0, lastIndex);
                            
                            // Strategy 1: Double JSON Parse (Safe Unescape)
                            let jsonObj = null;
                            try {
                                const unescaped = JSON.parse('"' + rawString + '"');
                                jsonObj = JSON.parse(unescaped);
                            } catch (e) {
                                try {
                                    const naive = rawString.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                                    jsonObj = JSON.parse(naive);
                                } catch (e2) {
                                    // Regex Fallback
                                    // Match variants array structure: "variants":[{"sku":"...","variant":{...},"offers":[...]}]
                                    // Note: In raw string, "variant" object is nested
                                    
                                    // Let's try to match individual variant objects
                                    // "sku":"..." ... "variant":{"attribute_code":"...","attribute_value":"..."}
                                    const varRegex = /"sku":"([^"]+)".*?"variant":{([^}]+)}.*?"offers":\[/g;
                                    let m;
                                    while ((m = varRegex.exec(rawString)) !== null) {
                                        const vSku = m[1];
                                        const vVariantStr = m[2]; // attribute_code":"...","attribute_value":"...
                                        
                                        // Extract size from variant string
                                        const sizeMatch = vVariantStr.match(/"attribute_value":"([^"]+)"/);
                                        const vSize = sizeMatch ? sizeMatch[1] : 'Unknown';
                                        
                                        sizeVariations.push({
                                            sku: vSku,
                                            size: vSize,
                                            price: price, // Fallback
                                            stock: 10
                                        });
                                    }
                                }
                            }

                            if (jsonObj) {
                                // Helper to find variants array
                                function findVariants(obj) {
                                    if (!obj || typeof obj !== 'object') return null;
                                    if (obj.variants && Array.isArray(obj.variants)) return obj.variants;
                                    if (obj.ssrCatalog && obj.ssrCatalog.product && obj.ssrCatalog.product.variants) return obj.ssrCatalog.product.variants;
                                    
                                    for (const key in obj) {
                                        const found = findVariants(obj[key]);
                                        if (found) return found;
                                    }
                                    return null;
                                }

                                const variantsList = findVariants(jsonObj);
                                if (variantsList && Array.isArray(variantsList)) {
                                    variantsList.forEach(v => {
                                        if (v.sku && v.variant) {
                                            // Extract Size
                                            let vSize = v.variant.attribute_value || v.variant.label || 'Unknown';
                                            
                                            // Extract Price/Stock from offers
                                            let vPrice = price;
                                            let vStock = 10;
                                            
                                            if (v.offers && Array.isArray(v.offers) && v.offers.length > 0) {
                                                const offer = v.offers[0];
                                                vPrice = offer.sale_price || offer.price || price;
                                                vStock = offer.stock !== undefined ? offer.stock : 10;
                                            }
                                            
                                            sizeVariations.push({
                                                sku: v.sku,
                                                size: vSize,
                                                price: vPrice,
                                                stock: vStock
                                            });
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error('Size extraction failed', e); }

        return {
            name: title,
            sku: sku,
            price: price,
            image: image,
            galleryImages: galleryImages,
            description: description,
            specs: specs,
            attributes: attributes,
            sizeVariations: sizeVariations,
            brand: brand,
            category: category,
            subcategory: subcategory,
            categoryPath: categoryPath
        };
    }, url);
}

/**
 * Robustly discovers all variation URLs using API/Regex and HTML scanning.
 */
async function discoverVariations(page) {
    return await page.evaluate(() => {
        const results = {
            parentId: '',
            variationLinks: [] // { url, id, source, color, image }
        };

        // 1. Extract Parent ID from URL
        const urlParts = window.location.pathname.split('/');
        const pIndex = urlParts.indexOf('p');
        if (pIndex > 0) {
            results.parentId = urlParts[pIndex - 1];
        } else {
            const m = window.location.href.match(/\/([A-Z0-9]{10,})\/p\//);
            if (m) results.parentId = m[1];
        }

        // 2. Try to find the ssrCatalog JSON script
        let jsonVariations = [];
        try {
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const s of scripts) {
                const content = s.innerText;
                if (content.includes('ssrCatalog')) {
                    const startMarker = 'self.__next_f.push([1,"';
                    const startIndex = content.indexOf(startMarker);
                    if (startIndex !== -1) {
                        let rawString = content.substring(startIndex + startMarker.length);
                        const lastIndex = rawString.lastIndexOf('"])');
                        if (lastIndex !== -1) {
                            rawString = rawString.substring(0, lastIndex);
                            // Unescape JSON string
                            let jsonStr = rawString
                                .replace(/\\"/g, '"')
                                .replace(/\\\\/g, '\\');
                            
                            // Parse JSON object
                            // Find the ssrCatalog object start
                            const catalogMarker = '"ssrCatalog":';
                            const catIndex = jsonStr.indexOf(catalogMarker);
                            if (catIndex !== -1) {
                                // We found the catalog. Now we need to parse the structure.
                                // It's safer to try to extract the "groups" array using regex
                                // Pattern: "groups":[{"name":"Colour Name", ... "options":[ ... ]}]
                                
                                // Let's try to extract the "options" array directly
                                // "options":[{"name":"...","sku":"...","is_available":...,"url":"...","offer_code":"...","image_key":"..."}]
                                
                                const optionsRegex = /"options":(\[[^\]]+\])/;
                                const match = jsonStr.match(optionsRegex);
                                if (match) {
                                    try {
                                        // This regex might fail if options contain nested arrays, but usually they don't
                                        // A safer way is to find "options":[ and count brackets, but we are in browser context.
                                        
                                        // Let's use a regex for individual option objects
                                        // {"name":"Basil Green","sku":"Z882860E17976E2A5715FZ","is_available":1,"url":"...","offer_code":"...","image_key":"..."}
                                        const optObjRegex = /{"name":"([^"]+)","sku":"([^"]+)","is_available":\d+,"url":"([^"]+)","offer_code":"([^"]+)","image_key":"([^"]+)"}/g;
                                        
                                        let m;
                                        while((m = optObjRegex.exec(jsonStr)) !== null) {
                                            jsonVariations.push({
                                                name: m[1],
                                                sku: m[2],
                                                url: m[3],
                                                offer_code: m[4],
                                                image_key: m[5]
                                            });
                                        }
                                    } catch (e) { console.error('Options parsing error', e); }
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error('JSON extraction failed', e); }

        // 3. Process JSON Variations (Colors)
        if (jsonVariations.length > 0) {
            jsonVariations.forEach(v => {
                // Construct full URL
                // The Base URL format: https://www.noon.com/uae-en/SLUG/SKU/p/?o=OFFER_CODE
                // We must handle the case where v.url is just the slug or full path
                let slug = v.url;
                if (slug.startsWith('/')) slug = slug.substring(1);
                
                const fullUrl = `${window.location.origin}/uae-en/${slug}/${v.sku}/p/?o=${v.offer_code}`;
                
                results.variationLinks.push({
                    id: v.offer_code,
                    url: fullUrl,
                    source: 'api_json',
                    color: v.name,
                    image: `https://f.nooncdn.com/p/${v.image_key}`
                });
            });
        }

        // 4. Fallback: Nuclear Regex Search for ?o= parameters (The "API" discovery)
        // Only if JSON failed or returned few results
        if (results.variationLinks.length < 2) {
            const html = document.documentElement.outerHTML;
            const regex = /[?&]o=([a-zA-Z0-9]+)/g;
            const foundIds = new Set();
            let match;
            
            while ((match = regex.exec(html)) !== null) {
                if (match[1].length > 5) foundIds.add(match[1]);
            }

            // Also look for "offer_code":"..." pattern in scripts
            const jsonRegex = /"offer_code":"([a-zA-Z0-9]+)"/g;
            while ((match = jsonRegex.exec(html)) !== null) {
                    if (match[1].length > 5) foundIds.add(match[1]);
            }

            // Construct URLs for regex findings
            const baseUrl = window.location.origin + window.location.pathname;
            foundIds.forEach(id => {
                // Check if we already have this ID
                const existing = results.variationLinks.find(l => l.id === id);
                if (!existing) {
                    let cleanUrl = window.location.href.split('?')[0];
                    results.variationLinks.push({
                        id: id,
                        url: `${cleanUrl}?o=${id}`,
                        source: 'regex'
                    });
                }
            });
        }
        
        // 5. Deduplicate
        const uniqueLinks = [];
        const seenIds = new Set();
        results.variationLinks.forEach(l => {
            if (!seenIds.has(l.id)) {
                seenIds.add(l.id);
                uniqueLinks.push(l);
            }
        });
        results.variationLinks = uniqueLinks;

        return results;
    });
}

async function scrapeProduct(url, config, browserInstance = null) {
    const mode = (config && config.noonMode) || 'parent_child';
    helpers.log(`Starting Noon product scrape (Mode: ${mode}): ${url}`);
    
    let browser = browserInstance;
    let isLocalBrowser = false;

    if (!browser) {
        browser = await helpers.launchBrowser();
        isLocalBrowser = true;
    }

    let page = null;

    try {
        page = await browser.newPage();
        await page.setUserAgent(helpers.getRandomUserAgent());
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });

        try { await page.waitForSelector('h1', { timeout: 10000 }); } catch (e) {}

        if (mode === 'api') {
            const data = await scrapeSinglePage(page, url);

            const attrMap = {};
            if (Array.isArray(data.attributes)) {
                data.attributes.forEach(a => {
                    if (!a || !a.name) return;
                    const key = a.name;
                    if (!attrMap[key]) attrMap[key] = new Set();
                    if (a.value) attrMap[key].add(a.value);
                });
            }

            const attributes = Object.keys(attrMap).map(name => ({
                name,
                options: Array.from(attrMap[name]),
                visible: true,
                variation: false
            }));

            const result = {
                name: data.name,
                sku: data.sku,
                price: data.price,
                image: data.image,
                galleryImages: data.galleryImages,
                description: data.description,
                specs: data.specs,
                attributes,
                variations: []
            };

            helpers.log('Scrape Complete (API single variant mode).');
            return result;
        }

        const discovery = await discoverVariations(page);
        helpers.log(`Discovery: Found ${discovery.variationLinks.length} variations. ParentID: ${discovery.parentId}`);

        const allVariations = [];
        const parentSku = discovery.parentId || 'UNKNOWN_PARENT';
        
        // If no variations found (unlikely on Noon), just scrape current
        if (discovery.variationLinks.length === 0) {
            discovery.variationLinks.push({ url: url, id: 'main', source: 'main' });
        }

        // 2. Scrape Each Variation
        // Optimization: Scrape current page first without reloading if it matches one of the IDs
        const currentUrl = page.url();
        const currentOfferMatch = currentUrl.match(/[?&]o=([a-zA-Z0-9]+)/);
        const currentOfferId = currentOfferMatch ? currentOfferMatch[1] : null;

        // Limit to 20 variations to prevent infinite loops or excessive time
        const linksToScrape = discovery.variationLinks.slice(0, 20); 

        for (const link of linksToScrape) {
            helpers.log(`Scraping variation: ${link.id} (${link.source})`);
            
            let data = null;
            
            // If this link is the current page, scrape directly
            if (currentOfferId && link.id === currentOfferId) {
                data = await scrapeSinglePage(page, link.url);
            } else {
                // Navigate to new URL
                try {
                    await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    // Wait for title/price to stabilize
                    try { await page.waitForSelector('h1', { timeout: 5000 }); } catch (e) {}
                    data = await scrapeSinglePage(page, link.url);
                } catch (err) {
                    helpers.log(`Failed to scrape variation ${link.url}: ${err.message}`);
                    continue;
                }
            }

            if (data) {
                // Post-process data
                
                // 1. Ensure Color Attribute matches the discovery (API) color
                if (link.color) {
                    // Remove existing color attr if any
                    const existingColorIndex = data.attributes.findIndex(a => a.name === 'Color');
                    if (existingColorIndex !== -1) {
                        data.attributes[existingColorIndex].value = link.color;
                    } else {
                        data.attributes.push({ name: 'Color', value: link.color });
                    }
                }

                // 2. Handle Size Variations (Multi-Attribute)
                if (data.sizeVariations && data.sizeVariations.length > 0) {
                     data.sizeVariations.forEach(sv => {
                         // Clone base data
                         const varData = { ...data };
                         varData.attributes = JSON.parse(JSON.stringify(data.attributes)); // Deep copy
                         
                         // Update with Size info
                         varData.price = sv.price;
                         // Use the specific variant SKU as the ID
                         // Noon SKUs are unique enough
                         varData.variationId = sv.sku; 
                         
                         // Add Size Attribute
                         // Remove existing size if any (from scraping selected element)
                         varData.attributes = varData.attributes.filter(a => a.name !== 'Size');
                         varData.attributes.push({ name: 'Size', value: sv.size });
                         
                         allVariations.push(varData);
                     });
                } else {
                    // Single variation (Color only, no size options found)
                    data.variationId = link.id;
                    allVariations.push(data);
                }
            }
        }

        if (allVariations.length === 0) {
            throw new Error("Failed to scrape any product data");
        }

        const mainData = allVariations[0]; 
        
        const result = {
            ...mainData, // Title, Description, etc.
            sku: parentSku, // Master Parent SKU
            type: 'variable',
            variations: allVariations.map(v => ({
                // If variationId is already a full SKU, use it. Otherwise append.
                sku: v.variationId.length > 15 ? v.variationId : `${parentSku}-${v.variationId}`,
                price: v.price,
                stock_quantity: 10, // Default fallback
                attributes: v.attributes,
                image: v.image,
                gallery_images: v.galleryImages
            })),
            // Aggregate all attributes for the parent
            attributes: [] 
        };

        const attrMap = {};
        allVariations.forEach(v => {
            v.attributes.forEach(a => {
                if (!attrMap[a.name]) attrMap[a.name] = new Set();
                attrMap[a.name].add(a.value);
            });
        });

        result.attributes = Object.keys(attrMap).map(name => ({
            name: name,
            options: Array.from(attrMap[name]),
            visible: true,
            variation: true
        }));

        if (Array.isArray(result.variations) && result.variations.length > 0) {
            const numericPrices = result.variations
                .map(v => {
                    if (!v || v.price == null) return NaN;
                    const m = v.price.toString().match(/[\d,.]+/);
                    if (!m) return NaN;
                    const num = parseFloat(m[0].replace(/,/g, ''));
                    return Number.isFinite(num) && num > 0 ? num : NaN;
                })
                .filter(n => Number.isFinite(n) && n > 0);
            if (numericPrices.length > 0) {
                const minPrice = numericPrices.reduce((a, b) => (a < b ? a : b));
                result.price = minPrice.toString();
            }
        }

        helpers.log(`Scrape Complete. Extracted ${result.variations.length} variations.`);
        return result;

    } catch (error) {
        helpers.log(`Error in Noon scraper: ${error.message}`);
        throw error;
    } finally {
        if (isLocalBrowser && browser) {
            await browser.close();
        } else if (page) {
            await page.close();
        }
    }
}

module.exports = { scrapeProduct };
