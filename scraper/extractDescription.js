function extractDescription(raw) {
  let desc = raw.description || raw.longDescription || raw.shortDescription || '';
  
  // If we have a short description, let's prepend it if it's different from the main description
  if (raw.shortDescription && raw.shortDescription !== desc) {
    desc = `<div class="short-description">${raw.shortDescription}</div><hr>` + desc;
  }
  
  return desc;
}

module.exports = {
  extractDescription
};
