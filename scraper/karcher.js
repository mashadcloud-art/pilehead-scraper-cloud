const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const helpers = require('./helpers');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function scrapeProduct(url, config, browserInstance = null) {
    let browser = browserInstance;
    let isLocalBrowser = false;
    let retries = 3;
    let attempt = 0;

    // If no browser provided, launch one (legacy mode)
    if (!browser) {
        browser = await helpers.launchBrowser();
        isLocalBrowser = true;
    }

    while (attempt < retries) {
        attempt++;
        let page = null;
        try {
            console.log(`Starting Karcher scraper for: ${url} (Attempt ${attempt}/${retries})`);
            
            page = await browser.newPage();
            
            // Remove webdriver property
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
            });

            // Use a newer, high-quality User-Agent
            const userAgent = helpers.getRandomUserAgent();
            await page.setUserAgent(userAgent);

            // Remove aggressive header overrides that might break sub-resources
            // Let StealthPlugin handle the browser fingerprint
            
            console.log('Navigating to product page...');
            
            // Random start delay to break timing patterns
            await helpers.randomDelay(2000, 5000);

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            // Wait for body to be available
            await page.waitForSelector('body', { timeout: 10000 });

            // Simulate human behavior: Random mouse movements
            // Get viewport from page
            const viewport = await page.viewport();
            const width = viewport ? viewport.width : 1366;
            const height = viewport ? viewport.height : 768;

            for (let i = 0; i < 5; i++) {
                await page.mouse.move(
                    Math.floor(Math.random() * width),
                    Math.floor(Math.random() * height)
                );
                await helpers.randomDelay(100, 500);
            }

            // Wait a bit more for any dynamic checks
            await helpers.randomDelay(2000, 4000);

            // Check for common blocking indicators
            const bodyText = await page.evaluate(() => document.body.innerText);
            if (bodyText.includes('Access Denied') || bodyText.includes('Security Check') || bodyText.includes('Forbidden') || bodyText.includes('Attention Required!')) {
                throw new Error('Blocked by Karcher security check (Access Denied/Forbidden)');
            }

            // Specific Selectors for Karcher Arabia (Magento/Adobe Commerce based)
            const product = await page.evaluate(async () => {
                const getText = (selector) => {
                    const el = document.querySelector(selector);
                    return el ? el.innerText.trim() : null;
                };

                const getAttr = (selector, attr) => {
                    const el = document.querySelector(selector);
                    return el ? el.getAttribute(attr) : null;
                };

                // Title
                const title = getText('h1.page-title') || getText('h1');

                if (title === 'Forbidden' || title === 'Access Denied' || title === '403 Forbidden') {
                     return { error: 'Blocked: Title is Forbidden' };
                }

                // Price
                // Karcher often has special price vs old price. We want the final price.
                let price = getText('.price-box .special-price .price') || getText('.price-box .price');
                if (!price) {
                    // Fallback
                    price = getText('[data-price-type="finalPrice"] .price');
                }

                // Image
                // Try to find the main image. Karcher uses Fotorama gallery usually.
                // But initial load might be static.
                let image = getAttr('.gallery-placeholder__image', 'src') || 
                            getAttr('.fotorama__img', 'src') || 
                            getAttr('.product-image-photo', 'src');

                // Description
                const description = getText('.product.attribute.description .value') || 
                                    getText('#description') || 
                                    getText('[itemprop="description"]');

                // Gallery
                // Karcher uses Magento. The best way to get gallery images is often via the JSON config script
                // or by looking for Fotorama thumbnails.
                let galleryImages = [];
                
                // Method 1: Fotorama loaded images (if visible)
                const fotoramaImgs = document.querySelectorAll('.fotorama__img');
                fotoramaImgs.forEach(img => {
                    if (img.src && !galleryImages.includes(img.src)) {
                        galleryImages.push(img.src);
                    }
                });

                // Method 2: Magento JSON config
                // Look for <script type="text/x-magento-init"> containing "mage/gallery/gallery"
                if (galleryImages.length <= 1) {
                    const scripts = document.querySelectorAll('script[type="text/x-magento-init"]');
                    scripts.forEach(script => {
                        if (script.innerText.includes('mage/gallery/gallery')) {
                            try {
                                const json = JSON.parse(script.innerText);
                                // Navigate the deep object structure: [data-role=gallery-placeholder] -> mage/gallery/gallery -> data
                                for (const key in json) {
                                    if (json[key]['mage/gallery/gallery']) {
                                        const data = json[key]['mage/gallery/gallery'].data;
                                        if (Array.isArray(data)) {
                                            data.forEach(item => {
                                                if (item.full) galleryImages.push(item.full);
                                                else if (item.img) galleryImages.push(item.img);
                                            });
                                        }
                                    }
                                }
                            } catch (e) {
                                // ignore parse error
                            }
                        }
                    });
                }

                // Method 3: Thumbnails fallback
                if (galleryImages.length === 0) {
                     const thumbs = document.querySelectorAll('.fotorama__nav__frame--thumb img');
                     thumbs.forEach(t => {
                         if (t.src) {
                             // Usually thumbnails are resized, try to guess full size or keep as is
                             // Karcher thumbs: .../cache/small_image/...
                             // We'll just take them and hope for the best or try to clean the URL
                             galleryImages.push(t.src);
                         }
                     });
                }

                // Ensure unique
                galleryImages = [...new Set(galleryImages)];

                // Clean Karcher URLs (remove /cache/hash parts) to get full resolution
                // Pattern: /cache/32 character hash/
                const cleanKarcherUrl = (u) => {
                    if (!u) return u;
                    // Replace /cache/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/ with / (empty string essentially, but preserving path structure)
                    // The structure is usually .../product/cache/HASH/path/to/image.jpg
                    // We want .../product/path/to/image.jpg
                    // But sometimes the folder structure changes.
                    // Safer: if we see /cache/..., try to remove it and the hash folder.
                    return u.replace(/\/cache\/[a-zA-Z0-9]{32}/, '');
                };

                // Apply cleaning, but keep original if cleaning breaks it (we can't verify here, so maybe keep both or prefer clean)
                // Actually, Karcher images might rely on the cache path if the original is not accessible directly.
                // But usually Magento stores originals in /catalog/product/x/y/image.jpg
                
                galleryImages = galleryImages.map(u => cleanKarcherUrl(u));
                if (image) image = cleanKarcherUrl(image);

                return {
                    name: title,
                    price: price,
                    image: image,
                    description: description,
                    galleryImages: galleryImages
                };
            });

            if (product.error) {
                throw new Error(product.error);
            }

            // Post-processing: Download Images Locally
            // Essential for Karcher as they block hotlinking
            
            // Helper to download a single image
            const downloadImage = async (imgUrl) => {
                 if (!imgUrl) return null;
                 
                 // Resolve relative URLs
                 let fullUrl = imgUrl;
                 if (fullUrl.startsWith('//')) fullUrl = 'https:' + fullUrl;
                 else if (fullUrl.startsWith('/')) fullUrl = new URL(fullUrl, url).href;
                 
                 try {
                    // Use page.evaluate to fetch image as buffer
                    // This uses the browser's context (cookies/headers) which bypasses hotlink protection
                    const imageBuffer = await page.evaluate(async (u) => {
                        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                        let attempts = 0;
                        const maxAttempts = 3;

                        while (attempts < maxAttempts) {
                            try {
                                const response = await fetch(u);
                                if (response.status === 429) {
                                    // Too Many Requests - wait significantly
                                    await delay(3000 * (attempts + 1));
                                    attempts++;
                                    continue;
                                }
                                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                const buffer = await response.arrayBuffer();
                                return Array.from(new Uint8Array(buffer));
                            } catch (e) {
                                if (attempts >= maxAttempts - 1) throw e;
                                await delay(1000 * (attempts + 1));
                                attempts++;
                            }
                        }
                    }, fullUrl);

                    return { buffer: Buffer.from(imageBuffer), filename: path.basename(new URL(fullUrl).pathname) };
                 } catch (e) {
                     console.error(`Failed to download image ${fullUrl}: ${e.message}`);
                     return null;
                 }
            };

            const tempDir = path.join(__dirname, '..', 'temp_images');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const saveImage = (buffer, originalFilename) => {
                let filename = originalFilename || `karcher_${Date.now()}.jpg`;
                if (!filename || filename.length < 3) filename = `karcher_${Date.now()}.jpg`;
                filename = filename.replace(/[^a-z0-9.]/gi, '_');
                const uniqueName = `${Date.now()}_${Math.floor(Math.random()*1000)}_${filename}`;
                const localPath = path.join(tempDir, uniqueName);
                fs.writeFileSync(localPath, buffer);
                return localPath;
            };

            // Download Main Image
            if (product.image) {
                console.log(`Downloading main image: ${product.image}`);
                const imgData = await downloadImage(product.image);
                if (imgData) {
                    product.localImagePath = saveImage(imgData.buffer, imgData.filename);
                }
            }

            // Download Gallery Images
            if (product.galleryImages && product.galleryImages.length > 0) {
                console.log(`Downloading ${product.galleryImages.length} gallery images...`);
                product.localGalleryPaths = [];
                for (const imgUrl of product.galleryImages) {
                    // Skip main image if duplicate
                    if (imgUrl === product.image) continue;
                    
                    // Add delay to prevent 429 errors
                    await helpers.randomDelay(1000, 2500);

                    const imgData = await downloadImage(imgUrl);
                    if (imgData) {
                        product.localGalleryPaths.push(saveImage(imgData.buffer, imgData.filename));
                    }
                }
            }

            await page.close();
            return product; // Success!

        } catch (error) {
            console.error(`Karcher Scraper Error (Attempt ${attempt}):`, error.message);
            
            if (page && !page.isClosed()) await page.close();
            
            // Check if we should retry
            if (attempt < retries && (error.message.includes('Blocked') || error.message.includes('Forbidden') || error.message.includes('Access Denied'))) {
                
                // If we are using a shared browser, we can't easily rotate identity (restart browser) here.
                // We should throw a specific error so the caller can restart the browser.
                if (!isLocalBrowser) {
                    throw new Error('BLOCKED_NEEDS_BROWSER_RESTART');
                }

                // If local browser, we can restart it
                if (browser) await browser.close();
                
                const waitTime = 30000 + (Math.random() * 20000); // 30-50 seconds cooldown
                console.log(`Blocked! Cooling down for ${Math.round(waitTime/1000)}s before retry...`);
                await helpers.delay(waitTime);
                
                // Restart browser for next attempt
                browser = await helpers.launchBrowser();
                continue; // Retry loop
            }
            
            // If local browser and we are done retrying or it's another error, close it
            if (isLocalBrowser && browser) await browser.close();

            throw error;
        }
    }
}

module.exports = { scrapeProduct };
