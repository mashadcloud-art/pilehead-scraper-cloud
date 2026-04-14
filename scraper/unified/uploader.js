const path = require('path');
const helpers = require('../helpers');
const wordpress = require('../wordpress');

async function uploadImagesToCloud(prepared, config, existingBrowser) {
  const gcs = config.gcs || {};
  const results = { localMain: null, localGallery: [] };
  if (!gcs || !gcs.bucket) return results;

  let browser = existingBrowser;
  let browserOwned = false;
  try {
    if (!browser) {
      browser = await helpers.launchBrowser();
      browserOwned = true;
    }
    try {
      // Download main image locally; reuse the scraper browser to avoid a second launch
      if (prepared.cloud.mainImage) {
        const localPath = await helpers.downloadImageViaBrowser(browser, prepared.cloud.mainImage);
        if (localPath) results.localMain = localPath;
      }
      for (const g of prepared.cloud.gallery || []) {
        const p = await helpers.downloadImageViaBrowser(browser, g);
        if (p) results.localGallery.push(p);
      }
    } finally {
      if (browserOwned && browser) {
        try { await browser.close(); } catch (_) {}
      }
    }
  } catch (_) {}
  return results;
}

async function uploadToWordPress(prepared, config) {
  const wp = config.wp || {};
  const tabs = prepared.seo?.tabs || {};
  // ... rest of function ...
  // Actually, I need to replace the whole function to accept profile directly or rely on config modification
  // Better to pass profile explicity. Let's stick to modifying config.wp in the loop.
  const assets = prepared.assets || {};
  const wpOptions = config._removeBgFn ? { removeBgFn: config._removeBgFn } : {};
  const mediaUsername = String(
    wp.mediaUsername || wp.wpUsername || wp.username || config?.wordpress?.username || ''
  ).trim();
  const mediaAppPassword = String(
    wp.mediaAppPassword || wp.wpAppPassword || wp.appPassword || config?.wordpress?.appPassword || ''
  ).trim();
  if (mediaUsername && mediaAppPassword) {
    wpOptions.mediaAuthHeader = 'Basic ' + Buffer.from(`${mediaUsername}:${mediaAppPassword}`).toString('base64');
  }
  
  // Use config.wp which is set per-iteration in uploadAll
  const profileKey = wp.key || '';
  const profileSecret = wp.secret || '';
  const profileUrl = wp.url || '';

  const res = await wordpress.createProduct(profileUrl, profileKey, profileSecret, {
    title: prepared.product.title,
    // ...
    // Using arguments from 'prepared' object
    price: prepared.product.price,
    salePrice: prepared.product.salePrice,
    description: prepared.seo.longDescription,
    image: prepared.product.image,
    url: prepared.product.url,
    category: prepared.product.category,
    localImagePath: assets.localImagePath || prepared.product.localImagePath || null,
    galleryImages: prepared.product.galleryImages,
    localGalleryPaths: assets.localGalleryPaths || prepared.product.localGalleryPaths || null,
    datasheetUrl: assets.datasheetUrl || prepared.product.datasheetUrl || null,
    localDatasheetPath: assets.localDatasheetPath || prepared.product.localDatasheetPath || null,
    datasheets: prepared.product.datasheets || [],
    documents: prepared.product.documents || [],
    descriptionTabs: tabs,
    gcs: {
      bucket: config.gcs ? config.gcs.bucket : '',
      token: config.gcs ? config.gcs.token : '',
      serviceAccountPath: config.gcs ? config.gcs.serviceAccountPath : '',
      folder: config.gcs ? config.gcs.folder : '',
      imageFolder: config.gcs ? config.gcs.imageFolder : '',
      fosrocImageFolder: config.gcs ? config.gcs.fosrocImageFolder : '',
      publicRead: config.gcs ? config.gcs.publicRead : false
    }
  }, wpOptions);
  return res;
}

async function uploadAll(prepared, config, browser) {
  // Download images to local temp files, reusing the already-open scraper browser
  const cloudPaths = await uploadImagesToCloud(prepared, config, browser);

  // Merge downloaded local paths into prepared
  const enriched = {
    ...prepared,
    product: {
      ...prepared.product,
      localImagePath: cloudPaths.localMain
        || prepared.product.localImagePath
        || prepared.assets?.localImagePath
        || '',
      localGalleryPaths: cloudPaths.localGallery.length
        ? cloudPaths.localGallery
        : (prepared.product.localGalleryPaths || prepared.assets?.localGalleryPaths || [])
    },
    assets: {
      ...prepared.assets,
      localImagePath: cloudPaths.localMain || prepared.assets?.localImagePath || '',
      localGalleryPaths: cloudPaths.localGallery.length
        ? cloudPaths.localGallery
        : (prepared.assets?.localGalleryPaths || [])
    }
  };

  // MULTI-PROFILE UPLOAD LOGIC
  const profiles = (config.wpProfiles && config.wpProfiles.length > 0) 
      ? config.wpProfiles 
      : (config.wp ? [config.wp] : []);

  // Filter valid profiles and check autoUpload flag
  const activeProfiles = profiles.filter(p => 
      p.url && p.key && p.secret && (p.autoUpload !== false)
  );

  if (activeProfiles.length === 0) {
      console.warn('No active WP profiles found for upload.');
      return { error: 'No active profiles' };
  }

  const results = [];
  // Use a sequential loop to avoid overwhelming local resources if running concurrently
  for (const profile of activeProfiles) {
      // Clone config and set the current profile as the 'wp' config for this iteration
      const profileConfig = { 
          ...config, 
          wp: profile 
      };

      console.log(`[Uploader] Starting upload to ${profile.name || profile.url}...`);
      
      try {
          const res = await uploadToWordPress(enriched, profileConfig);
          // Decorate result with profile info for UI
          res._profileName = profile.name || 'Wordpress';
          res._profileUrl = profile.url;

          // Fix HTTPS permalink on HTTP sites (Oracle Cloud fix)
          if (profile.url && profile.url.startsWith('http:') && res.permalink && res.permalink.startsWith('https:')) {
              res.permalink = res.permalink.replace(/^https:/, 'http:');
          }
          
          results.push(res);
          console.log(`[Uploader] Success ${profile.name} (ID: ${res.id})`);
      } catch (err) {
          console.error(`[Uploader] Failed to upload to ${profile.name}: ${err.message}`);
          // Don't throw, just record error so other profiles can continue
          results.push({ 
              error: err.message, 
              _profileName: profile.name,
              _profileUrl: profile.url 
          });
      }
  }

  // Return array of results. 
  // Make sure orchestration handles arrays (it just passes it through usually).
  return results;
}

module.exports = {
  uploadImagesToCloud,
  uploadToWordPress,
  uploadAll
};
