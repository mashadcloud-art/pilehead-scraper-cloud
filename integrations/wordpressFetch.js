const wordpress = require('../scraper/wordpress');

/**
 * Fetches products from WordPress.
 * @param {object} config - { url, key, secret }
 * @param {object} options - { page, perPage, search, category }
 * @returns {Promise<object>} - { products: Array, total: number, totalPages: number }
 */
async function fetchProducts(config, options = {}) {
    if (!config.url || !config.key || !config.secret) {
        throw new Error("Missing WordPress configuration.");
    }

    try {
        const response = await wordpress.listProducts(
            config.url,
            config.key,
            config.secret,
            options
        );
        return response;
    } catch (error) {
        console.error("Error fetching products:", error);
        throw error;
    }
}

module.exports = { fetchProducts };
