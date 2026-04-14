const { MASTER_CATEGORIES, MASTER_BRANDS } = require('../master-categories');

function normalize(text) {
  return (text || '').toString().trim();
}

function mapBrand(product) {
  // If a meaningful brand was already resolved (e.g. by brandFromUrl in scrapeProduct)
  // trust it — don't overwrite with a text-match that might be wrong.
  if (product.brand && product.brand !== 'Generic') return product.brand;

  const text = (product.title + ' ' + (product.description || '')).toLowerCase();
  for (const b of MASTER_BRANDS || []) {
    if (text.includes(b.toLowerCase())) return b;
  }
  return product.brand || 'Generic';
}

function mapCategory(product) {
  if (product.categoryPath && product.categoryPath.length >= 2) {
    return {
      category: product.categoryPath[0],
      subcategory: product.categoryPath[product.categoryPath.length - 1]
    };
  }
  const t = (product.title + ' ' + (product.description || '')).toLowerCase();
  let best = { category: 'Uncategorized', subcategory: 'General' };
  let max = 0;
  for (const [cat, subs] of Object.entries(MASTER_CATEGORIES || {})) {
    for (const [sub, keywords] of Object.entries(subs)) {
      let score = 0;
      keywords.forEach(k => { if (t.includes(k.toLowerCase())) score++; });
      if (score > max) { max = score; best = { category: cat, subcategory: sub }; }
    }
  }
  return best;
}

function mapAttributes(product) {
  const attrs = [];
  if (product.specs && typeof product.specs === 'object') {
    for (const [k, v] of Object.entries(product.specs)) {
      attrs.push({ name: normalize(k), visible: true, variation: false, options: [normalize(v)] });
    }
  }
  if (product.brand) {
    attrs.push({ name: 'Brand', visible: true, variation: false, options: [normalize(product.brand)] });
  }
  return attrs;
}

function mapTags(product, seo) {
  const tags = [];
  const kw = (seo.focusKeywords || '').split(',').map(s => normalize(s)).filter(Boolean);
  kw.forEach(k => tags.push(k));
  return tags;
}

function applyAll(product, seo, config) {
  const brand = mapBrand(product);
  const cat = mapCategory(product);
  const attributes = mapAttributes({ ...product, brand });
  const tags = mapTags(product, seo);
  return {
    ...product,
    brand,
    category: cat.category,
    subcategory: cat.subcategory,
    attributes,
    tags
  };
}

module.exports = {
  mapBrand,
  mapCategory,
  mapAttributes,
  mapTags,
  applyAll
};
