const path = require('path');
const fs = require('fs');
const helpers = require('../helpers');
const cleaner = require('./cleaner');

const mapper = require('./mapper');
const preparer = require('./preparer');
const uploader = require('./uploader');

/**
 * Orchestrates the full end-to-end workflow for a single product URL
 * Scrape → Clean → SEO → Map → Prepare → Upload → Backup
 */
async function processSingle({ url, selectedWebsite, config, browser, scrapeModules, onProgress }) {
  const progress = (step, detail) => {
    if (typeof onProgress === 'function') onProgress(step, detail);
  };
  const STEPS = {
    SCRAPING: 'Scraping',
    CLEANING: 'Cleaning',
    SEO: 'SEO',
    TABS: 'Tabs',
    MAPPING: 'Mapping',
    PREPARE: 'Preparing',
    UPLOADING: 'Uploading',
    COMPLETED: 'Completed'
  };

  progress(STEPS.SCRAPING, { url });
  // 1) Scrape using existing per-site modules
  let scraperModule = scrapeModules.universal;
  try {
    if (selectedWebsite === 'amazon' || (selectedWebsite === 'auto' && url.includes('amazon'))) scraperModule = scrapeModules.amazon;
    else if (selectedWebsite === 'noon' || (selectedWebsite === 'auto' && url.includes('noon'))) scraperModule = scrapeModules.noon;
    else if (selectedWebsite === 'fosroc' || (selectedWebsite === 'auto' && url.includes('fosroc'))) scraperModule = scrapeModules.fosroc;
    else if (selectedWebsite === 'fepy' || (selectedWebsite === 'auto' && url.includes('fepy'))) scraperModule = scrapeModules.fepy;
    else if (selectedWebsite === 'karcher' || (selectedWebsite === 'auto' && url.includes('karcher'))) scraperModule = scrapeModules.karcher;
  } catch (_) {}

  const raw = await scraperModule.scrapeProduct(url, config, browser);

  // Normalize core fields
  const base = {
    url,
    title: raw.title || raw.name || '',
    name: raw.name || raw.title || '',
    price: raw.price || raw.regular_price || '',
    salePrice: raw.salePrice || raw.sale_price || '',
    image: raw.image || raw.mainImage || '',
    localImagePath: raw.localImagePath || '',
    galleryImages: Array.isArray(raw.galleryImages) ? raw.galleryImages : (Array.isArray(raw.images) ? raw.images : []),
    localGalleryPaths: Array.isArray(raw.localGalleryPaths) ? raw.localGalleryPaths : [],
    description: raw.description || '',
    specs: raw.specs || raw.specifications || {},
    brand: raw.brand || '',
    category: raw.category || '',
    stock: raw.stock || raw.stockStatus || '',
    sku: raw.sku || '',
    weight: raw.weight || '',
    dimensions: raw.dimensions || { length: '', width: '', height: '' },
    datasheetUrl: raw.datasheetUrl || '',
    localDatasheetPath: raw.localDatasheetPath || '',
    datasheets: Array.isArray(raw.datasheets) ? raw.datasheets : [],
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    tabs: raw.tabs || {}
  };

  // 2) Clean & normalize
  progress(STEPS.CLEANING, { title: base.title });
  const cleaned = {
    ...base,
    title: cleaner.cleanTitle(base.title),
    description: cleaner.cleanDescription(base.description),
    specs: cleaner.cleanSpecs(base.specs)
  };

  progress(STEPS.SEO, { title: cleaned.title });

  const seoData = {
      title: cleaned.title,
      metaDescription: cleaned.description ? cleaned.description.substring(0, 160) : '',
      focusKeywords: '',
      ogTitle: cleaned.title,
      ogDescription: cleaned.description ? cleaned.description.substring(0, 160) : '',
      slug: cleaned.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      schemaJson: '',
      shortDescription: cleaned.description ? cleaned.description.substring(0, 160) : '',
      longDescription: cleaned.description || '',
      seoScore: 0,
      seoIssues: [],
      tags: []
  };

  progress(STEPS.TABS, { title: cleaned.title });

  // Helper: build specs table HTML from a specs object
  const _specsToHtml = (specObj) => {
    if (!specObj || typeof specObj !== 'object') return '';
    const entries = Object.entries(specObj).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (!entries.length) return '';
    const rows = entries.map(([k, v]) => `<tr><th>${k}</th><td>${Array.isArray(v) ? v.join(', ') : v}</td></tr>`).join('\n');
    return `<table class="ph-specs-table"><tbody>\n${rows}\n</tbody></table>`;
  };

  // Helper: build attributes/features bullet list
  const _attrsToHtml = (attrs) => {
    if (!Array.isArray(attrs) || !attrs.length) return '';
    const items = attrs
      .filter(a => a && a.name)
      .map(a => {
        const val = Array.isArray(a.options) ? a.options.join(', ') : (a.value || a.options || '');
        return `<li><strong>${a.name}:</strong> ${val}</li>`;
      }).join('\n');
    return items ? `<ul>\n${items}\n</ul>` : '';
  };

  const _overviewHtml = (text) => {
    if (!text || !text.trim()) return '';
    return '<div class="ph-product-overview">\n' +
      text.trim().split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n') +
      '\n</div>';
  };

  // AI-ENHANCED TAB EXTRACTION FROM PDF
  // Extract and combine text from ALL available datasheets (TDS, SDS, MS)
  if (base.datasheets && base.datasheets.length > 0) {
    console.log(`[Tabs] Found ${base.datasheets.length} datasheets for combined AI extraction.`);
    try {
      const pdf = require('pdf-parse');
      let combinedText = '';
      
      for (const ds of base.datasheets) {
        if (ds.localPath && fs.existsSync(ds.localPath)) {
          console.log(`[Tabs] Extracting text from: ${ds.type || 'Document'} (${ds.localPath})`);
          const dataBuffer = fs.readFileSync(ds.localPath);
          const pdfData = await pdf(dataBuffer);
          if (pdfData.text) {
            combinedText += `\n--- DOCUMENT: ${ds.type || 'Technical Data'} ---\n${pdfData.text}\n`;
          }
        }
      }

      if (combinedText && combinedText.length > 100) {
        console.log(`[Tabs] Total combined text length: ${combinedText.length} chars. Running enhanced AI categorization...`);
        
        // 2. Use Gemini/AI to categorize combined text into tabs
        const aiCategorized = await helpers.categorizeProductText(combinedText, base.title);
        
        if (aiCategorized && typeof aiCategorized === 'object') {
          console.log(`[Tabs] AI successfully categorized content into: ${Object.keys(aiCategorized).join(', ')}`);
          // Merge AI content into raw.tabs
          raw.tabs = { ...aiCategorized, ...raw.tabs };
        }
      }
    } catch (err) {
      console.error(`[Tabs] AI PDF combined extraction failed: ${err.message}`);
    }
  }

  // 1. Detect source for specific detail tabs
  const sourceLabel = (selectedWebsite === 'auto' || !selectedWebsite) 
    ? (url.includes('amazon') ? 'Amazon' : 
       url.includes('noon') ? 'Noon' : 
       url.includes('fosroc') ? 'Fosroc' : 
       url.includes('fepy') ? 'Fepy' : 
       url.includes('karcher') ? 'Karcher' : 'Other')
    : (selectedWebsite.charAt(0).toUpperCase() + selectedWebsite.slice(1));

  const tabs = {
    descriptionHtml:    (cleaned.tabs && (cleaned.tabs.overviewHtml || cleaned.tabs.overview)) ||
                        _overviewHtml(cleaned.description) ||
                        cleaned.description || '',
    benefitsHtml:       (cleaned.tabs && (cleaned.tabs.benefitsHtml || cleaned.tabs.benefits)) ||
                        _attrsToHtml(cleaned.attributes || raw.attributes || []),
    specificationsHtml: (cleaned.tabs && (cleaned.tabs.specificationsHtml || cleaned.tabs.specifications)) ||
                        _specsToHtml(cleaned.specs),
    applicationHtml:    (cleaned.tabs && (cleaned.tabs.applicationsHtml || cleaned.tabs.applicationHtml)) || '',
    faqsHtml:           (cleaned.tabs && (cleaned.tabs.faqHtml || cleaned.tabs.faqs)) || '',
    reviewsHtml:        (cleaned.tabs && (cleaned.tabs.reviewsHtml || cleaned.tabs.reviews)) || '',
    deliveryHtml:       (cleaned.tabs && (cleaned.tabs.deliveryHtml || cleaned.tabs.delivery)) || ''
  };

  // 2. Add source-specific detail tab (Combined Details)
  const sourceKey = `${sourceLabel.toLowerCase()}DetailsHtml`;
  
  // Build a single, comprehensive HTML block that includes all parts from the source
  let combinedSourceDetails = '';
  
  if (tabs.descriptionHtml) combinedSourceDetails += `<h3>Product Overview</h3>\n${tabs.descriptionHtml}\n`;
  if (tabs.benefitsHtml) combinedSourceDetails += `<h3>Key Features & Benefits</h3>\n${tabs.benefitsHtml}\n`;
  if (tabs.specificationsHtml) combinedSourceDetails += `<h3>Technical Specifications</h3>\n${tabs.specificationsHtml}\n`;
  if (tabs.applicationHtml) combinedSourceDetails += `<h3>Application Guide</h3>\n${tabs.applicationHtml}\n`;
  if (tabs.faqsHtml) combinedSourceDetails += `<h3>Frequently Asked Questions</h3>\n${tabs.faqsHtml}\n`;
  if (cleaned.tabs && cleaned.tabs.suitableForHtml) combinedSourceDetails += `<h3>Suitable For</h3>\n${cleaned.tabs.suitableForHtml}\n`;
  if (cleaned.tabs && cleaned.tabs.estimatingHtml) combinedSourceDetails += `<h3>Estimating & Supply</h3>\n${cleaned.tabs.estimatingHtml}\n`;
  if (cleaned.tabs && cleaned.tabs.attachmentsHtml) combinedSourceDetails += `<h3>Attachments</h3>\n${cleaned.tabs.attachmentsHtml}\n`;
  if (cleaned.tabs && cleaned.tabs.reviewsHtml) combinedSourceDetails += `<h3>Customer Reviews</h3>\n${cleaned.tabs.reviewsHtml}\n`;

  // Put the combined details into the specific source tab
  tabs[sourceKey] = combinedSourceDetails || tabs.descriptionHtml;

  // 3. Global "Fepy" removal from all tab content
  Object.keys(tabs).forEach(key => {
    if (typeof tabs[key] === 'string') {
        tabs[key] = tabs[key].replace(/fepy/gi, '').replace(/\s{2,}/g, ' ').trim();
    }
  });

  seoData.tabs = tabs;

  // 4) Mapping (brand/category/attributes/tags)
  progress(STEPS.MAPPING, { brand: cleaned.brand, category: cleaned.category });
  const mapped = mapper.applyAll(cleaned, seoData, config);

  // 5) Prepare product object for upload
  progress(STEPS.PREPARE, {});
  const prepared = preparer.prepareProductObject(mapped, config, seoData);

  // 6) Upload images and product
  progress(STEPS.UPLOADING, {});
  let uploadResult = {};
  const browserOwned = !browser;
  let localBrowser = browser;
  try {
    if (!localBrowser) {
      localBrowser = await helpers.launchBrowser();
    }
    uploadResult = await uploader.uploadAll(prepared, config, localBrowser);
  } finally {
    if (browserOwned && localBrowser) {
      await localBrowser.close();
    }
  }

  // 7) Save local JSON backup
  const backupDir = path.join(__dirname, '..', '..', 'scraped_data');
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const filePath = path.join(backupDir, `product_${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ raw, cleaned, seoData, mapped, prepared, uploadResult }, null, 2));
  } catch (_) {}

  progress(STEPS.COMPLETED, { productId: uploadResult?.product?.id });

  return {
    raw,
    cleaned,
    seo: seoData,
    mapped,
    prepared,
    uploadResult
  };
}

module.exports = {
  processSingle
};
