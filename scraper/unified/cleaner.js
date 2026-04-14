function normalize(text) {
  return (text || '').toString().replace(/\s+/g, ' ').trim();
}

function cleanTitle(title) {
  let t = normalize(title);
  t = t.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '');
  t = t.replace(/\b(Original|Official|Best|New|Sale|Discount|Offer)\b/gi, '').replace(/\s+/g, ' ').trim();
  return t;
}

function cleanDescription(desc) {
  let d = (desc || '').toString();
  d = d.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  d = d.replace(/<!--[\s\S]*?-->/g, '');
  d = d.replace(/<\/?span[^>]*>/gi, '').replace(/<\/?div[^>]*>/gi, '');
  d = d.replace(/\s+/g, ' ').trim();
  return d;
}

function cleanSpecs(specs) {
  const out = {};
  try {
    if (Array.isArray(specs)) {
      specs.forEach(s => {
        if (!s) return;
        const key = normalize(s.name || s.key || '');
        const val = normalize(s.value || s.val || '');
        if (key && val) out[key] = val;
      });
    } else if (typeof specs === 'object' && specs) {
      Object.entries(specs).forEach(([k, v]) => {
        const key = normalize(k);
        const val = normalize(v);
        if (key && val) out[key] = val;
      });
    }
  } catch (_) {}
  return out;
}

module.exports = {
  cleanTitle,
  cleanDescription,
  cleanSpecs
};
