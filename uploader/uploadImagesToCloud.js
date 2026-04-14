const { uploadImagesToCloud: unifiedUploadImages } = require('../scraper/unified/uploader');

async function uploadImagesToCloud(prepared, config) {
  return await unifiedUploadImages(prepared, config);
}

module.exports = { uploadImagesToCloud };
