/**
 * Fosroc Scraper � buy.fosroc.ae
 * Scrapes: name, price, code, images, description, specs, documents (TDS/SDS/MS/etc.)
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const helpers = require('./helpers');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
let pdfParse; try { pdfParse = require('pdf-parse'); } catch (e) { console.error('PDF PARSE REQUIRE FAILED', e); pdfParse = null; }

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://buy.fosroc.ae';

// ---------------------------------------------------------------------------
// PDF Datasheet Parser
// Extracts structured sections (Technical Data, Application, Coverage, etc.)
// from a Fosroc TDS/SDS PDF and returns formatted HTML.
// ---------------------------------------------------------------------------
async function parsePdfDatasheet(pdfPath) {
    if (!pdfParse) return null;
    try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const data = await pdfParse(pdfBuffer);
        const rawText = data.text || '';
        if (!rawText.trim()) return null;

        // Known Fosroc section headings (case-insensitive full-line match)
        const HEADINGS = [
            /^(uses?|description|product description|scope|design criteria|overview|general)$/i,
            /^(advantages?|key advantages?|benefits?|features?|key features?)$/i,
            /^(technical data|technical information|properties|physical properties|product properties|test data|performance data)$/i,
            /^(application instructions?|application|how to apply|method of application|method of use|instructions for use|preparation|substrate preparation|surface preparation|mixing|mixing instructions?|primer|priming|coverage|yield|theoretical coverage|applying|installation)$/i,
            /^(packaging|pack sizes?|standard pack|supply)$/i,
            /^(storage|shelf life|storage & shelf life|storage and shelf life|precautions?|health and safety|health & safety|safety|safety data|important notes?|notes?|standards? compliance|limitations?|warranty|cautions?|additional information|technical support|site trials?|cleaning|equipment)$/i,
            /^(approvals?|certifications?|references?|quality|quality assurance)$/i,
        ];

        const isHeading = (line) => HEADINGS.some(p => p.test(line.trim()));

        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const sections = [];
        let curTitle = null;
        let curLines = [];

        for (const line of lines) {
            if (isHeading(line)) {
                if (curTitle && curLines.length > 0) sections.push({ title: curTitle, lines: curLines });
                curTitle = line.trim();
                curLines = [];
            } else if (curTitle) {
                curLines.push(line);
            }
        }
        if (curTitle && curLines.length > 0) sections.push({ title: curTitle, lines: curLines });

        // Build HTML
        const sectionHtml = (sec, hideTitle = false) => {
            const { title, lines: ls } = sec;
            let out = hideTitle ? '' : `<h3 style="color:#111827;border-bottom:2px solid #3b82f6;padding-bottom:8px;margin-top:24px;margin-bottom:16px;font-size:20px;font-weight:700;">${title}</h3>\n`;

            // Detect table-like rows: two columns separated by 2+ spaces or tab
            const tableRows = ls.filter(l => /\S.+?(?:\s{2,}|\t)\S/.test(l));
            if (tableRows.length >= 3 && tableRows.length >= ls.length * 0.35) {
                out += '<div style="overflow-x:auto;margin:15px 0;"><table style="width:100%;border-collapse:collapse;box-shadow:0 1px 3px rgba(0,0,0,0.1);font-family:inherit;font-size:14px;background:#fff;"><tbody>\n';
                let rowCount = 0;
                for (const l of ls) {
                    const parts = l.split(/(?:\s{2,}|\t)/);
                    if (parts.length >= 2) {
                        const k = parts[0].trim();
                        const v = parts.slice(1).join(' ').trim();
                        const bg = rowCount % 2 === 0 ? '#f9fafb' : '#ffffff';
                        if (k) out += `<tr style="border-bottom:1px solid #e5e7eb;background-color:${bg};"><td style="padding:12px 15px;color:#374151;font-weight:600;width:40%;">${k}</td><td style="padding:12px 15px;color:#4b5563;">${v}</td></tr>\n`;
                        rowCount++;
                    } else if (l.trim()) {
                        out += `<tr><td colspan="2" style="padding:10px 15px;background-color:#f3f4f6;color:#1f2937;font-weight:600;text-align:center;border-bottom:1px solid #e5e7eb;">${l.trim()}</td></tr>\n`;
                    }
                }
                out += '</tbody></table></div>\n';
            } else if (ls.some(l => /^[•\-*\uf06e\u2022\uf0b7]\s/.test(l) || /^\d+\.\s/.test(l))) {
                // Bullet / numbered list
                out += '<ul style="list-style-type:disc;padding-left:20px;margin-bottom:15px;color:#4b5563;line-height:1.6;">\n';
                for (const l of ls) {
                    const clean = l.replace(/^[•\-*\uf06e\u2022\uf0b7\d.]+\s*/, '').trim();
                    if (clean) out += `<li style="margin-bottom:8px;">${clean}</li>\n`;
                }
                out += '</ul>\n';
            } else {
                // Plain paragraphs — join consecutive lines, split on blank chunks
                const joined = ls.join('\n').replace(/\n{2,}/g, '\n\n');
                for (const para of joined.split('\n\n')) {
                    const t = para.replace(/\n/g, ' ').trim();
                    if (t) out += `<p style="margin-bottom:15px;color:#4b5563;line-height:1.6;font-size:15px;">${t}</p>\n`;
                }
            }
            return out;
        };

        if (sections.length === 0) {
            // No recognised headings — return first 2000 chars as plain text
            const preview = rawText.trim().slice(0, 2000).replace(/&/g, '&amp;').replace(/</g, '&lt;');
            const fallBackHtml = `<div class="fosroc-datasheet"><p><em>(Datasheet preview)</em></p><pre style="white-space:pre-wrap;font-size:0.85em;">${preview}</pre></div>`;
            return {
                html: fallBackHtml,
                sections: []
            };
        }

        let html = '<div class="fosroc-datasheet" style="margin-top:20px;">\n';
        for (const sec of sections) html += sectionHtml(sec, false);
        html += '</div>';
        return {
            html,
            sections: sections.map(s => ({
                title: s.title,
                lines: s.lines,
                text: s.lines.join(' '),
                html: sectionHtml(s, false),
                htmlNoTitle: sectionHtml(s, true)
            }))
        };
    } catch (err) {
        return null;
    }
}

// --- Browser launcher --------------------------------------------------------

async function launchBrowser(config = {}) {
    return puppeteer.launch({
        headless: config.headless !== false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--start-maximized'
        ]
    });
}

// --- File downloader ---------------------------------------------------------

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        try {
            const proto = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(destPath);
            const request = proto.get(url, {
                headers: {
                    'Referer': BASE_URL,
                    'User-Agent': helpers.getRandomUserAgent()
                }
            }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    file.close();
                    fs.unlink(destPath, () => {});
                    return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                }
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(destPath, () => {});
                    return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                }
                response.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', (err) => {
                    fs.unlink(destPath, () => {});
                    reject(err);
                });
            });
            request.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
            request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Download timed out'));
            });
        } catch (err) {
            reject(err);
        }
    });
}

// --- Main product scraper ----------------------------------------------------

async function scrapeProduct(url, config = {}, checkIfProductExists) {
    let browser;
    try {
        browser = await launchBrowser(config);
        const page = await browser.newPage();
        await page.setUserAgent(helpers.getRandomUserAgent());
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        // Intercept and capture AJAX document responses
        const capturedDocUrls = [];
        await page.setRequestInterception(true);
        page.on('request', req => req.continue());
        page.on('response', async (response) => {
            try {
                const resUrl = response.url();
                const ct = response.headers()['content-type'] || '';
                if (
                    resUrl.includes('SupportedDocuments') ||
                    resUrl.includes('document') ||
                    resUrl.includes('Download') ||
                    (ct.includes('application/json') && resUrl.includes(BASE_URL))
                ) {
                    const text = await response.text().catch(() => '');
                    if (text && (text.includes('.pdf') || text.includes('Url') || text.includes('url'))) {
                        const pdfMatches = text.match(/https?:\/\/[^"'\s]+\.pdf[^"'\s]*/gi) || [];
                        const urlMatches = text.match(/"(?:Url|url|href|link)":\s*"([^"]+)"/g) || [];
                        pdfMatches.forEach(u => capturedDocUrls.push(u));
                        urlMatches.forEach(u => {
                            const m = u.match(/"(?:Url|url|href|link)":\s*"([^"]+)"/);
                            if (m && m[1]) capturedDocUrls.push(m[1]);
                        });
                    }
                }
            } catch (_) {}
        });

        helpers.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: config.timeout || 60000 });

        // -- Product object ----------------------------------------------------

        const product = {
            name: '',
            code: '',
            price: '',
            brand: 'Fosroc',
            image: '',
            localImagePath: null,
            description: '',
            shortDescription: '',
            galleryImages: [],
            localGalleryPaths: [],
            specs: {},
            datasheetUrl: null,
            localDatasheetPath: null,
            datasheets: [],
            documents: [],
            attributes: [],
            variations: []
        };

        // -- 1. Core product data ----------------------------------------------

        const coreData = await page.evaluate(() => {
            // Name
            const nameEl = document.querySelector('h1.product-name, h1.page-title, h1, .product-title h1');
            const name = nameEl ? nameEl.textContent.trim() : '';

            // Price — nopCommerce uses id="price-value-NNN" or class "actual-price"
            let price = '';
            const priceEl = document.querySelector(
                '[id^="price-value"], .actual-price, .price-value, ' +
                '.product-price span, [itemprop="price"], .price'
            );
            if (priceEl) {
                price = priceEl.textContent.trim()
                    .replace(/^AED\s*/i, '')   // strip "AED" prefix
                    .replace(/,/g, '')          // strip thousand separators
                    .trim();
            }
            // Fallback: parse from page text e.g. "AED 230.00"
            if (!price || isNaN(parseFloat(price))) {
                const bodyText = document.body.innerText;
                const m = bodyText.match(/AED\s*([\d,]+\.?\d*)/i);
                if (m) price = m[1].replace(/,/g, '');
            }

            // SKU
            let code = '';
            const skuEl = document.querySelector('.sku, .product-sku, [itemprop="sku"], .product-code');
            if (skuEl) {
                code = skuEl.textContent.trim().replace(/^(SKU|Code|Part No|Item)[:\s]*/i, '').trim();
            }
            if (!code) {
                document.querySelectorAll('li, span, div').forEach(el => {
                    if (!code && /SKU|Model|Code/i.test(el.textContent) && el.textContent.length < 80) {
                        const val = el.textContent.replace(/^.*(SKU|Model|Code)[:\s]*/i, '').trim();
                        if (val && val.length < 40) code = val;
                    }
                });
            }

            // Short description
            const shortDescEl = document.querySelector('.short-description, .product-short-description, .overview-text');
            const shortDescription = shortDescEl ? shortDescEl.textContent.trim() : '';

            // Main image — nopCommerce stores images in /images/thumbs/ with _NNN size suffix
            // We record BOTH the _1000 attempt and the original URL as fallback
            const toFullSize = (src) => {
                if (!src) return src;
                return src.replace(/(_\d+)(\.(jpe?g|png|gif|webp))$/i, '_1000$2');
            };
            const getOriginalUrl = (src) => src; // keep as-is for fallback

            let image = '';
            let imageFallback = '';

            // Collect all candidate product images — exclude logos, headers, placeholders
            const isProductImg = (src) => {
                if (!src) return false;
                const lower = src.toLowerCase();
                return lower.includes('/images/') &&
                    !lower.includes('logo') &&
                    !lower.includes('header') &&
                    !lower.includes('placeholder') &&
                    !lower.includes('loading') &&
                    !lower.includes('noimage') &&
                    !lower.includes('default-image');
            };

            // Priority 1: main product picture container (nopCommerce .picture within product details)
            const productPicEl = (() => {
                // Try in-product containers first
                for (const sel of [
                    '.product-essential .picture img',
                    '.product-details-page .picture img',
                    '.gallery .picture img',
                    '.overview .picture img',
                    '.picture img',
                    '.woocommerce-product-gallery img',
                    '.wp-post-image',
                    '.attachment-shop_single img',
                    '.product-images img'
                ]) {
                    const el = document.querySelector(sel);
                    const src = el && (el.getAttribute('data-zoom-image') || el.getAttribute('data-large_image') || el.getAttribute('data-src') || el.getAttribute('src') || '');
                    if (src && isProductImg(src)) return el;
                }
                // Fallback: any thumbs image that is not a logo
                const allImgs = [...document.querySelectorAll('img[src*="/images/thumbs/"], img[data-src*="/images/thumbs/"]')];
                return allImgs.find(img => {
                    const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
                    return isProductImg(src);
                }) || null;
            })();

            if (productPicEl) {
                const rawSrc = productPicEl.getAttribute('data-zoom-image') || productPicEl.getAttribute('data-large_image') || productPicEl.getAttribute('data-src') || productPicEl.getAttribute('src') || '';
                const absRaw = rawSrc.startsWith('/') ? window.location.origin + rawSrc : rawSrc;
                image = toFullSize(absRaw);
                imageFallback = absRaw; // use original size as fallback
            }

            // Gallery — nopCommerce picture thumbs
            // nopCommerce often uses href="#" / href="javascript:" so we must look at data-* attributes
            const galleryImages = [];
            const thumbAnchorSel = [
                '.picture-thumbs a', '.more-pictures a', '.thumb-item a',
                '.product-pictures-thumbs a', 'li.product-thumbnail a',
                '.slick-slide a', '.picture a'
            ].join(', ');

            document.querySelectorAll(thumbAnchorSel).forEach(a => {
                // 1. Try data attributes on the <a> element first
                let href = a.getAttribute('data-full-image-url') ||
                           a.getAttribute('data-fullsizeimageurl') ||
                           a.getAttribute('data-full') ||
                           a.getAttribute('data-src') || '';

                // 2. If href is '#' or javascript:, dig into the child <img>
                if (!href || href === '#' || href.startsWith('javascript')) {
                    const hrefAttr = a.getAttribute('href') || '';
                    if (hrefAttr && hrefAttr !== '#' && !hrefAttr.startsWith('javascript')) {
                        href = hrefAttr;
                    } else {
                        const img = a.querySelector('img');
                        if (img) {
                            href = img.getAttribute('data-fullsizeimageurl') ||
                                   img.getAttribute('data-full-image-url') ||
                                   img.getAttribute('data-src') ||
                                   img.getAttribute('src') || '';
                            // Convert tiny thumbnail (_80) to a usable size (_625)
                            if (href) href = href.replace(/(_\d+)(\.(jpe?g|png|gif|webp))$/i, '_625$2');
                        }
                    }
                }

                if (!href || href === '#' || href.startsWith('javascript')) return;
                if (href.startsWith('/')) href = window.location.origin + href;
                else if (href.startsWith('//')) href = 'https:' + href;
                href = toFullSize(href);
                if (isProductImg(href) && !galleryImages.includes(href)) galleryImages.push(href);
            });

            // Fallback: collect any thumbs <img> NOT already captured (e.g. carousel slides)
            if (galleryImages.length === 0) {
                [...document.querySelectorAll(
                    '.picture-thumbs img, .slick-slide img, .picture-carousel img, .thumb-item img'
                )].forEach(img => {
                    let src = img.getAttribute('data-fullsizeimageurl') ||
                               img.getAttribute('data-src') ||
                               img.getAttribute('src') || '';
                    if (!src || !isProductImg(src)) return;
                    if (src.startsWith('/')) src = window.location.origin + src;
                    // Upgrade thumbnail → 625
                    src = src.replace(/(_\d+)(\.(jpe?g|png|gif|webp))$/i, '_625$2');
                    src = toFullSize(src);
                    if (!galleryImages.includes(src)) galleryImages.push(src);
                });
            }

            return { name, price, code, shortDescription, image, imageFallback, galleryImages };
        });

        if (coreData.name) product.name = coreData.name;
        if (coreData.price) product.price = coreData.price;
        if (coreData.code) product.code = coreData.code;
        if (coreData.shortDescription) product.shortDescription = coreData.shortDescription;
        if (coreData.image) product.image = coreData.image;
        // Store fallback image URL for download retry
        const imageFallbackUrl = coreData.imageFallback || '';
        if (coreData.galleryImages?.length) {
            product.galleryImages = Array.from(new Set(coreData.galleryImages))
                .filter(u => u !== product.image && !u.includes('logo') && !u.includes('placeholder'))
                .slice(0, 10);
        }

        helpers.log(`Product: ${product.name || '(no name)'} | Price: ${product.price}`);

        // -- 1c. Scrape ALL variants/attributes (nopCommerce) — SIZE, COLOR, etc. --
        try {
            // Phase 1: Read all attribute groups + their clickable options from the DOM (no JS interaction yet)
            const attrData = await page.evaluate(() => {
                const groups = [];
                const containers = [...document.querySelectorAll('[id^="product_attribute_container_"]')];

                for (const container of containers) {
                    // ── Attribute name ──────────────────────────────────────────────────
                    let name = 'Attribute';
                    for (const sel of ['.attribute-label', 'dt label', '.control-label', 'label:first-of-type']) {
                        const el = container.querySelector(sel);
                        if (el && el.textContent.trim()) {
                            name = el.textContent.trim().replace(/[*:]/g, '').trim();
                            break;
                        }
                    }

                    const options = [];

                    // ── 1. Radio buttons (most common on nopCommerce) ────────────────
                    const radios = [...container.querySelectorAll('input[type="radio"]')];
                    for (const r of radios) {
                        let label = '';
                        // Try label[for=id]
                        if (r.id) {
                            const forLabel = document.querySelector(`label[for="${r.id}"]`);
                            if (forLabel) label = forLabel.textContent.trim();
                        }
                        // Try parent label
                        if (!label) {
                            const parentLabel = r.closest('label');
                            if (parentLabel) label = parentLabel.textContent.trim();
                        }
                        // Try next sibling span/label
                        if (!label) {
                            const sib = r.nextElementSibling;
                            if (sib) label = sib.textContent.trim();
                        }
                        // Try li text
                        if (!label) {
                            const li = r.closest('li');
                            if (li) label = li.textContent.trim();
                        }
                        if (!label) label = r.value;
                        if (label && r.id) options.push({ label: label.trim(), type: 'radio', clickSel: `#${CSS.escape(r.id)}` });
                    }

                    // ── 2. Select dropdown ───────────────────────────────────────────
                    if (options.length === 0) {
                        const sel = container.querySelector('select');
                        if (sel) {
                            const selSel = sel.name ? `select[name="${sel.name}"]` : (sel.id ? `#${CSS.escape(sel.id)}` : 'select');
                            for (const opt of sel.options) {
                                if (!opt.value || opt.value === '') continue;
                                options.push({ label: opt.text.trim(), type: 'select', selectSel: selSel, selectVal: opt.value });
                            }
                        }
                    }

                    // ── 3. Swatch buttons with data-attributevalueid ─────────────────
                    if (options.length === 0) {
                        const swatches = [...container.querySelectorAll('[data-attributevalueid]')];
                        for (const sw of swatches) {
                            const label = (sw.getAttribute('title') || sw.textContent).trim();
                            const vid = sw.getAttribute('data-attributevalueid');
                            if (label && vid) options.push({ label, type: 'swatch', clickSel: `[data-attributevalueid="${vid}"]` });
                        }
                    }

                    // ── 4. Generic li/span fallback ──────────────────────────────────
                    if (options.length === 0) {
                        const lis = [...container.querySelectorAll('ul li, .attribute-values li')];
                        for (const li of lis) {
                            const inp = li.querySelector('input');
                            const label = li.textContent.trim();
                            const clickSel = inp && inp.id ? `#${CSS.escape(inp.id)}` : null;
                            if (label) options.push({ label, type: inp ? 'radio' : 'li', clickSel });
                        }
                    }

                    if (options.length > 0) groups.push({ name, options });
                }
                return groups;
            });

            helpers.log(`Attribute groups found: ${attrData.length}`);

            if (attrData.length > 0) {
                const sleep = ms => new Promise(r => setTimeout(r, ms));
                const attrGroups = [];

                for (const group of attrData) {
                    helpers.log(`  Attribute: "${group.name}" (${group.options.length} options)`);
                    const variants = [];

                    for (const opt of group.options) {
                        try {
                            // Click/select the option to trigger nopCommerce AJAX price update
                            if (opt.type === 'select' && opt.selectSel) {
                                await page.select(opt.selectSel, opt.selectVal).catch(() => {});
                            } else if (opt.clickSel) {
                                await page.click(opt.clickSel).catch(() => {});
                            }
                            await sleep(700); // wait for AJAX to update price

                            // Read updated price
                            const varPrice = await page.$eval(
                                '[id^="price-value"], .actual-price, .price-value, .product-price span',
                                el => el.textContent.trim().replace(/[^0-9.]/g, '')
                            ).catch(() => '');

                            variants.push({ label: opt.label, price: varPrice || product.price || '' });
                            helpers.log(`    "${opt.label}" → AED ${varPrice || '?'}`);
                        } catch (_) { /* skip broken option */ }
                    }

                    if (variants.length > 0) attrGroups.push({ name: group.name, variants });
                }

                if (attrGroups.length > 0) {
                    // ── WooCommerce attributes ───────────────────────────────────────
                    product.attributes = attrGroups.map(g => ({
                        name: g.name,
                        options: g.variants.map(v => v.label),
                        visible: true,
                        variation: true
                    }));

                    // ── WooCommerce variations ───────────────────────────────────────
                    if (attrGroups.length === 1) {
                        // Single attribute — one variation per option
                        product.variations = attrGroups[0].variants.map(v => ({
                            price: v.price,
                            regular_price: v.price,
                            attributes: [{ name: attrGroups[0].name, value: v.label }]
                        }));
                    } else {
                        // Multi-attribute — Cartesian product; first attr drives price
                        const [primary, ...rest] = attrGroups;
                        product.variations = [];
                        for (const pv of primary.variants) {
                            const combos = rest.reduce(
                                (acc, g) => acc.flatMap(a => g.variants.map(rv => [...a, { name: g.name, value: rv.label }])),
                                [[{ name: primary.name, value: pv.label }]]
                            );
                            combos.forEach(attrs => product.variations.push({
                                price: pv.price, regular_price: pv.price, attributes: attrs
                            }));
                        }
                    }

                    // Set product.price to the lowest variant price
                    const prices = product.variations.map(v => parseFloat(v.price)).filter(p => p > 0);
                    if (prices.length > 0) product.price = Math.min(...prices).toFixed(2);

                    helpers.log(`Variants scraped: ${attrGroups.map(g => `${g.name}(${g.variants.length})`).join(', ')}`);
                }
            }
        } catch (varErr) {
            helpers.log(`Variant scraping error: ${varErr.message}`);
        }

        // -- 1b. Download images through browser session (buy.fosroc.ae blocks hotlinks) --
        try {
            const imgDir = path.join(process.cwd(), 'downloads', 'fosroc', 'images');
            if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

            // Helper: download one image URL via browser fetch (session cookies included)
            const browserDownloadImage = async (imgUrl, fileName) => {
                const destPath = path.join(imgDir, fileName);
                const b64 = await page.evaluate(async (u) => {
                    try {
                        const r = await fetch(u, { credentials: 'include' });
                        if (!r.ok) return null;
                        const buf = await r.arrayBuffer();
                        let binary = '';
                        const bytes = new Uint8Array(buf);
                        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                        return btoa(binary);
                    } catch (_) { return null; }
                }, imgUrl).catch(() => null);

                if (b64) {
                    fs.writeFileSync(destPath, Buffer.from(b64, 'base64'));
                    return destPath;
                }
                return null;
            };

            // Download main product image — try _1000 first, fall back to original size
            if (product.image) {
                const safeName = (product.name || 'product').replace(/[^a-z0-9_-]/gi, '_').slice(0, 50);
                let localPath = null;

                // Try _1000 (full size)
                const ext1000 = product.image.match(/\.(jpe?g|png|gif|webp)/i)?.[1] || 'jpg';
                localPath = await browserDownloadImage(product.image, `${safeName}_main.${ext1000}`);

                // Fallback: try original size URL (e.g. _625, _550, _325)
                if (!localPath && imageFallbackUrl && imageFallbackUrl !== product.image) {
                    helpers.log(`⟳ Retrying image with original size URL...`);
                    const extFb = imageFallbackUrl.match(/\.(jpe?g|png|gif|webp)/i)?.[1] || 'jpg';
                    localPath = await browserDownloadImage(imageFallbackUrl, `${safeName}_main.${extFb}`);
                }

                if (localPath) {
                    product.localImagePath = localPath;
                    helpers.log(`✓ Main image downloaded: ${path.basename(localPath)}`);
                } else {
                    helpers.log(`✗ Main image download failed: ${product.image}`);
                }
            }

            // Download gallery images
            for (let i = 0; i < product.galleryImages.length; i++) {
                const imgUrl = product.galleryImages[i];
                const ext = imgUrl.match(/\.(jpe?g|png|gif|webp)/i)?.[1] || 'jpg';
                const safeName = (product.name || 'product').replace(/[^a-z0-9_-]/gi, '_').slice(0, 50);
                const localPath = await browserDownloadImage(imgUrl, `${safeName}_gallery_${i + 1}.${ext}`);
                if (localPath) {
                    product.localGalleryPaths.push(localPath);
                    helpers.log(`✓ Gallery image ${i + 1} downloaded`);
                }
            }
        } catch (imgErr) {
            helpers.log(`Image download error: ${imgErr.message}`);
        }

        // -- 2. Full Description -----------------------------------------------

        try {
            const descTab = await page.$('.tab-title a, .nav-tabs a, [data-tab="overview"], a[href="#tab-description"], a[href="#overview"]');
            if (descTab) {
                await descTab.click().catch(() => {});
                await new Promise(r => setTimeout(r, 800));
            }

            const descHtml = await page.evaluate(() => {
                const selectors = [
                    '.full-description', '#tab-description', '#overview',
                    '.product-description', '.tab-content .overview',
                    '[itemprop="description"]', '.overview-content', '.product-details-content'
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const clone = el.cloneNode(true);
                        ['script', 'style', 'button', '.add-to-cart', '.social-sharing', 'nav'].forEach(s => {
                            clone.querySelectorAll(s).forEach(n => n.remove());
                        });
                        const html = clone.innerHTML.trim();
                        if (html.length > 30) return html;
                    }
                }
                const fallback = document.querySelector('.short-description, .product-intro, .description');
                return fallback ? fallback.innerHTML.trim() : '';
            });

            if (descHtml) product.description = descHtml;
        } catch (err) {
            helpers.log(`Description error: ${err.message}`);
        }

        // -- 3. Specifications ------------------------------------------------

        try {
            const specsData = await page.evaluate(() => {
                const specs = {};
                document.querySelectorAll(
                    '.product-specs table tr, .specification table tr, .technical-data tr, .attributes tr'
                ).forEach(row => {
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length >= 2) {
                        const key = cells[0].textContent.trim().replace(/:$/, '');
                        const val = cells[1].textContent.trim();
                        if (key && val) specs[key] = val;
                    }
                });
                document.querySelectorAll('.product-attributes dt, .product-specs dt').forEach(dt => {
                    const dd = dt.nextElementSibling;
                    if (dd && dd.tagName === 'DD') {
                        const key = dt.textContent.trim().replace(/:$/, '');
                        const val = dd.textContent.trim();
                        if (key && val) specs[key] = val;
                    }
                });
                return specs;
            });
            if (Object.keys(specsData).length > 0) product.specs = specsData;
        } catch (err) {
            helpers.log(`Specs error: ${err.message}`);
        }

        // -- 4. Documents (TDS / SDS / MS / Approval / etc.) -----------------

        try {
            helpers.log('Looking for documents...');

            // Click any Download/Documents tab
            const triggers = await page.$$('a, button');
            for (const trigger of triggers) {
                const text = await page.evaluate(el => el.textContent.trim().toLowerCase(), trigger).catch(() => '');
                if (text === 'download' || text === 'documents' || text === 'datasheets') {
                    await trigger.click().catch(() => {});
                    await new Promise(r => setTimeout(r, 2000));
                    break;
                }
            }

            // Find product ID
            const productId = await page.evaluate(() => {
                const tblDoc = document.querySelector('[id^="tblDoc"]');
                if (tblDoc) {
                    const m = tblDoc.id.match(/\d+/);
                    return m ? m[0] : null;
                }
                const src = document.documentElement.innerHTML;
                const m = src.match(/productId['":\s]+(\d{4,})/i) || src.match(/product_id['":\s]+(\d{4,})/i);
                return m ? m[1] : null;
            });

            if (productId) {
                helpers.log(`Product ID: ${productId} � triggering document loader`);

                await page.evaluate((id) => {
                    const fn = window[`myFunction${id}`] || window[`loadDocs${id}`];
                    if (typeof fn === 'function') fn();
                }, productId).catch(() => {});

                await page.waitForFunction(
                    (id) => !!document.querySelector(`#tblDoc${id} tbody tr`),
                    { timeout: 8000 },
                    productId
                ).catch(() => helpers.log('Document table not populated via JS trigger.'));

                // Call the real Fosroc AJAX endpoint: POST /GoogleAuth/DocList
                // Response fields: PictureUrl, OverrideTitleAttribute, Type
                try {
                    const apiDocs = await page.evaluate(async (baseUrl, pid) => {
                        try {
                            const formData = new URLSearchParams();
                            formData.append('id', pid);
                            const r = await fetch(`${baseUrl}/GoogleAuth/DocList`, {
                                method: 'POST',
                                credentials: 'include',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                    'X-Requested-With': 'XMLHttpRequest'
                                },
                                body: formData.toString()
                            });
                            if (r.ok) {
                                const data = await r.json();
                                if (Array.isArray(data)) {
                                    return data.map(item => ({
                                        url: item.PictureUrl || item.pictureUrl || item.Url || item.url || '',
                                        name: item.OverrideTitleAttribute || item.overrideTitleAttribute || item.Name || item.name || 'Document',
                                        type: item.Type || item.type || item.DocumentType || ''
                                    })).filter(d => d.url);
                                }
                            }
                        } catch (_) {}
                        return [];
                    }, BASE_URL, productId);

                    if (apiDocs.length > 0) {
                        helpers.log(`✓ API returned ${apiDocs.length} documents`);
                        apiDocs.forEach(d => capturedDocUrls.push(JSON.stringify(d)));
                    }
                } catch (_) {}
            }

            // DOM extraction
            const domDocs = await page.evaluate(() => {
                const docs = [];

                // From tblDoc table
                const tblDoc = document.querySelector('[id^="tblDoc"], #document-table, .document-table');
                if (tblDoc) {
                    tblDoc.querySelectorAll('tbody tr, tr:not(:first-child)').forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            const name = cells[0]?.textContent?.trim() || '';
                            const type = cells.length >= 3 ? (cells[1]?.textContent?.trim() || '') : '';
                            const a = cells[cells.length - 1]?.querySelector('a');
                            if (a?.href) docs.push({ url: a.href, name, type });
                        }
                    });
                }

                // Scan all <a> tags
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    const text = a.textContent?.trim() || '';
                    const isDoc = (
                        href.includes('.pdf') || href.includes('/content/') ||
                        href.includes('download') || href.includes('datasheet') ||
                        /\.(pdf|doc|docx)(\?|$)/i.test(href)
                    );
                    if (isDoc && href.startsWith('http') && !href.includes('shipping') && !href.includes('privacy')) {
                        docs.push({ url: href, name: text || 'Document', type: '' });
                    }
                    const onclick = a.getAttribute('onclick') || '';
                    if (onclick.includes("window.open('")) {
                        const m = onclick.match(/window\.open\('([^']+)'/);
                        if (m) docs.push({ url: m[1], name: text || 'Document', type: '' });
                    }
                });

                return docs;
            });

            // Merge all sources
            const allRaw = [...domDocs];
            capturedDocUrls.forEach(raw => {
                try { allRaw.push(JSON.parse(raw)); } catch (_) {
                    if (raw.startsWith('http')) allRaw.push({ url: raw, name: 'Document', type: '' });
                }
            });

            // Deduplicate
            const seen = new Set();
            const unique = allRaw.filter(d => {
                const u = d.url?.trim();
                if (!u || seen.has(u)) return false;
                seen.add(u);
                return true;
            });

            // Classify
            product.documents = unique.map(doc => {
                const combined = `${doc.type || ''} ${doc.name || ''} ${doc.url || ''}`.toUpperCase();
                let type = 'OTHER';
                if (combined.includes('TDS') || combined.includes('TECHNICAL DATA')) type = 'TDS';
                else if (combined.includes('SDS') || combined.includes('SAFETY DATA') || combined.includes('MSDS')) type = 'SDS';
                else if (/\bMS\b/.test(combined) || combined.includes('METHOD STATEMENT')) type = 'MS';
                else if (combined.includes('APPROVAL') || combined.includes('CERTIFICATE')) type = 'APPROVAL';
                else if (combined.includes('BROCHURE') || combined.includes('CATALOGUE')) type = 'BROCHURE';
                else if (combined.includes('.PDF')) type = 'PDF';
                return { url: doc.url.trim(), name: doc.name || 'Document', type };
            });

            // Primary datasheet
            const tds = product.documents.find(d => d.type === 'TDS');
            const sds = product.documents.find(d => d.type === 'SDS');
            product.datasheetUrl = tds?.url || sds?.url || product.documents[0]?.url || null;
            product.datasheets = product.documents; // backward compat

            helpers.log(`Documents found: ${product.documents.length} | Primary: ${product.datasheetUrl || 'none'}`);

        } catch (err) {
            helpers.log(`Documents error: ${err.message}`);
        }

        // -- 5. Download documents through browser session (avoids 403 on Fosroc CDN) ----

        if (product.documents.length > 0) {
            const dlDir = path.join(process.cwd(), 'downloads', 'fosroc');
            if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });

            for (const doc of product.documents) {
                try {
                    const ext = (doc.url.match(/\.(pdf|doc|docx)(\?|$)/i) || ['', 'pdf'])[1].toLowerCase();
                    const safeName = (doc.name || 'document').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
                    const destPath = path.join(dlDir, `${safeName}_${Date.now()}.${ext}`);

                    // Download via browser page so session cookies are included (buy.fosroc.ae requires auth)
                    const b64 = await page.evaluate(async (docUrl) => {
                        try {
                            const r = await fetch(docUrl, { credentials: 'include' });
                            if (!r.ok) return null;
                            const buf = await r.arrayBuffer();
                            let binary = '';
                            const bytes = new Uint8Array(buf);
                            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                            return btoa(binary);
                        } catch (_) { return null; }
                    }, doc.url);

                    if (b64) {
                        fs.writeFileSync(destPath, Buffer.from(b64, 'base64'));
                        doc.localPath = destPath;
                        helpers.log(`✓ Downloaded (browser): ${path.basename(destPath)}`);
                        if (doc.type === 'TDS' && !product.localDatasheetPath) product.localDatasheetPath = destPath;
                    } else {
                        // Fallback: bare HTTP download
                        await downloadFile(doc.url, destPath).then(() => {
                            doc.localPath = destPath;
                            helpers.log(`✓ Downloaded (http): ${path.basename(destPath)}`);
                            if (doc.type === 'TDS' && !product.localDatasheetPath) product.localDatasheetPath = destPath;
                        }).catch(dlErr => helpers.log(`✗ Download failed for ${doc.url}: ${dlErr.message}`));
                    }
                } catch (dlErr) {
                    helpers.log(`Download error for ${doc.url}: ${dlErr.message}`);
                }
            }
        }

        // -- 5b. Parse downloaded PDFs to extract structured datasheet content ----
        try {
            const parseable = product.documents.filter(
                d => d.localPath && fs.existsSync(d.localPath) && d.localPath.toLowerCase().endsWith('.pdf')
            );

            // Priority: TDS first, then SDS, then any PDF
            const priority = ['TDS', 'SDS', 'MS', 'APPROVAL', 'BROCHURE', 'PDF', 'OTHER'];
            parseable.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));

            product.tabs = {};

            // ── Per-tab premium HTML builder ──────────────────────────────────
            const buildTabHtml = (sec, tabKey) => {
                const ls = sec.lines || (sec.text ? sec.text.split('\n') : []);
                const cleanLine = l => l.replace(/^[•\-*\uf06e\u2022\uf0b7\d.]+\s*/, '').trim();
                const isBulletLine = l => /^[•\-*\uf06e\u2022\uf0b7]\s/.test(l) || /^\d+\.\s/.test(l);
                const tableRows = ls.filter(l => /\S.+?(?:\s{2,}|\t)\S/.test(l));
                const isTableLike = tableRows.length >= 3 && tableRows.length >= ls.length * 0.35;
                const hasBullets = ls.some(l => isBulletLine(l));
                const textJoined = ls.join(' ').replace(/\s+/g, ' ').trim();

                // BENEFITS — premium checkmark cards
                if (tabKey === 'benefits') {
                    const items = ls.map(cleanLine).filter(Boolean);
                    if (!items.length) return `<p style="color:#374151;line-height:1.7;font-size:15px;">${textJoined}</p>`;
                    let out = '<ul style="list-style:none;padding:0;margin:0;">';
                    for (const item of items) {
                        out += `<li style="display:flex;align-items:flex-start;padding:13px 16px;margin-bottom:10px;background:#f0f7ff;border-left:4px solid #3b82f6;border-radius:6px;"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:50%;background:#3b82f6;color:#fff;font-size:12px;font-weight:700;margin-right:12px;flex-shrink:0;">&#10003;</span><span style="color:#1e3a5f;font-size:15px;line-height:1.6;">${item}</span></li>`;
                    }
                    out += '</ul>';
                    return out;
                }

                // SPECIFICATIONS — premium striped table with column headers
                if (tabKey === 'specifications' && isTableLike) {
                    let out = '<div style="overflow-x:auto;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.08);margin-bottom:24px;"><table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;">';
                    out += '<thead><tr><th style="padding:14px 20px;background:linear-gradient(135deg,#1e3a5f 0%,#3b82f6 100%);color:#fff;text-align:left;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:42%;">Property</th><th style="padding:14px 20px;background:linear-gradient(135deg,#1e3a5f 0%,#3b82f6 100%);color:#fff;text-align:left;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Value</th></tr></thead><tbody>';
                    let rowCount = 0;
                    for (const l of ls) {
                        const parts = l.split(/(?:\s{2,}|\t)/);
                        if (parts.length >= 2) {
                            const k = parts[0].trim();
                            const v = parts.slice(1).join(' ').trim();
                            const bg = rowCount % 2 === 0 ? '#f8fafc' : '#ffffff';
                            if (k) { out += `<tr style="border-bottom:1px solid #e2e8f0;background-color:${bg};"><td style="padding:13px 20px;color:#1e3a5f;font-weight:600;">${k}</td><td style="padding:13px 20px;color:#374151;">${v}</td></tr>`; rowCount++; }
                        } else if (l.trim()) {
                            out += `<tr><td colspan="2" style="padding:10px 20px;background:#eff6ff;color:#1e3a5f;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${l.trim()}</td></tr>`;
                        }
                    }
                    out += '</tbody></table></div>';
                    return out;
                }

                // APPLICATIONS — numbered step cards
                if (tabKey === 'applications') {
                    const items = ls.map(cleanLine).filter(Boolean);
                    if (hasBullets && items.length) {
                        let stepNum = 0;
                        let out = '<ol style="list-style:none;padding:0;margin:0;">';
                        for (const item of items) {
                            stepNum++;
                            out += `<li style="display:flex;align-items:flex-start;padding:14px 18px;margin-bottom:12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1e3a5f,#3b82f6);color:#fff;font-size:13px;font-weight:700;margin-right:14px;flex-shrink:0;">${stepNum}</span><span style="color:#374151;font-size:15px;line-height:1.6;padding-top:4px;">${item}</span></li>`;
                        }
                        out += '</ol>';
                        return out;
                    }
                }

                // FAQ — styled info/warning cards per section
                if (tabKey === 'faq') {
                    const isWarning = /precaution|safety|warning|danger|caution/i.test(sec.title);
                    const cardBg   = isWarning ? '#fff5f5' : '#fffbeb';
                    const border   = isWarning ? '#ef4444' : '#f59e0b';
                    const hColor   = isWarning ? '#b91c1c' : '#92400e';
                    const icon     = isWarning ? '&#9888;' : '&#8505;';
                    const iconBg   = isWarning ? '#ef4444' : '#f59e0b';
                    let body = '';
                    if (hasBullets) {
                        body = '<ul style="margin:0;padding-left:18px;">';
                        for (const l of ls) { const c = cleanLine(l); if (c) body += `<li style="margin-bottom:8px;color:#374151;font-size:15px;line-height:1.6;">${c}</li>`; }
                        body += '</ul>';
                    } else {
                        const paras = ls.join('\n').replace(/\n{2,}/g, '\n\n').split('\n\n');
                        for (const p of paras) { const t = p.replace(/\n/g, ' ').trim(); if (t) body += `<p style="margin:0 0 10px;color:#374151;font-size:15px;line-height:1.7;">${t}</p>`; }
                    }
                    return `<div style="background:${cardBg};border-left:5px solid ${border};border-radius:8px;padding:18px 22px;margin-bottom:20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${iconBg};color:#fff;font-size:14px;font-weight:700;margin-right:12px;">${icon}</span><strong style="font-size:16px;color:${hColor};">${sec.title}</strong></div>${body}</div>`;
                }

                // DELIVERY — compact table or highlighted box
                if (tabKey === 'delivery') {
                    if (isTableLike) {
                        let out = '<div style="overflow-x:auto;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:20px;"><table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;"><tbody>';
                        let rowCount = 0;
                        for (const l of ls) {
                            const parts = l.split(/(?:\s{2,}|\t)/);
                            if (parts.length >= 2) {
                                const k = parts[0].trim(); const v = parts.slice(1).join(' ').trim();
                                const bg = rowCount % 2 === 0 ? '#f8fafc' : '#ffffff';
                                if (k) { out += `<tr style="border-bottom:1px solid #e2e8f0;background:${bg};"><td style="padding:12px 18px;color:#1e3a5f;font-weight:600;width:45%;">${k}</td><td style="padding:12px 18px;color:#374151;">${v}</td></tr>`; rowCount++; }
                            } else if (l.trim()) {
                                out += `<tr><td colspan="2" style="padding:10px 18px;background:#eff6ff;color:#1e3a5f;font-weight:700;">${l.trim()}</td></tr>`;
                            }
                        }
                        out += '</tbody></table></div>';
                        return out;
                    }
                    return `<div style="background:#f0f9ff;border-radius:8px;padding:16px 20px;color:#374151;font-size:15px;line-height:1.7;margin-bottom:16px;">${textJoined}</div>`;
                }

                // OVERVIEW & DEFAULT — clean readable paragraphs
                const paras = ls.join('\n').replace(/\n{2,}/g, '\n\n').split('\n\n');
                let out = '';
                for (const p of paras) { const t = p.replace(/\n/g, ' ').trim(); if (t) out += `<p style="color:#374151;line-height:1.75;font-size:15px;margin-bottom:18px;">${t}</p>`; }
                return out || `<p style="color:#374151;line-height:1.75;font-size:15px;">${textJoined}</p>`;
            };
            // ─────────────────────────────────────────────────────────────────

            for (const doc of parseable) {
                helpers.log(`  Parsing PDF: ${path.basename(doc.localPath)} [${doc.type}]`);
                const result = await parsePdfDatasheet(doc.localPath);
                if (!result) { helpers.log('  (no structured content extracted)'); continue; }

                doc.parsedSections = result.sections;
                doc.parsedHtml = result.html;

                // Map parsed sections to the fixed tab keys wordpress.js expects
                // Keys: overview, benefits, specifications, applications, faq, delivery
                const TAB_MAP = [
                    { key: 'overview',       patterns: [/^uses?$/i, /^description$/i, /^product description$/i, /^scope$/i, /^design criteria$/i, /^overview$/i, /^general$/i] },
                    { key: 'benefits',       patterns: [/^advantages?$/i, /^key advantages?$/i, /^benefits?$/i, /^features?$/i, /^key features?$/i] },
                    { key: 'specifications', patterns: [/^technical data$/i, /^technical information$/i, /^properties$/i, /^physical properties$/i, /^product properties$/i, /^test data$/i, /^performance data$/i] },
                    { key: 'applications',   patterns: [/application/i, /how to apply/i, /method of application/i, /method of use/i, /instructions for use/i, /^mixing/i, /substrate preparation/i, /surface preparation/i, /^preparation$/i, /^primer/i, /^coverage$/i, /^yield$/i, /^applying/i, /^installation/i] },
                    { key: 'faq',            patterns: [/precautions?/i, /health.*safety/i, /important notes?/i, /^notes?$/i, /^storage/i, /shelf life/i, /standards? compliance/i, /limitations?/i, /^warranty/i, /^cautions?/i, /^technical support/i, /^additional information/i, /^site trial/i, /^cleaning/i, /^equipment/i] },
                    { key: 'delivery',       patterns: [/packaging/i, /pack sizes?/i, /standard pack/i, /^supply$/i, /approvals?/i, /certifications?/i, /^references?$/i, /^quality/i] },
                ];

                // Build the keyed tabs object (merge content if multiple sections map to same key)
                if (!product.tabs || Array.isArray(product.tabs)) product.tabs = {};

                for (const sec of result.sections) {
                    let tabKey = null;
                    for (const map of TAB_MAP) {
                        if (map.patterns.some(p => p.test(sec.title))) { tabKey = map.key; break; }
                    }
                    if (!tabKey) tabKey = 'faq'; // unknown sections go to FAQ/notes

                    const blockHtml = buildTabHtml(sec, tabKey);
                    product.tabs[`${tabKey}Html`] = (product.tabs[`${tabKey}Html`] || '') + blockHtml;
                }

                // Append the full formatted HTML to the product description
                const label = doc.type === 'TDS' ? 'Technical Data Sheet'
                            : doc.type === 'SDS' ? 'Safety Data Sheet'
                            : doc.name || 'Datasheet';
                const docBlock = `<hr/>\n<h2>${label}</h2>\n${result.html}`;

                product.description = (product.description || '') + docBlock;
                helpers.log(`  ✓ Appended ${result.sections.length} sections from ${doc.type} to description`);
            }

            if (parseable.length === 0) helpers.log('  No local PDF files to parse yet.');
            helpers.log(`Tabs built: ${Object.keys(product.tabs || {}).join(', ') || 'none'}`);
        } catch (pdfErr) {
            helpers.log(`PDF parse error: ${pdfErr.message}`);
        }

        // -- 6. Duplicate check -----------------------------------------------

        if (typeof checkIfProductExists === 'function') {
            try {
                const exists = await checkIfProductExists(product);
                if (exists) {
                    helpers.log(`Duplicate: ${product.name}`);
                    return { skipped: true, reason: 'duplicate', product };
                }
            } catch (_) {}
        }

        if (!product.image) product.image = 'https://via.placeholder.com/500x500?text=No+Image';

        helpers.log(`? Done: ${product.name}`);
        return product;

    } catch (err) {
        helpers.log(`scrapeProduct error [${url}]: ${err.message}`);
        return { error: err.message };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

// --- Category / Search scraper -----------------------------------------------

async function scrapeCategory(term, config = {}) {
    let browser;

    let url = term;
    if (!term.startsWith('http')) {
        url = term.includes(' ')
            ? `${BASE_URL}/search?q=${encodeURIComponent(term)}`
            : `${BASE_URL}/${term.replace(/^\//, '')}`;
    }

    helpers.log(`Scanning: ${url}`);

    try {
        browser = await launchBrowser(config);
        const page = await browser.newPage();
        await page.setUserAgent(helpers.getRandomUserAgent());
        await page.goto(url, { waitUntil: 'networkidle2', timeout: config.timeout || 60000 });

        const links = new Set();
        let hasNextPage = true;
        let pageNum = 1;

        while (hasNextPage) {
            // Scroll to bottom to load lazy content
            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight));
                await new Promise(r => setTimeout(r, 800));
            }

            const pageLinks = await page.evaluate((base) => {
                const found = new Set();
                document.querySelectorAll([
                    '.product-item a', '.product-title a', '.item-title a',
                    'h2.product-name a', '.product-box a', 'a.product-link'
                ].join(', ')).forEach(a => {
                    const h = a.href;
                    if (h && h.startsWith(base) && h !== base && !h.includes('#')) found.add(h);
                });
                return Array.from(found);
            }, BASE_URL);

            pageLinks.forEach(l => links.add(l));
            helpers.log(`Page ${pageNum}: ${pageLinks.length} products (total: ${links.size})`);

            const nextBtn = await page.$('.next-page a, a[rel="next"], .pagination .next a, li.next a');
            if (nextBtn) {
                await nextBtn.click();
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
                pageNum++;
            } else {
                hasNextPage = false;
            }
        }

        helpers.log(`Total: ${links.size} products`);
        return Array.from(links);

    } catch (err) {
        helpers.log(`scrapeCategory error: ${err.message}`);
        return [];
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

module.exports = { scrapeProduct, scrapeCategory };
