function extractSpecs(raw) {
  if (raw.specs) return raw.specs;
  if (raw.specifications) return raw.specifications;
  if (raw.features && Array.isArray(raw.features)) {
    const map = {};
    raw.features.forEach(f => {
      if (f && f.name && f.value) map[f.name] = f.value;
    });
    return map;
  }
  return {};
}

module.exports = {
  extractSpecs
};
