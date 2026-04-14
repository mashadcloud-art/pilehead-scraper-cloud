/**
 * FEPY Product Upload Handler
 * Fills WordPress product details tab with complete FEPY product information
 * 
 * Usage:
 *   const fepyUpload = require('./fepy_upload_handler');
 *   await fepyUpload.uploadProductTab(productDetailsData, wpConfig);
 */

const fs = require('fs');
const path = require('path');

/**
 * Prepares product data for WordPress WooCommerce product details tab
 * @param {object} productDetailsTab - Product data with all details
 * @returns {object} WordPress-formatted product data
 */
function prepareWPProductData(productDetailsTab) {
    return {
        // Basic Product Info
        name: productDetailsTab.title,
        type: 'variable', // If has variations, use 'variable'
        description: productDetailsTab.longDescription,
        short_description: productDetailsTab.shortDescription,
        
        // Pricing
        regular_price: extractPrice(productDetailsTab.price),
        
        // Organization
        sku: productDetailsTab.sku,
        categories: [productDetailsTab.category],
        tags: productDetailsTab.featuresKeywords || [],
        
        // Media
        images: (productDetailsTab.localGalleryPaths || []).map((imagePath, idx) => ({
            src: imagePath,
            name: productDetailsTab.title + ' Image ' + (idx + 1),
            alt: productDetailsTab.title
        })),
        
        // Attributes
        attributes: formatWPAttributes(productDetailsTab.attributes),
        
        // Variations (if applicable)
        variations: formatWPVariations(productDetailsTab.variations),
        
        // Stock
        manage_stock: true,
        stock_quantity: 999, // Update based on actual stock
        
        // SEO
        yoast_wpseo_metadesc: productDetailsTab.metaDescription,
        _yoast_wpseo_focuskw: productDetailsTab.focusKeywords,
        
        // Meta
        meta_data: [
            { key: '_fepy_source_url', value: productDetailsTab.sourceUrl },
            { key: '_fepy_brand', value: productDetailsTab.brand },
            { key: '_fepy_scraped_date', value: productDetailsTab.processedAt }
        ]
    };
}

/**
 * Extracts numeric price from price string
 * @param {string} priceStr - Price with currency (e.g., "AED 150.50")
 * @returns {string} Numeric price
 */
function extractPrice(priceStr) {
    if (!priceStr) return '0';
    const match = priceStr.match(/[\d.,]+/);
    return match ? match[0].replace(/,/g, '') : '0';
}

/**
 * Formats product attributes for WooCommerce
 * @param {array} attributes - Attribute data from FEPY
 * @returns {array} WP-formatted attributes
 */
function formatWPAttributes(attributes) {
    if (!Array.isArray(attributes) || attributes.length === 0) {
        return [];
    }

    return attributes.map(attr => ({
        name: attr.name,
        options: Array.isArray(attr.options) ? attr.options : [attr.options],
        visible: true,
        variation: true // Allow in variations
    }));
}

/**
 * Formats product variations for WooCommerce
 * @param {array} variations - Variation data
 * @returns {array} WP-formatted variations
 */
function formatWPVariations(variations) {
    if (!Array.isArray(variations) || variations.length === 0) {
        return [];
    }

    return variations.map((variation, idx) => ({
        description: 'Variation ' + (idx + 1),
        regular_price: extractPrice(variation.price || variation.regular_price || ''),
        image: { src: variation.image || '' },
        attributes: (Array.isArray(variation.attributes) ? variation.attributes : []).map(attr => ({
            name: attr.name,
            option: attr.option || attr.value
        })),
        manage_stock: true,
        stock_quantity: 999
    }));
}

/**
 * Generates WooCommerce product description with formatted tabs
 * @param {object} productDetailsTab - Product data
 * @returns {string} HTML description with tabs
 */
function generateProductDescription(productDetailsTab) {
    let html = '';

    // Main description
    html += `<div class="product-description">\n${productDetailsTab.longDescription}\n</div>\n\n`;

    // Tabs
    if (productDetailsTab.tabs && Object.keys(productDetailsTab.tabs).length > 0) {
        html += '<!-- Product Detail Tabs -->\n';
        html += '<div class="product-tabs">\n';

        Object.entries(productDetailsTab.tabs).forEach(([tabName, tabContent]) => {
            if (tabContent) {
                const tabId = tabName.replace(/\s+/g, '-').toLowerCase();
                html += `\n<!-- Tab: ${tabName} -->\n`;
                html += `<div id="${tabId}" class="product-tab">\n`;
                html += `<h3>${formatTabTitle(tabName)}</h3>\n`;
                html += `${tabContent}\n`;
                html += `</div>\n`;
            }
        });

        html += '</div>\n';
    }

    return html;
}

/**
 * Formats tab name for display
 * @param {string} tabName - Internal tab name
 * @returns {string} Formatted display name
 */
function formatTabTitle(tabName) {
    const titles = {
        benefits: 'Features & Benefits',
        specifications: 'Key Specifications',
        applications: 'Applications',
        faq: 'Frequently Asked Questions',
        suitableFor: 'Suitable For',
        estimating: 'Estimating & Supply',
        attachments: 'Attachments',
        reviews: 'Ratings & Reviews'
    };
    return titles[tabName] || tabName.charAt(0).toUpperCase() + tabName.slice(1);
}

/**
 * Saves product data as JSON for manual upload
 * @param {object} productDetailsTab - Product data
 * @param {string} outputPath - Where to save
 * @returns {string} Path to saved file
 */
function saveForManualUpload(productDetailsTab, outputPath = null) {
    if (!outputPath) {
        const outputDir = path.join(__dirname, 'wp_uploads');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const fileName = (productDetailsTab.title || 'product')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') + '_wp_import.json';
        outputPath = path.join(outputDir, fileName);
    }

    const wpData = prepareWPProductData(productDetailsTab);
    fs.writeFileSync(outputPath, JSON.stringify(wpData, null, 2));
    
    return outputPath;
}

/**
 * Generates CSV for bulk import
 * @param {array} productsArray - Array of product detail tabs
 * @param {string} outputPath - Where to save CSV
 * @returns {string} Path to saved CSV
 */
function generateBulkImportCSV(productsArray, outputPath = null) {
    if (!outputPath) {
        const outputDir = path.join(__dirname, 'wp_uploads');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        outputPath = path.join(outputDir, 'fepy_products_bulk_import.csv');
    }

    let csv = 'Type,SKU,Name,Published,Regular price,Sale price,Description,Short description,Categories,Images,Attributes,Meta: _fepy_source_url\n';

    productsArray.forEach(product => {
        const descCSV = (product.longDescription || '').replace(/"/g, '""');
        const shortDescCSV = (product.shortDescription || '').replace(/"/g, '""');
        const categoriesCSV = (product.category || '').replace(/"/g, '""');
        const attributesCSV = (product.attributes || [])
            .map(a => a.name + ': ' + (Array.isArray(a.options) ? a.options.join(', ') : a.options))
            .join(' | ');

        csv += `simple,${product.sku},"${product.title}",1,${extractPrice(product.price)},,"${descCSV}","${shortDescCSV}","${categoriesCSV}",,${attributesCSV},"${product.sourceUrl}"\n`;
    });

    fs.writeFileSync(outputPath, csv);
    return outputPath;
}

/**
 * Generates HTML for manual copy-paste into WP admin
 * @param {object} productDetailsTab - Product data
 * @param {string} outputPath - Where to save
 * @returns {string} Path to saved file
 */
function generateHTMLForManualEntry(productDetailsTab, outputPath = null) {
    if (!outputPath) {
        const outputDir = path.join(__dirname, 'wp_uploads');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const fileName = (productDetailsTab.title || 'product')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') + '_wp_manual.html';
        outputPath = path.join(outputDir, fileName);
    }

    let html = `<!DOCTYPE html>
<html>
<head>
    <title>WooCommerce Product: ${productDetailsTab.title}</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .section { margin: 30px 0; padding: 15px; border: 1px solid #ddd; }
        h1 { color: #333; }
        h2 { color: #666; border-bottom: 2px solid #0073aa; padding-bottom: 10px; }
        .label { font-weight: bold; color: #0073aa; }
        .value { margin-left: 20px; }
        .tab-content { background: #f9f9f9; padding: 15px; margin: 10px 0; border-left: 4px solid #0073aa; }
        table { width: 100%; border-collapse: collapse; }
        td, th { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Product Details Tab: ${productDetailsTab.title}</h1>
    <p><strong>Source:</strong> FEPY | <strong>URL:</strong> <a href="${productDetailsTab.sourceUrl}" target="_blank">${productDetailsTab.sourceUrl}</a></p>
    
    <div class="section">
        <h2>Basic Information</h2>
        <table>
            <tr><td class="label">Title:</td><td>${productDetailsTab.title}</td></tr>
            <tr><td class="label">SKU:</td><td>${productDetailsTab.sku || 'Auto-generate'}</td></tr>
            <tr><td class="label">Price:</td><td>${productDetailsTab.price}</td></tr>
            <tr><td class="label">Brand:</td><td>${productDetailsTab.brand}</td></tr>
            <tr><td class="label">Category:</td><td>${productDetailsTab.category}</td></tr>
        </table>
    </div>

    <div class="section">
        <h2>Descriptions</h2>
        <p class="label">Short Description:</p>
        <div class="value">${productDetailsTab.shortDescription}</div>
        
        <p class="label" style="margin-top: 20px;">Long Description / Full Description:</p>
        <div class="value">${productDetailsTab.longDescription}</div>
        
        <p class="label" style="margin-top: 20px;">Meta Description (for SEO):</p>
        <div class="value">${productDetailsTab.metaDescription}</div>
    </div>

    <div class="section">
        <h2>Images</h2>
        <p><strong>Main Image:</strong> ${productDetailsTab.mainImage}</p>
        <p><strong>Gallery Images (${productDetailsTab.localGalleryPaths.length} total):</strong></p>
        <ul>
            ${productDetailsTab.localGalleryPaths.map(img => `<li>${img}</li>`).join('')}
        </ul>
    </div>

    <div class="section">
        <h2>Specifications & Attributes</h2>
        ${Object.keys(productDetailsTab.specifications).length > 0 ? `
        <p class="label">Specifications:</p>
        <table>
            <tr><th>Spec</th><th>Value</th></tr>
            ${Object.entries(productDetailsTab.specifications).map(([key, val]) => 
                `<tr><td>${key}</td><td>${val}</td></tr>`
            ).join('')}
        </table>
        ` : '<p>No specifications</p>'}
        
        ${productDetailsTab.attributes.length > 0 ? `
        <p class="label" style="margin-top: 20px;">Attributes:</p>
        <ul>
            ${productDetailsTab.attributes.map(attr => 
                `<li><strong>${attr.name}:</strong> ${Array.isArray(attr.options) ? attr.options.join(', ') : attr.options}</li>`
            ).join('')}
        </ul>
        ` : ''}
    </div>

    <div class="section">
        <h2>Product Detail Tabs</h2>
        ${Object.entries(productDetailsTab.tabs).map(([tabName, tabContent]) => `
        <h3>${formatTabTitle(tabName)}</h3>
        <div class="tab-content">
            ${tabContent}
        </div>
        `).join('')}
    </div>

    <div class="section">
        <h2>SEO Settings</h2>
        <table>
            <tr><td class="label">Slug:</td><td>${productDetailsTab.slug}</td></tr>
            <tr><td class="label">Focus Keywords:</td><td>${productDetailsTab.focusKeywords || 'Not set'}</td></tr>
            <tr><td class="label">OG Title:</td><td>${productDetailsTab.ogTitle}</td></tr>
            <tr><td class="label">OG Description:</td><td>${productDetailsTab.ogDescription}</td></tr>
        </table>
    </div>
</body>
</html>`;

    fs.writeFileSync(outputPath, html);
    return outputPath;
}

module.exports = {
    prepareWPProductData,
    saveForManualUpload,
    generateBulkImportCSV,
    generateHTMLForManualEntry,
    formatWPAttributes,
    formatWPVariations,
    extractPrice,
    generateProductDescription
};
