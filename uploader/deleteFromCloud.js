const wordpress = require('../scraper/wordpress');

async function deleteFromCloud(gcsConfig, urls) {
  return await wordpress.deleteGcsObjects(gcsConfig || {}, urls || []);
}

module.exports = { deleteFromCloud };
