const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const helpers = require('./helpers');

puppeteer.use(StealthPlugin());

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
        await page.setUserAgent(helpers.getRandomUserAgent());

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await helpers.randomDelay(2000, 4000);

        const product = await page.evaluate(async () => {
            const pickText = (selectors) => {
                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el && el.textContent) return el.textContent.trim();
                }
                return '';
            };

            const pickAttr = (selectors, attr) => {
                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const value = el.getAttribute(attr);
                        if (value) return value;
                    }
                }
                return '';
            };

            const parseLdJson = () => {
                const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                for (const node of nodes) {
                    try {
                        const data = JSON.parse(node.textContent);
                        const items = Array.isArray(data) ? data : [data];
                        for (const item of items) {
                            const product = item && item['@type'] === 'Product' ? item : null;
                            if (product) return product;
                            if (item && item['@graph']) {
                                const graphItems = Array.isArray(item['@graph']) ? item['@graph'] : [];
                                for (const gi of graphItems) {
                                    if (gi && gi['@type'] === 'Product') return gi;
                                }
                            }
                        }
                    } catch (_) {}
                }
                return null;
            };

            const cleanText = (txt) => {
                if (!txt) return '';
                // Remove "Fepy" name globally as requested (case insensitive)
                return txt.replace(/fepy/gi, '').replace(/\s{2,}/g, ' ').trim();
            };

            const ld = parseLdJson();
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

            const normalizeUrl = (value) => {
                if (!value || typeof value !== 'string') return '';
                let url = value.trim();
                if (!url) return '';
                if (url.startsWith('//')) url = 'https:' + url;
                if (url.startsWith('/')) url = window.location.origin + url;
                if (url.endsWith('.')) url = url.slice(0, -1);
                if (url.includes('?')) url = url.split('?')[0];
                return url;
            };

            let title = ld && ld.name ? ld.name.toString().trim() : '';
            if (!title || title.length < 3) {
                const el = document.querySelector('h1.page-title span, h1');
                if (el && el.textContent) title = el.textContent.trim();
            }
            title = cleanText(title);
            
            // Robust Price Extraction
            let price = '';
            const priceSelectors = [
                '.price-wrapper .price',
                '.product-info-price .price',
                '.price-box .price',
                '.regular-price .price',
                '.special-price .price',
                '[data-price-amount]',
                '[itemprop="price"]',
                '.amount',
                '.current-price',
                '.price'
            ];

            const readCurrentPrice = () => {
                for (const sel of priceSelectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const txt = el.textContent.trim();
                        if (txt && /\d/.test(txt)) {
                            return txt;
                        }
                    }
                }
                const bodyText = document.body ? document.body.innerText : '';
                const match = bodyText && bodyText.match(/AED\s*[\d.,]+/i);
                if (match) {
                    return match[0];
                }
                return '';
            };

            price = readCurrentPrice();

            const getBestImgUrl = (img) => {
                if (!img) return '';
                return img.getAttribute('data-zoom-image') || 
                       img.getAttribute('data-large_image') || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-lazy-src') || 
                       img.getAttribute('srcset')?.split(',').pop().trim().split(' ')[0] ||
                       img.getAttribute('src');
            };

            let image = '';
            let galleryImages = [];

            // Strategy: Specific to Fepy's React Carousel + ImageKit Structure
            const galleryItems = Array.from(document.querySelectorAll('.product-gallery__carousel-item img, .product-gallery img, .woocommerce-product-gallery img'));
            galleryItems.forEach(img => {
                const src = getBestImgUrl(img);
                if (src) {
                    if (src.includes('?')) {
                        const base = src.split('?')[0];
                        galleryImages.push(base);
                        galleryImages.push(src);
                    } else {
                        galleryImages.push(src);
                    }
                }
            });

            // Fallback: JSON-LD (Schema.org)
            if (galleryImages.length === 0 && ld && ld.image) {
                const schemaImages = Array.isArray(ld.image) ? ld.image : [ld.image];
                schemaImages.forEach(url => {
                    if (url) galleryImages.push(url.toString());
                });
            }

            // Strategy 2: Look for carousels
            if (galleryImages.length === 0) {
                const carousels = Array.from(document.querySelectorAll('.react-multi-carousel-list, .slick-slider, .owl-carousel'));
                if (carousels.length > 0) {
                    const mainCarousel = carousels[0];
                    const nodes = Array.from(mainCarousel.querySelectorAll('img'));
                    nodes.forEach((el) => {
                        const src = getBestImgUrl(el);
                        if (src) galleryImages.push(src);
                    });
                }
            }

            // Strategy 3: Fallback selectors
            if (galleryImages.length === 0) {
                 const gallerySelectors = [
                    '.fotorama__img', 
                    '.gallery-placeholder__image',
                    'img[itemprop="image"]',
                    '.product-gallery img',
                    '.product-media img',
                    '.product-main-image img',
                    '.wp-post-image',
                    '.attachment-shop_single img',
                    'img[data-zoom-image]',
                    'img[srcset]'
                ];
                
                for (const selector of gallerySelectors) {
                    const nodes = Array.from(document.querySelectorAll(selector));
                    if (nodes.length > 0) {
                        nodes.forEach((el) => {
                            const src = getBestImgUrl(el);
                            if (src) galleryImages.push(src);
                        });
                        if (galleryImages.length > 0) break;
                    }
                }
            }

            const uniqueGallery = Array.from(new Set(galleryImages.map(normalizeUrl).filter(Boolean)));
            if (!image && uniqueGallery.length > 0) image = uniqueGallery[0];
            if (!image && ld && ld.image) {
                image = Array.isArray(ld.image) ? ld.image[0] : ld.image;
            }

            let description = pickText(['.product-description', '#product-description', '.tab-content', '[itemprop="description"]', '.product-overview-content']);
            if (!description && ld && ld.description) description = ld.description;

            // Try to get description from "Product overview" section if still empty
            if (!description || description.length < 10) {
                const overviewHeader = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, strong, b')).find(el => 
                    el.textContent && el.textContent.trim().toLowerCase() === 'product overview'
                );
                if (overviewHeader) {
                    let next = overviewHeader.nextElementSibling;
                    if (next) description = next.textContent.trim();
                }
            }
            description = cleanText(description);

            let category = '';
            const bcContainer = document.querySelector('.breadcrumb, .breadcrumbs, [class*="breadcrumb"]');
            if (bcContainer) {
                const bcItems = Array.from(bcContainer.querySelectorAll('li, a, span')).filter(el => {
                    const t = el.textContent.trim().toLowerCase();
                    return t && t !== 'home' && !t.includes('>') && !t.includes('/');
                });
                if (bcItems.length > 0) {
                    // Get the last item before the current product title
                    const lastIdx = bcItems.length - 1;
                    category = bcItems[lastIdx].textContent.trim();
                }
            }
            category = cleanText(category);

            const collectList = (selectors) => {
                const items = [];
                selectors.forEach((selector) => {
                    const nodes = Array.from(document.querySelectorAll(selector));
                    nodes.forEach((node) => {
                        const text = node.textContent ? node.textContent.trim() : '';
                        if (text && text.length > 2) items.push(cleanText(text));
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
                            if (key && value) specs.push(`${cleanText(key)}: ${cleanText(value)}`);
                        });
                    });
                });
                return specs;
            };

            const features = collectList([
                '.product-description li',
                '.tab-content li',
                '.product-features li',
                '.features li',
                '.short-description li',
                '.product-info-main li'
            ]);

            const specs = collectSpecsFromTables([
                '.product-specs table',
                '.specifications table',
                'table.shop_attributes',
                'table.product-specs',
                'table.specs',
                '.product-info-detailed table'
            ]);

            let brand = '';
            const brandSpan = document.querySelector('span[style*="cursor: pointer"][style*="display: inline"]');
            if (brandSpan && brandSpan.textContent) {
                const bText = brandSpan.textContent.trim();
                const bLower = bText.toLowerCase();
                const badBrands = ['home', 'fepy', 'quotations', 'cart', 'login', 'signup', 'menu', 'search'];
                if (bText && !badBrands.includes(bLower)) {
                    brand = bText;
                }
            }
            if (!brand) {
                // Try from title
                const titleLower = (title || '').toLowerCase();
                if (titleLower.includes('rust-oleum')) brand = 'Rust-Oleum';
                else if (titleLower.includes('fosroc')) brand = 'Fosroc';
                else if (titleLower.includes('henkel')) brand = 'Henkel';
                else if (titleLower.includes('karcher')) brand = 'Karcher';
                else if (titleLower.includes('noon')) brand = 'Noon';
                else if (titleLower.includes('asian')) brand = 'Asian Paint';
                else if (titleLower.includes('berger')) brand = 'Berger';
            }
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
            brand = cleanText(brand);

            // --- FAQ & Tab Extraction (Fepy Specific) ---
            const tabs = {};
            
            // Function to extract a section based on a header text
            const extractSectionByHeader = (headerText) => {
                const allElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, strong, b, span, div, button'));
                
                // 1. Find the header, prioritizing real headers (H1-H5, strong, b) over others
                const header = allElements.find(el => {
                    const txt = el.textContent ? el.textContent.trim().toLowerCase() : '';
                    
                    // Skip if inside a navigation/tab row (common on fepy local)
                    if (el.closest('.flex.items-center.gap-2')) return false;
                    if (el.closest('nav')) return false;

                    const isMatch = txt === headerText.toLowerCase() || 
                                   (txt.includes(headerText.toLowerCase()) && txt.length < headerText.length + 15);
                    return isMatch;
                });
                
                if (!header) {
                    // Strategy 2: Look for sections that start with the header text
                    const section = Array.from(document.querySelectorAll('div, section')).find(el => {
                        if (el.children.length === 0) return false;
                        const t = el.textContent ? el.textContent.trim().toLowerCase() : '';
                        return t.startsWith(headerText.toLowerCase()) && t.length < 500;
                    });
                    if (section) return cleanText(section.innerHTML);
                    return null;
                }
                
                let content = [];
                let current = header.nextElementSibling;
                
                // If no next sibling, try parent's next sibling (common if header is wrapped)
                if (!current && header.parentElement) {
                    current = header.parentElement.nextElementSibling;
                }
                
                const sectionBreaks = [
                    'key specifications', 'applications', 'frequently asked questions', 
                    'features & benefits', 'key features', 'suitable for', 
                    'estimating & supply', 'technical data', 'product overview',
                    'attachments', 'ratings & reviews', 'faq', 'key features & benefits'
                ];
                
                while (current) {
                    // Stop if we hit a real header
                    if (['H1', 'H2', 'H3', 'H4'].includes(current.tagName)) break;
                    
                    const text = current.textContent.trim().toLowerCase();
                    
                    // Stop if we hit a sibling that looks like another section header
                    if (sectionBreaks.some(sb => text === sb || (text.startsWith(sb) && text.length < sb.length + 10))) break;
                    
                    // Skip the navigation rows if they appear between sections
                    if (current.querySelector('.flex.items-center.gap-2')) {
                        current = current.nextElementSibling;
                        continue;
                    }

                    if (['P', 'UL', 'OL', 'DIV', 'TABLE', 'SECTION'].includes(current.tagName)) {
                        const clone = current.cloneNode(true);
                        // Clean "Fepy" from the HTML content
                        clone.innerHTML = clone.innerHTML.replace(/fepy/gi, '');
                        content.push(clone.outerHTML);
                    }
                    current = current.nextElementSibling;
                }
                
                return content.length > 0 ? content.join('\n') : null;
            };

            const faqContent = extractSectionByHeader('Frequently Asked Questions') || extractSectionByHeader('FAQ');
            if (faqContent) tabs.faq = faqContent;

            const benefitsContent = extractSectionByHeader('Features & Benefits') || extractSectionByHeader('Key Features') || extractSectionByHeader('Key features & benefits');
            if (benefitsContent) tabs.benefits = benefitsContent;

            const specsContent = extractSectionByHeader('Key Specifications') || extractSectionByHeader('Technical data');
            if (specsContent) tabs.specifications = specsContent;

            const appsContent = extractSectionByHeader('Applications');
            if (appsContent) tabs.applications = appsContent;

            const suitableContent = extractSectionByHeader('Suitable for');
            if (suitableContent) tabs.suitableFor = suitableContent;

            const estimatingContent = extractSectionByHeader('Estimating & supply');
            if (estimatingContent) tabs.estimating = estimatingContent;

            const attachmentsContent = extractSectionByHeader('Attachments');
            if (attachmentsContent) tabs.attachments = attachmentsContent;

            const reviewsContent = extractSectionByHeader('Ratings & Reviews');
            if (reviewsContent) tabs.reviews = reviewsContent;

            // --- Similar Products Extraction ---
            const similarUrls = [];
            const similarSection = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, strong, b, span, div')).find(el => {
                const t = el.textContent ? el.textContent.trim().toLowerCase() : '';
                return t === 'similar products' || t === 'you may also like';
            });
            if (similarSection) {
                let container = similarSection.nextElementSibling || similarSection.parentElement.nextElementSibling;
                if (container) {
                    const origin = window.location.origin;
                    const links = Array.from(container.querySelectorAll('a'))
                        .map(a => a.href)
                        .filter(href => href && href.startsWith(origin) && !href.includes('/category/') && !href.includes('/brand/'));
                    similarUrls.push(...links);
                }
            }

            // --- Variation Strategy (Restored) ---
            // Extract attributes and generate variations as a single product structure
            const attributes = [];
            const variations = [];

            // 1. Extract Attributes
            let attrContainers = Array.from(document.querySelectorAll('.form-group.product__option'));
            
            // Fallback for different templates
            if (attrContainers.length === 0) {
                attrContainers = Array.from(document.querySelectorAll('.swatch-attribute, .field.configurable, .product-option'));
            }

            attrContainers.forEach(container => {
                let name = '';
                
                // Strategy A: Fepy Custom Theme
                const labelDiv = container.querySelector('div.text-black');
                if (labelDiv && labelDiv.textContent.includes(':')) {
                    name = labelDiv.textContent.replace(':', '').trim();
                }
                
                // Strategy B: Standard Magento/Other
                if (!name) {
                    const labelEl = container.querySelector('.swatch-attribute-label, .label, label');
                    if (labelEl) name = labelEl.textContent.replace(/\*/g, '').replace(':', '').trim();
                }
                
                if (name) {
                    const options = new Set();
                    
                    // Strategy A: Buttons (Fepy Custom)
                    const buttons = Array.from(container.querySelectorAll('button'));
                    buttons.forEach(btn => {
                        const txt = btn.textContent.trim();
                        if (txt && !txt.includes('Show more') && !txt.includes('Show less') && !txt.includes('+')) {
                            if (btn.classList.contains('border') || btn.classList.contains('swatch-option')) {
                                options.add(txt);
                            }
                        }
                    });
                    
                    // Strategy B: Standard Swatches/Selects
                    if (options.size === 0) {
                        const swatches = Array.from(container.querySelectorAll('.swatch-option'));
                        swatches.forEach(swatch => {
                            const val = swatch.getAttribute('option-label') || swatch.getAttribute('data-option-label') || swatch.textContent.trim();
                            if (val) options.add(val);
                        });

                        const select = container.querySelector('select');
                        if (select) {
                            Array.from(select.options).forEach(opt => {
                                const val = opt.textContent.trim();
                                if (val && opt.value && !val.includes('Choose')) options.add(val);
                            });
                        }
                    }

                    if (options.size > 0) {
                        attributes.push({
                            name: name,
                            options: Array.from(options)
                        });
                    }
                }
            });

            // 2. Detect per-option prices by simulating selection (single-attribute case)
            const optionPriceMap = {};
            if (attributes.length === 1 && attributes[0].options.length > 0) {
                const attrName = attributes[0].name;
                const container = attrContainers.find(c => {
                    const labelDiv = c.querySelector('div.text-black');
                    const labelEl = labelDiv || c.querySelector('.swatch-attribute-label, .label, label');
                    if (!labelEl || !labelEl.textContent) return false;
                    const txt = labelEl.textContent.replace(/\*/g, '').trim().toLowerCase();
                    return txt.includes(attrName.toLowerCase());
                }) || attrContainers[0];

                if (container) {
                    const buttons = Array.from(container.querySelectorAll('button')).filter(btn => {
                        const txt = (btn.textContent || '').trim();
                        if (!txt) return false;
                        if (txt.includes('Show more') || txt.includes('Show less') || txt.includes('+')) return false;
                        return btn.classList.contains('border') || btn.classList.contains('swatch-option') || true;
                    });

                    for (const btn of buttons) {
                        const txt = (btn.textContent || '').trim();
                        if (!txt) continue;
                        btn.click();
                        await new Promise(r => setTimeout(r, 500));
                        const pTxt = readCurrentPrice();
                        if (pTxt && /\d/.test(pTxt)) {
                            optionPriceMap[txt] = pTxt;
                        }
                    }
                }
            }

            // 3. Generate Variations (Cartesian Product)
            if (attributes.length > 0) {
                const cartesian = (args) => {
                    const r = [];
                    const max = args.length - 1;
                    function helper(arr, i) {
                        for (let j = 0, l = args[i].options.length; j < l; j++) {
                            const a = arr.slice(0);
                            a.push({ name: args[i].name, value: args[i].options[j] });
                            if (i === max) r.push(a);
                            else helper(a, i + 1);
                        }
                    }
                    helper([], 0);
                    return r;
                };

                const combinations = cartesian(attributes);
                combinations.forEach(combo => {
                    const varAttributes = combo.map(c => ({
                        name: c.name,
                        option: c.value
                    }));

                    let varPrice = price;
                    if (combo.length === 1) {
                        const v = combo[0].value;
                        if (optionPriceMap[v]) {
                            varPrice = optionPriceMap[v];
                        }
                    }

                    variations.push({
                        attributes: varAttributes,
                        price: varPrice,
                        regular_price: varPrice,
                        image: image
                    });
                });
            }

            image = normalizeUrl(image);

            // --- Product Details Tab (Basic Product Information) ---
            // Extract the product overview/description from the page
            let productOverview = '';
            const overviewPatterns = [
                '.product-overview',
                '.product-description',
                '[class*="overview"]',
                '.tab-content-wrapper',
                '.product-content'
            ];
            
            for (const selector of overviewPatterns) {
                const el = document.querySelector(selector);
                if (el && el.textContent && el.textContent.trim().length > 50) {
                    const clone = el.cloneNode(true);
                    clone.innerHTML = clone.innerHTML.replace(/fepy/gi, '');
                    productOverview = clone.innerHTML;
                    break;
                }
            }
            
            // If still empty, use the description we already extracted
            if (!productOverview && description) {
                productOverview = `<p>${description}</p>`;
            }
            
            // Create the Product Details tab with basic info
            let productDetailsHtml = '<div class="product-details-container">';
            
            // Add basic product information as a table
            productDetailsHtml += '<table class="product-details-table">';
            productDetailsHtml += '<tbody>';
            
            if (title) {
                productDetailsHtml += `<tr><td class="label">Product Name:</td><td class="value">${title}</td></tr>`;
            }
            
            if (category) {
                productDetailsHtml += `<tr><td class="label">Category:</td><td class="value">${category}</td></tr>`;
            }
            
            if (brand) {
                productDetailsHtml += `<tr><td class="label">Brand:</td><td class="value">${brand}</td></tr>`;
            }
            
            if (price) {
                productDetailsHtml += `<tr><td class="label">Price:</td><td class="value">${price}</td></tr>`;
            }
            
            // Add attributes if available
            if (attributes && attributes.length > 0) {
                attributes.forEach(attr => {
                    const options = attr.options.join(', ');
                    productDetailsHtml += `<tr><td class="label">${attr.name}:</td><td class="value">${options}</td></tr>`;
                });
            }
            
            productDetailsHtml += '</tbody>';
            productDetailsHtml += '</table>';
            
            // Add the product overview/description
            if (productOverview) {
                productDetailsHtml += '<div class="product-overview-section">';
                productDetailsHtml += productOverview;
                productDetailsHtml += '</div>';
            }
            
            // Add specifications if available
            if (specs && specs.length > 0) {
                productDetailsHtml += '<div class="product-specs-section">';
                productDetailsHtml += '<h3>Key Specifications</h3>';
                productDetailsHtml += '<ul>';
                specs.forEach(spec => {
                    productDetailsHtml += `<li>${spec}</li>`;
                });
                productDetailsHtml += '</ul>';
                productDetailsHtml += '</div>';
            }
            
            productDetailsHtml += '<style>';
            productDetailsHtml += '.product-details-container { font-family: Arial, sans-serif; padding: 15px; }';
            productDetailsHtml += '.product-details-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }';
            productDetailsHtml += '.product-details-table tr { border-bottom: 1px solid #eee; }';
            productDetailsHtml += '.product-details-table td { padding: 12px 8px; }';
            productDetailsHtml += '.product-details-table td.label { font-weight: bold; width: 25%; color: #333; background-color: #f9f9f9; }';
            productDetailsHtml += '.product-details-table td.value { color: #555; }';
            productDetailsHtml += '.product-overview-section { margin: 20px 0; line-height: 1.6; color: #444; }';
            productDetailsHtml += '.product-specs-section { margin: 20px 0; }';
            productDetailsHtml += '.product-specs-section h3 { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #333; }';
            productDetailsHtml += '.product-specs-section ul { list-style-type: disc; margin-left: 20px; }';
            productDetailsHtml += '.product-specs-section li { margin-bottom: 8px; color: #555; }';
            productDetailsHtml += '</style>';
            
            if (productDetailsHtml.length > 100) {
                tabs.productDetails = productDetailsHtml;
            }

            return {
                name: title || null,
                price: price || '',
                image: image || null,
                galleryImages: uniqueGallery || [],
                description: description || '',
                category: category || '',
                features: features || [],
                specs: Array.from(new Set(specs)).filter(Boolean),
                brand: brand,
                attributes: attributes,
                variations: variations,
                tabs: tabs,
                similarUrls: Array.from(new Set(similarUrls)).filter(u => u !== window.location.href)
            };
        });

        /* 
        // Universal Gallery Fix REMOVED - Causing duplicate/invalid images for Fepy
        // Restored original logic which was working correctly
        const universalGallery = await helpers.extractUniversalGallery(page);
        if (universalGallery && universalGallery.length > 0) {
            const existing = new Set(product.galleryImages || []);
            universalGallery.forEach(img => existing.add(img));
            product.galleryImages = Array.from(existing);
            
            // Ensure main image is set if missing
            if (!product.image && product.galleryImages.length > 0) {
                product.image = product.galleryImages[0];
            }
        }
        */

        if (product.image) {
            const localPath = await helpers.downloadImageViaBrowser(browser, product.image);
            if (localPath) product.localImagePath = localPath;
        }

        if (product.galleryImages && product.galleryImages.length > 0) {
            const normalizedGallery = Array.from(new Set(product.galleryImages.map((url) => {
                if (typeof url !== 'string') return '';
                let clean = url.trim();
                if (!clean) return '';
                if (clean.endsWith('.')) clean = clean.slice(0, -1);
                if (clean.includes('?')) clean = clean.split('?')[0];
                if (clean.startsWith('//')) clean = 'https:' + clean;
                return clean;
            }).filter(Boolean)));
            const limitedGallery = normalizedGallery.slice(0, 6);
            const localGallery = [];
            const localSet = new Set();
            for (const imgUrl of limitedGallery) {
                const localPath = await helpers.downloadImageViaBrowser(browser, imgUrl);
                if (localPath && !localSet.has(localPath)) {
                    localSet.add(localPath);
                    localGallery.push(localPath);
                }
            }
            if (localGallery.length > 0) {
                product.localGalleryPaths = localGallery;
            }
        }

        // --- Apply Premium Formatting (Fosroc-style) ---
        if (product && product.tabs) {
            const formattedTabs = {};
            if (product.tabs.benefits) {
                formattedTabs.benefitsHtml = helpers.formatTabHtml('Features & Benefits', product.tabs.benefits, 'benefits');
            }
            if (product.tabs.specifications) {
                formattedTabs.specificationsHtml = helpers.formatTabHtml('Key Specifications', product.tabs.specifications, 'specifications');
            }
            if (product.tabs.applications) {
                formattedTabs.applicationHtml = helpers.formatTabHtml('Applications', product.tabs.applications, 'applications');
            }
            if (product.tabs.faq) {
                formattedTabs.faqHtml = helpers.formatTabHtml('Frequently Asked Questions', product.tabs.faq, 'faq');
            }
            if (product.tabs.suitableFor) {
                formattedTabs.suitableForHtml = helpers.formatTabHtml('Suitable For', product.tabs.suitableFor, 'suitable');
            }
            if (product.tabs.estimating) {
                formattedTabs.estimatingHtml = helpers.formatTabHtml('Estimating & Supply', product.tabs.estimating, 'estimating');
            }
            if (product.tabs.attachments) {
                formattedTabs.attachmentsHtml = helpers.formatTabHtml('Attachments', product.tabs.attachments, 'attachments');
            }
            if (product.tabs.reviews) {
                formattedTabs.reviewsHtml = helpers.formatTabHtml('Ratings & Reviews', product.tabs.reviews, 'reviews');
            }
            if (product.tabs.productDetails) {
                // Product Details doesn't need extra formatting, it's already formatted with inline styles
                formattedTabs.productDetailsHtml = product.tabs.productDetails;
            }
            product.tabs = { ...product.tabs, ...formattedTabs };
        }

        return product;
    } catch (error) {
        throw error;
    } finally {
        if (page && !page.isClosed()) await page.close();
        if (isLocalBrowser && browser) await browser.close();
    }
}

async function scrapeCategory(categoryUrl, config) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: config.headless,
            defaultViewport: null,
            args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setUserAgent(helpers.getRandomUserAgent());
        
        console.log(`Navigating to category: ${categoryUrl}`);
        await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await helpers.randomDelay(2000, 4000);

        // Scroll down to trigger lazy loading if any
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight - window.innerHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        const productUrls = await page.evaluate(() => {
            const urls = new Set();
            const baseUrl = window.location.origin;

            // Strategy 1: Find product cards specifically
            // Based on analysis: div.myProduct-card contains the link
            const productCards = Array.from(document.querySelectorAll('div[class*="myProduct-card"], div[class*="product-item"], div[class*="product-card"]'));
            
            productCards.forEach(card => {
                const link = card.querySelector('a');
                if (link && link.href) {
                    urls.add(link.href);
                }
            });

            // Strategy 2: Fallback to all links that look like products (long slugs)
            if (urls.size === 0) {
                const allLinks = Array.from(document.querySelectorAll('a'));
                allLinks.forEach(a => {
                    const href = a.href;
                    if (!href || href.startsWith('javascript') || href.includes('#')) return;
                    
                    // Filter out non-product pages
                    if (href.includes('/account/') || href.includes('/checkout/') || href.includes('/cart/')) return;
                    if (href.includes('/contact') || href.includes('/about')) return;

                    // Heuristic: Product URLs usually have long slugs (more than 3 hyphens)
                    // and are not just category paths (though some are).
                    // Fepy products seem to be at root level: /product-name-slug
                    const slug = href.split('/').pop();
                    if (slug && slug.split('-').length > 3) {
                        urls.add(href);
                    }
                });
            }

            return Array.from(urls);
        });

        console.log(`Found ${productUrls.length} products in category.`);
        return productUrls;

    } catch (error) {
        console.error(`Error scraping category ${categoryUrl}:`, error);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = {
    scrapeProduct,
    scrapeCategory
};
