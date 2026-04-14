const wordpress = require('../scraper/wordpress');

async function uploadToWordPress(site, creds, payload) {
  const res = await wordpress.createProduct(site.url, creds.key, creds.secret, payload);
  return res;
}

module.exports = { uploadToWordPress };
