const fs = require('fs');
const path = require('path');

/**
 * Retrieves product data for viewing.
 * @param {string} filePath - Path to the product JSON file.
 * @returns {object} - { current: object, original: object }
 */
function getProductView(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error("Product file not found.");
    }

    const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    let current;
    let original;

    // Handle wrapped structure from orchestrator
    if (fileContent.cleaned && fileContent.seoData) {
        current = {
            ...fileContent.cleaned,
            ...fileContent.seoData
        };
        // Use stored original or fallback to cleaned
        original = fileContent._original || {
            title: fileContent.cleaned.title,
            description: fileContent.cleaned.description,
            specs: fileContent.cleaned.specs
        };
    } else {
        // Legacy flat structure
        current = fileContent;
        original = fileContent._original || {
            title: fileContent.title,
            description: fileContent.description,
            specs: fileContent.specs
        };
    }

    return {
        current: current,
        original: original,
        filePath: filePath
    };
}

module.exports = { getProductView };
