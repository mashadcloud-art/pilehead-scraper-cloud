const fs = require('fs');
const path = require('path');

/**
 * Saves manual edits to a product.
 * @param {string} filePath - Path to product file
 * @param {object} updates - Object containing updated fields
 * @returns {object} - Updated product
 */
function saveProductEdits(filePath, updates) {
    if (!fs.existsSync(filePath)) {
        throw new Error("Product file not found.");
    }

    const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Handle wrapped structure from orchestrator
    if (fileContent.cleaned && fileContent.seoData) {
        // Updates should apply to seoData or cleaned data
        // For simplicity, we assume updates are mostly SEO related and put them in seoData
        // If updates contain core product info (like title/specs), we might need to update 'cleaned' too.
        
        // Merge updates into seoData
        Object.assign(fileContent.seoData, updates);
        fileContent.seoData.lastUpdated = new Date().toISOString();

    } else {
        // Legacy flat structure
        Object.assign(fileContent, updates);
        fileContent.lastUpdated = new Date().toISOString();
    }

    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    
    return fileContent;
}

module.exports = { saveProductEdits };
