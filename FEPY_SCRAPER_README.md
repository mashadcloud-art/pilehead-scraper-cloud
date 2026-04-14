# 🚀 FEPY Complete Product Scraper & Upload System

**For FEPY products only - No changes to FOSROC**

This system scrapes complete FEPY product details and fills your WordPress product details tab with all information.

---

## 📦 What Gets Extracted from FEPY

✅ **Product Information**
- Title, Price, Brand, Category, SKU
- Full & Short Descriptions
- Weight, Dimensions, Stock Status

✅ **Images & Media**
- Main product image
- Complete gallery (up to 6 images)
- All images downloaded locally

✅ **Product Content**
- Specifications table
- Attributes & Variations
- Features list
- Related products

✅ **Advanced Tabs** (Formatted as HTML)
- Features & Benefits
- Key Specifications
- Applications
- Frequently Asked Questions (FAQ)
- Suitable For
- Estimating & Supply
- Attachments
- Ratings & Reviews

✅ **SEO Data**
- Meta descriptions
- Focus keywords
- OG tags
- URL slug
- Schema JSON

---

## 🎯 Quick Start

### Step 1: Run the Scraper

```bash
node scrape_fepy_complete.js
```

**This will:**
1. Scrape the FEPY URL: `https://www.fepy.com/aluminium-extention-stick-3-mtr-tower`
2. Extract ALL product details
3. Download all images locally
4. Format tab content as HTML
5. Save to: `scraped_data/fepy_products/`

**Output files:**
- `aluminium-extention-stick-3-mtr-tower.json` → Clean product data ready for upload
- `aluminium-extention-stick-3-mtr-tower_full.json` → Complete raw data with all fields

### Step 2: Convert to WordPress Format

```bash
node fepy_bulk_upload.js
```

**This will:**
1. Read all FEPY product JSON files
2. Generate WordPress-ready formats:
   - **JSON** - For REST API upload
   - **CSV** - For WordPress bulk import
   - **HTML** - For manual copy-paste

**Output location:** `wp_uploads/`

### Step 3: Upload to WordPress

Choose one method:

#### **Method A: Bulk Import (Easiest)**
```
1. WordPress Admin → All Products → Import
2. Upload: wp_uploads/fepy_products_bulk_import.csv
3. Follow importer prompts
```

#### **Method B: REST API**
```bash
# Using curl or Postman
curl -X POST https://your-store.com/wp-json/wc/v3/products \
  -H "Authorization: Basic <base64-encoded-credentials>" \
  -d @wp_uploads/aluminium-extention-stick-3-mtr-tower_wp.json
```

#### **Method C: Manual Entry**
```
1. Open: wp_uploads/aluminium-extention-stick-3-mtr-tower_wp_manual.html
2. Copy product details
3. Paste into WordPress product editor
```

---

## 📋 File Structure

```
project/
├── scrape_fepy_complete.js      ← Main scraper (FEPY ONLY)
├── fepy_upload_handler.js       ← WordPress format converter
├── fepy_bulk_upload.js          ← Generate upload files
├── fepy_pipeline.js             ← Pipeline orchestrator
│
├── scraped_data/fepy_products/
│   ├── aluminium-extention-stick-3-mtr-tower.json        ← Clean data
│   └── aluminium-extention-stick-3-mtr-tower_full.json   ← Full raw data
│
└── wp_uploads/
    ├── aluminium-extention-stick-3-mtr-tower_wp.json     ← API upload
    ├── aluminium-extention-stick-3-mtr-tower_wp_manual.html ← Manual entry
    └── fepy_products_bulk_import.csv                      ← Bulk import
```

---

## 🔧 Advanced Usage

### Custom FEPY URLs

Edit `scrape_fepy_complete.js`, line 14:
```javascript
const FEPY_URL = 'https://www.fepy.com/your-product-url-here';
```

Then run:
```bash
node scrape_fepy_complete.js
```

### Multiple Products

Create a batch file `scrape_fepy_batch.js`:
```javascript
const fepyScraper = require('./scraper/fepy');
const puppeteer = require('puppeteer-extra');

const urls = [
    'https://www.fepy.com/product-1',
    'https://www.fepy.com/product-2',
    'https://www.fepy.com/product-3'
];

(async () => {
    let browser = await puppeteer.launch();
    for (const url of urls) {
        console.log(`Scraping: ${url}`);
        const product = await fepyScraper.scrapeProduct(url, {}, browser);
        console.log(`✓ ${product.name}`);
    }
    await browser.close();
})();
```

### Include Product in Your Store

After upload, the product will have:

**✅ Product Details Tab Fields (Auto-filled):**
```
Title:          Aluminium Extension Stick 3 MTR Tower
Price:          AED 450.00
Brand:          [Extracted from FEPY]
Category:       [From breadcrumb]
SKU:            [Auto-generated or from FEPY]

Short Desc:     [First 160 characters]
Long Desc:      [Complete product description]

Images:         [6 gallery images from FEPY]
Specs:          [From product spec table]
Attributes:     [Size, Color, etc.]
Variations:     [If available]
```

**✅ Product Tabs (Formatted HTML):**
```
Features & Benefits       [Formatted table]
Key Specifications        [From spec section]
Applications             [Product uses]
FAQ                      [Customer Q&A]
Suitable For             [Product categories]
Estimating & Supply      [Ordering info]
```

---

## 📊 Data Flow Diagram

```
FEPY URL
   ↓
[scrape_fepy_complete.js]
   ├→ Extract raw product data
   ├→ Download images locally
   ├→ Format tab HTML
   ├→ Extract attributes
   └→ Save JSON
      ↓
scraped_data/fepy_products/
   ↓
[fepy_bulk_upload.js]
   ├→ Convert to WP JSON format
   ├→ Generate CSV for bulk import
   └→ Create HTML for manual entry
      ↓
wp_uploads/
   ├→ JSON (REST API)
   ├→ CSV (Bulk Import)
   └→ HTML (Manual Copy-Paste)
      ↓
WordPress Store
   └→ Product Published
```

---

## 🆘 Troubleshooting

### "Cannot find scraper module"
Make sure `scraper/fepy.js` exists and has `scrapeProduct()` function.

### "Browser launch failed"
Install dependencies:
```bash
npm install puppeteer-extra puppeteer-extra-plugin-stealth
```

### "CSV import not working"
Check WordPress import settings:
1. Activate WooCommerce import plugin
2. Ensure CSV file is UTF-8 encoded
3. Try manual API upload instead

### Tags/keywords missing
Edit the clean product JSON file and add tags manually, or they'll be extracted from the product title.

---

## ⚙️ Configuration

### Browser Settings (in scrape_fepy_complete.js)
```javascript
headless: true              // Set to false to see browser
timeout: 60000              // Page load timeout (milliseconds)
downloadImages: true        // Download images locally
```

### WordPress Settings
Update before bulk import in `fepy_bulk_upload.js`:
```javascript
manage_stock: true          // Enable inventory management
stock_quantity: 999         // Default stock amount
```

---

## ✨ Features

✅ **Complete Data Extraction** - Title, price, images, specs, tabs  
✅ **Image Management** - Automatic download and local storage  
✅ **HTML Formatting** - Tab content formatted for WordPress  
✅ **Multiple Upload Methods** - CSV, JSON, HTML, REST API  
✅ **Error Handling** - Graceful fallbacks for missing data  
✅ **FEPY-Only** - No interference with FOSROC products  
✅ **Batch Processing** - Handle multiple products  

---

## 📞 Support

For issues:
1. Check that FEPY website structure hasn't changed
2. Review `scrape_fepy_complete.js` for any CSS selector updates
3. Verify all modules are installed: `npm install`
4. Check browser console for JavaScript errors

---

## 🔐 Important Notes

- ⚠️ **FEPY ONLY** - Scraper specifically tuned for FEPY structure
- 🚫 **FOSROC UNCHANGED** - No modifications to FOSROC scraper
- 📦 **Images Downloaded** - All images stored in `local_paths`
- 🔄 **Idempotent** - Can re-run scraper without side effects
- 💾 **Offline Capable** - Works without WordPress initially

---

**Happy scraping! Your FEPY products will be fully imported with complete details. 🎉**
