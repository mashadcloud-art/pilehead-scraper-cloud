/**
 * Henkel Polybit Scraper - henkelpolybit.com
 * Scrapes: name, description, features, specs, and technical documents.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const helpers = require('./helpers');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://www.henkelpolybit.com';

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

async function scrapeProduct(url, config = {}) {
    let browser;
    try {
        browser = await launchBrowser(config);
        const page = await browser.newPage();
        await page.setUserAgent(helpers.getRandomUserAgent());
        
        helpers.log(`Navigating to Henkel Polybit: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for potential dynamic content
        await helpers.delay(3000);
        
        // Scroll down to trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, 800));
        await helpers.delay(1000);

        const product = await page.evaluate(() => {
            const data = {
                name: '',
                brand: 'Henkel Polybit',
                description: '',
                shortDescription: '',
                image: '',
                galleryImages: [],
                specs: {},
                documents: [],
                features: [],
                tabs: {}
            };

            // 1. Name & Subtitle
            const nameEl = document.querySelector('h1') || document.querySelector('.product-title') || document.querySelector('.title-headline');
            data.name = nameEl ? nameEl.innerText.trim() : '';

            // 2. Images
            // Henkel often uses a carousel or specific product image classes
            const imageCandidates = [
                '.product-image img',
                '.main-image img',
                '.carousel__slider img',
                '.product-detail-image img',
                '.image-gallery img',
                'img[src*="/products/"]',
                'img[src*="/polybit/"]',
                'img.product-image'
            ];
            
            let foundImages = [];
            imageCandidates.forEach(sel => {
                document.querySelectorAll(sel).forEach(img => {
                    let src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('lazy-src');
                    if (src && !foundImages.includes(src) && !src.includes('base64') && !src.includes('placeholder')) {
                        // Handle relative URLs
                        if (src.startsWith('/')) {
                            src = window.location.origin + src;
                        }
                        foundImages.push(src);
                    }
                });
            });

            // Filter out small icons or tracking pixels
            foundImages = foundImages.filter(src => !src.includes('icon') && !src.includes('pixel'));

            if (foundImages.length > 0) {
                data.image = foundImages[0];
                data.galleryImages = foundImages.slice(1);
            }

            // 3. Documents (TDS/SDS/Method)
            // Look for any links containing .pdf, specifically in sections like "Downloads" or "Technical Data"
            const allLinks = Array.from(document.querySelectorAll('a[href*=".pdf"]'));
            allLinks.forEach(a => {
                let url = a.getAttribute('href');
                if (!url) return;
                
                // Handle relative URLs
                if (url.startsWith('/')) {
                    url = window.location.origin + url;
                }

                const text = (a.innerText || a.getAttribute('title') || '').toLowerCase();
                
                let type = 'document';
                if (text.includes('tds') || text.includes('technical data') || text.includes('data sheet')) type = 'TDS';
                else if (text.includes('sds') || text.includes('msds') || text.includes('safety')) type = 'SDS';
                else if (text.includes('method statement') || text.includes('how to use')) type = 'MS';
                
                if (!data.documents.some(d => d.url === url)) {
                    data.documents.push({
                        name: a.innerText.trim() || type,
                        url: url,
                        type: type
                    });
                }
            });

            // If no docs found in links, check for specific "Download" buttons or sections
            if (data.documents.length === 0) {
                const downloadButtons = document.querySelectorAll('.download-link, .btn-download');
                downloadButtons.forEach(btn => {
                    if (btn.href && btn.href.endsWith('.pdf')) {
                        data.documents.push({
                            name: btn.innerText.trim() || 'Download',
                            url: btn.href,
                            type: 'document'
                        });
                    }
                });
            }

            // 7. Tabs Construction
            if (data.description) {
                data.tabs.overview = `<div class="ph-prose"><p>${data.description.replace(/\n\n/g, '</p><p>')}</p></div>`;
            }

            if (data.features.length > 0) {
                // Style these as requested earlier: blue background, checkmark
                const featureHtml = data.features.map(f => `
                    <li style="display:flex;align-items:flex-start;padding:13px 16px;margin-bottom:10px;background:#f0f7ff;border-left:4px solid #3b82f6;border-radius:6px">
                        <span style="display:flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:50%;background:#3b82f6;color:#fff;font-size:12px;font-weight:700;margin-right:12px;flex-shrink:0">✓</span>
                        <span style="color:#1e3a5f;font-size:15px;line-height:1.6">${f}</span>
                    </li>
                `).join('');
                data.tabs.benefits = `<ul style="padding:0;margin:0">${featureHtml}</ul>`;
            }

            if (Object.keys(data.specs).length > 0) {
                const specHtml = Object.entries(data.specs).map(([k, v]) => `
                    <div class="ph-spec-item" style="padding:12px;background:#fff;border:1.5px solid #eee;border-radius:10px;display:flex;flex-direction:column;gap:4px;">
                        <span class="ph-spec-label" style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;">${k}</span>
                        <span class="ph-spec-value" style="font-size:14px;font-weight:600;color:#111827;">${v}</span>
                    </div>
                `).join('');
                data.tabs.specifications = `<div class="ph-spec-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">${specHtml}</div>`;
            }

            return data;
        });

        // Add SKU from URL or breadcrumbs if possible
        const skuMatch = url.match(/SAP_([A-Z0-9]+)/);
        if (skuMatch) product.sku = skuMatch[1];

        await browser.close();
        return product;

    } catch (err) {
        if (browser) await browser.close();
        throw err;
    }
}

module.exports = {
    scrapeProduct
};
