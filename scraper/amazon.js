const puppeteer = require('puppeteer');
const helpers = require('./helpers');

async function scrapeProduct(url, config, browserInstance = null) {
    helpers.log(`Starting Amazon product scrape: ${url}`);
    
    let browser = browserInstance;
    let isLocalBrowser = false;

    if (!browser) {
        // Use helper to launch consistent browser if none provided
        browser = await helpers.launchBrowser();
        isLocalBrowser = true;
    }

    let page = null;

    try {
        page = await browser.newPage();
        // Use random user agent for better anti-blocking
        await page.setUserAgent(helpers.getRandomUserAgent());

        // Extra stealth headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });

        // Handle Amazon "Continue shopping" interstitial if present
        // This page shows a button with text like "Continue shopping"
        // Clicking it once usually restores normal navigation to the product page
        try {
            const hasInterstitial = await page.evaluate(() => {
                const txt = (document.body && document.body.innerText || '').toLowerCase();
                const btn = Array.from(document.querySelectorAll('button, a, input[type="submit"]'))
                    .find(el => (el.innerText || el.value || '').toLowerCase().includes('continue shopping'));
                // Heuristic: specific phrase often appears on that page
                const phrase = txt.includes('click the button below to continue shopping');
                return !!btn || phrase;
            });
            if (hasInterstitial) {
                helpers.log('Amazon interstitial detected. Attempting to continue...');
                const clicked = await page.evaluate(() => {
                    const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
                    const el = candidates.find(e => (e.innerText || e.value || '').toLowerCase().includes('continue shopping'));
                    if (el) { 
                        (el.click ? el.click() : el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
                        return true;
                    }
                    return false;
                });
                if (clicked) {
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
                }
            }
        } catch (_) {
            // Non-fatal: continue
        }

        // Wait for key element (product title)
        try {
            await page.waitForSelector('#productTitle', { timeout: 10000 });
        } catch (e) {
            helpers.log('Timeout waiting for product title. Checking for captcha...');
            const pageTitle = await page.title();
            helpers.log(`Page Title: ${pageTitle}`);
            if (pageTitle.includes('Robot Check') || pageTitle.includes('Captcha')) {
                throw new Error('BLOCKED_NEEDS_BROWSER_RESTART');
            }
        }

        try {
            await page.waitForSelector('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, .a-price-whole, .priceToPay, [data-a-color=\"price\"]', { timeout: 8000 });
        } catch (_) {}

        await new Promise(resolve => setTimeout(resolve, 1000));

        const product = await page.evaluate(() => {
            const titleEl = document.querySelector('#productTitle');
            const title = titleEl ? titleEl.innerText.trim() : null;

            let price = 'N/A';
            const priceEl = document.querySelector('.a-price .a-offscreen') || 
                            document.querySelector('#priceblock_ourprice') ||
                            document.querySelector('#priceblock_dealprice') ||
                            document.querySelector('.a-price-whole') ||
                            document.querySelector('.priceToPay') ||
                            document.querySelector('[data-a-color="price"]');
            
            if (priceEl) {
                price = priceEl.innerText.trim();
                price = price.replace(/[^\d.,]/g, '').trim();
            }

            if (!price || price === 'N/A') {
                const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                const prices = [];
                const visit = (node) => {
                    if (!node || typeof node !== 'object') return;
                    if (Array.isArray(node)) {
                        node.forEach(visit);
                        return;
                    }
                    if (node['@type'] === 'Offer' && node.price) {
                        prices.push(node.price);
                    }
                    if (node.offers) visit(node.offers);
                    Object.values(node).forEach(val => {
                        if (val && typeof val === 'object') visit(val);
                    });
                };
                ldScripts.forEach(script => {
                    try {
                        const data = JSON.parse(script.textContent || script.innerText || '');
                        visit(data);
                    } catch (e) {}
                });
                const cleanedFromLd = prices
                    .map(p => p != null ? p.toString().replace(/[^\d.,]/g, '').trim() : '')
                    .filter(p => p);
                if (cleanedFromLd.length > 0) {
                    price = cleanedFromLd[0];
                }
            }

            if (!price || price === 'N/A') {
                const html = document.documentElement ? document.documentElement.innerHTML : '';
                const m = html && html.match(/\{[\s\S]*?"desktop_buybox_group_1"[\s\S]*?\}/);
                if (m) {
                    try {
                        const obj = JSON.parse(m[0]);
                        if (obj && obj.desktop_buybox_group_1 && Array.isArray(obj.desktop_buybox_group_1) && obj.desktop_buybox_group_1.length > 0) {
                            const first = obj.desktop_buybox_group_1[0];
                            const rawPrice = first.priceAmount || first.displayPrice;
                            if (rawPrice !== undefined && rawPrice !== null) {
                                const str = rawPrice.toString();
                                const cleaned = str.replace(/[^\d.,]/g, '').trim();
                                if (cleaned) {
                                    price = cleaned;
                                }
                            }
                        }
                    } catch (e) {}
                }
            }

            // Helper to clean Amazon Image URLs
            const getHighRes = (src) => {
                if (!src) return null;
                // Filter out icons, buttons, overlays
                if (src.includes('icon') || src.includes('overlay') || src.includes('button') || src.includes('sprite')) {
                    return null;
                }
                
                // Regex to remove the size/crop modifiers before the extension
                // Matches a dot, followed by non-slash/non-dot characters, ending with underscore, then extension
                // e.g. ._AC_US40_.jpg -> .jpg
                // e.g. .SS40_.jpg -> .jpg
                return src.replace(/\.[^/.]+?_(\.[a-z]{3,4})$/i, '$1');
            };

            // Image - multiple selectors for different Amazon layouts
            let image = null;
            const imgSelectors = [
                '#landingImage',
                '#imgTagWrapperId img',
                '.a-dynamic-image',
                '[data-a-image-name="landingImage"]',
                '.a-stretch-vertical',
                'img[data-old-hires]',
                'img[data-a-dynamic-image]'
            ];
            
            for (const selector of imgSelectors) {
                const imgEl = document.querySelector(selector);
                if (imgEl && imgEl.src) {
                    image = getHighRes(imgEl.src); // Clean immediately
                    
                    // Get high-res version if available in dataset
                    if (imgEl.dataset.oldHires) {
                        image = getHighRes(imgEl.dataset.oldHires);
                    } else if (imgEl.dataset.aDynamicImage) {
                        try {
                            const imageData = JSON.parse(imgEl.dataset.aDynamicImage);
                            const urls = Object.keys(imageData);
                            if (urls.length > 0) {
                                // Get the largest/highest quality image (usually the last one or largest key)
                                // But sometimes the keys are just URLs. Let's clean them too.
                                const clean = getHighRes(urls[0]);
                                if (clean) image = clean;
                            }
                        } catch (e) {
                            // Fallback to src
                        }
                    }
                    break;
                }
            }

            // Description
            const description = document.querySelector('#feature-bullets') ? 
                document.querySelector('#feature-bullets').innerText.trim() : 
                (document.querySelector('#productDescription') ? document.querySelector('#productDescription').innerText.trim() : '');

            const featureItems = Array.from(document.querySelectorAll('#feature-bullets li span'))
                .map(el => el.textContent ? el.textContent.trim() : '')
                .filter(t => t.length > 2);

            const specRows = [];
            const specTables = [
                '#productDetails_techSpec_section_1',
                '#productDetails_detailBullets_sections1',
                '#productOverview_feature_div'
            ];
            specTables.forEach(selector => {
                const table = document.querySelector(selector);
                if (!table) return;
                const rows = Array.from(table.querySelectorAll('tr'));
                rows.forEach(row => {
                    const th = row.querySelector('th');
                    const td = row.querySelector('td');
                    const key = th ? th.textContent.trim() : '';
                    const value = td ? td.textContent.trim() : '';
                    if (key && value) specRows.push(`${key}: ${value}`);
                });
            });
            const detailBullets = Array.from(document.querySelectorAll('#detailBullets_feature_div li'));
            detailBullets.forEach(li => {
                const keyEl = li.querySelector('span.a-text-bold');
                const key = keyEl ? keyEl.textContent.replace(':', '').trim() : '';
                let value = '';
                if (keyEl) {
                    const cloned = li.cloneNode(true);
                    const bold = cloned.querySelector('span.a-text-bold');
                    if (bold) bold.remove();
                    value = cloned.textContent.trim();
                }
                if (key && value) specRows.push(`${key}: ${value}`);
            });

            let brand = '';
            const byline = document.querySelector('#bylineInfo');
            if (byline && byline.textContent) {
                const text = byline.textContent.trim();
                const m = text.match(/Visit the\s+(.+?)\s+Store/i);
                if (m && m[1]) {
                    brand = m[1].trim();
                } else {
                    brand = text.replace(/^(Visit the\s*)?/i, '').replace(/\s*Store$/i, '').trim();
                }
            }
            if (!brand) {
                for (const row of specRows) {
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

            // Gallery Images
            let galleryImages = [];
            
            // Method 1: Extract from data-a-dynamic-image JSON on the main image
            // This is often the most reliable source for the main variations
            const mainImg = document.querySelector('#landingImage') || document.querySelector('[data-a-dynamic-image]');
            if (mainImg && mainImg.dataset.aDynamicImage) {
                try {
                    const imageData = JSON.parse(mainImg.dataset.aDynamicImage);
                    const urls = Object.keys(imageData);
                    urls.forEach(u => {
                        const clean = getHighRes(u);
                        if (clean && !galleryImages.includes(clean)) galleryImages.push(clean);
                    });
                } catch (e) {}
            }

            // Method 2: Look for the "altImages" thumbnails
            const thumbSelectors = [
                '#altImages li.item img',
                '#avs-inner .image-thumbnail img',
                '.a-button-text img', 
                'li[data-csa-c-action-name="pp-image-hover"] img',
                '#imageBlock .a-list-item img',
                '.a-declarative [data-action="main-image-click"] img'
            ];

            for (const selector of thumbSelectors) {
                const thumbs = document.querySelectorAll(selector);
                if (thumbs.length > 0) {
                    thumbs.forEach(img => {
                        let src = img.src;
                        if (src) {
                            const highRes = getHighRes(src);
                            if (highRes && !galleryImages.includes(highRes)) {
                                galleryImages.push(highRes);
                            }
                        }
                    });
                }
            }

            // Fallback: Check for data-a-dynamic-image on main image again for at least one
            if (galleryImages.length === 0 && image) {
                galleryImages.push(image);
            }

            // Title Fallback
            if (!title) {
                const titleEl = document.querySelector('h1') || document.querySelector('#title');
                if (titleEl) {
                     // We can't reassign const title, so we'll just return it directly in the object
                     // But we need to handle it. 
                     // Let's rely on the return object construction.
                }
            }

            const variations = [];
            const styleVariants = [];
            try {
                const variationForm = document.querySelector('form#twister, form#twister-plus-buying-options_form, form#addToCart');
                if (variationForm) {
                    const dimensionData = {};

                    const sizeSelect = variationForm.querySelector('#native_dropdown_selected_size_name, select[name="dropdown_selected_size_name"], select[id*="dropdown_selected_size_name"]');
                    if (sizeSelect && sizeSelect.options) {
                        Array.from(sizeSelect.options).forEach(opt => {
                            const rawVal = (opt.value || '').trim();
                            if (!rawVal || rawVal === '-1') return;
                            const parts = rawVal.split(',');
                            const asin = (parts[1] || parts[0] || '').trim();
                            let label = opt.getAttribute('data-a-html-content') || opt.textContent || '';
                            label = label.trim();
                            if (!asin || !label) return;
                            if (!dimensionData[asin]) dimensionData[asin] = {};
                            dimensionData[asin]['size_name'] = label;
                        });
                    }

                    const dimensionInputs = variationForm.querySelectorAll('input[name="dropdown-selection"], input[name*="dimension"], input[name*="twister"]');
                    dimensionInputs.forEach(input => {
                        const data = input.value || '';
                        if (!data) return;
                        const parts = data.split(':');
                        if (parts.length < 3) return;
                        const dimName = parts[0];
                        const dimValue = parts[1];
                        const asin = parts[2];
                        if (!dimensionData[asin]) dimensionData[asin] = {};
                        dimensionData[asin][dimName] = dimValue;
                    });

                    const stateNodes = Array.from(document.querySelectorAll('script[data-a-state]'));
                    const variationPriceMap = {};
                    stateNodes.forEach(node => {
                        const raw = node.textContent || '';
                        if (!raw) return;
                        let dataObj = null;
                        try {
                            dataObj = JSON.parse(raw);
                        } catch (_) {
                            const match = raw.match(/\{[\s\S]*\}/);
                            if (match) {
                                try {
                                    dataObj = JSON.parse(match[0]);
                                } catch (_) {}
                            }
                        }
                        if (!dataObj) return;

                        if (dataObj.priceByAsin && typeof dataObj.priceByAsin === 'object') {
                            Object.keys(dataObj.priceByAsin).forEach(asin => {
                                const p = dataObj.priceByAsin[asin];
                                const rawPrice = p.priceAmount || p.amount || p.price || '';
                                if (!rawPrice) return;
                                const str = rawPrice.toString();
                                const cleaned = str.replace(/[^\d.,]/g, '').trim();
                                if (cleaned) variationPriceMap[asin] = cleaned;
                            });
                        }

                        if (dataObj.dimensionValuesDisplayData && typeof dataObj.dimensionValuesDisplayData === 'object') {
                            Object.keys(dataObj.dimensionValuesDisplayData).forEach(key => {
                                const entry = dataObj.dimensionValuesDisplayData[key];
                                if (!entry || typeof entry !== 'object') return;
                                const asin = entry.asin || entry.asinList && entry.asinList[0];
                                if (!asin) return;
                                const rawPrice = entry.price || entry.displayPrice || entry.priceAmount;
                                if (!rawPrice) return;
                                const str = rawPrice.toString();
                                const cleaned = str.replace(/[^\d.,]/g, '').trim();
                                if (cleaned) variationPriceMap[asin] = cleaned;
                            });
                        }
                    });

                    const colorMap = {};
                    const colorNodes = document.querySelectorAll('#variation_color_name li, #variation_color_name img');
                    colorNodes.forEach(node => {
                        const asin = node.getAttribute('data-defaultasin') || node.getAttribute('data-asin') || node.getAttribute('data-csa-c-item-id');
                        if (!asin) return;
                        let label = node.getAttribute('data-a-html-content') || node.getAttribute('alt') || node.getAttribute('title') || node.textContent || '';
                        label = label.trim();
                        if (/^click to select/i.test(label)) {
                            label = label.replace(/^click to select/i, '').trim();
                        }
                        if (!label) return;
                        colorMap[asin] = label;
                    });

                    Object.keys(dimensionData).forEach(asin => {
                        const dims = dimensionData[asin];
                        const attrs = [];
                        Object.keys(dims).forEach(dimName => {
                            const rawName = dimName.replace(/_/g, ' ').trim();
                            const prettyName = rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                            let val = dims[dimName];
                            if (dimName.toLowerCase().includes('color') && colorMap[asin]) {
                                val = colorMap[asin];
                            }
                            attrs.push({ name: prettyName, value: val });
                        });
                        if (attrs.length === 0 && colorMap[asin]) {
                            attrs.push({ name: 'Color', value: colorMap[asin] });
                        }
                        const vPrice = variationPriceMap[asin] || price;
                        variations.push({
                            variationId: asin,
                            price: vPrice,
                            attributes: attrs,
                            image: image,
                            gallery_images: galleryImages
                        });
                    });
                }

                // Style-level variants (e.g. "2023" vs "2024" model years) that behave like separate products
                const styleContainer = document.querySelector('#tp-inline-twister-dim-values-container ul.dimension-values-list');
                if (styleContainer) {
                    const liNodes = styleContainer.querySelectorAll('li[data-asin]');
                    liNodes.forEach(li => {
                        const asin = li.getAttribute('data-asin');
                        if (!asin) return;
                        let label = '';
                        const labelEl = li.querySelector('.swatch-title-text-display') || li.querySelector('.a-button-text');
                        if (labelEl && labelEl.textContent) {
                            label = labelEl.textContent.trim();
                        }
                        const isSelected = li.getAttribute('data-initiallyselected') === 'true' ||
                                           li.classList.contains('a-button-selected') ||
                                           !!li.querySelector('.a-button-selected');
                        styleVariants.push({
                            asin,
                            label,
                            isSelected
                        });
                    });
                }
            } catch (_) {}

            const normalizePriceFromText = (val) => {
                if (!val) return '';
                const str = val.toString();
                const cleaned = str.replace(/[^\d.,]/g, '').trim();
                return cleaned;
            };

            if ((!price || price === 'N/A') && variations.length > 0) {
                const numericPrices = variations
                    .map(v => normalizePriceFromText(v.price))
                    .map(p => {
                        if (!p) return NaN;
                        const normalized = p.replace(/,/g, '.');
                        const num = parseFloat(normalized);
                        return Number.isFinite(num) ? num : NaN;
                    })
                    .filter(n => Number.isFinite(n));
                if (numericPrices.length > 0) {
                    const minPrice = Math.min(...numericPrices);
                    price = String(minPrice);
                }
            }

            // Compute style grouping info (all style ASINs) so WooCommerce can link them later
            let styleGroupKey = '';
            let styleLabel = '';
            if (styleVariants.length > 0) {
                const asins = styleVariants
                    .map(v => v.asin)
                    .filter(Boolean)
                    .map(a => a.toUpperCase());
                if (asins.length > 0) {
                    styleGroupKey = Array.from(new Set(asins)).sort().join(',');
                }
                const selected = styleVariants.find(v => v.isSelected) || styleVariants[0];
                if (selected && selected.label) {
                    styleLabel = selected.label.trim();
                }
            }

            return {
                name: title || (document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : 'Unknown Product'),
                price: price,
                image: image,
                description: description,
                galleryImages: galleryImages,
                features: Array.from(new Set(featureItems)),
                specs: Array.from(new Set(specRows)),
                 brand: brand,
                rawVariations: variations,
                styleVariants: styleVariants,
                styleGroupKey,
                styleLabel
            };
        });

        const styleMode = config && config.amazonStyleMode ? config.amazonStyleMode : 'separate';

        // Handle style-level siblings as separate product URLs (e.g. "2023" vs "2024") when in separate mode
        if (styleMode !== 'group' && Array.isArray(product.styleVariants) && product.styleVariants.length > 1) {
            try {
                const currentStyle = product.styleVariants.find(v => v.isSelected);
                let currentAsin = null;
                if (currentStyle && currentStyle.asin) {
                    currentAsin = currentStyle.asin;
                } else {
                    const currentUrl = page.url();
                    const m = currentUrl.match(/\/dp\/([A-Z0-9]{10})/i);
                    if (m) currentAsin = m[1].toUpperCase();
                }

                const u = new URL(page.url());
                const origin = `${u.protocol}//${u.host}`;

                const siblingUrls = product.styleVariants
                    .filter(v => v.asin && (!currentAsin || v.asin.toUpperCase() !== currentAsin.toUpperCase()))
                    .map(v => `${origin}/dp/${v.asin}`);

                if (siblingUrls.length > 0) {
                    product.discoveredUrls = (product.discoveredUrls || []).concat(siblingUrls);
                }
            } catch (_) {}
        }

        if (Array.isArray(product.rawVariations) && product.rawVariations.length > 0) {
            const allVariations = product.rawVariations.filter(v => Array.isArray(v.attributes) && v.attributes.length > 0);
            if (allVariations.length > 0) {
                const attrMap = {};
                allVariations.forEach(v => {
                    v.attributes.forEach(a => {
                        if (!a || !a.name) return;
                        if (!attrMap[a.name]) attrMap[a.name] = new Set();
                        if (a.value) attrMap[a.name].add(a.value);
                    });
                });

                const wcVariations = allVariations.map(v => ({
                    sku: v.variationId || '',
                    price: v.price || product.price,
                    stock_quantity: 10,
                    attributes: v.attributes.map(a => ({ name: a.name, value: a.value })),
                    image: v.image || product.image,
                    gallery_images: v.gallery_images || product.galleryImages
                }));

                const attributes = Object.keys(attrMap).map(name => ({
                    name,
                    options: Array.from(attrMap[name]),
                    visible: true,
                    variation: true
                }));

                return {
                    name: product.name,
                    price: product.price,
                    image: product.image,
                    description: product.description,
                    galleryImages: product.galleryImages,
                    features: product.features,
                    specs: product.specs,
                    brand: product.brand || '',
                    type: 'variable',
                    variations: wcVariations,
                    attributes
                };
            }
        }

        return product;

    } catch (error) {
        helpers.log(`Error scraping Amazon product: ${error.message}`);
        throw error;
    } finally {
        if (page && !page.isClosed()) await page.close();
        if (isLocalBrowser && browser) await browser.close();
    }
}

async function scrapeCategory(term, config) {
    let url = term;
    if (!term.startsWith('http')) {
        url = `https://www.amazon.com/s?k=${encodeURIComponent(term)}`;
    }

    helpers.log(`Scanning Amazon category: ${url}`);

    const browser = await puppeteer.launch({
        headless: config.headless,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent(helpers.getRandomUserAgent());
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });

        try {
            await page.waitForSelector('.s-result-item', { timeout: 10000 });
        } catch (e) {
            helpers.log('Timeout waiting for search results.');
        }

        const links = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('.s-result-item h2 a'));
            const urls = new Set();
            
            anchors.forEach(a => {
                if (a.href) {
                    let fullUrl = a.href;
                    if (!fullUrl.startsWith('http')) {
                        fullUrl = `https://www.amazon.com${a.getAttribute('href')}`;
                    }
                    // Clean URL (remove query params for cleaner scraping)
                    if (fullUrl.includes('/dp/')) {
                        const asin = fullUrl.match(/\/dp\/([A-Z0-9]{10})/);
                        if (asin) {
                            urls.add(`https://www.amazon.com/dp/${asin[1]}`);
                        } else {
                            urls.add(fullUrl);
                        }
                    } else {
                        urls.add(fullUrl);
                    }
                }
            });
            
            return Array.from(urls);
        });

        return links;

    } catch (error) {
        helpers.log(`Error scraping Amazon category: ${error.message}`);
        return [];
    } finally {
        await browser.close();
    }
}

module.exports = { scrapeProduct, scrapeCategory };
