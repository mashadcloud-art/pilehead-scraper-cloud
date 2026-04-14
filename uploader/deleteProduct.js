const wordpress = require('../scraper/wordpress');

async function deleteProduct(siteUrl, key, secret, productId) {
  return await wordpress.deleteProduct(siteUrl, key, secret, productId);
}

module.exports = { deleteProduct };
