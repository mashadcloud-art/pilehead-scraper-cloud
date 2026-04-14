const axios = require('axios');
const pdfParse = require('pdf-parse');

/**
 * 🚀 Automatic PDF Extractor & Content Categorizer
 * Extracts text from PDFs, categorizes into product tabs, generates HTML
 * 
 * Usage:
 *   const enriched = await pdfExtractor.enrichProductWithPDFs(product);
 *   // Returns product with tab HTML fields filled
 */
class ScraperPDFExtractor {
  constructor() {
    this.extractionLog = [];
    this.keywords = {
      specifications: ['spec', 'technical', 'property', 'appearance', 'density', 'viscosity', 'strength', 'cure', 'astm', 'bs', 'iso', 'standard', 'grade', 'quality'],
      features: ['feature', 'benefit', 'advantage', 'excellent', 'superior', 'resistant', 'easy', 'fast', 'unique', 'special', 'high', 'low', 'improved'],
      applications: ['application', 'suitable', 'ideal for', 'use for', 'concrete', 'masonry', 'repair', 'anchor', 'grout', 'inject', 'bond', 'seal'],
      estimating: ['consumption', 'coverage', 'kg/m', 'l/m', 'yield', 'coverage rate', 'thickness', 'spread', 'per meter', 'per square'],
      delivery: ['pack', 'container', 'delivery', 'storage', 'shelf life', 'bucket', 'carton', 'pallet', 'litre', 'bag', 'box', 'unit'],
      faqs: ['question', 'faq', 'how', 'when', 'why', 'can i', 'what is', 'frequently', 'commonly', 'asked']
    };
  }

  deriveKeyFacts(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const facts = [];

    const mmRange = text && text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:to|–|-)\s*([0-9]+(?:\.[0-9]+)?)\s*mm/i);
    if (mmRange) facts.push(`Gap width: ${mmRange[1]}–${mmRange[2]} mm`);

    if (/(solvent[\s-]*free)\s+(epoxy\s+resin\s+grout|epoxy\s+grout)/i.test(text || '')) {
      facts.push('Type: Solvent-free epoxy resin grout');
    }

    if (/consisting\s+of\s+base\s+and\s+hardener/i.test(text || '')) {
      facts.push('System: Base + hardener (whole pack mixing)');
    }

    const cs = text && text.match(/compressive\s+strength[^.]{0,80}greater\s+than\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (cs) facts.push(`Compressive strength (7 days): > ${cs[1]}`);

    const ts = text && text.match(/tensile\s+strength[^.]{0,80}greater\s+than\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (ts) facts.push(`Tensile strength (7 days): > ${ts[1]}`);

    const fs = text && text.match(/flexural\s+strength[^.]{0,80}greater\s+than\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (fs) facts.push(`Flexural strength (7 days): > ${fs[1]}`);

    if (/chemical\s+resist/i.test(t)) facts.push('Chemical resistance: Good');

    return [...new Set(facts)];
  }

  /**
   * Extract plain text from PDF URL
   */
  async extractPDFText(pdfUrl) {
    try {
      console.log(`  ⬇️  Downloading from: ${pdfUrl}`);
      
      const response = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const data = await pdfParse(response.data);
      
      return {
        success: true,
        text: data.text,
        pages: data.numpages,
        metadata: data.metadata
      };
    } catch (error) {
      console.error(`  ❌ PDF text extraction failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect PDF type (TDS, SDS, MS) from URL and metadata
   */
  detectPDFType(url, metadata = {}) {
    const combined = `${url} ${metadata.title || ''} ${metadata.subject || ''}`.toLowerCase();

    if (combined.includes('tds') || combined.includes('technical data sheet') || combined.includes('datasheet')) {
      return 'tds';
    }
    if (combined.includes('sds') || combined.includes('msds') || combined.includes('safety data sheet')) {
      return 'sds';
    }
    if (combined.includes('ms') && combined.includes('method')) {
      return 'ms';
    }
    return 'auto';
  }

  /**
   * Categorize text content using keyword matching
   */
  categorizeContent(text) {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    const categories = {
      specifications: [],
      features: [],
      applications: [],
      estimating: [],
      delivery: [],
      faqs: [],
      unknown: []
    };

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      let matched = false;

      // Check each category
      for (const [category, keywords] of Object.entries(this.keywords)) {
        if (keywords.some(kw => lowerLine.includes(kw))) {
          categories[category].push(line.trim());
          matched = true;
          break;
        }
      }

      if (!matched) {
        categories.unknown.push(line);
      }
    }

    return categories;
  }

  /**
   * Generate HTML for each category
   */
  convertToTabHTML(categorized) {
    const specifications = this.renderSpecifications(categorized.specifications);
    const benefits = this.renderFeatures(categorized.features);
    const applications = this.renderApplications(categorized.applications);
    const estimating = this.renderEstimating(categorized.estimating);
    const delivery = this.renderDelivery(categorized.delivery);
    const faqs = this.renderFAQs(categorized.faqs);

    return {
      tabs: {
        specifications,
        benefits,
        applications,
        estimating,
        delivery,
        faqs
      },
      descriptionTabs: {
        specificationsHtml: specifications,
        benefitsHtml: benefits,
        applicationsHtml: applications,
        estimatingHtml: estimating,
        deliveryHtml: delivery,
        faqsHtml: faqs
      }
    };
  }

  // ────── Rendering Methods ──────

  renderSpecifications(specs) {
    if (!specs || specs.length === 0) {
      return '';
    }

    const rows = specs.slice(0, 14).map((spec, i) => {
      const cleaned = String(spec || '').replace(/\s+/g, ' ').trim();
      const parts = cleaned.split(':');
      const label = (parts[0] || '').trim() || `Property ${i + 1}`;
      const value = (parts.slice(1).join(':') || '').trim() || cleaned.substring(0, 80);
      return `<div class="ph-spec-row-new"><span class="ph-spec-lbl">${this.escapeHtml(label)}</span><span class="ph-spec-val">${this.escapeHtml(value)}</span></div>`;
    }).join('');

    return `<div class="ph-spec-grid-new" style="grid-template-columns:repeat(2,1fr)">${rows}</div>`;
  }

  renderFeatures(features) {
    if (!features || features.length === 0) {
      return '';
    }

    const items = features
      .map(f => String(f || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 14)
      .map(feature => `<li>${this.escapeHtml(feature.replace(/^[✓✔☑]\s*/u, ''))}</li>`)
      .join('');

    return `<ul>${items}</ul>`;
  }

  renderApplications(apps) {
    if (!apps || apps.length === 0) {
      return '';
    }

    const emojis = ['🏗️', '🔩', '🧱', '🛣️', '⚓', '🌊', '🧰', '🧪'];
    const items = apps
      .map(a => String(a || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((app, i) => `
        <div class="ph-app-card-new">
          <div class="ph-app-icon-new">${emojis[i] || '🏗️'}</div>
          <div class="ph-app-name-new">${this.escapeHtml(app.substring(0, 60))}</div>
          <div class="ph-app-type-new">Application</div>
        </div>
      `).join('');

    return `<div class="ph-app-grid-new">${items}</div>`;
  }

  renderEstimating(estimating) {
    if (!estimating || estimating.length === 0) {
      return '';
    }

    const lines = estimating
      .map(e => String(e || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 12);

    // Output as plain text lines "Label: Value" so the Woo template can re-render into cards
    // matching the current tab design.
    return lines.map(l => this.escapeHtml(l)).join('\n');
  }

  renderDelivery(delivery) {
    if (!delivery || delivery.length === 0) {
      return '';
    }

    const items = delivery.slice(0, 5).map(item => `
      <li class="ph-delivery-item">
        <span class="ph-delivery-icon">📦</span>
        <span class="ph-delivery-text">${item.substring(0, 80)}</span>
      </li>
    `).join('');

    return `<ul class="ph-delivery-list">${items}</ul>`;
  }

  renderFAQs(faqs) {
    if (!faqs || faqs.length === 0) {
      return '';
    }

    // Keep as simple <ul><li> list. Actual FAQ UI/SEO is handled on the WP side.
    const items = faqs
      .map(f => String(f || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 10)
      .map(f => `<li>${this.escapeHtml(f.substring(0, 140))}</li>`)
      .join('');

    return `<ul>${items}</ul>`;
  }

  escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ────── Main Orchestrator ──────

  /**
   * Complete extraction workflow
   */
  async extractAndEnrich(product, pdfUrl) {
    try {
      console.log(`\n📄 Auto-extracting PDF content: ${pdfUrl}`);
      
      // Step 1: Extract PDF text
      console.log(`  1️⃣ Extracting text from PDF...`);
      const extracted = await this.extractPDFText(pdfUrl);
      
      if (!extracted.success) {
        console.error(`     ❌ Extraction failed: ${extracted.error}`);
        return product; // Return unchanged
      }
      
      console.log(`     ✅ Extracted ${extracted.pages} pages`);

      // Step 2: Detect PDF type
      const pdfType = this.detectPDFType(pdfUrl, extracted.metadata);
      console.log(`     📄 Detected type: ${pdfType.toUpperCase()}`);

      // Step 3: Categorize content
      console.log(`  2️⃣ Categorizing content...`);
      const categorized = this.categorizeContent(extracted.text);
      const totalLines = Object.values(categorized).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`     ✅ Categorized ${totalLines} lines into 6 tabs`);

      const keyFacts = this.deriveKeyFacts(extracted.text);
      if (keyFacts.length) {
        categorized.specifications = [...keyFacts, ...(categorized.specifications || [])];
      }

      // Step 4: Generate HTML
      console.log(`  3️⃣ Generating HTML...`);
      const tabHTML = this.convertToTabHTML(categorized);
      console.log(`  4️⃣ Adding to product tabs...`);

      // Step 5: Merge into product
      const filledCount = Object.values(tabHTML.descriptionTabs || {}).filter(html => typeof html === 'string' && html.length > 50).length;
      
      const enriched = {
        ...product,
        ...tabHTML,
        _pdf_extracted: true,
        _pdf_source: pdfUrl,
        _pdf_type: pdfType,
        _pdf_filled_tabs: filledCount
      };

      console.log(`     ✅ Added ${filledCount} tab fields (${Object.keys(tabHTML).join(', ')})`);
      
      // Log this extraction
      this.extractionLog.push({
        timestamp: new Date().toISOString(),
        productId: product.id || 'unknown',
        pdfUrl: pdfUrl,
        success: true,
        type: pdfType,
        tabsFilled: filledCount
      });

      return enriched;
    } catch (error) {
      console.error(`  ❌ Error during PDF enrichment: ${error.message}`);
      
      this.extractionLog.push({
        timestamp: new Date().toISOString(),
        productId: product.id || 'unknown',
        pdfUrl: pdfUrl,
        success: false,
        error: error.message
      });

      return product; // Return unchanged on error
    }
  }

  /**
   * Main entry point for scraper
   * Checks if product has datasheet URL and enriches if found
   */
  async enrichProductWithPDFs(product) {
    // Check if product has a datasheet URL
    if (!product.datasheetUrl && (!product.datasheets || product.datasheets.length === 0)) {
      return product; // No datasheet, return unchanged
    }

    // Get datasheet URL (prefer direct URL, fall back to array)
    const pdfUrl = product.datasheetUrl || (product.datasheets && product.datasheets[0]?.url);
    
    if (!pdfUrl) {
      return product;
    }

    // Extract and enrich
    return await this.extractAndEnrich(product, pdfUrl);
  }

  /**
   * Get extraction log for debugging
   */
  getLog() {
    return this.extractionLog;
  }

  /**
   * Clear extraction log
   */
  clearLog() {
    this.extractionLog = [];
  }
}

// Export as singleton
module.exports = new ScraperPDFExtractor();
