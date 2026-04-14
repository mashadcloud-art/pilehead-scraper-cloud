const { uploadProduct } = require('../integrations/wordpressUpload');
const { updateProduct } = require('../integrations/wordpressUpdate');

/**
 * Publishes a product to WordPress (Create or Update).
 * @param {object} config - WordPress config
 * @param {object} product - Product data
 * @returns {Promise<object>} - Response
 */
async function publishProduct(config, product) {
    if (product.id) {
        console.log(`Updating existing product ${product.id}...`);
        return await updateProduct(config, product.id, product);
    } else {
        console.log(`Creating new product ${product.name}...`);
        return await uploadProduct(config, product);
    }
}

module.exports = { publishProduct };
