const amazon = require('./amazon');
const noon = require('./noon');
const fosroc = require('./fosroc');
const henkel = require('./henkel');
const fepy = require('./fepy');
const karcher = require('./karcher');
const universal = require('./universal');
const { cleanTitle } = require('../cleaner/cleanTitle');
const { cleanDescription } = require('../cleaner/cleanDescription');
const { cleanSpecs } = require('../cleaner/cleanSpecs');
const { extractImages } = require('./extractImages');
const { extractSpecs } = require('./extractSpecs');
const { extractDescription } = require('./extractDescription');
const pdfExtractor = require('./pdfAutoExtractor');

// ── Brand-from-URL ───────────────────────────────────────────────────────────
// Maps known brand domains to their canonical brand name.
// For any unlisted domain the brand is derived from the hostname itself
// (e.g. "makita.com" → "Makita", "bostik.com" → "Bostik").
// ─────────────────────────────────────────────────────────────────────────────
const DOMAIN_BRAND_MAP = {
  // Exact domain-keyword → Brand name (all lowercase keys)
  'fosroc':    'Fosroc',
  'henkel':    'Henkel',
  'karcher':   'Kärcher',
  'karcher':   'Kärcher',   // handle both spellings
  'makita':    'Makita',
  'bosch':     'Bosch',
  'dewalt':    'DeWalt',
  'hilti':     'Hilti',
  'sika':      'Sika',
  'mapei':     'Mapei',
  'basf':      'BASF',
  'bostik':    'Bostik',
  '3m':        '3M',
  'wurth':     'Würth',
  'stanley':   'Stanley',
  'metabo':    'Metabo',
  'flex':      'FLEX',
  'festool':   'Festool',
  'fepy':      'Fepy',
  'pilehead':  'Pilehead',
};

/**
 * Derive a brand name from the scraped URL.
 * Priority:
 *   1. Explicit match in DOMAIN_BRAND_MAP
 *   2. Extract second-level domain and title-case it
 *   3. Fall back to whatever the scraper already put in raw.brand
 *   4. 'Generic' as last resort
 *
 * @param {string} url  - full product URL
 * @param {string} [scraperBrand] - brand the scraper extracted (may be empty)
 * @returns {string}
 */
function brandFromUrl(url, scraperBrand) {
  try {
    const hostname = new URL(url).hostname.toLowerCase(); // e.g. "buy.fosroc.ae"
    // 1. Check every key in map against the hostname
    for (const [keyword, brand] of Object.entries(DOMAIN_BRAND_MAP)) {
      if (hostname.includes(keyword)) return brand;
    }
    // 2. Extract SLD (second-level domain) e.g. "buy.fosroc.ae" → "fosroc"
    const parts = hostname.replace(/^www\./, '').split('.');
    if (parts.length >= 2) {
      // SLD is second-to-last part for ccTLD like .ae, .co.uk
      // For "buy.fosroc.ae" parts = ["buy","fosroc","ae"] → sld = "fosroc"
      const sld = parts[parts.length - 2];
      if (sld && sld.length > 1) {
        return sld.charAt(0).toUpperCase() + sld.slice(1);
      }
    }
  } catch (_) {}
  // 3. Use whatever the scraper found
  return scraperBrand || 'Generic';
}

function pickScraper(url, selectedWebsite) {
  if (selectedWebsite === 'amazon' || (selectedWebsite === 'auto' && url.includes('amazon'))) return amazon;
  if (selectedWebsite === 'noon' || (selectedWebsite === 'auto' && url.includes('noon'))) return noon;
  if (selectedWebsite === 'fosroc' || (selectedWebsite === 'auto' && url.includes('fosroc'))) return fosroc;
  if (selectedWebsite === 'henkel' || (selectedWebsite === 'auto' && (url.includes('henkel') || url.includes('polybit')))) return henkel;
  if (selectedWebsite === 'fepy' || (selectedWebsite === 'auto' && url.includes('fepy'))) return fepy;
  if (selectedWebsite === 'karcher' || (selectedWebsite === 'auto' && url.includes('karcher'))) return karcher;
  return universal;
}

async function scrapeProduct(url, selectedWebsite, config, browser) {
  const scraper = pickScraper(url, selectedWebsite);
  const raw = await scraper.scrapeProduct(url, config, browser);
  const images = extractImages(raw);
  const specs = extractSpecs(raw);
  const desc = extractDescription(raw);
  const cleaned = {
    url,
    title: cleanTitle(raw.title || raw.name || ''),
    name: raw.name || raw.title || '',
    price: raw.price || raw.regular_price || '',
    salePrice: raw.salePrice || raw.sale_price || '',
    image: images.main || raw.image || raw.mainImage || '',
    galleryImages: images.gallery || raw.galleryImages || raw.images || [],
    description: cleanDescription(desc || raw.description || ''),
    specs: cleanSpecs(specs || raw.specs || raw.specifications || {}),
    brand: brandFromUrl(url, raw.brand || ''),
    category: raw.category || '',
    stock: raw.stock || raw.stockStatus || '',
    sku: raw.sku || '',
    weight: raw.weight || '',
    dimensions: raw.dimensions || { length: '', width: '', height: '' },
    datasheetUrl: raw.datasheetUrl || raw.datasheet_url || '',
    datasheets: raw.datasheets || raw.documents || [],
    documents: raw.documents || [],
    tabs: raw.tabs || undefined,
    shortDescription: raw.shortDescription || '',
    localDatasheetPath: raw.localDatasheetPath || raw.localDatasheet || '',
    // Preserve local paths for uploaders to use (vital for sites blocking hotlinking like Fosroc)
    localImagePath: raw.localImagePath || '',
    localGalleryPaths: raw.localGalleryPaths || []
  };

  // ── Auto-build descriptionTabs if the scraper didn't provide them ──
  // Noon (and other scrapers) return description + specs + attributes but no tabs object.
  // Build minimal tab HTML so the product page shows real content instead of "Scraped from: URL".
  if (!cleaned.tabs) {
    const autoTabs = {};

    // Overview tab: use description text, converting line-breaks to HTML
    if (cleaned.description && cleaned.description.trim()) {
      const overviewHtml = cleaned.description
        .trim()
        .split(/\n{2,}/)
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n');
      autoTabs.overview = `<div class="ph-product-overview">\n${overviewHtml}\n</div>`;
    }

    // Features/Benefits tab: render attributes as a bullet list
    const attrs = cleaned.attributes || raw.attributes || [];
    if (Array.isArray(attrs) && attrs.length > 0) {
      const items = attrs
        .filter(a => a && a.name)
        .map(a => {
          const val = Array.isArray(a.options)
            ? a.options.join(', ')
            : (a.value || a.options || '');
          return `<li><strong>${a.name}:</strong> ${val}</li>`;
        })
        .join('\n');
      if (items) autoTabs.benefits = `<ul>\n${items}\n</ul>`;
    }

    // Specifications tab: render specs as a two-column table
    const specObj = cleaned.specs || {};
    const specEntries = Object.entries(specObj).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (specEntries.length > 0) {
      const rows = specEntries
        .map(([k, v]) => `<tr><th>${k}</th><td>${Array.isArray(v) ? v.join(', ') : v}</td></tr>`)
        .join('\n');
      autoTabs.specifications = `<table class="ph-specs-table"><tbody>\n${rows}\n</tbody></table>`;
    }

    // Downloads tab: render datasheets/documents as a list of links
    const docs = cleaned.datasheets || [];
    if (Array.isArray(docs) && docs.length > 0) {
      const docItems = docs
        .map(d => `<li><a href="${d.url}" target="_blank" rel="noopener noreferrer">${d.name || d.type || 'Download Document'}</a></li>`)
        .join('\n');
      if (docItems) autoTabs.downloads = `<ul>\n${docItems}\n</ul>`;
    }

    if (Object.keys(autoTabs).length > 0) {
      cleaned.tabs = autoTabs;
    }
  }

  // Always append Downloads to existing tabs if not already present
  if (cleaned.tabs && !cleaned.tabs.downloads) {
    const docs = cleaned.datasheets || [];
    if (Array.isArray(docs) && docs.length > 0) {
      const docItems = docs
        .map(d => `<li><a href="${d.url}" target="_blank" rel="noopener noreferrer">${d.name || d.type || 'Download Document'}</a></li>`)
        .join('\n');
      if (docItems) cleaned.tabs.downloads = `<ul>\n${docItems}\n</ul>`;
    }
  }

  // Always expose tabs under both keys so wordpress.js finds them regardless of which it checks
  if (cleaned.tabs) {
    cleaned.descriptionTabs = cleaned.tabs;
  }

  // ── AUTO-EXTRACT PDF CONTENT ──
  // If a datasheet URL exists, automatically extract and enrich product tabs
  if (cleaned.datasheetUrl || (cleaned.datasheets && cleaned.datasheets.length > 0)) {
    try {
      console.log('\n📄 PDF Auto-Extraction enabled');
      const enriched = await pdfExtractor.enrichProductWithPDFs(cleaned);
      
      // Merge extracted tab content with cleaned data
      if (enriched._pdf_extracted) {
        console.log(`✅ PDF content auto-filled (${enriched._pdf_type.toUpperCase()})`);
        Object.assign(cleaned, enriched);
      }
    } catch (error) {
      console.error('⚠️ PDF auto-extraction skipped:', error.message);
      // Continue anyway - PDF extraction is optional enhancement
    }
  }

  return { raw, cleaned };
}

module.exports = {
  scrapeProduct
};
