function extractImages(raw) {
  const main = raw.image || raw.mainImage || '';
  const gallery = Array.isArray(raw.galleryImages) ? raw.galleryImages : (Array.isArray(raw.images) ? raw.images : []);
  return { main, gallery };
}

module.exports = {
  extractImages
};
