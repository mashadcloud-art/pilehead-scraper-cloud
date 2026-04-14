const wordpress = require('../scraper/wordpress');

/**
 * Updates an existing product in WordPress.
 * @param {object} config - { url, key, secret }
 * @param {number|string} productId - WordPress Product ID
 * @param {object} updates - Object containing fields to update (description, seo, etc.)
 * @returns {Promise<object>} - Response from WordPress
 */
async function updateProduct(config, productId, updates) {
    if (!config.url || !config.key || !config.secret) {
        throw new Error("Missing WordPress configuration.");
    }

    // Map our internal SEO structure to what scraper/wordpress.js expects
    const seo = {
        title: updates.seoTitle || updates.title,
        slug: updates.slug,
        metaDescription: updates.metaDescription,
        focusKeywords: updates.focusKeywords,
        ogTitle: updates.ogTitle,
        ogDescription: updates.ogDescription,
        ogImageAlt: updates.ogImageAlt,
        schemaJson: updates.schema ? JSON.stringify(updates.schema) : null,
        shortDescription: updates.shortDescription
    };

    // Map tabs
    const descriptionTabs = {};
    if (updates.tabs) {
        descriptionTabs.descriptionHtml = updates.tabs.description || updates.longDescription;
        descriptionTabs.benefitsHtml = updates.tabs.features;
        descriptionTabs.specificationsHtml = updates.tabs.specs;
        descriptionTabs.applicationHtml = updates.tabs.applications;
        descriptionTabs.faqsHtml = updates.tabs.faqs;
        descriptionTabs.reviewsHtml = updates.tabs.reviews;
        descriptionTabs.deliveryHtml = updates.tabs.delivery;
    } else {
        // Fallback if tabs not explicitly structured
        descriptionTabs.descriptionHtml = updates.longDescription;
    }

    try {
        const response = await wordpress.updateProductDescription(
            config.url, 
            config.key, 
            config.secret, 
            productId, 
            updates.longDescription || '', // Main description HTML
            seo,
            descriptionTabs
        );
        return response;
    } catch (error) {
        console.error(`Error updating product ${productId}:`, error);
        throw error;
    }
}

module.exports = { updateProduct };
