const fs = require('fs').promises;
const path = require('path');

module.exports = {
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    // Random Helpers
    randomDelay: (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)),
    
    getRandomUserAgent: () => {
        const userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    },

    cleanText: (text) => {
        return text ? text.trim().replace(/\s+/g, ' ') : '';
    },
    
    log: (msg) => {
        console.log(`[${new Date().toISOString()}] ${msg}`);
    },

    /**
     * AI-Powered Text Categorization
     * Uses Gemini/GPT to parse raw PDF text into product tabs
     */
    categorizeProductText: async (text, productName) => {
        if (!text || text.length < 50) return null;
        
        const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[AI] GEMINI_API_KEY missing. Using basic rule-based extraction fallback.');
            return module.exports.ruleBasedCategorization(text, productName);
        }

        try {
            const axios = require('axios');
            const prompt = `
You are a technical product expert. Extract technical details for "${productName}" from the provided text (which combines technical datasheets, safety datasheets (SDS), and method statements).

Organize the content into exactly these JSON keys:
- overview: A professional 2-3 paragraph summary. Include what the product is and its primary purpose.
- features: A detailed bulleted list of features, benefits, and advantages.
- specifications: Detailed technical specifications. If health/safety data is found in the SDS text, include a "Safety & Health Data" subsection here. Use HTML table rows or bullet lists.
- applications: Comprehensive guide on where and how to use. Include "Preparation", "Mixing", and "Application" steps if found in the Method Statement (MS) text.
- faqs: Common questions, troubleshooting, or technical tips found in the text.

Text to parse (Combined Documents):
${text.substring(0, 12000)}

Return ONLY a valid JSON object. Use professional HTML formatting (<ul>, <li>, <p>, <strong>) for values.
`;

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        topK: 1,
                        topP: 1,
                        maxOutputTokens: 2048,
                        responseMimeType: "application/json"
                    }
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            const resultText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (resultText) {
                // Handle cases where AI might include markdown blocks despite instructions
                const cleanJson = resultText.replace(/```json|```/g, '').trim();
                return JSON.parse(cleanJson);
            }
        } catch (err) {
            console.error(`[AI] Categorization failed: ${err.message}. Falling back to rule-based.`);
            return module.exports.ruleBasedCategorization(text, productName);
        }
        return null;
    },

    /**
     * Basic Rule-Based Extraction (No API Key Required)
     * Uses regex and section headers to split text into tabs
     */
    ruleBasedCategorization: (text, productName) => {
        const sections = {
            overview: '',
            features: '',
            specifications: '',
            applications: '',
            faqs: ''
        };

        const clean = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
        
        // Simple logic: split by common headers found in construction datasheets
        const lines = clean.split('\n');
        let currentSection = 'overview';
        
        lines.forEach(line => {
            const l = line.trim();
            if (!l) return;

            // Header detection
            if (/^(Description|Overview|Introduction|Product Overview)/i.test(l)) currentSection = 'overview';
            else if (/^(Features|Benefits|Advantages|Advantages & Benefits|Key Features)/i.test(l)) currentSection = 'features';
            else if (/^(Specifications|Technical Data|Properties|Typical Properties|Technical Specification)/i.test(l)) currentSection = 'specifications';
            else if (/^(Applications|Uses|Where to use|Application Instructions|Method of Use)/i.test(l)) currentSection = 'applications';
            else if (/^(FAQs|Frequently Asked Questions|Questions)/i.test(l)) currentSection = 'faqs';
            else {
                // Append content to current section
                if (sections[currentSection].length < 5000) {
                    sections[currentSection] += l + '\n';
                }
            }
        });

        // Convert raw text to basic HTML for the tabs
        Object.keys(sections).forEach(key => {
            if (sections[key]) {
                const lines = sections[key].trim().split('\n');
                if (key === 'features' || key === 'applications') {
                    sections[key] = '<ul>' + lines.map(li => `<li>${li}</li>`).join('') + '</ul>';
                } else {
                    sections[key] = lines.map(p => `<p>${p}</p>`).join('');
                }
            }
        });

        return sections;
    },

    // Browser Helper
    launchBrowser: async () => {
        const viewWidth = 1366 + Math.floor(Math.random() * 600);
        const viewHeight = 768 + Math.floor(Math.random() * 400);
        const baseArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            `--window-size=${viewWidth},${viewHeight}`,
            '--incognito',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check'
        ];
        try {
            const puppeteerExtra = require('puppeteer-extra');
            const StealthPlugin = require('puppeteer-extra-plugin-stealth');
            puppeteerExtra.use(StealthPlugin());
            try {
                return await puppeteerExtra.launch({
                    headless: true,
                    defaultViewport: null,
                    args: baseArgs
                });
            } catch (_) {
                return await puppeteerExtra.launch({
                    headless: true,
                    defaultViewport: null,
                    args: baseArgs
                });
            }
        } catch (_) {
            const puppeteer = require('puppeteer');
            try {
                return await puppeteer.launch({
                    headless: true,
                    defaultViewport: null,
                    args: baseArgs
                });
            } catch (_) {
                return await puppeteer.launch({
                    headless: true,
                    defaultViewport: null,
                    args: baseArgs
                });
            }
        }
    },

    downloadImageViaBrowser: async (browser, imageUrl) => {
        let page = null;
        try {
            if (!imageUrl) return null;
            let clean = imageUrl.toString().trim();
            if (!clean) return null;
            if (clean.endsWith('.')) clean = clean.slice(0, -1);
            if (clean.startsWith('//')) clean = 'https:' + clean;
            if (!/^https?:\/\//i.test(clean)) return null;

            page = await browser.newPage();
            const response = await page.goto(clean, { waitUntil: 'networkidle0', timeout: 15000 });
            if (!response || !response.ok()) return null;

            let imageBuffer = await response.buffer();
            const tempDir = path.join(__dirname, '..', 'temp_images');
            await fs.mkdir(tempDir, { recursive: true });

            let filename = path.basename(new URL(clean).pathname);
            if (!filename || filename.length < 3) filename = `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
            filename = filename.replace(/[^a-z0-9.]/gi, '_');
            if (!path.extname(filename)) filename += '.jpg';

            // ── Convert WebP → JPEG using Puppeteer canvas (WordPress rejects WebP on many hosts) ──
            // Detect WebP magic bytes: RIFF....WEBP
            const isWebP = imageBuffer.length >= 12 &&
                imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 &&
                imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46 &&
                imageBuffer[8] === 0x57 && imageBuffer[9] === 0x45 &&
                imageBuffer[10] === 0x42 && imageBuffer[11] === 0x50;

            if (isWebP) {
                try {
                    const base64WebP = imageBuffer.toString('base64');
                    const jpegDataUrl = await page.evaluate(async (b64) => {
                        return new Promise((resolve, reject) => {
                            const img = new Image();
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.naturalWidth || 800;
                                canvas.height = img.naturalHeight || 600;
                                const ctx = canvas.getContext('2d');
                                ctx.fillStyle = '#ffffff'; // white background for transparency
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 0, 0);
                                resolve(canvas.toDataURL('image/jpeg', 0.92));
                            };
                            img.onerror = () => reject(new Error('WebP load failed in canvas'));
                            img.src = 'data:image/webp;base64,' + b64;
                        });
                    }, base64WebP);

                    const jpegBase64 = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '');
                    imageBuffer = Buffer.from(jpegBase64, 'base64');
                    // Rename .webp → .jpg
                    filename = filename.replace(/\.webp$/i, '.jpg');
                    console.log(`[helpers] Converted WebP → JPEG: ${filename}`);
                } catch (convErr) {
                    console.warn(`[helpers] WebP conversion failed, keeping original: ${convErr.message}`);
                }
            }

            const localPath = path.join(tempDir, filename);
            await fs.writeFile(localPath, imageBuffer);
            return localPath;
        } catch (_) {
            return null;
        } finally {
            if (page && !page.isClosed()) await page.close();
        }
    },

    // File System Helpers
    ensureDir: async (dirPath) => {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
    },

    writeJson: async (filePath, data) => {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    },

    appendCsv: async (filePath, rowData) => {
        const csvLine = rowData.map(field => `"${field}"`).join(',') + '\n';
        await fs.appendFile(filePath, csvLine);
    },

    formatTabHtml: (title, content, tabKey) => {
        if (!content) return '';
        
        const cleanLine = l => l.replace(/^[•\-*\uf06e\u2022\uf0b7\d.]+\s*/, '').trim();
        const isBulletLine = l => /^[•\-*\uf06e\u2022\uf0b7]\s/.test(l) || /^\d+\.\s/.test(l);
        
        // Convert HTML content to lines if needed, or handle raw text
        let lines = [];
        if (content.includes('<li') || content.includes('<p')) {
            // Very basic HTML to text conversion for line processing
            lines = content.replace(/<\/?[^>]+(>|$)/g, "\n").split('\n').map(l => l.trim()).filter(Boolean);
        } else {
            lines = content.split('\n').map(l => l.trim()).filter(Boolean);
        }

        const tableRows = lines.filter(l => /\S.+?(?:\s{2,}|\t)\S/.test(l));
        const isTableLike = tableRows.length >= 3 && tableRows.length >= lines.length * 0.35;
        const hasBullets = lines.some(l => isBulletLine(l));
        const textJoined = lines.join(' ').replace(/\s+/g, ' ').trim();

        // BENEFITS — premium checkmark cards
        if (tabKey === 'benefits') {
            const items = lines.map(cleanLine).filter(Boolean);
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
            for (const l of lines) {
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
            const items = lines.map(cleanLine).filter(Boolean);
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
            const isWarning = /precaution|safety|warning|danger|caution/i.test(title);
            const cardBg   = isWarning ? '#fff5f5' : '#fffbeb';
            const border   = isWarning ? '#ef4444' : '#f59e0b';
            const hColor   = isWarning ? '#b91c1c' : '#92400e';
            const icon     = isWarning ? '&#9888;' : '&#8505;';
            const iconBg   = isWarning ? '#ef4444' : '#f59e0b';
            let body = '';
            if (hasBullets) {
                body = '<ul style="margin:0;padding-left:18px;">';
                for (const l of lines) { const c = cleanLine(l); if (c) body += `<li style="margin-bottom:8px;color:#374151;font-size:15px;line-height:1.6;">${c}</li>`; }
                body += '</ul>';
            } else {
                const paras = lines.join('\n').replace(/\n{2,}/g, '\n\n').split('\n\n');
                for (const p of paras) { const t = p.replace(/\n/g, ' ').trim(); if (t) body += `<p style="margin:0 0 10px;color:#374151;font-size:15px;line-height:1.7;">${t}</p>`; }
            }
            return `<div style="background:${cardBg};border-left:5px solid ${border};border-radius:8px;padding:18px 22px;margin-bottom:20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${iconBg};color:#fff;font-size:14px;font-weight:700;margin-right:12px;">${icon}</span><strong style="font-size:16px;color:${hColor};">${title}</strong></div>${body}</div>`;
        }

        // DELIVERY — compact table or highlighted box
        if (tabKey === 'delivery' || tabKey === 'estimating') {
            if (isTableLike) {
                let out = '<div style="overflow-x:auto;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:20px;"><table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;"><tbody>';
                let rowCount = 0;
                for (const l of lines) {
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

        // SUITABLE FOR — checkmark list
        if (tabKey === 'suitable') {
            const items = lines.map(cleanLine).filter(Boolean);
            if (!items.length) return `<p style="color:#374151;line-height:1.7;font-size:15px;">${textJoined}</p>`;
            let out = '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));gap:12px;">';
            for (const item of items) {
                out += `<div style="display:flex;align-items:center;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;"><span style="color:#10b981;margin-right:10px;font-weight:bold;">&#10003;</span><span style="color:#1e3a5f;font-size:14px;">${item}</span></div>`;
            }
            out += '</div>';
            return out;
        }

        // ATTACHMENTS — link list
        if (tabKey === 'attachments') {
            return `<div style="padding:16px;background:#f9fafb;border-radius:8px;border:1px dashed #d1d5db;"><div style="display:flex;align-items:center;color:#6b7280;font-size:14px;"><svg style="margin-right:8px;" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M17.8666 9.20835L10.2082 16.8667C9.27005 17.8049 7.99757 18.332 6.67075 18.332C5.34393 18.332 4.07145 17.8049 3.13325 16.8667C2.19505 15.9285 1.66797 14.656 1.66797 13.3292C1.66797 12.0024 2.19505 10.7299 3.13325 9.79168L10.7916 2.13335" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path></svg>Technical documents and attachments will be available here.</div>${content}</div>`;
        }

        // REVIEWS — placeholder or styled box
        if (tabKey === 'reviews') {
            return `<div style="padding:20px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><span style="color:#fbbf24;font-size:18px;">★★★★★</span><span style="margin-left:10px;color:#374151;font-weight:600;">Customer Ratings</span></div><div style="color:#6b7280;font-size:14px;line-height:1.6;">${content || 'No reviews available yet for this product.'}</div></div>`;
        }

        // OVERVIEW & DEFAULT — clean readable paragraphs
        const paras = lines.join('\n').replace(/\n{2,}/g, '\n\n').split('\n\n');
        let out = '';
        for (const p of paras) { const t = p.replace(/\n/g, ' ').trim(); if (t) out += `<p style="color:#374151;line-height:1.75;font-size:15px;margin-bottom:18px;">${t}</p>`; }
        return out || `<p style="color:#374151;line-height:1.75;font-size:15px;">${textJoined}</p>`;
    },

    extractUniversalGallery: async (page) => {
        return await page.evaluate(() => {
            const images = new Set();
            
            const addImg = (src) => {
                if (!src) return;
                let clean = src.toString().trim();
                clean = clean.replace(/^`+|`+$/g, '').trim();
                if (clean.startsWith('//')) clean = 'https:' + clean;
                if (clean.startsWith('/')) clean = window.location.origin + clean;
                
                // Filter out small icons or unrelated images
                if (clean.match(/\.(svg|gif|ico)$/i)) return;
                if (clean.includes('logo') || clean.includes('icon') || clean.includes('sprite')) return;
                
                // Try to get high-res version by removing dimension suffixes if possible
                // e.g. image-150x150.jpg -> image.jpg
                const highRes = clean.replace(/-\d+x\d+\.(jpg|png|jpeg|webp)$/i, '.$1');
                
                images.add(highRes);
                // Also add original just in case the regex broke something valid
                if (highRes !== clean) images.add(clean);

                // Fosroc-specific improvement: replace /images/thumbs/ with /images/ and strip _<size> suffixes
                if (/\/images\/thumbs\//i.test(clean)) {
                    const noThumbs = clean.replace(/\/images\/thumbs\//i, '/images/');
                    images.add(noThumbs);
                    const stripSuffix = noThumbs.replace(/_(\d+(x\d+)?)\.(jpg|jpeg|png|webp|gif)$/i, '.$3');
                    images.add(stripSuffix);
                }
            };

            // Strategy 1: Look for links to images inside gallery containers (Best for WooCommerce/Magento)
            const galleryLinks = document.querySelectorAll(
                '.woocommerce-product-gallery__image a, ' +
                '.product-gallery a[href*=".jpg"], ' +
                '.product-gallery a[href*=".png"], ' +
                '.gallery a[href*=".jpg"], ' +
                '.gallery a[href*=".png"], ' +
                'a[data-lightbox], ' +
                'a[data-fancybox]'
            );
            galleryLinks.forEach(a => addImg(a.href));

            // Strategy 2: Look for specific gallery image classes
            const galleryImages = document.querySelectorAll(
                '.product-gallery__carousel-item img, ' + // Fepy specific
                '.woocommerce-product-gallery__image img, ' +
                '.gallery-item img, ' +
                '.product-images img, ' +
                '.swiper-slide img, ' +
                '.owl-item img, ' +
                '.slick-slide img'
            );
            
            galleryImages.forEach(img => {
                const fullSrc = img.getAttribute('data-full') || 
                              img.getAttribute('data-large') || 
                              img.getAttribute('data-src') || 
                              img.getAttribute('data-zoom-image') || 
                              img.getAttribute('data-original') ||
                              img.src;
                addImg(fullSrc);

                // Handle srcset for high-res images
                const srcset = img.getAttribute('srcset');
                if (srcset) {
                    // Extract the largest image from srcset (usually the last one)
                    const parts = srcset.split(',');
                    const lastPart = parts[parts.length - 1];
                    if (lastPart) {
                        const url = lastPart.trim().split(' ')[0];
                        if (url) addImg(url);
                    }
                }
            });

            // Strategy 2.1: Cloudzoom galleries (e.g., Fosroc)
            const cloudZoomAnchors = document.querySelectorAll('a.cloudzoom-gallery, a[data-cloudzoom], a[data-full-image-url]');
            cloudZoomAnchors.forEach(a => {
                const fullAttr = a.getAttribute('data-full-image-url');
                if (fullAttr) addImg(fullAttr);
                const cz = a.getAttribute('data-cloudzoom') || '';
                if (cz && typeof cz === 'string') {
                    // Extract zoomImage and image from the options string
                    const zoomMatch = cz.match(/zoomImage:\s*'([^']+)'/i) || cz.match(/zoomImage:\s*"([^"]+)"/i);
                    const imgMatch = cz.match(/image:\s*'([^']+)'/i) || cz.match(/image:\s*"([^"]+)"/i);
                    if (zoomMatch && zoomMatch[1]) addImg(zoomMatch[1]);
                    if (imgMatch && imgMatch[1]) addImg(imgMatch[1]);
                }
                const innerImg = a.querySelector('img');
                if (innerImg && innerImg.src) addImg(innerImg.src);
            });

            // Strategy 3: Schema.org (JSON-LD)
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            scripts.forEach(script => {
                try {
                    const json = JSON.parse(script.innerText);
                    const processSchema = (obj) => {
                        if (!obj) return;
                        if (Array.isArray(obj)) obj.forEach(processSchema);
                        else {
                            if (obj['@type'] === 'Product' && obj.image) {
                                if (Array.isArray(obj.image)) obj.image.forEach(addImg);
                                else if (typeof obj.image === 'string') addImg(obj.image);
                                else if (typeof obj.image === 'object' && obj.image.url) addImg(obj.image.url);
                            }
                            // Recursive search for nested objects
                            Object.values(obj).forEach(val => {
                                if (typeof val === 'object') processSchema(val);
                            });
                        }
                    };
                    processSchema(json);
                } catch (e) {}
            });

            return Array.from(images);
        });
    }
};
