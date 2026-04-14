const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const helpers = require('./helpers');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Common product page selectors across multiple e-commerce sites
const COMMON_SELECTORS = {
    title: [
        'h1',
        '[itemprop="name"]',
        '.product-title',
        '.title',
        '.name',
        '#productTitle',
        '.product-name'
    ],
    price: [
        '.price',
        '[itemprop="price"]',
        '.product-price',
        '.current-price',
        '.price-now',
        '.special-price',
        '.price__regular',
        '.price__sale',
        '.price--current',
        '.price-item',
        '.woocommerce-Price-amount',
        '.product__price',
        '.price .amount',
        '[data-price]',
        '[data-price-amount]',
        '[data-product-price]',
        '.a-price .a-offscreen',
        '#priceblock_ourprice',
        '#priceblock_dealprice'
    ],
    image: [
        '.main-image-area img',
        '.main-product-image',
        'img[itemprop="image"]',
        '.product-image img',
        '.main-image img',
        '#landingImage',
        '.gallery img',
        'img[alt*="product"]',
        'img[src*="product"]',
        'img[src*="image"]'
    ],
    description: [
        '[itemprop="description"]',
        '.product-description',
        '.description',
        '#productDescription',
        '.long-description'
    ]
};

async function scrapeProduct(url, config, browserInstance = null) {
    let browser = browserInstance;
    let isLocalBrowser = false;

    if (!browser) {
        browser = await helpers.launchBrowser();
        isLocalBrowser = true;
    }

    let page = null;

    try {
        page = await browser.newPage();
        
        // Set random user agent for better anti-blocking
        await page.setUserAgent(helpers.getRandomUserAgent());

        console.log(`Universal scraping: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await helpers.randomDelay(2000, 4000);
        await page.waitForSelector('.main-image-area img, .main-product-image, .thumbnails-strip img, img[data-full], img', { timeout: 5000 }).catch(() => {});

        let product;
        if (url.includes('temu.com')) {
            const bodyText = await page.evaluate(() => {
                if (!document || !document.body) return '';
                return document.body.innerText || '';
            });
            const lowerBody = bodyText.toLowerCase();
            if (lowerBody.includes('security verification') ||
                lowerBody.includes('click and drag the line so that it covers all of the shapes')) {
                throw new Error('Temu login/security page detected; cannot scrape this product automatically.');
            }
            product = await scrapeTemuJsonProduct(page, url);
            if (!product || (!product.name && !product.price && !product.image)) {
                product = await extractProductData(page);
            }
        } else {
            product = await extractProductData(page);
        }

        // COMPREHENSIVE IMAGE HANDLING
        
        // 1. Wait for dynamic images to load (Puppeteer waiting)
        await helpers.randomDelay(3000, 5000); // Wait for lazy loading
        
        // 2. Try primary image extraction
        if (!product.image) {
            console.log('No primary image found, trying advanced detection...');
            product.image = await findImageWithPuppeteer(page);
        }
        
        // 3. Fallback to related product images
        if (!product.image) {
            console.log('Trying related product images fallback...');
            product.image = await findRelatedProductImages(page);
        }
        
        if (!product.image) {
            console.log('Using placeholder image as final fallback...');
            product.image = 'https://via.placeholder.com/500x500?text=No+Image+Available';
            product.isPlaceholder = true;
        }

        // UNIVERSAL GALLERY EXTRACTION (Using Helper)
        console.log('Attempting universal gallery extraction...');
        const universalGallery = await helpers.extractUniversalGallery(page);
        if (universalGallery && universalGallery.length > 0) {
            console.log(`Universal gallery found ${universalGallery.length} images.`);
            product.galleryImages = universalGallery;
        }

        const imageCandidates = [product.image, ...(Array.isArray(product.galleryImages) ? product.galleryImages : [])]
            .map((value) => normalizeImageUrlForCheck(value, url))
            .filter(Boolean);
        const reachableMain = await pickFirstReachableImageUrl(imageCandidates);
        if (reachableMain) {
            if (product.image !== reachableMain) {
                console.log(`Main image URL replaced with reachable candidate: ${reachableMain}`);
            }
            product.image = reachableMain;
        } else if (product.image && !product.isPlaceholder) {
            console.log('No reachable image URL found; using placeholder image.');
            product.image = 'https://via.placeholder.com/500x500?text=No+Image+Available';
            product.isPlaceholder = true;
        }

        const normalizeGalleryUrl = (value) => {
            if (!value) return '';
            let cleaned = value.toString().trim().replace(/`/g, '').trim();
            if (!cleaned) return '';
            if (cleaned.endsWith('.')) cleaned = cleaned.slice(0, -1);
            if (cleaned.includes('?')) cleaned = cleaned.split('?')[0];
            if (cleaned.startsWith('//')) cleaned = 'https:' + cleaned;
            // Handle relative URLs properly
            if (cleaned.startsWith('/')) {
                try {
                    cleaned = new URL(cleaned, url).href;
                } catch (e) { return ''; }
            }
            return cleaned;
        };

        if (product.galleryImages && product.galleryImages.length > 0) {
            const normalizedGallery = Array.from(new Set(product.galleryImages.map(normalizeGalleryUrl).filter(Boolean)));
            const limitedGallery = normalizedGallery.slice(0, 15); // Increased limit
            const tempDir = path.join(__dirname, '..', 'temp_images');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const localGallery = [];
            
            for (const imgUrl of limitedGallery) {
                try {
                    // Skip if same as main image
                    if (imgUrl === product.image) continue;

                    const imageBuffer = await page.evaluate(async (url) => {
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const buffer = await response.arrayBuffer();
                        return Array.from(new Uint8Array(buffer));
                    }, imgUrl);

                    let filename = path.basename(new URL(imgUrl).pathname);
                    if (!filename || filename.length < 3) filename = `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
                    filename = filename.replace(/[^a-z0-9.]/gi, '_');
                    if (!path.extname(filename)) filename += '.jpg';
                    const localPath = path.join(tempDir, filename);
                    fs.writeFileSync(localPath, Buffer.from(imageBuffer));
                    localGallery.push(localPath);
                } catch (_) {}
            }
            if (localGallery.length > 0) {
                product.localGalleryPaths = localGallery;
            }
        }

        if (product.image && !product.image.startsWith('data:') && !product.isPlaceholder) {
            try {
                console.log(`Downloading image: ${product.image}`);
                const localImagePath = await downloadImageViaPuppeteer(page, product.image);
                if (localImagePath) {
                    product.localImagePath = localImagePath;
                    console.log(`Image downloaded to: ${localImagePath}`);
                }
            } catch (imgError) {
                console.error(`Failed to download image: ${imgError.message}`);
                // Keep original URL as fallback
            }
        }

        return product;

    } catch (error) {
        console.error(`Error universal scraping ${url}:`, error);
        return { error: error.message };
    } finally {
        if (page && !page.isClosed()) await page.close();
        if (isLocalBrowser && browser) await browser.close();
    }
}

async function extractProductData(page) {
    return await page.evaluate((selectors) => {
        const findElement = (selectors) => {
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) return element;
            }
            return null;
        };
        const normalizeUrl = (value) => {
            if (!value) return '';
            let url = value.toString().trim();
            if (!url) return '';
            // Remove backticks and extra quotes that sometimes appear in raw extraction
            url = url.replace(/[`'"]/g, '').trim();
            if (!url) return '';
            if (url.startsWith('//')) url = 'https:' + url;
            if (url.startsWith('/')) url = window.location.origin + url;
            // Remove trailing dots but keep .pdf
            if (url.endsWith('.') && !url.toLowerCase().endsWith('.pdf.')) {
                url = url.slice(0, -1);
            }
            if (url.includes('#')) url = url.split('#')[0];
            // Only strip query params if it's NOT a google viewer link or similar proxy
            if (url.includes('?') && !url.includes('docs.google.com') && !url.includes('viewer.html')) {
                url = url.split('?')[0];
            }
            return url;
        };
        const isProductImage = (url) => {
            if (!url) return false;
            const lower = url.toLowerCase();
            if (lower.endsWith('.svg')) return false;
            if (lower.includes('logo') || lower.includes('icon') || lower.includes('sprite') || lower.includes('placeholder') || lower.includes('app-store')) return false;
            return true;
        };
        const extractPriceFromLd = () => {
            const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            const getPriceFromOffer = (offer) => {
                if (!offer) return '';
                if (offer.price) return offer.price.toString();
                if (offer.lowPrice) return offer.lowPrice.toString();
                if (offer.highPrice) return offer.highPrice.toString();
                if (offer.priceSpecification) {
                    const spec = offer.priceSpecification;
                    if (Array.isArray(spec)) {
                        for (const s of spec) {
                            if (s && s.price) return s.price.toString();
                        }
                    } else if (spec && spec.price) {
                        return spec.price.toString();
                    }
                }
                return '';
            };
            const scan = (obj) => {
                if (!obj) return '';
                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        const found = scan(item);
                        if (found) return found;
                    }
                    return '';
                }
                if (typeof obj === 'object') {
                    if (obj['@type'] === 'Product') {
                        if (obj.offers) {
                            if (Array.isArray(obj.offers)) {
                                for (const offer of obj.offers) {
                                    const value = getPriceFromOffer(offer);
                                    if (value) return value;
                                }
                            } else {
                                const value = getPriceFromOffer(obj.offers);
                                if (value) return value;
                            }
                        }
                        if (obj.price) return obj.price.toString();
                    }
                    for (const val of Object.values(obj)) {
                        const found = scan(val);
                        if (found) return found;
                    }
                }
                return '';
            };
            for (const node of nodes) {
                try {
                    const data = JSON.parse(node.textContent);
                    const found = scan(data);
                    if (found) return found;
                } catch (_) {}
            }
            return '';
        };

        let title = null;
        const titleEl = findElement(selectors.title);
        if (titleEl) title = titleEl.textContent.trim();

        let price = '';
        const priceEl = findElement(selectors.price);
        if (priceEl) price = priceEl.textContent.trim();
        if (!price) {
            const priceAttrEl = document.querySelector('[data-price], [data-price-amount], [data-product-price]');
            if (priceAttrEl) {
                price = priceAttrEl.getAttribute('data-price') || priceAttrEl.getAttribute('data-price-amount') || priceAttrEl.getAttribute('data-product-price') || (priceAttrEl.textContent ? priceAttrEl.textContent.trim() : '');
            }
        }
        if (!price) {
            const metaPrice = document.querySelector('meta[itemprop="price"], meta[property="product:price:amount"], meta[property="og:price:amount"], meta[name="product:price:amount"]');
            if (metaPrice) price = metaPrice.getAttribute('content') || '';
        }
        if (!price) {
            const ldPrice = extractPriceFromLd();
            if (ldPrice) price = ldPrice;
        }
        if (!price) {
            let bodyText = '';
            if (document && document.body && document.body.innerText) {
                bodyText = document.body.innerText.toLowerCase();
            }
            if (bodyText.includes('contact us') || bodyText.includes('request a quote') || bodyText.includes('request quote')) {
                price = 'Contact us for price';
            } else {
                price = 'Price not found';
            }
        }

        let image = null;
        // 1. Try common main image selectors (more specific ones first)
        const mainImgSelectors = [
            '.woocommerce-product-gallery__image img',
            '.wp-post-image',
            '.product-main-content .main-image-area img',
            '.product-main-content .main-product-image',
            '.main-image-area img',
            '.main-product-image',
            '.attachment-shop_single',
            '#main-image',
            '.product-image img',
            '[class*="product-main-image"] img',
            '[id*="product-main-image"] img',
            '.product-view img',
            '.product-img img'
        ];
        
        for (const sel of mainImgSelectors) {
            const img = document.querySelector(sel);
            if (img) {
                image = img.getAttribute('data-full') || img.getAttribute('data-zoom-image') || img.getAttribute('data-src') || img.getAttribute('src');
                if (image && isProductImage(normalizeUrl(image))) break;
            }
        }

        // 2. Try meta tags as fallback
        if (!image) {
            const metaImg = document.querySelector('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"], meta[itemprop="image"]');
            if (metaImg) image = metaImg.getAttribute('content') || metaImg.getAttribute('href');
        }

        // 3. Fallback to findElement with provided selectors
        if (!image) {
            const imageEl = findElement(selectors.image);
            if (imageEl && imageEl.src) {
                image = imageEl.src;
                if (imageEl.parentElement && imageEl.parentElement.href) {
                    const href = imageEl.parentElement.href;
                    if (/\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(href) || href.includes('/wp-content/uploads/')) {
                        image = href;
                    }
                }
            }
        }

        const galleryImages = [];
        const galleryNodes = Array.from(document.querySelectorAll('.thumbnails-strip img, .gallery-container img, .product-gallery img, .woocommerce-product-gallery__image img, img[data-full], img[data-zoom-image], img[data-src], img[data-original]'));
        galleryNodes.forEach((img) => {
            const dataFull = img.getAttribute('data-full');
            const dataZoom = img.getAttribute('data-zoom-image');
            const dataSrc = img.getAttribute('data-src');
            const dataOriginal = img.getAttribute('data-original');
            const src = img.getAttribute('src');
            if (dataFull) galleryImages.push(dataFull);
            if (dataZoom) galleryImages.push(dataZoom);
            if (dataSrc) galleryImages.push(dataSrc);
            if (dataOriginal) galleryImages.push(dataOriginal);
            if (src) galleryImages.push(src);
        });
        const uniqueGallery = Array.from(new Set(galleryImages.map(normalizeUrl).filter(Boolean))).filter(isProductImage);
        if (!image && uniqueGallery.length > 0) image = uniqueGallery[0];

        let description = null;
        const descEl = findElement(selectors.description);
        if (descEl) description = descEl.textContent.trim();

        const extraBlocks = [];
        const addBlock = (selector) => {
            const nodes = Array.from(document.querySelectorAll(selector));
            nodes.forEach((node) => {
                const text = node.innerText || node.textContent || '';
                const clean = text.replace(/\s+/g, ' ').trim();
                if (clean && clean.length > 20) extraBlocks.push(clean);
            });
        };
        addBlock('[class*="faq"], [id*="faq"]');
        addBlock('[class*="application"], [id*="application"]');
        addBlock('[class*="usage"], [id*="usage"]');
        addBlock('[class*="how-to"], [id*="how-to"]');
        const uniqueExtra = Array.from(new Set(extraBlocks));
        if (uniqueExtra.length > 0) {
            const extraText = uniqueExtra.join('\n\n');
            if (description) {
                description = description + '\n\n' + extraText;
            } else {
                description = extraText;
            }
        }

        const collectList = (selectors) => {
            const items = [];
            selectors.forEach((selector) => {
                const nodes = Array.from(document.querySelectorAll(selector));
                nodes.forEach((node) => {
                    const text = node.textContent ? node.textContent.trim() : '';
                    if (text && text.length > 2) items.push(text);
                });
            });
            return Array.from(new Set(items));
        };

        const collectSpecsFromTables = (selectors) => {
            const specs = [];
            selectors.forEach((selector) => {
                const tables = Array.from(document.querySelectorAll(selector));
                tables.forEach((table) => {
                    const rows = Array.from(table.querySelectorAll('tr'));
                    rows.forEach((row) => {
                        const th = row.querySelector('th');
                        const td = row.querySelector('td');
                        const key = th ? th.textContent.trim() : '';
                        const value = td ? td.textContent.trim() : '';
                        if (key && value) specs.push(`${key}: ${value}`);
                    });
                });
            });
            return specs;
        };

        const collectSpecsFromDl = (selectors) => {
            const specs = [];
            selectors.forEach((selector) => {
                const dls = Array.from(document.querySelectorAll(selector));
                dls.forEach((dl) => {
                    const dts = Array.from(dl.querySelectorAll('dt'));
                    dts.forEach((dt) => {
                        const dd = dt.nextElementSibling && dt.nextElementSibling.tagName.toLowerCase() === 'dd' ? dt.nextElementSibling : null;
                        const key = dt.textContent ? dt.textContent.trim() : '';
                        const value = dd && dd.textContent ? dd.textContent.trim() : '';
                        if (key && value) specs.push(`${key}: ${value}`);
                    });
                });
            });
            return specs;
        };

        const features = collectList([
            '#feature-bullets li span',
            '.product-features li',
            '.features li',
            '.product-description li',
            '.description li',
            '.short-description li'
        ]);

        const specs = [
            ...collectSpecsFromTables([
                '.product-specs table',
                '.specifications table',
                '.product-attributes table',
                'table.shop_attributes',
                'table.product-specs',
                'table.specs'
            ]),
            ...collectSpecsFromDl(['.specifications dl', '.product-specs dl', 'dl'])
        ];

        const datasheetCandidates = [];
        const addCandidate = (value, text) => {
            const clean = normalizeUrl(value);
            if (!clean) return;
            datasheetCandidates.push({ url: clean, text: (text || '').toString() });
        };
        const isDatasheetText = (text) => {
            const t = (text || '').toLowerCase();
            return (
                t.includes('datasheet') ||
                t.includes('data sheet') ||
                t.includes('technical data') ||
                t.includes('safety data') ||
                t.includes('tds') ||
                t.includes('sds') ||
                t.includes('msds') ||
                t.includes('brochure') ||
                t.includes('catalog') ||
                t.includes('catalogue') ||
                t.includes('manual') ||
                t.includes('method') ||
                t.includes('application')
            );
        };
        // Specific check for "Documentation:" text (common in Pilehead)
        const findDocsByText = () => {
            // Check for the specific pilehead.com "ph-product-assets-card"
            const assetCard = document.querySelector('.ph-product-assets-card');
            if (assetCard) {
                console.log('Found ph-product-assets-card, extracting assets...');
                const onclick = assetCard.getAttribute('onclick') || '';
                // The pattern might have single or double quotes, and escaped characters
                const match = onclick.match(/openAssetModal\(([\s\S]*?)\)/);
                if (match && match[1]) {
                    try {
                        // Clean up the JSON string from the onclick attribute
                        let jsonStr = match[1].trim();
                        // If it's wrapped in single quotes, remove them
                        if (jsonStr.startsWith("'") && jsonStr.endsWith("'")) {
                            jsonStr = jsonStr.substring(1, jsonStr.length - 1);
                        }
                        // Unescape common JSON characters found in HTML attributes
                        jsonStr = jsonStr
                            .replace(/\\(['"])/g, '$1')  // Unescape quotes
                            .replace(/&quot;/g, '"')     // Unescape &quot;
                            .replace(/\\\//g, '/')       // Unescape forward slashes \/
                            .replace(/\\\\/g, '\\');     // Unescape backslashes \\
                        
                        // If the string still looks like it has escaped quotes but is not valid JSON, 
                        // try a more aggressive approach
                        try {
                            const assets = JSON.parse(jsonStr);
                            if (Array.isArray(assets)) {
                                assets.forEach(asset => {
                                    if (asset.url) {
                                        console.log(`Extracted asset: ${asset.url} (${asset.title || asset.type})`);
                                        addCandidate(normalizeUrl(asset.url), asset.title || asset.type);
                                    }
                                });
                            }
                        } catch (parseErr) {
                            console.log('JSON.parse failed, trying regex fallback for assets...');
                            // Fallback: extract objects using regex if JSON.parse fails
                            const assetMatches = jsonStr.match(/\{"url":"[^"]+","title":"[^"]+","type":"[^"]+"\}/g);
                            if (assetMatches) {
                                assetMatches.forEach(m => {
                                    try {
                                        const asset = JSON.parse(m);
                                        if (asset.url) addCandidate(normalizeUrl(asset.url), asset.title || asset.type);
                                    } catch(_) {}
                                });
                            }
                        }
                    } catch (e) { 
                        console.error('Error parsing assets from onclick', e);
                    }
                }
            }

            const allElements = Array.from(document.querySelectorAll('div, p, span, strong, b, li'));
            for (const el of allElements) {
                const text = (el.textContent || '').trim();
                if (text.toLowerCase().includes('documentation:')) {
                    // Try to find links inside this element or its siblings
                    const links = Array.from(el.querySelectorAll('a'));
                    if (links.length > 0) {
                        links.forEach(a => {
                            const href = a.getAttribute('href');
                            if (href) addCandidate(normalizeUrl(href), a.textContent);
                        });
                    }
                    // Check siblings if no links inside
                    if (links.length === 0) {
                        let next = el.nextElementSibling;
                        while (next && (next.tagName === 'A' || next.querySelector('a'))) {
                            const a = next.tagName === 'A' ? next : next.querySelector('a');
                            if (a) {
                                const href = a.getAttribute('href');
                                if (href) addCandidate(normalizeUrl(href), a.textContent);
                            }
                            next = next.nextElementSibling;
                        }
                    }
                }
            }
        };
        findDocsByText();

        const anchors = Array.from(document.querySelectorAll('a'));
        anchors.forEach((a) => {
            const href = a.getAttribute('href') || '';
            if (!href) return;
            const text = a.textContent || '';
            if (href.match(/\.(pdf|doc|docx|xls|xlsx|zip)(\?|#|$)/i) || isDatasheetText(text)) {
                addCandidate(normalizeUrl(href), text);
            }
        });
        const dataLinks = Array.from(document.querySelectorAll('[data-href], [data-url], [data-download], [data-file], [data-asset], [data-src]'));
        dataLinks.forEach((el) => {
            const href =
                el.getAttribute('data-href') ||
                el.getAttribute('data-url') ||
                el.getAttribute('data-download') ||
                el.getAttribute('data-file') ||
                el.getAttribute('data-asset') ||
                el.getAttribute('data-src') ||
                '';
            if (!href) return;
            const text = el.textContent || '';
            if (href.match(/\.(pdf|doc|docx|xls|xlsx|zip)(\?|#|$)/i) || isDatasheetText(text)) {
                addCandidate(href, text);
            }
        });
        const guessDatasheetType = (text, link) => {
            const t = (text || '').toString().toLowerCase();
            const u = (link || '').toString().toLowerCase();
            if (t.includes('tds') || u.includes('tds') || t.includes('technical data') || t.includes('data sheet') || t.includes('datasheet')) return 'TDS';
            if (t.includes('sds') || u.includes('sds') || t.includes('msds') || u.includes('msds') || t.includes('safety')) return 'SDS';
            if (t.includes('method') || u.includes('method') || t.includes('application') || u.includes('application')) return 'MS';
            return '';
        };
        const seenDocs = new Set();
        const datasheets = [];
        datasheetCandidates.forEach((item) => {
            if (!item.url || seenDocs.has(item.url)) return;
            seenDocs.add(item.url);
            const type = guessDatasheetType(item.text, item.url);
            const labelSource = (item.text || '').trim();
            const name =
                labelSource && !/^(click here|download)$/i.test(labelSource)
                    ? labelSource
                    : (function () {
                          try {
                              const pathname = new URL(item.url).pathname;
                              const base = pathname.split('/').pop() || '';
                              return base.replace(/[-_]/g, ' ').replace(/\.(pdf|docx?|xlsx?|zip)$/i, '') || 'Document';
                          } catch (e) {
                              return 'Document';
                          }
                      })();
            datasheets.push({
                url: item.url,
                type: type,
                name: name
            });
        });
        let datasheetUrl = '';
        if (datasheets.length > 0) {
            const preferred = datasheets.find((d) => d.type === 'TDS');
            const first = preferred || datasheets[0];
            if (first && first.url) datasheetUrl = first.url;
        }

        let category = null;
        const breadcrumbEl = document.querySelector('.breadcrumb a:last-child');
        if (breadcrumbEl) category = breadcrumbEl.textContent.trim();

        image = normalizeUrl(image);
        if (image && !isProductImage(image)) image = '';

        return {
            name: title,
            price: price,
            image: image,
            description: description,
            category: category,
            galleryImages: uniqueGallery || [],
            features: features || [],
            specs: Array.from(new Set(specs)).filter(Boolean),
            datasheets: datasheets,
            datasheetUrl: datasheetUrl
        };
    }, COMMON_SELECTORS);
}

async function scrapeTemuJsonProduct(page, url) {
    const product = await page.evaluate((currentUrl) => {
        const normalizeText = (value) => {
            if (!value) return '';
            return value.toString().replace(/\s+/g, ' ').trim();
        };
        const normalizeUrl = (value) => {
            if (!value) return '';
            let u = value.toString().trim();
            if (!u) return '';
            // Remove backticks and extra quotes that sometimes appear in raw extraction
            u = u.replace(/[`'"]/g, '').trim();
            if (!u) return '';
            if (u.startsWith('//')) u = 'https:' + u;
            if (u.startsWith('/')) {
                try {
                    const base = new URL(currentUrl);
                    u = base.origin + u;
                } catch (e) {
                    return '';
                }
            }
            // Remove trailing dots but keep .pdf
            if (u.endsWith('.') && !u.toLowerCase().endsWith('.pdf.')) {
                u = u.slice(0, -1);
            }
            if (u.includes('#')) u = u.split('#')[0];
            // Only strip query params if it's NOT a google viewer link or similar proxy
            if (u.includes('?') && !u.includes('docs.google.com') && !u.includes('viewer.html')) {
                u = u.split('?')[0];
            }
            return u;
        };
        const isProductImage = (url) => {
            if (!url) return false;
            const lower = url.toLowerCase();
            if (!/\.(jpg|jpeg|png|gif|webp)(\?|#|$)/.test(lower)) return false;
            if (lower.includes('logo') || lower.includes('icon') || lower.includes('sprite') || lower.includes('placeholder') || lower.includes('avatar') || lower.includes('flag')) return false;
            return true;
        };
        const tryParseJsonBlock = (str) => {
            if (!str) return null;
            const trimmed = str.trim();
            try {
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    return JSON.parse(trimmed);
                }
            } catch (e) {}
            const startIndex = trimmed.indexOf('{');
            if (startIndex === -1) return null;
            let braceCount = 0;
            let endIndex = -1;
            for (let i = startIndex; i < trimmed.length; i++) {
                const ch = trimmed[i];
                if (ch === '{') braceCount++;
                else if (ch === '}') braceCount--;
                if (braceCount === 0) {
                    endIndex = i + 1;
                    break;
                }
            }
            if (endIndex === -1) return null;
            const jsonStr = trimmed.substring(startIndex, endIndex);
            try {
                return JSON.parse(jsonStr);
            } catch (e) {
                return null;
            }
        };
        const collectJsonObjects = () => {
            const objects = [];
            const scripts = Array.from(document.scripts || []);
            scripts.forEach((script) => {
                const id = script.id || '';
                const txt = script.textContent || '';
                if (!txt) return;
                if (id === '__NEXT_DATA__') {
                    const obj = tryParseJsonBlock(txt);
                    if (obj) objects.push(obj);
                    return;
                }
                const lower = txt.toLowerCase();
                if (lower.includes('__next_data__') ||
                    lower.includes('__initial_state__') ||
                    lower.includes('window.__initial_state__') ||
                    lower.includes('window.rawdata') ||
                    lower.includes('window.__data')) {
                    const obj = tryParseJsonBlock(txt);
                    if (obj) objects.push(obj);
                }
            });
            return objects;
        };
        const jsonObjects = collectJsonObjects();
        if (!jsonObjects.length) {
            return {};
        }
        let mainNode = null;
        const candidates = [];
        const visitForProductNode = (node) => {
            if (!node || typeof node !== 'object') return;
            const keys = Object.keys(node);
            const keyStr = keys.join(',').toLowerCase();
            if (keyStr.includes('productinfo') || keyStr.includes('product_info') || keyStr.includes('goodsdetail') || keyStr.includes('goods_detail')) {
                if (node.productInfo && typeof node.productInfo === 'object') {
                    candidates.push(node.productInfo);
                } else {
                    candidates.push(node);
                }
            }
            if (node.skuInfo || node.skuinfo || node.sku_map || node.skuMap) {
                candidates.push(node);
            }
            Object.values(node).forEach((v) => {
                if (v && typeof v === 'object') visitForProductNode(v);
            });
        };
        jsonObjects.forEach((obj) => visitForProductNode(obj));
        if (candidates.length > 0) {
            mainNode = candidates[0];
        } else {
            mainNode = jsonObjects[0];
        }
        const out = {
            name: '',
            price: '',
            image: '',
            description: '',
            category: '',
            brand: '',
            galleryImages: [],
            features: [],
            specs: [],
            rating: '',
            reviewsCount: 0,
            attributes: [],
            variations: []
        };
        const imageSet = new Set();
        const variationCandidates = [];
        const scanNode = (node) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {
                node.forEach((item) => {
                    if (item && typeof item === 'object') {
                        const keys = Object.keys(item);
                        const hasSku = keys.some((k) => {
                            const lk = k.toLowerCase();
                            return lk === 'skuid' || lk === 'sku_id' || lk === 'id' || lk.includes('sku');
                        });
                        const hasPrice = keys.some((k) => {
                            const lk = k.toLowerCase();
                            return lk.includes('price') || lk.includes('amount');
                        });
                        if (hasSku && hasPrice) {
                            variationCandidates.push(item);
                        }
                    }
                    scanNode(item);
                });
                return;
            }
            Object.keys(node).forEach((key) => {
                const v = node[key];
                const lk = key.toLowerCase();
                if (typeof v === 'string' || typeof v === 'number') {
                    const vs = v.toString();
                    if (!out.name && (lk === 'title' || lk === 'name' || lk === 'productname' || lk === 'product_name')) {
                        out.name = normalizeText(vs);
                    }
                    if (!out.description && (lk === 'description' || lk === 'desc' || lk.includes('detail'))) {
                        out.description = normalizeText(vs);
                    }
                    if (!out.price && (lk === 'price' || lk.includes('saleprice') || lk.includes('sale_price') || lk.includes('amount'))) {
                        const m = vs.match(/([0-9]{1,6}(?:\.[0-9]{1,2})?)/);
                        if (m) {
                            const num = parseFloat(m[1]);
                            if (Number.isFinite(num) && num > 0 && num <= 100000) {
                                out.price = num.toFixed(2);
                            }
                        }
                    }
                    if (!out.brand && (lk === 'brand' || lk === 'brandname' || lk === 'brand_name')) {
                        out.brand = normalizeText(vs);
                    }
                    if (!out.category && (lk === 'category' || lk === 'categoryname' || lk === 'category_name')) {
                        out.category = normalizeText(vs);
                    }
                    if (!out.rating && (lk === 'rating' || lk.includes('score') || lk.includes('star'))) {
                        const num = parseFloat(vs);
                        if (Number.isFinite(num) && num > 0 && num <= 5) {
                            out.rating = num.toFixed(2);
                        }
                    }
                    if (!out.reviewsCount && (lk.includes('reviewcount') || lk.includes('reviews') || lk.includes('commentcount'))) {
                        const num = parseInt(vs.replace(/[^0-9]/g, ''), 10);
                        if (Number.isFinite(num) && num >= 0) {
                            out.reviewsCount = num;
                        }
                    }
                    if (lk === 'image' || lk === 'imageurl' || lk === 'imgurl' || lk === 'thumburl' || lk.includes('image_url') || lk.includes('img_url')) {
                        const nu = normalizeUrl(vs);
                        if (isProductImage(nu)) imageSet.add(nu);
                    }
                } else if (Array.isArray(v)) {
                    if (lk.includes('image') || lk.includes('gallery')) {
                        v.forEach((item) => {
                            if (typeof item === 'string') {
                                const nu = normalizeUrl(item);
                                if (isProductImage(nu)) imageSet.add(nu);
                            } else if (item && typeof item === 'object') {
                                Object.values(item).forEach((iv) => {
                                    if (typeof iv === 'string') {
                                        const nu = normalizeUrl(iv);
                                        if (isProductImage(nu)) imageSet.add(nu);
                                    }
                                });
                            }
                        });
                    }
                    scanNode(v);
                } else if (v && typeof v === 'object') {
                    scanNode(v);
                }
            });
        };
        scanNode(mainNode);
        const allImages = Array.from(imageSet);
        if (allImages.length > 0) {
            out.image = allImages[0];
            out.galleryImages = allImages.slice(1, 16);
        }
        if (!out.name) {
            const titleEl = document.querySelector('h1, [itemprop="name"]');
            if (titleEl && titleEl.textContent) out.name = normalizeText(titleEl.textContent);
        }
        if (!out.description) {
            const metaDesc = document.querySelector('meta[name="description"], meta[property="og:description"]');
            if (metaDesc) {
                const dv = metaDesc.getAttribute('content') || metaDesc.textContent;
                if (dv) out.description = normalizeText(dv);
            }
        }
        const variationAttrMap = {};
        const variations = [];
        variationCandidates.forEach((vc) => {
            if (!vc || typeof vc !== 'object') return;
            const keys = Object.keys(vc);
            let variationId = '';
            let rawPrice = '';
            let stock = '';
            let vImage = '';
            const attrs = [];
            keys.forEach((key) => {
                const v = vc[key];
                const lk = key.toLowerCase();
                if (!variationId && (lk === 'skuid' || lk === 'sku_id' || lk === 'id' || lk.includes('sku'))) {
                    variationId = v != null ? v.toString() : variationId;
                }
                if (!rawPrice && (lk === 'price' || lk.includes('saleprice') || lk.includes('sale_price') || lk.includes('amount'))) {
                    rawPrice = v != null ? v.toString() : rawPrice;
                }
                if (!stock && (lk.includes('stock') || lk.includes('inventory') || lk.includes('quantity'))) {
                    stock = v != null ? v.toString() : stock;
                }
                if (!vImage && (lk === 'image' || lk === 'imageurl' || lk === 'imgurl' || lk === 'thumburl' || lk.includes('image_url') || lk.includes('img_url'))) {
                    const nu = normalizeUrl(v != null ? v.toString() : '');
                    if (isProductImage(nu)) vImage = nu;
                }
                const pushAttr = (name, value) => {
                    const n = name.trim();
                    const val = normalizeText(value);
                    if (!n || !val) return;
                    attrs.push({ name: n, value: val });
                    if (!variationAttrMap[n]) variationAttrMap[n] = new Set();
                    variationAttrMap[n].add(val);
                };
                if (typeof v === 'string' || typeof v === 'number') {
                    const vs = v.toString();
                    if (lk.includes('color')) pushAttr('Color', vs);
                    else if (lk.includes('size')) pushAttr('Size', vs);
                } else if (v && typeof v === 'object') {
                    const vn = v.name || v.value || v.label;
                    if (vn && lk.includes('color')) pushAttr('Color', vn);
                    else if (vn && lk.includes('size')) pushAttr('Size', vn);
                }
            });
            let priceValue = '';
            if (rawPrice) {
                const m = rawPrice.toString().match(/([0-9]{1,6}(?:\.[0-9]{1,2})?)/);
                if (m) {
                    const num = parseFloat(m[1]);
                    if (Number.isFinite(num) && num > 0 && num <= 100000) {
                        priceValue = num.toFixed(2);
                    }
                }
            }
            let stockQty = null;
            if (stock) {
                const num = parseInt(stock.replace(/[^0-9]/g, ''), 10);
                if (Number.isFinite(num) && num >= 0) stockQty = num;
            }
            if (!variationId && attrs.length === 0 && !priceValue) return;
            variations.push({
                sku: variationId || '',
                price: priceValue || out.price,
                stock_quantity: stockQty != null ? stockQty : null,
                attributes: attrs,
                image: vImage || out.image,
                gallery_images: out.galleryImages.slice()
            });
        });
        if (variations.length > 0) {
            const attributes = Object.keys(variationAttrMap).map((name) => ({
                name,
                options: Array.from(variationAttrMap[name]),
                visible: true,
                variation: true
            }));
            out.attributes = attributes;
            out.variations = variations;
        }
        return out;
    }, url);
    return product;
}

function normalizeImageUrlForCheck(value, baseUrl) {
    if (!value) return '';
    let cleaned = value.toString().trim().replace(/`/g, '').trim();
    if (!cleaned) return '';
    if (cleaned.startsWith('//')) cleaned = 'https:' + cleaned;
    if (cleaned.startsWith('/')) {
        try {
            cleaned = new URL(cleaned, baseUrl).href;
        } catch (_) {
            return '';
        }
    }
    if (cleaned.endsWith('.')) cleaned = cleaned.slice(0, -1);
    if (cleaned.includes('#')) cleaned = cleaned.split('#')[0];
    return cleaned;
}

async function isImageUrlReachable(url) {
    if (!url || !/^https?:\/\//i.test(url)) return false;
    const methods = ['HEAD', 'GET'];
    for (const method of methods) {
        try {
            const response = await fetch(url, {
                method,
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            if (response && response.ok) return true;
        } catch (_) {}
    }
    return false;
}

async function pickFirstReachableImageUrl(candidates) {
    const seen = new Set();
    for (const candidate of candidates) {
        const url = (candidate || '').trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        if (await isImageUrlReachable(url)) return url;
    }
    return '';
}

// Advanced image detection with Puppeteer waiting
async function findImageWithPuppeteer(page) {
    console.log('Performing advanced image detection...');
    
    // Multiple strategies for finding images
    const imageStrategies = [
        // Strategy 1: Wait for common image selectors
        async () => {
            try {
                await page.waitForSelector('img[src*="product"]', { timeout: 5000 });
                const img = await page.$('img[src*="product"]');
                return await page.evaluate(img => img.src, img);
            } catch (e) { return null; }
        },
        
        // Strategy 2: Look for gallery images
        async () => {
            try {
                await page.waitForSelector('.gallery img', { timeout: 3000 });
                const img = await page.$('.gallery img');
                return await page.evaluate(img => img.src, img);
            } catch (e) { return null; }
        },
        
        // Strategy 3: Look for any product images
        async () => {
            try {
                const images = await page.$$eval('img', imgs => {
                    return imgs
                        .filter(img => img.src && img.src.length > 0)
                        .map(img => ({ src: img.src, area: img.width * img.height }))
                        .sort((a, b) => b.area - a.area)[0]?.src;
                });
                return images || null;
            } catch (e) { return null; }
        },
        
        // Strategy 4: Click on image thumbnails/zoom buttons
        async () => {
            try {
                const zoomButtons = await page.$$('[data-zoom-image], .zoom-button, .image-zoom');
                for (const button of zoomButtons) {
                    await button.click();
                    await helpers.randomDelay(1000, 2000);
                    
                    const largeImage = await page.$eval('body', () => {
                        const modalImg = document.querySelector('.modal-image, .zoom-container img');
                        return modalImg?.src || null;
                    });
                    
                    if (largeImage) return largeImage;
                }
                return null;
            } catch (e) { return null; }
        }
    ];
    
    // Try each strategy until we find an image
    for (const strategy of imageStrategies) {
        const result = await strategy();
        if (result) {
            console.log(`Found image via strategy: ${result}`);
            return result;
        }
    }
    
    return null;
}

// Fallback to related product images
async function findRelatedProductImages(page) {
    console.log('Looking for related product images...');
    
    try {
        // Look for product carousels, related items, or similar products
        const relatedImages = await page.$$eval('[data-product-id], .related-product, .similar-item', elements => {
            return elements
                .map(el => {
                    const img = el.querySelector('img');
                    return img?.src || null;
                })
                .filter(src => src && src.length > 0)[0] || null;
        });
        
        return relatedImages;
    } catch (e) {
        console.log('No related product images found');
        return null;
    }
}

// Enhanced image download with better error handling
async function downloadImageViaPuppeteer(page, imageUrl) {
    try {
        console.log(`Attempting to download: ${imageUrl}`);

        const sourcePageUrl = typeof page.url === 'function' ? page.url() : '';
        const browser = typeof page.browser === 'function' ? page.browser() : null;
        if (browser && sourcePageUrl) {
            let tempPage = null;
            try {
                tempPage = await browser.newPage();
                const response = await tempPage.goto(imageUrl, {
                    waitUntil: 'networkidle0',
                    timeout: 15000,
                    referer: sourcePageUrl
                });
                if (response && response.status() === 200) {
                    const imageBuffer = await response.buffer();
                    const tempDir = path.join(__dirname, '..', 'temp_images');
                    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                    const filename = `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
                    const filePath = path.join(tempDir, filename);
                    fs.writeFileSync(filePath, imageBuffer);
                    console.log(`Image saved to: ${filePath}`);
                    return filePath;
                }
            } catch (_) {
                // fall through to existing strategy
            } finally {
                if (tempPage && !tempPage.isClosed()) {
                    try { await tempPage.close(); } catch (_) {}
                }
            }
        }
        
        // Navigate to image URL directly
        const response = await page.goto(imageUrl, { 
            waitUntil: 'networkidle0', 
            timeout: 15000 
        });
        
        if (!response || response.status() !== 200) {
            throw new Error(`Failed to fetch image: ${response?.status()}`);
        }
        
        // Get image buffer
        const imageBuffer = await response.buffer();
        
        // Create temp directory if it doesn't exist
        const tempDir = path.join(__dirname, '..', 'temp_images');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Generate unique filename
        const filename = `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        const filePath = path.join(tempDir, filename);
        
        // Save image
        fs.writeFileSync(filePath, imageBuffer);
        
        console.log(`Image saved to: ${filePath}`);
        return filePath;
        
    } catch (error) {
        console.error(`Image download failed: ${error.message}`);
        
        // Fallback: Try to get image via evaluate if direct download fails
        try {
            const imageData = await page.evaluate((url) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/jpeg'));
                    };
                    img.onerror = () => resolve(null);
                    img.src = url;
                });
            }, imageUrl);
            
            if (imageData) {
                console.log('Got image via canvas fallback');
                return imageData; // Return as data URL
            }
        } catch (fallbackError) {
            console.error('Canvas fallback also failed:', fallbackError.message);
        }
        
        return null;
    }
}

async function scrapeCategory(term, config) {
    // For universal scraping, we can try to find product links on any page
    let url = term;
    if (!term.startsWith('http')) {
        // If it's not a URL, try to search on Google Shopping or similar
        url = `https://www.google.com/search?q=${encodeURIComponent(term)}&tbm=shop`;
    }

    helpers.log(`Universal category scanning: ${url}`);

    const browser = await puppeteer.launch({
        headless: config.headless,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent(helpers.getRandomUserAgent());
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });
        await helpers.randomDelay(2000, 3000);

        // Find product links using multiple strategies
        const links = await page.evaluate(() => {
            const productUrls = new Set();
            
            // Strategy 1: Look for common e-commerce patterns
            const anchors = Array.from(document.querySelectorAll('a'));
            
            anchors.forEach(a => {
                const href = a.href;
                if (!href) return;

                // Common e-commerce URL patterns
                const patterns = [
                    /\/product\//i,
                    /\/p\//i,
                    /\/item\//i,
                    /\/dp\//i,
                    /\/sku\//i,
                    /\/prod\//i,
                    /\/detail\//i
                ];

                for (const pattern of patterns) {
                    if (pattern.test(href)) {
                        productUrls.add(href);
                        break;
                    }
                }
            });

            return Array.from(productUrls);
        });

        return links.slice(0, 10); // Return first 10 product links

    } catch (error) {
        console.error(`Error scanning category ${url}:`, error);
        return [];
    } finally {
        await browser.close();
    }
}

module.exports = { scrapeProduct, scrapeCategory };
