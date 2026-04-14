const wordpress = require('../scraper/wordpress');

/**
 * Uploads a new product to WordPress.
 * @param {object} config - { url, key, secret }
 * @param {object} product - Product data
 * @returns {Promise<object>} - Response from WordPress
 */
async function uploadProduct(config, product) {
    if (!config.url || !config.key || !config.secret) {
        throw new Error("Missing WordPress configuration.");
    }

    try {
        const response = await wordpress.createProduct(config.url, config.key, config.secret, product);

        return response;
    } catch (error) {
        console.error("Error uploading to WordPress:", error);
        throw error;
    }
}

module.exports = { uploadProduct };
