const fepy = require('./scraper/fepy');
const orchestrator = require('./scraper/unified/orchestrator');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

(async () => {
    const FEPY_URL = 'https://www.fepy.com/aluminium-extention-stick-3-mtr-tower';
    
    let browser = null;
    
    try {
        // Launch browser once for reuse
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        console.log('🔍 Scraping FEPY product: ' + FEPY_URL);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Step 1: Raw scrape from FEPY
        console.log('📥 Step 1: Raw Data Extraction...');
        const rawProduct = await fepy.scrapeProduct(FEPY_URL, {}, browser);
        
        console.log('✅ Raw Data Extracted:');
        console.log('   Title:', rawProduct.name);
        console.log('   Price:', rawProduct.price);
        console.log('   Brand:', rawProduct.brand || 'N/A');
        console.log('   Category:', rawProduct.category || 'N/A');
        console.log('   Description Length:', (rawProduct.description || '').length + ' chars');
        console.log('   Gallery Images:', rawProduct.galleryImages ? rawProduct.galleryImages.length : 0);
        console.log('   Specs Found:', rawProduct.specs ? rawProduct.specs.length : 0);
        console.log('   Attributes Found:', rawProduct.attributes ? rawProduct.attributes.length : 0);
        console.log('   Tabs Found:', rawProduct.tabs ? Object.keys(rawProduct.tabs).length : 0);
        if (rawProduct.tabs) {
            console.log('   Tab Types:', Object.keys(rawProduct.tabs).join(', '));
        }
        console.log('   Features:', rawProduct.features ? rawProduct.features.length : 0);

        // Step 2: Process through orchestrator (Clean + SEO + Map + Format)
        console.log('\n📦 Step 2: Processing Through Orchestrator...');
        console.log('   - Cleaning data');
        console.log('   - Adding SEO metadata');
        console.log('   - Formatting HTML tabs');
        console.log('   - Mapping attributes');
        
        const requireModules = {
            universal: require('./scraper/universal'),
            amazon: require('./scraper/amazon'),
            noon: require('./scraper/noon'),
            fosroc: require('./scraper/fosroc'),
            fepy: require('./scraper/fepy'),
            karcher: require('./scraper/karcher'),
        };

        let processProgress = [];
        const processed = await orchestrator.processSingle({
            url: FEPY_URL,
            selectedWebsite: 'fepy',
            config: { headless: true },
            browser,
            scrapeModules: requireModules,
            onProgress: (step, detail) => {
                processProgress.push(step);
                console.log(`   ✓ ${step}`);
            }
        });

        console.log('\n✅ Processing Complete!');

        // Step 3: Prepare product details for the tab
        console.log('\n📋 Step 3: Preparing Product Details Tab Data...');

        const productDetailsTab = {
            // Basic Info
            title: processed.cleaned?.title || processed.title || '',
            sku: processed.cleaned?.sku || '',
            price: processed.cleaned?.price || '',
            brand: processed.cleaned?.brand || '',
            category: processed.cleaned?.category || '',
            
            // Descriptions
            shortDescription: processed.seoData?.shortDescription || '',
            longDescription: processed.seoData?.longDescription || '',
            metaDescription: processed.seoData?.metaDescription || '',
            
            // Media
            mainImage: processed.cleaned?.image || processed.cleaned?.localImagePath || '',
            galleryImages: processed.cleaned?.galleryImages || [],
            localGalleryPaths: processed.cleaned?.localGalleryPaths || [],
            
            // Product Info
            weight: processed.cleaned?.weight || '',
            dimensions: processed.cleaned?.dimensions || {},
            stock: processed.cleaned?.stock || '',
            
            // Specifications & Attributes
            specifications: processed.cleaned?.specs || {},
            attributes: processed.cleaned?.attributes || [],
            variations: processed.cleaned?.variations || [],
            features: processed.cleaned?.features || [],
            
            // SEO & Content
            slug: processed.seoData?.slug || '',
            focusKeywords: processed.seoData?.focusKeywords || '',
            ogTitle: processed.seoData?.ogTitle || '',
            ogDescription: processed.seoData?.ogDescription || '',
            
            // Tabs with Formatted HTML
            tabs: {
                productDetails: processed.cleaned?.tabs?.productDetailsHtml || '',
                benefits: processed.cleaned?.tabs?.benefitsHtml || '',
                specifications: processed.cleaned?.tabs?.specificationsHtml || '',
                applications: processed.cleaned?.tabs?.applicationHtml || '',
                faq: processed.cleaned?.tabs?.faqHtml || '',
                suitableFor: processed.cleaned?.tabs?.suitableForHtml || '',
                estimating: processed.cleaned?.tabs?.estimatingHtml || '',
                attachments: processed.cleaned?.tabs?.attachmentsHtml || '',
                reviews: processed.cleaned?.tabs?.reviewsHtml || '',
            },
            
            // Documents
            datasheetUrl: processed.cleaned?.datasheetUrl || '',
            documents: processed.cleaned?.documents || [],
            
            // Additional
            sourceUrl: FEPY_URL,
            processedAt: new Date().toISOString(),
            source: 'FEPY'
        };

        // Remove empty tabs
        Object.keys(productDetailsTab.tabs).forEach(key => {
            if (!productDetailsTab.tabs[key]) {
                delete productDetailsTab.tabs[key];
            }
        });

        // Step 4: Save the complete product data
        console.log('\n💾 Step 4: Saving Product Data...');
        
        const outputDir = path.join(__dirname, 'scraped_data', 'fepy_products');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate filename from product title
        const fileName = (rawProduct.name || 'product')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') + '.json';
        
        const outputPath = path.join(outputDir, fileName);
        fs.writeFileSync(outputPath, JSON.stringify(productDetailsTab, null, 2));

        console.log('   ✓ Main product file: ' + fileName);
        console.log('   ✓ Location: ' + outputPath);

        // Also save the full raw processed data
        const fullDataPath = path.join(outputDir, fileName.replace('.json', '_full.json'));
        fs.writeFileSync(fullDataPath, JSON.stringify(processed, null, 2));
        console.log('   ✓ Full data file: ' + fileName.replace('.json', '_full.json'));

        // Step 5: Display summary
        console.log('\n📊 PRODUCT DETAILS TAB SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Title:', productDetailsTab.title);
        console.log('Price:', productDetailsTab.price);
        console.log('Brand:', productDetailsTab.brand);
        console.log('Category:', productDetailsTab.category);
        console.log('SKU:', productDetailsTab.sku);
        console.log('');
        console.log('Description Lengths:');
        console.log('  - Short: ', productDetailsTab.shortDescription.length + ' chars');
        console.log('  - Long: ', productDetailsTab.longDescription.length + ' chars');
        console.log('');
        console.log('Media:');
        console.log('  - Main Image: ', productDetailsTab.mainImage ? '✓ Available' : '✗ None');
        console.log('  - Gallery Images: ', productDetailsTab.galleryImages.length + ' images');
        console.log('  - Local Paths: ', productDetailsTab.localGalleryPaths.length + ' downloaded');
        console.log('');
        console.log('Product Content:');
        console.log('  - Specifications: ', Object.keys(productDetailsTab.specifications).length + ' specs');
        console.log('  - Attributes: ', productDetailsTab.attributes.length + ' attributes');
        console.log('  - Variations: ', productDetailsTab.variations.length + ' variations');
        console.log('  - Features: ', productDetailsTab.features.length + ' features');
        console.log('');
        console.log('HTML Tabs Ready for WooCommerce:');
        Object.keys(productDetailsTab.tabs).forEach(tabName => {
            const tabContent = productDetailsTab.tabs[tabName];
            const contentLength = tabContent ? tabContent.length : 0;
            console.log('  ✓ ' + tabName + ': ' + contentLength + ' chars');
        });
        console.log('');
        console.log('SEO Data:');
        console.log('  - Slug: ', productDetailsTab.slug);
        console.log('  - Meta Description: ', productDetailsTab.metaDescription.substring(0, 50) + '...');
        console.log('');
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ COMPLETE! Product details ready to upload to WordPress/WooCommerce');
        console.log('');
        console.log('📝 NEXT STEPS:');
        console.log('1. Review the JSON file in: ' + outputPath);
        console.log('2. Use wordpressUpload.js to push to your store');
        console.log('3. Or manually fill WP admin with the tab data above');
        console.log('');

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
            console.log('🔌 Browser closed');
        }
    }
})();
