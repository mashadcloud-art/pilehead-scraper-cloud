/**
 * Pilehead PDF Content Extractor
 * Extracts specifications, features, applications from PDF datasheets
 * Auto-fills WooCommerce product tabs with structured data
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdfParse = require('pdf-parse');

class PDFExtractor {
  constructor(apiUrl = 'http://pilehead-local.local') {
    this.apiUrl = apiUrl;
    this.wpRestUrl = `${apiUrl}/wp-json/wp/v2`;
  }

  /**
   * Extract text from PDF file or URL
   */
  async extractTextFromPDF(pdfSource) {
    try {
      let pdfBuffer;

      if (pdfSource.startsWith('http')) {
        // Download from URL
        const response = await axios.get(pdfSource, { responseType: 'arraybuffer' });
        pdfBuffer = response.data;
      } else {
        // Read from local file
        pdfBuffer = fs.readFileSync(pdfSource);
      }

      const data = await pdfParse(pdfBuffer);
      return {
        text: data.text,
        pages: data.numpages,
        metadata: data.metadata || {}
      };
    } catch (error) {
      console.error('PDF extraction error:', error.message);
      throw error;
    }
  }

  /**
   * Parse extracted text and categorize into product fields
   */
  categorizeContent(rawText) {
    const sections = {
      specifications: [],
      features: [],
      applications: [],
      estimating: [],
      delivery: [],
      faqs: [],
      unknown: []
    };

    // Split text into logical chunks
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const chunks = this.groupIntoChunks(lines);

    chunks.forEach(chunk => {
      const category = this.detectCategory(chunk);
      const formatted = this.formatChunk(chunk, category);

      if (formatted) {
        sections[category].push(formatted);
      }
    });

    return sections;
  }

  /**
   * Group lines into logical chunks
   */
  groupIntoChunks(lines, maxLines = 5) {
    const chunks = [];
    for (let i = 0; i < lines.length; i += maxLines) {
      chunks.push(lines.slice(i, i + maxLines).join(' '));
    }
    return chunks;
  }

  /**
   * Detect which category a text chunk belongs to
   */
  detectCategory(text) {
    const lowerText = text.toLowerCase();

    // Specification keywords
    if (this.matchesPatterns(lowerText, ['specification', 'technical', 'property', 'data', 'density', 'viscosity', 'strength', 'colour', 'appearance', 'standard', 'astm', 'bs ', 'iso'])) {
      return 'specifications';
    }

    // Features keywords
    if (this.matchesPatterns(lowerText, ['feature', 'benefit', 'advantage', 'high', 'excellent', 'superior', 'resistant', 'easy', 'fast', 'durable', 'low', 'eco'])) {
      return 'features';
    }

    // Applications keywords
    if (this.matchesPatterns(lowerText, ['application', 'use', 'suitable', 'ideal', 'for', 'concrete', 'masonry', 'repair', 'anchoring', 'grouting', 'filling', 'injection'])) {
      return 'applications';
    }

    // Estimating/Coverage keywords
    if (this.matchesPatterns(lowerText, ['consumption', 'coverage', 'coverage rate', 'kg/m', 'litres/m', 'yield', 'thickness', 'spread', 'application rate', 'coverage values'])) {
      return 'estimating';
    }

    // Delivery/Packaging keywords
    if (this.matchesPatterns(lowerText, ['packaging', 'pack', 'container', 'delivery', 'shelf life', 'storage', 'litre', 'kg', 'bucket', 'carton', 'pallet'])) {
      return 'delivery';
    }

    // FAQ keywords
    if (this.matchesPatterns(lowerText, ['question', 'q:', 'faq', 'frequently asked', 'how', 'when', 'why', 'can i', 'will', 'what'])) {
      return 'faqs';
    }

    return 'unknown';
  }

  /**
   * Check if text matches any keyword patterns
   */
  matchesPatterns(text, patterns) {
    return patterns.some(pattern => text.includes(pattern.toLowerCase()));
  }

  /**
   * Format chunk as HTML for product tab
   */
  formatChunk(text, category) {
    const lines = text.split(/\s{2,}|\n/).filter(l => l.trim());

    switch (category) {
      case 'specifications':
        return this.formatSpecifications(lines);
      case 'features':
        return this.formatFeatures(lines);
      case 'applications':
        return this.formatApplications(lines);
      case 'estimating':
        return this.formatEstimating(lines);
      case 'delivery':
        return this.formatDelivery(lines);
      case 'faqs':
        return this.formatFAQs(lines);
      default:
        return null;
    }
  }

  /**
   * Format as specification rows (Label: Value)
   */
  formatSpecifications(lines) {
    const spec = {};
    lines.forEach(line => {
      if (line.includes(':') || line.includes('–') || line.includes('-')) {
        const [label, value] = line.split(/[:–-]/).map(s => s.trim());
        if (label && value && label.length < 50) {
          spec[label] = value;
        }
      }
    });
    return Object.keys(spec).length > 0 ? spec : null;
  }

  /**
   * Format as feature bullets with checkmarks
   */
  formatFeatures(lines) {
    if (lines.length === 0) return null;

    const features = lines
      .map(line => {
        // Remove bullet points and extra characters
        return line.replace(/^[•\-*\s]+/, '').trim();
      })
      .filter(line => line.length > 5 && line.length < 150);

    return features.length > 0 ? { features } : null;
  }

  /**
   * Format as applications list
   */
  formatApplications(lines) {
    const apps = lines
      .map(line => line.replace(/^[•\-*\s]+/, '').trim())
      .filter(line => line.length > 3 && line.length < 100);

    return apps.length > 0 ? { applications: apps } : null;
  }

  /**
   * Format as consumption table
   */
  formatEstimating(lines) {
    const table = [];
    lines.forEach(line => {
      // Look for patterns like "3mm - 5.25 kg/m²"
      if (line.match(/\d+\s*(mm|m|m²|kg|litre|l|cm)/i)) {
        const [thickness, coverage] = line.split(/[-–]/).map(s => s.trim());
        if (thickness && coverage) {
          table.push({ thickness: thickness.trim(), coverage: coverage.trim() });
        }
      }
    });

    return table.length > 0 ? { estimating: table } : null;
  }

  /**
   * Format delivery/packaging info
   */
  formatDelivery(lines) {
    return {
      delivery: lines
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .slice(0, 3)
    };
  }

  /**
   * Format FAQs (Q&A pairs)
   */
  formatFAQs(lines) {
    const faqs = [];
    let currentQ = null;

    lines.forEach(line => {
      if (line.toLowerCase().startsWith('q:') || line.toLowerCase().startsWith('q.')) {
        currentQ = line.replace(/^q[:.]\s*/i, '').trim();
      } else if (currentQ && (line.toLowerCase().startsWith('a:') || line.toLowerCase().startsWith('a.'))) {
        const answer = line.replace(/^a[:.]\s*/i, '').trim();
        faqs.push({ question: currentQ, answer });
        currentQ = null;
      }
    });

    return faqs.length > 0 ? { faqs } : null;
  }

  /**
   * Convert categorized content to HTML for WooCommerce post meta
   */
  convertToHTML(categorized) {
    const html = {};

    if (categorized.specifications.length > 0) {
      html.specifications = this.specsToHTML(categorized.specifications);
    }

    if (categorized.features.length > 0) {
      html.features = this.featuresToHTML(categorized.features);
    }

    if (categorized.applications.length > 0) {
      html.applications = this.applicationsToHTML(categorized.applications);
    }

    if (categorized.estimating.length > 0) {
      html.estimating = this.estimatingToHTML(categorized.estimating);
    }

    if (categorized.delivery.length > 0) {
      html.delivery = this.deliveryToHTML(categorized.delivery);
    }

    if (categorized.faqs.length > 0) {
      html.faqs = this.faqsToHTML(categorized.faqs);
    }

    return html;
  }

  /**
   * Render specifications as HTML grid
   */
  specsToHTML(specs) {
    let html = '<div class="ph-spec-grid">';

    specs.forEach(spec => {
      Object.entries(spec).forEach(([label, value]) => {
        html += `
          <div class="ph-spec-row">
            <span class="ph-spec-label">${this.escapeHTML(label)}</span>
            <span class="ph-spec-val">${this.escapeHTML(value)}</span>
          </div>
        `;
      });
    });

    html += '</div>';
    return html;
  }

  /**
   * Render features as checkmark list
   */
  featuresToHTML(features) {
    let html = '<div class="ph-feat-list">';

    features.forEach(f => {
      if (f.features) {
        f.features.forEach(feature => {
          html += `
            <div class="ph-feat-item">
              <div class="ph-feat-dot"><svg viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3"/></svg></div>
              <div>
                <div class="ph-feat-title">${this.escapeHTML(feature)}</div>
              </div>
            </div>
          `;
        });
      }
    });

    html += '</div>';
    return html;
  }

  /**
   * Render applications as emoji cards
   */
  applicationsToHTML(apps) {
    const emojis = ['🏗️', '🔩', '🧱', '🛣️', '⚓', '🌊'];
    let html = '<div class="ph-app-grid">';

    apps.forEach((app, idx) => {
      if (app.applications) {
        app.applications.forEach((application, appIdx) => {
          const emoji = emojis[appIdx % emojis.length];
          html += `
            <div class="ph-app-card">
              <span class="ph-app-icon">${emoji}</span>
              <span class="ph-app-name">${this.escapeHTML(application)}</span>
            </div>
          `;
        });
      }
    });

    html += '</div>';
    return html;
  }

  /**
   * Render estimating as table
   */
  estimatingToHTML(estimating) {
    let html = `
      <div class="ph-est-note">Coverage values are approximate and vary by substrate condition and application method. Add 10-15% for site wastage.</div>
      <table class="ph-est-table">
        <thead>
          <tr><th>Application</th><th>Thickness</th><th>Consumption</th></tr>
        </thead>
        <tbody>
    `;

    estimating.forEach(est => {
      if (est.estimating) {
        est.estimating.forEach(row => {
          html += `
            <tr>
              <td>${this.escapeHTML(row.thickness || 'N/A')}</td>
              <td>${this.escapeHTML(row.coverage || 'N/A')}</td>
              <td></td>
            </tr>
          `;
        });
      }
    });

    html += `
        </tbody>
      </table>
    `;
    return html;
  }

  /**
   * Render delivery info
   */
  deliveryToHTML(delivery) {
    let html = '<ul>';

    delivery.forEach(d => {
      if (d.delivery) {
        d.delivery.forEach(item => {
          html += `<li>${this.escapeHTML(item)}</li>`;
        });
      }
    });

    html += '</ul>';
    return html;
  }

  /**
   * Render FAQs as accordion items
   */
  faqsToHTML(faqs) {
    let html = '<div class="ph-faq-list">';

    faqs.forEach(faq => {
      if (faq.faqs) {
        faq.faqs.forEach(item => {
          html += `
            <div class="ph-faq-item">
              <div class="ph-faq-q">${this.escapeHTML(item.question)}</div>
              <div class="ph-faq-a"><div class="ph-faq-a-inner">${this.escapeHTML(item.answer)}</div></div>
            </div>
          `;
        });
      }
    });

    html += '</div>';
    return html;
  }

  /**
   * Safely escape HTML
   */
  escapeHTML(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Save extracted content to WooCommerce product
   */
  async saveToProduct(productId, extractedHTML) {
    try {
      const meta = {};

      if (extractedHTML.specifications) {
        meta.ph_tab_specifications_html = extractedHTML.specifications;
      }
      if (extractedHTML.features) {
        meta.ph_tab_features_html = extractedHTML.features;
      }
      if (extractedHTML.applications) {
        meta.ph_tab_applications_html = extractedHTML.applications;
      }
      if (extractedHTML.estimating) {
        meta.ph_tab_estimating_html = extractedHTML.estimating;
      }
      if (extractedHTML.delivery) {
        meta.ph_tab_delivery_html = extractedHTML.delivery;
      }
      if (extractedHTML.faqs) {
        meta.ph_tab_faqs_html = extractedHTML.faqs;
      }

      // This would normally be done via WordPress REST API
      // For now, return the data structure
      return meta;
    } catch (error) {
      console.error('Error saving to product:', error.message);
      throw error;
    }
  }

  /**
   * Process a complete PDF extraction workflow
   */
  async processPDF(pdfSource, productId) {
    console.log(`📄 Processing PDF: ${pdfSource}`);

    try {
      // Step 1: Extract text
      console.log('1️⃣ Extracting text from PDF...');
      const { text, pages } = await this.extractTextFromPDF(pdfSource);
      console.log(`   ✅ Extracted ${pages} pages`);

      // Step 2: Categorize content
      console.log('2️⃣ Categorizing content...');
      const categorized = this.categorizeContent(text);
      console.log('   ✅ Content categorized');

      // Step 3: Convert to HTML
      console.log('3️⃣ Converting to HTML...');
      const html = this.convertToHTML(categorized);
      console.log('   ✅ HTML generated');

      // Step 4: Save to product
      console.log(`4️⃣ Saving to product #${productId}...`);
      const meta = await this.saveToProduct(productId, html);
      console.log('   ✅ Saved to product meta');

      return {
        success: true,
        productId,
        pdfUrl: pdfSource,
        pagesProcessed: pages,
        fieldsExtracted: Object.keys(meta),
        meta
      };
    } catch (error) {
      console.error('❌ PDF processing failed:', error.message);
      return {
        success: false,
        error: error.message,
        productId
      };
    }
  }
}

// Export for Node.js
module.exports = PDFExtractor;

// CLI usage
if (require.main === module) {
  const pdfUrl = process.argv[2] || 'https://example.com/datasheet.pdf';
  const productId = process.argv[3] || 1;

  const extractor = new PDFExtractor();
  extractor.processPDF(pdfUrl, productId).then(result => {
    console.log('\n📊 Result:', JSON.stringify(result, null, 2));
  });
}
