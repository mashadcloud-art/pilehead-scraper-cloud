const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// Allow self-signed certificates for development (w/ LocalWP etc)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ── Runtime upload throttle ───────────────────────────────────────────────────
// Set via IPC 'set-ik-upload-delay' from the renderer without restarting the app.
// 0 = full speed (default), 1000 = 1 second pause between each product.
global.ikUploadDelay = 0;

function getStartupLogPath() {
    try {
        if (app && app.getPath) {
            return path.join(app.getPath('userData'), 'startup.log');
        }
    } catch (_) {}
    try {
        return path.join(process.cwd(), 'startup.log');
    } catch (_) {}
    return 'startup.log';
}

function getStartupLogPaths() {
    const paths = [];
    try {
        if (app && app.getPath) {
            paths.push(path.join(app.getPath('userData'), 'startup.log'));
        }
    } catch (_) {}
    try {
        paths.push(path.join(process.cwd(), 'startup.log'));
    } catch (_) {}
    if (!paths.length) paths.push('startup.log');
    return Array.from(new Set(paths));
}

function logToFile(msg) {
    for (const filePath of getStartupLogPaths()) {
        try {
            fs.appendFileSync(filePath, msg + '\n');
        } catch (_) {}
    }
}

logToFile('Main process started');
console.log('Starting Electron App...');

try {
    app.disableHardwareAcceleration();
} catch (_) {}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    try {
        app.quit();
    } catch (_) {}
    process.exit(0);
}

app.on('second-instance', () => {
    try {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
        }
    } catch (_) {}
});

function showFatalError(title, error) {
    const msg =
        (error && error.stack) ? String(error.stack) :
        (error && error.message) ? String(error.message) :
        String(error);
    logToFile(`${title}: ${msg}`);
    try {
        dialog.showErrorBox(title, msg);
    } catch (_) {}
}

process.on('uncaughtException', (error) => {
    logToFile('Uncaught Exception: ' + error.stack);
    showFatalError('Pilehead Scraper crashed', error);
});

process.on('unhandledRejection', (reason) => {
    showFatalError('Pilehead Scraper unhandled rejection', reason);
});

logToFile('Requiring axios...');
const axios = require('axios');
logToFile('Requiring wordpress...');
const wordpress = require('./scraper/wordpress');
logToFile('Requiring helpers...');
const helpers = require('./scraper/helpers');
logToFile('Requiring scrapeProduct...');
const { scrapeProduct } = require('./scraper/scrapeProduct');
logToFile('Requiring bgremove...');
const bgremove = require('./scraper/bgremove');
logToFile('Requiring amazon...');
const amazon = require('./scraper/amazon');
logToFile('Requiring noon...');
const noon = require('./scraper/noon');
logToFile('Requiring fosroc...');
const fosroc = require('./scraper/fosroc');
logToFile('Requiring fepy...');
const fepy = require('./scraper/fepy');
logToFile('Requiring karcher...');
const karcher = require('./scraper/karcher');
logToFile('Requiring universal...');
const universal = require('./scraper/universal');
logToFile('Requiring productView...');
const { getProductView } = require('./editor/productView');
let orchestrator = null;
try {
    logToFile('Requiring orchestrator...');
    orchestrator = require('./scraper/unified/orchestrator');
} catch (e) {
    logToFile('Orchestrator load failed: ' + e.message);
    orchestrator = null;
}
logToFile('Modules loaded.');

function getScrapedDataDir() {
    return path.resolve(__dirname, 'scraped_data');
}

function listScrapedProductFilePaths() {
    const dir = getScrapedDataDir();
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json') && file.startsWith('product_'))
        .map((file) => path.join(dir, file));
}

function readJsonSafe(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function findScrapedFileByWpId(wpId) {
    const files = listScrapedProductFilePaths();
    for (const filePath of files) {
        const json = readJsonSafe(filePath);
        if (!json) continue;
        const id =
            (json.uploadResult && json.uploadResult.product && json.uploadResult.product.id) ||
            (json.uploadResult && json.uploadResult.id) ||
            (json.product && json.product.id) ||
            null;
        if (id && Number(id) === Number(wpId)) return filePath;
    }
    return null;
}

function matchesText(haystack, needle) {
    const h = String(haystack || '').toLowerCase();
    const n = String(needle || '').toLowerCase();
    if (!h || !n) return false;
    return h.includes(n);
}

function resolveScrapedFilePath(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    if ((raw.includes('\\') || raw.includes('/')) && fs.existsSync(raw)) {
        return raw;
    }

    const dir = getScrapedDataDir();
    if (raw.endsWith('.json')) {
        const direct = path.join(dir, raw);
        if (fs.existsSync(direct)) return direct;
    }
    if (raw.startsWith('product_')) {
        const direct = path.join(dir, raw.endsWith('.json') ? raw : `${raw}.json`);
        if (fs.existsSync(direct)) return direct;
    }

    if (/^\d+$/.test(raw)) {
        const byWpId = findScrapedFileByWpId(raw);
        if (byWpId) return byWpId;
    }

    const files = listScrapedProductFilePaths();
    for (const filePath of files) {
        const base = path.basename(filePath);
        if (matchesText(base, raw)) return filePath;
        const json = readJsonSafe(filePath);
        if (!json) continue;
        const title = (json.cleaned && (json.cleaned.title || json.cleaned.name)) || json.title || json.name || '';
        const url = (json.cleaned && json.cleaned.url) || json.url || '';
        if (matchesText(title, raw) || matchesText(url, raw)) return filePath;
    }

    return null;
}

function createWindow() {
  logToFile('Creating BrowserWindow...');
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    center: true,
    title: 'Pilehead Scraper v1.1.0',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      webviewTag: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    logToFile('Window ready to show');
    mainWindow.show();
    mainWindow.focus();
  });

  logToFile('Loading index.html...');
  mainWindow.webContents.on('dom-ready', () => {
    logToFile('dom-ready');
  });
  mainWindow.webContents.on('did-finish-load', () => {
    logToFile('did-finish-load');
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logToFile(`Failed to load: ${errorCode} ${errorDescription}`);
    showFatalError('Failed to load UI', `${errorCode} ${errorDescription}`);
  });
  mainWindow.webContents.on('crashed', (event, killed) => {
    logToFile(`Renderer process crashed: killed=${killed}`);
    showFatalError('Renderer crashed', `killed=${killed}`);
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logToFile(`render-process-gone: ${JSON.stringify(details)}`);
    showFatalError('Renderer process gone', JSON.stringify(details));
  });

  // Start the server in the background and load the URL instead of the local file
  require('./server');
  
  // Add a slight delay to ensure the server binds successfully
  setTimeout(() => {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => { console.log('[UI Console]', message); });
    mainWindow.loadURL('http://localhost:3001/').catch(e => {
        logToFile('Failed to load local server URL: ' + e);
        showFatalError('Failed to load UI', e);
    });
  }, 1000);
  setTimeout(() => {
    try {
      if (!mainWindow.isVisible()) {
        logToFile('Forcing window show (fallback)');
        mainWindow.show();
        mainWindow.focus();
      }
    } catch (_) {}
  }, 3000);
  logToFile('Window loaded.');
}

app.whenReady().then(() => {
  logToFile('App is ready.');
  console.log('App is ready, creating window...');
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
        logToFile('Activate event, creating window...');
        console.log('Activate event, creating window...');
        createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
ipcMain.on('window-close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
});
ipcMain.on('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
});
ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
    }
});

// --- IPC Handlers for WordPress ---

// Handle Test Connection
ipcMain.handle('wp-test-connection', async (event, { url, key, secret }) => {
    try {
        console.log(`[Main] Testing WP connection to: ${url}`);
        const result = await wordpress.testConnection(url, key, secret);
        return { success: true, data: result };
    } catch (error) {
        console.error(`[Main] WP Test Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// ── Helper: write a WP meta key with retry (used to mark migration outcome) ──
async function writeWpMeta(siteUrl, key, secret, productId, metaKey, metaValue) {
    const endpoint = `${siteUrl.replace(/\/$/, '')}/wp-json/wc/v3/products/${productId}`;
    const authHeader = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
    const payload = { meta_data: [{ key: metaKey, value: String(metaValue) }] };
    const headers = { Authorization: authHeader, 'Content-Type': 'application/json' };
    // Try up to 3 times with increasing timeouts (20s, 30s, 45s)
    for (const timeout of [20000, 30000, 45000]) {
        try {
            await axios.put(endpoint, payload, { headers, timeout });
            return true;
        } catch (_) {
            // wait 1s between retries
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return false; // all retries exhausted — caller logs warning
}

// Handle Product Upload
ipcMain.handle('wp-create-product', async (event, { url, key, secret, data }) => {
    try {
        console.log(`[Main] Uploading product: ${data.title}`);
        const result = await wordpress.createProduct(url, key, secret, data);
        return { success: true, data: result };
    } catch (error) {
        console.error(`[Main] WP Upload Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// Handle Product Delete
ipcMain.handle('wp-delete-product', async (event, { url, key, secret, productId }) => {
    try {
        console.log(`[Main] Deleting product: ${productId}`);
        const result = await wordpress.deleteProduct(url, key, secret, productId);
        return { success: true, data: result };
    } catch (error) {
        console.error(`[Main] WP Delete Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// Handle Synced Product Delete (WordPress + Oracle/pilehead.com)
ipcMain.handle('wp-delete-product-synced', async (event, { primaryProfile, oracleProfile, productId }) => {
    try {
        console.log(`[Main] Deleting product synced: ${productId} from both profiles`);
        const results = {};
        
        // Delete from primary profile (WordPress)
        if (primaryProfile && primaryProfile.url && primaryProfile.key && primaryProfile.secret) {
            try {
                console.log(`[Main] Deleting from primary profile: ${primaryProfile.name || primaryProfile.url}`);
                results.primary = await wordpress.deleteProduct(
                    primaryProfile.url, 
                    primaryProfile.key, 
                    primaryProfile.secret, 
                    productId
                );
            } catch (error) {
                console.error(`[Main] Primary profile delete failed:`, error.message);
                results.primary = { error: error.message };
            }
        }
        
        // Delete from Oracle profile (pilehead.com)
        if (oracleProfile && oracleProfile.url && oracleProfile.key && oracleProfile.secret) {
            try {
                console.log(`[Main] Deleting from Oracle profile: ${oracleProfile.name || oracleProfile.url}`);
                results.oracle = await wordpress.deleteProduct(
                    oracleProfile.url, 
                    oracleProfile.key, 
                    oracleProfile.secret, 
                    productId
                );
            } catch (error) {
                console.error(`[Main] Oracle profile delete failed:`, error.message);
                results.oracle = { error: error.message };
            }
        }
        
        const hasErrors = results.primary?.error || results.oracle?.error;
        return { 
            success: !hasErrors, 
            data: results,
            message: hasErrors ? 'Some profiles failed to delete' : 'Product deleted from all profiles'
        };
    } catch (error) {
        console.error(`[Main] Synced Delete Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wp-update-product-description', async (event, { url, key, secret, productId, description, seo, descriptionTabs }) => {
    try {
        console.log(`[Main] Updating product description: ${productId}`);
        const result = await wordpress.updateProductDescription(
            url,
            key,
            secret,
            productId,
            description,
            seo,
            descriptionTabs
        );
        return { success: true, data: result };
    } catch (error) {
        console.error('[Main] WP Update Description Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('gcs-list-files', async (event, { gcsConfig, prefix, maxResults, pageToken, delimiter }) => {
    try {
        const result = await wordpress.listGcsFiles(gcsConfig || {}, { prefix, maxResults, pageToken, delimiter });
        return { success: true, data: result };
    } catch (e) {
        console.error('[Main] GCS List Files Failed:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('gcs-delete-assets', async (event, { gcsConfig, urls }) => {
    try {
        console.log('[Main] Deleting GCS assets');
        const result = await wordpress.deleteGcsObjects(gcsConfig || {}, urls || []);
        return { success: true, data: result };
    } catch (error) {
        console.error('[Main] GCS Delete Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('gcs-test-connection', async (event, { gcsConfig }) => {
    try {
        console.log('[Main] Testing GCS connection');
        const result = await wordpress.testGcsConnection(gcsConfig || {});
        return { success: true, data: result };
    } catch (error) {
        console.error('[Main] GCS Test Failed:', error.message);
        return { success: false, error: error.message };
    }
});

// ─── Media Source Management ────────────────────────────────────────────────
ipcMain.handle('media-source-get', async () => {
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'settings.json'), 'utf8'));
        const source = (cfg.gcs && cfg.gcs.imageStorage) || 'gcs';
        const bucket = (cfg.gcs && cfg.gcs.bucket) || '';
        const saPath = (cfg.gcs && cfg.gcs.serviceAccountPath) || '';
        return { success: true, source, bucket, saPath };
    } catch (e) {
        return { success: false, error: e.message, source: 'gcs', bucket: '', saPath: '' };
    }
});

ipcMain.handle('media-source-set', async (event, { source }) => {
    try {
        const cfgPath = path.join(__dirname, 'config', 'settings.json');
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        cfg.gcs = cfg.gcs || {};
        cfg.gcs.imageStorage = source; // 'wp' | 'gcs' | 'both'
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 4));
        console.log('[Main] Media source set to:', source);
        return { success: true, source };
    } catch (e) {
        console.error('[Main] media-source-set failed:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('media-source-migrate', async (event, { scope, productIds, maxPages, preloadedProducts }) => {
    const send = (msg, data) => { try { event.sender.send('media-source-progress', { msg, ...data }); } catch(_) {} };
    let done = 0, ok = 0, failed = 0;
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'settings.json'), 'utf8'));
        const siteUrl = (cfg.wp && cfg.wp.url)    || '';
        const key     = (cfg.wp && cfg.wp.key)    || '';
        const secret  = (cfg.wp && cfg.wp.secret) || '';
        const gcs     = cfg.gcs || {};
        const gcsConfig = gcs.bucket ? {
            bucket:             gcs.bucket,
            token:              gcs.token || '',
            serviceAccountPath: gcs.serviceAccountPath || '',
            folder:             gcs.folder || '',
            imageFolder:        gcs.imageFolder || '',
            fosrocImageFolder:  gcs.fosrocImageFolder || '',
            publicRead:         gcs.publicRead || false,
            publicBase:         `https://storage.googleapis.com/${gcs.bucket}`
        } : null;

        if (!siteUrl || !key || !secret) {
            send('✗ WordPress credentials not configured in Settings.', { status: 'error', done: 0, total: 0, ok: 0, failed: 0 });
            return { success: false, error: 'WP credentials missing' };
        }
        if (!gcsConfig) {
            send('✗ GCS bucket not configured in Settings.', { status: 'error', done: 0, total: 0, ok: 0, failed: 0 });
            return { success: false, error: 'GCS not configured' };
        }

        // ── Early GCS auth/connectivity check ─────────────────────────────────
        send('⏳ Verifying GCS credentials…', { status: 'running', done: 0, total: 0, ok: 0, failed: 0 });
        const testToken = await wordpress.resolveGcsToken(gcsConfig);
        if (!testToken) {
            send('✗ GCS authentication failed — token is empty. Check Settings: GCS Token or Service Account JSON path.', { status: 'error', done: 0, total: 0, ok: 0, failed: 0 });
            return { success: false, error: 'GCS token missing or auth failed' };
        }
        // Quick bucket HEAD to verify bucket access
        try {
            await axios.get(
                `https://storage.googleapis.com/storage/v1/b/${gcsConfig.bucket}`,
                { headers: { Authorization: `Bearer ${testToken}` }, timeout: 8000 }
            );
            send(`✓ GCS bucket "${gcsConfig.bucket}" accessible.`, { status: 'running', done: 0, total: 0, ok: 0, failed: 0 });
        } catch (bucketErr) {
            const st = bucketErr.response ? bucketErr.response.status : 0;
            if (st === 401 || st === 403) {
                send(`✗ GCS access denied (HTTP ${st}) — token may be expired or missing bucket permissions.`, { status: 'error', done: 0, total: 0, ok: 0, failed: 0 });
                return { success: false, error: `GCS auth error HTTP ${st}` };
            }
            // 404 means the bucket name is wrong
            if (st === 404) {
                send(`✗ GCS bucket "${gcsConfig.bucket}" not found (HTTP 404) — check bucket name in Settings.`, { status: 'error', done: 0, total: 0, ok: 0, failed: 0 });
                return { success: false, error: 'GCS bucket not found' };
            }
            // Other errors (network etc.) — warn but continue
            send(`⚠ GCS bucket check returned unexpected error (${st || bucketErr.message}) — proceeding anyway.`, { status: 'running', done: 0, total: 0, ok: 0, failed: 0 });
        }
        // ── End GCS check ──────────────────────────────────────────────────────

        // Fetch products
        let products = [];
        send('⏳ Fetching products from WordPress...', { status: 'running', done: 0, total: 0, ok: 0, failed: 0 });

        if (scope === 'preloaded' && Array.isArray(preloadedProducts) && preloadedProducts.length) {
            // Renderer already fetched + pre-filtered these products — use directly
            products = preloadedProducts;
            send(`⏳ Using ${products.length} pre-scanned products (batch upload)…`, { status: 'running', done: 0, total: products.length, ok: 0, failed: 0 });
        } else if (scope === 'ids' && Array.isArray(productIds) && productIds.length) {
            for (const id of productIds) {
                try {
                    const p = await wordpress.getProduct(siteUrl, key, secret, id);
                    if (p) products.push(p);
                } catch (_) {}
            }
        } else {
            const pages = Math.max(1, Math.min(maxPages || 20, 100));
            for (let page = 1; page <= pages; page++) {
                const result = await wordpress.listProducts(siteUrl, key, secret, { page, perPage: 100, orderby: 'id', order: 'asc' });
                const batch = result.products || [];
                if (!batch.length) break;
                if (scope === 'no-gcs') {
                    // Only include products that have neither gcs_image_url nor gcs_gallery_urls nor gcs_no_images nor gcs_upload_failed meta
                    batch.forEach(p => {
                        const hasMeta = Array.isArray(p.meta_data) && p.meta_data.some(m =>
                            (m.key === 'gcs_image_url' || m.key === 'gcs_gallery_urls' || m.key === 'gcs_no_images' || m.key === 'gcs_upload_failed') && m.value
                        );
                        if (!hasMeta) products.push(p);
                    });
                } else {
                    products = products.concat(batch);
                }
                send(`⏳ Fetched ${products.length} products (page ${page})...`, { status: 'running', done: 0, total: products.length, ok: 0, failed: 0 });
                if (batch.length < 100) break;
            }
        }

        if (!products.length) {
            send('ℹ No products found to migrate.', { status: 'done', done: 0, total: 0, ok: 0, failed: 0 });
            return { success: true, ok: 0, failed: 0, total: 0 };
        }

        const total = products.length;
        send(`✅ Found ${total} products. Starting GCS upload...`, { status: 'running', done: 0, total, ok: 0, failed: 0 });

        let consecutiveFails = 0;
        let lastFailReason   = '';
        const failedProductIds = [];

        for (const product of products) {
            if (!Array.isArray(product.images) || !product.images.length) {
                done++; ok++;
                send(`⏭ Skipped #${product.id} — no images (marking as done)`, { status: 'running', done, total, ok, failed });
                // Write a marker meta so the scan stops counting this product as pending
                const _marked = await writeWpMeta(siteUrl, key, secret, product.id, 'gcs_no_images', '1');
                if (!_marked) send(`  ⚠ #${product.id} — could not write gcs_no_images marker (WP slow/unreachable)`, { status: 'running', done, total, ok, failed });
                continue;
            }
            // Skip products already migrated (double-guard for safety) — only bypass if scope='all'
            if (scope !== 'all') {
                const alreadyDone = Array.isArray(product.meta_data) && product.meta_data.some(m =>
                    (m.key === 'gcs_image_url' || m.key === 'gcs_gallery_urls' || m.key === 'gcs_no_images' || m.key === 'gcs_upload_failed') && m.value
                );
                if (alreadyDone) {
                    done++; ok++;
                    send(`⏭ Skipped #${product.id} — already in GCS`, { status: 'running', done, total, ok, failed });
                    continue;
                }
            }
            try {
                const uploadTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('product_timeout_180s')), 180000)
                );
                const result = await Promise.race([
                    wordpress.retryUploadImagesToGcs(
                        siteUrl, key, secret, product, gcsConfig,
                        (msg) => send(msg, { status: 'running', done, total, ok, failed })
                    ),
                    uploadTimeout
                ]);
                if (result.success) {
                    ok++;
                    consecutiveFails = 0;
                    lastFailReason   = '';
                } else {
                    failed++;
                    failedProductIds.push(product.id);
                    const reason = result.reason || result.error || 'unknown';
                    send(`✗ #${product.id} failed: ${reason} — skipping and continuing`, { status: 'running', done, total, ok, failed });
                    // Track consecutive GCS auth failures (only stop for auth errors, not download errors)
                    if (reason === lastFailReason) { consecutiveFails++; }
                    else { consecutiveFails = 1; lastFailReason = reason; }
                    if (consecutiveFails >= 5 && (reason.includes('missing_token') || reason.includes('http_401') || reason.includes('http_403'))) {
                        send(`\n🚨 5+ consecutive GCS auth failures: "${reason}" → GCS token expired. Fix in Settings and retry.`, { status: 'error', done, total, ok, failed });
                        break;
                    }
                    // Write a marker so this product doesn't keep showing as pending
                    // Use 'gcs_no_images' for download failures (permanent skip); 'gcs_upload_failed' for GCS errors (retriable)
                    const markerKey = (reason === 'no_images' || reason === 'download_failed' || reason === 'all_uploads_failed')
                        ? 'gcs_no_images' : 'gcs_upload_failed';
                    const markerVal = reason;
                    const marked = await writeWpMeta(siteUrl, key, secret, product.id, markerKey, markerVal);
                    if (!marked) send(`  ⚠ #${product.id} — could not write failure marker to WP (will re-appear as pending)`, { status: 'running', done, total, ok, failed });
                }
            } catch (e) {
                failed++;
                send(`✗ Error #${product.id}: ${e.message} — skipping`, { status: 'running', done, total, ok, failed });
                // Write marker so this product stops showing as pending
                const errMarked = await writeWpMeta(siteUrl, key, secret, product.id, 'gcs_upload_failed', e.message.slice(0, 200));
                if (!errMarked) send(`  ⚠ #${product.id} — could not write error marker to WP (will re-appear as pending)`, { status: 'running', done, total, ok, failed });
            }
            done++;
            send(`▶ ${done}/${total} done  (✓${ok} ✗${failed})`, { status: 'running', done, total, ok, failed });
        }

        send(`🎉 Migration complete: ${ok} uploaded, ${failed} failed, ${total} total.`, { status: 'done', done, total, ok, failed });
        return { success: true, ok, failed, total };
    } catch (e) {
        send(`✗ Fatal: ${e.message}`, { status: 'error', done, total: 0, ok, failed });
        return { success: false, error: e.message };
    }
});

// Bulk mark remaining products (no GCS meta) as skipped so they don't stay pending
ipcMain.handle('media-source-bulk-skip', async (event) => {
    const send = (msg, data) => { try { event.sender.send('media-source-progress', { msg, ...data }); } catch(_) {} };
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'settings.json'), 'utf8'));
        const siteUrl = (cfg.wp && cfg.wp.url)    || '';
        const key     = (cfg.wp && cfg.wp.key)    || '';
        const secret  = (cfg.wp && cfg.wp.secret) || '';
        if (!siteUrl || !key || !secret) {
            return { success: false, error: 'WP credentials missing' };
        }
        const authHeader = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');

        let pending = 0, skipped = 0;
        const perPage = 100;
        for (let page = 1; ; page++) {
            const r = await wordpress.listProducts(siteUrl, key, secret, { page, perPage, orderby: 'id', order: 'asc' });
            const batch = r.products || [];
            if (!batch.length) break;
            for (const p of batch) {
                const hasMeta = Array.isArray(p.meta_data) && p.meta_data.some(m =>
                    (m.key === 'gcs_image_url' || m.key === 'gcs_gallery_urls' || m.key === 'gcs_no_images' || m.key === 'gcs_upload_failed') && m.value
                );
                if (hasMeta) continue;
                pending++;
                const skipOk = await writeWpMeta(siteUrl, key, secret, p.id, 'gcs_upload_failed', 'manual_skip');
                if (skipOk) {
                    skipped++;
                    send(`✓ Marked #${p.id} as skipped`, { status: 'running' });
                } else {
                    send(`✗ Failed to skip #${p.id}: WP unreachable after 3 retries`, { status: 'error' });
                }
            }
            if (batch.length < perPage) break;
        }
        send(`🎉 Skip complete: ${skipped}/${pending} pending marked.`, { status: 'done' });
        return { success: true, skipped, pending };
    } catch (e) {
        send(`✗ Bulk skip failed: ${e.message}`, { status: 'error' });
        return { success: false, error: e.message };
    }
});

// ─── Retroactive GCS Image Upload ─────────────────────────────────────────────
// Fetches selected WP products, downloads their images, re-uploads to GCS,
// then writes gcs_image_url + gcs_gallery_urls back to the WP product meta.
ipcMain.handle('gcs-bulk-image-upload', async (event, { products, gcsConfig, removeBg }) => {
    const results = [];
    const send = (msg, data) => { try { event.sender.send('gcs-bulk-progress', { msg, ...data }); } catch(_) {} };

    // Resolve WP credentials from settings.json (renderer passes gcsConfig, WP creds come from disk)
    const cfg     = require('./config/settings.json');
    const siteUrl = cfg.wp && cfg.wp.url    ? cfg.wp.url    : '';
    const key     = cfg.wp && cfg.wp.key    ? cfg.wp.key    : '';
    const secret  = cfg.wp && cfg.wp.secret ? cfg.wp.secret : '';

    // Build options: pass BG removal function if requested
    const gcsOptions = removeBg ? { removeBgFn: (buf) => bgremove.removeBg(buf) } : {};

    let done = 0;
    for (const product of products) {
        send(`Processing product #${product.id}: ${product.name || ''}`, { productId: product.id, status: 'running', done, total: products.length });
        try {
            const result = await wordpress.retryUploadImagesToGcs(
                siteUrl, key, secret, product, gcsConfig,
                (msg) => send(msg, { productId: product.id, status: 'running', done, total: products.length }),
                gcsOptions
            );
            done++;
            results.push({ id: product.id, name: product.name, ...result });
            send(`✓ Done #${product.id} (${done}/${products.length})`, { productId: product.id, status: result.success ? 'ok' : 'error', done, total: products.length });
        } catch (err) {
            done++;
            results.push({ id: product.id, name: product.name, success: false, error: err.message });
            send(`✗ Error #${product.id}: ${err.message}`, { productId: product.id, status: 'error', done, total: products.length });
        }
    }
    send(`Batch complete: ${results.filter(r=>r.success).length} ok, ${results.filter(r=>!r.success).length} failed`, { status: 'done', done, total: products.length });
    return { success: true, results };
});

// ─── ImageKit helper ──────────────────────────────────────────────────────────
/**
 * Returns a bound IK uploader function for the given key + target folder.
 * Re-used by ik-bulk-upload and auto-IK in scrape-url.
 *
 * @param {string} ikPrivateKey  ImageKit private API key.
 * @param {string} folder        Destination folder on ImageKit e.g. '/pilehead'.
 * @returns {Function}           async uploadUrlToIK(fileUrl, fileName, binaryBuffer?)
 */
function makeIkUploader(ikPrivateKey, folder) {
    const authHeader = 'Basic ' + Buffer.from(`${ikPrivateKey}:`).toString('base64');
    const IK_UPLOAD  = 'https://upload.imagekit.io/api/v1/files/upload';
    return async function uploadUrlToIK(fileUrl, fileName, binaryBuffer = null) {
        // Force .png extension when uploading a BG-removed buffer (output is always PNG)
        const uploadFileName = binaryBuffer
            ? fileName.replace(/\.[^.]+$/, '') + '.png'
            : fileName;
        const form = new FormData();
        form.append('fileName', uploadFileName);
        form.append('folder', folder);
        form.append('useUniqueFileName', 'false');
        if (binaryBuffer) {
            const blob = new Blob([binaryBuffer], { type: 'image/png' });
            form.append('file', blob, uploadFileName);
        } else {
            // URL-based upload: ImageKit fetches the image itself — fast, no download on our end
            form.append('file', fileUrl);
        }
        const res = await axios.post(IK_UPLOAD, form, {
            headers: { Authorization: authHeader },
            timeout: 120000
        });
        return res.data.url;
    };
}

/**
 * Auto-upload GCS images to ImageKit after a successful WP product create.
 * Used when autoIkUpload flag is set in the scrape-url payload.
 *
 * @param {object} config       Scraper config (needs config.ik.privateKey, config.ik.folder, config.wp.*)
 * @param {object} uploadResult Return value of createProduct / orchestrator.processSingle.uploadResult
 * @returns {object}            { main, gallery } IK URLs, or {} if nothing to do / key missing
 */
async function autoUploadGcsToIK(config, uploadResult) {
    if (!config || !config.ik || !config.ik.privateKey) return {};
    if (!uploadResult) return {};
    const ikFolder      = (config.ik.folder || '/pilehead').trim();
    const uploadIK      = makeIkUploader(config.ik.privateKey, ikFolder);
    const siteUrl       = config.wp && config.wp.url    ? config.wp.url    : '';
    const key           = config.wp && config.wp.key    ? config.wp.key    : '';
    const secret        = config.wp && config.wp.secret ? config.wp.secret : '';
    const gcsImages     = uploadResult.gcs_images || {};
    const gcsMain       = gcsImages.main || '';
    const gcsGallery    = Array.isArray(gcsImages.gallery) ? gcsImages.gallery : [];
    const productId     = uploadResult.product && uploadResult.product.id ? uploadResult.product.id : 0;
    if (!gcsMain || !productId) return {};
    const result = {};
    try {
        const mainFileName = path.basename(gcsMain.split('?')[0]) || `product-${productId}.jpg`;
        const ikMain = await uploadIK(gcsMain, mainFileName);
        await writeWpMeta(siteUrl, key, secret, productId, 'imagekit_image_url', ikMain);
        result.main = ikMain;
        if (gcsGallery.length) {
            const ikGallery = [];
            for (const gUrl of gcsGallery) {
                try {
                    const gName = path.basename(gUrl.split('?')[0]) || `gallery-${productId}-${ikGallery.length}.jpg`;
                    ikGallery.push(await uploadIK(gUrl, gName));
                } catch (_) {}
            }
            if (ikGallery.length) {
                const galleryStr = ikGallery.join('|');
                await writeWpMeta(siteUrl, key, secret, productId, 'imagekit_gallery_urls', galleryStr);
                result.gallery = galleryStr;
            }
        }
    } catch (err) {
        result.error = err.message;
        console.error('[Main] Auto IK upload failed:', err.message);
    }
    return result;
}

// ─── ImageKit Direct Upload ────────────────────────────────────────────────
// Downloads GCS image → uploads to ImageKit storage → writes imagekit_image_url
// and imagekit_gallery_urls back to WP product meta.
ipcMain.handle('ik-bulk-upload', async (event, { products, ikPrivateKey, ikFolder, removeBg, wpUrl, wpKey, wpSecret }) => {
    const results = [];
    const send = (msg, data) => { try { event.sender.send('ik-bulk-progress', { msg, ...data }); } catch(_) {} };

    // Prefer passed credentials (from current profile), fallback to file
    let siteUrl = wpUrl || '';
    let key     = wpKey || '';
    let secret  = wpSecret || '';

    if (!siteUrl || !key || !secret) {
        try {
            const cfg     = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'settings.json'), 'utf8'));
            siteUrl = siteUrl || (cfg.wp && cfg.wp.url ? cfg.wp.url : '');
            key     = key     || (cfg.wp && cfg.wp.key ? cfg.wp.key : '');
            secret  = secret  || (cfg.wp && cfg.wp.secret ? cfg.wp.secret : '');
        } catch (_) {}
    }

    const folder        = (ikFolder || '/pilehead').trim();
    const uploadUrlToIK = makeIkUploader(ikPrivateKey, folder);
    let done = 0;

    for (const product of products) {
        send(`Processing #${product.id}: ${product.name || ''}`, { productId: product.id, status: 'running', done, total: products.length });
        try {
            const meta = Array.isArray(product.meta_data) ? product.meta_data : [];
            let gcsMain    = (meta.find(m => m.key === 'gcs_image_url')    || {}).value || '';
            const gcsGallery = (meta.find(m => m.key === 'gcs_gallery_urls') || {}).value || '';

            // Fallback: If no GCS URL, check generic "images" array from WP object
            if (!gcsMain && product.images && product.images.length > 0) {
                gcsMain = product.images[0].src;
            }

            if (!gcsMain) {
                done++;
                results.push({ id: product.id, name: product.name, skipped: true, reason: 'no image source' });
                send(`⚠ Skipped #${product.id} — no image check`, { productId: product.id, status: 'warn', done, total: products.length });
                continue;
            }
            // Dedup guard: skip products that already have imagekit_image_url
            const existingIk = (meta.find(m => m.key === 'imagekit_image_url') || {}).value || '';
            if (existingIk) {
                done++;
                results.push({ id: product.id, name: product.name, skipped: true, reason: 'already on IK', ikMain: existingIk });
                send(`⊘ #${product.id} already on ImageKit — skipped`, { productId: product.id, status: 'warn', done, total: products.length, ikMain: existingIk });
                continue;
            }

            // Upload main image (with optional BG removal)
            // If URL is local (localhost) or not public, ImageKit cannot fetch it.
            // However, this implementation (makeIkUploader) uses URL-based upload unless binaryBuffer is provided.
            // If the URL is "pilehead-local.local" etc, ImageKit will fail.
            // We should ideally download it if it's not a generic public valid URL, but that requires more logic.
            // For now, if BG removal is ON, we download it anyway (in removeBg).
            // If BG removal is OFF, we pass the URL.
            
            // To support local WP images, we FORCE binary upload if the URL looks local.
            const isLocalUrl = (url) => {
                const u = url.toLowerCase();
                return u.includes('localhost') || u.includes('.local') || u.includes('127.0.0.1') || u.includes('192.168.');
            };

            const mainFileName = path.basename(gcsMain.split('?')[0]) || `product-${product.id}.jpg`;
            let mainBuffer = null;
            
            // If RemoveBG is on OR if URL is local, we must download the buffer
            if (removeBg || isLocalUrl(gcsMain)) {
                try {
                    if (removeBg) {
                        send(`  🎨 Removing background: ${mainFileName}`, { productId: product.id, status: 'running', done, total: products.length });
                        mainBuffer = await bgremove.removeBg(gcsMain);
                        send(`  ✓ Background removed`, { productId: product.id, status: 'running', done, total: products.length });
                    } else {
                         // Just download the image to buffer to upload as binary
                         send(`  ⬇ Downloading local image: ${mainFileName}`, { productId: product.id, status: 'running', done, total: products.length });
                         const resp = await axios.get(gcsMain, { responseType: 'arraybuffer' });
                         mainBuffer = Buffer.from(resp.data);
                    }
                } catch (bgrErr) {
                    send(`  ⚠ Image download/process failed: ${bgrErr.message}`, { productId: product.id, status: 'warn', done, total: products.length });
                    // If download failed, we can't upload. If it was just BG removal that failed, result might be null so we try URL?
                    // But if URL is local, that will fail too.
                    if (isLocalUrl(gcsMain)) {
                        throw new Error("Could not download local image for upload: " + bgrErr.message);
                    }
                    mainBuffer = null;
                }
            }
            const ikMain = await uploadUrlToIK(gcsMain, mainFileName, mainBuffer);
            await writeWpMeta(siteUrl, key, secret, product.id, 'imagekit_image_url', ikMain);

            // Upload gallery images (BG removal optional, same flag)
            let ikGalleryStr = '';
            if (gcsGallery) {
                const galleryUrls = gcsGallery.split('|').map(u => u.trim()).filter(Boolean);
                const ikGallery = [];
                for (const gUrl of galleryUrls) {
                    try {
                        const gName = path.basename(gUrl.split('?')[0]) || `gallery-${product.id}-${ikGallery.length}.jpg`;
                        let gallBuffer = null;
                        if (removeBg) {
                            try {
                                gallBuffer = await bgremove.removeBg(gUrl);
                            } catch (_bgrErr) {
                                gallBuffer = null; // fall back to uploading original
                            }
                        }
                        const ikUrl = await uploadUrlToIK(gUrl, gName, gallBuffer);
                        ikGallery.push(ikUrl);
                    } catch (gErr) {
                        send(`  ⚠ Gallery image failed: ${gErr.message}`, { productId: product.id, status: 'warn', done, total: products.length });
                    }
                }
                if (ikGallery.length) {
                    ikGalleryStr = ikGallery.join('|');
                    await writeWpMeta(siteUrl, key, secret, product.id, 'imagekit_gallery_urls', ikGalleryStr);
                }
            }

            done++;
            results.push({ id: product.id, name: product.name, success: true, ikMain, ikGalleryStr });
            send(`✓ #${product.id} → ${ikMain}`, { productId: product.id, status: 'ok', done, total: products.length, ikMain, ikGalleryStr });
            // Throttle: pause between products to reduce CPU/network pressure
            if (global.ikUploadDelay > 0) await new Promise(r => setTimeout(r, global.ikUploadDelay));
        } catch (err) {
            done++;
            results.push({ id: product.id, name: product.name, success: false, error: err.message });
            send(`✗ #${product.id} failed: ${err.message}`, { productId: product.id, status: 'error', done, total: products.length });
        }
    }

    const ok     = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    send(`🎉 Done: ${ok} uploaded, ${failed} failed, ${skipped} skipped`, { status: 'done', done, total: products.length });
    return { success: true, results };
});

// Adjust delay between IK uploads at runtime — no restart needed.
// Call with delay=0 for full speed, delay=2000 for 2 s gap, etc.
ipcMain.handle('set-ik-upload-delay', async (_event, { delay }) => {
    global.ikUploadDelay = Math.max(0, parseInt(delay, 10) || 0);
    console.log('[Main] IK upload delay set to', global.ikUploadDelay, 'ms');
    return { success: true, delay: global.ikUploadDelay };
});

ipcMain.handle('app-restart', async () => {
    try {
        app.relaunch();
        app.exit(0);
        return { success: true };
    } catch (error) {
        console.error('[Main] App Restart Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wp-list-products', async (event, { url, key, secret, page, perPage, search, orderby, order }) => {
    try {
        console.log('[Main] Listing WooCommerce products');
        const want    = parseInt(perPage, 10) || 50;
        const apiMax  = 100;
        if (want <= apiMax) {
            const result = await wordpress.listProducts(url, key, secret, { page, perPage: want, search, orderby, order });
            return { success: true, data: result };
        }
        // Paginate: fetch multiple pages of 100 and concat
        const pages   = Math.ceil(want / apiMax);
        const results = await Promise.all(
            Array.from({ length: pages }, (_, i) =>
                wordpress.listProducts(url, key, secret, { page: (page || 1) + i, perPage: apiMax, search, orderby, order })
            )
        );
        const products   = results.flatMap(r => r.products || []).slice(0, want);
        const total      = results[0].total;
        const totalPages = results[0].totalPages;
        return { success: true, data: { products, total, totalPages, page: page || 1, perPage: want } };
    } catch (error) {
        console.error('[Main] WP List Products Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wp-list-categories', async (event, { url, key, secret, page, perPage, search, orderby, order }) => {
    try {
        console.log('[Main] Listing WooCommerce categories');
        const result = await wordpress.listCategories(url, key, secret, { page, perPage, search, orderby, order });
        return { success: true, data: result };
    } catch (error) {
        console.error('[Main] WP List Categories Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wp-list-pages', async (event, { url, key, secret, page, perPage, search, orderby, order }) => {
    try {
        console.log('[Main] Listing WordPress pages');
        const result = await wordpress.listPages(url, key, secret, { page, perPage, search, orderby, order });
        return { success: true, data: result };
    } catch (error) {
        console.error('[Main] WP List Pages Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wp-list-media', async (event, { url, key, secret, page, perPage, search, mediaType }) => {
    try {
        console.log('[Main] Listing WordPress media items');
        const want   = parseInt(perPage, 10) || 50;
        const apiMax = 100;
        if (want <= apiMax) {
            const result = await wordpress.listMedia(url, key, secret, { page, perPage: want, search, mediaType });
            return { success: true, data: result };
        }
        const pages   = Math.ceil(want / apiMax);
        const results = await Promise.all(
            Array.from({ length: pages }, (_, i) =>
                wordpress.listMedia(url, key, secret, { page: (page || 1) + i, perPage: apiMax, search, mediaType })
            )
        );
        const items      = results.flatMap(r => r.items || []).slice(0, want);
        const total      = results[0].total;
        const totalPages = results[0].totalPages;
        return { success: true, data: { items, total, totalPages, page: page || 1, perPage: want } };
    } catch (error) {
        console.error('[Main] WP List Media Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('gcs-create-folder', async (event, { gcsConfig, folderPath }) => {
    try {
        const result = await wordpress.createGcsFolder(gcsConfig || {}, folderPath);
        return { success: true, data: result };
    } catch (e) {
        console.error('[Main] GCS Create Folder Failed:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('wp-delete-media', async (event, { url, key, secret, mediaId }) => {
    try {
        console.log('[Main] Deleting media item:', mediaId);
        const result = await wordpress.deleteMedia(url, key, secret, mediaId);
        return { success: true, data: result };
    } catch (error) {
        console.error('[Main] WP Delete Media Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wp-bulk-delete-media', async (event, { url, key, secret, count, search }) => {
    try {
        console.log('[Main] Bulk deleting media items, requested count:', count);
        const result = await wordpress.bulkDeleteMedia(url, key, secret, { count, search });
        return { success: true, data: result };
    } catch (error) {
        console.error('[Main] WP Bulk Delete Media Failed:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('scrape-url', async (event, payload) => {
    const url = payload && payload.url ? String(payload.url).trim() : '';
    if (!url) return { success: false, error: 'missing_url' };
    const selectedWebsite = payload && payload.selectedWebsite ? payload.selectedWebsite : 'auto';
    const config = payload && payload.config ? payload.config : {};
    const autoUpload    = !!(payload && payload.autoUpload);
    const autoIkUpload  = !!(payload && payload.autoIkUpload);
    const isFosroc = selectedWebsite === 'fosroc' || (selectedWebsite === 'auto' && /fosroc/i.test(url));
    // Attach BG removal function at runtime if the config calls for it (never serialised, only lives in memory)
    if (config && config.gcs && config.gcs.removeBg && bgremove.isAvailable()) {
        config._removeBgFn = (buf) => bgremove.removeBg(buf);
    }
    let browser = null;
    try {
        if (isFosroc) {
            const raw = await fosroc.scrapeProduct(url, config);
            if (raw && raw.error) throw new Error(raw.error);
            
            // MULTI-UPLOAD LOGIC
            const profiles = (config.wpProfiles || []).length > 0 ? config.wpProfiles : [config.wp];
            // Filter only valid profiles
            const activeProfiles = profiles.filter(p => p.url && p.key && p.secret);

            if (autoUpload && activeProfiles.length > 0) {
                const productData = {
                    title: raw.title || raw.name || '',
                    name: raw.name || raw.title || '',
                    price: raw.price || raw.regular_price || '',
                    salePrice: raw.salePrice || raw.sale_price || '',
                    description: raw.description || '',
                    image: raw.image || raw.mainImage || '',
                    url,
                    category: raw.category || '',
                    localImagePath: raw.localImagePath || '',
                    galleryImages: Array.isArray(raw.galleryImages) ? raw.galleryImages : (Array.isArray(raw.images) ? raw.images : []),
                    localGalleryPaths: Array.isArray(raw.localGalleryPaths) ? raw.localGalleryPaths : [],
                    datasheetUrl: raw.datasheetUrl || '',
                    localDatasheetPath: raw.localDatasheetPath || '',
                    datasheets: Array.isArray(raw.datasheets) ? raw.datasheets : [],
                    documents: Array.isArray(raw.documents) ? raw.documents : [],
                    tabs: raw.tabs || undefined,
                    descriptionTabs: raw.tabs || undefined,
                    source: 'fosroc',
                    // ── GCS config passed to allow internal uploads
                    gcs: config.gcs || {}
                };
                
                const wpCreateOpts = config._removeBgFn ? { removeBgFn: config._removeBgFn } : {};
                const results = [];
                let firstValidGcsResult = null; // Store GCS result to reuse URLs if needed, or just for IK

                // Upload to each profile sequentially
                for (const profile of activeProfiles) {
                    // Respect "autoUpload" per profile if defined (default true if undefined)
                    if (profile.autoUpload === false) {
                        console.log(`[Main] Skipping profile "${profile.name}" (autoUpload: false)`);
                        continue;
                    }

                    try {
                        console.log(`[Main] Uploading to profile: ${profile.name} (${profile.url})...`);
                        const mediaUsername = String(
                            profile.mediaUsername || profile.wpUsername || profile.username || config?.wordpress?.username || ''
                        ).trim();
                        const mediaAppPassword = String(
                            profile.mediaAppPassword || profile.wpAppPassword || profile.appPassword || config?.wordpress?.appPassword || ''
                        ).trim();
                        const profileOpts = { ...wpCreateOpts };
                        if (mediaUsername && mediaAppPassword) {
                            profileOpts.mediaAuthHeader = 'Basic ' + Buffer.from(`${mediaUsername}:${mediaAppPassword}`).toString('base64');
                        }

                        const profileResult = await wordpress.createProduct(profile.url, profile.key, profile.secret, productData, profileOpts);
                        
                        // Add context to result for UI
                        profileResult._profileName = profile.name || 'WP';
                        profileResult._profileUrl = profile.url;

                        if (profile.url && profile.url.startsWith('http:') && profileResult.permalink && profileResult.permalink.startsWith('https:')) {
                            profileResult.permalink = profileResult.permalink.replace(/^https:/, 'http:');
                        }

                        results.push(profileResult);

                        // Capture first GCS result for ImageKit
                        if (!firstValidGcsResult && profileResult.gcs_images && profileResult.gcs_images.main) {
                            firstValidGcsResult = profileResult;
                        }

                    } catch (uploadErr) {
                         console.error(`[Main] Upload failed for profile "${profile.name}":`, uploadErr.message);
                         results.push({ 
                             error: uploadErr.message, 
                             _profileName: profile.name,
                             _profileUrl: profile.url 
                         });
                    }
                }

                // ImageKit handling: use the first valid GCS result
                let ik_images = {};
                if (autoIkUpload && firstValidGcsResult) {
                    try {
                        ik_images = await autoUploadGcsToIK(config, firstValidGcsResult);
                        // Optional: Write back IK meta to all successful uploads
                        if (ik_images.main) {
                            for (const res of results) {
                                if (res.id && !res.error) {
                                    // Use fire-and-forget for meta update to avoid slowing down response
                                    writeWpMeta(res._profileUrl, 
                                                activeProfiles.find(p => p.url === res._profileUrl).key, 
                                                activeProfiles.find(p => p.url === res._profileUrl).secret, 
                                                res.id, 'imagekit_image_url', ik_images.main).catch(console.error);
                                }
                            }
                        }
                    } catch (ikErr) {
                        console.error("[Main] ImageKit upload error:", ikErr.message);
                    }
                }

                // Fallback for single-upload compatibility
                const mainResult = results.find(r => !r.error) || results[0] || {};
                // Include ALL results in the response
                return { success: true, url, cleaned: raw, uploadResult: mainResult, allUploads: results, ik_images };
            }
            return { success: true, url, cleaned: raw, uploadResult: null };
        }
        browser = await helpers.launchBrowser();
        if (autoUpload && config && config.wp && config.wp.url && config.wp.key && config.wp.secret && orchestrator && typeof orchestrator.processSingle === 'function') {
            const result = await orchestrator.processSingle({
                url,
                selectedWebsite,
                config,
                browser,
                scrapeModules: { amazon, noon, fosroc, fepy, karcher, universal }
            });

            let ik_images = {};
            // Handle multi-site result (array) or single result (object)
            const uploadRes = result.uploadResult;
            const resultsArray = Array.isArray(uploadRes) ? uploadRes : (uploadRes ? [uploadRes] : []);
            const firstValid = resultsArray.find(r => r && !r.error && r.gcs_images) || resultsArray[0];

            if (autoIkUpload && firstValid) {
                try {
                    // Use first valid result for IK upload
                    ik_images = await autoUploadGcsToIK(config, firstValid);
                    
                    // Propagate IK URLs to ALL successful profiles
                    if (ik_images.main) {
                         const profiles = (config.wpProfiles || []).length > 0 ? config.wpProfiles : [config.wp];
                         
                         for (const res of resultsArray) {
                            if (res && res.id && !res.error && res._profileUrl) {
                                 const p = profiles.find(prof => prof && prof.url === res._profileUrl);
                                 if (p && p.key && p.secret) {
                                      writeWpMeta(p.url, p.key, p.secret, res.id, 'imagekit_image_url', ik_images.main).catch(console.error);
                                 }
                            }
                         }
                    }
                } catch (ikErr) {
                    console.error("[Main] Orchestrator IK upload error:", ikErr.message);
                }
            }

            return { success: true, url, cleaned: result.cleaned, uploadResult: uploadRes, ik_images };
        }
        const result = await scrapeProduct(url, selectedWebsite, config, browser);
        return { success: true, url, cleaned: result.cleaned, uploadResult: null };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
    }
});

/*
ipcMain.handle('plugin-updater-select-folder', async () => {
    const res = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return res;
});

ipcMain.handle('plugin-updater-select-files', async () => {
    const res = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections']
    });
    return res;
});

ipcMain.handle('plugin-updater-select-zip', async () => {
    const res = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
    });
    return res;
});

ipcMain.handle('plugin-updater-save-as', async (event, options) => {
    const res = await dialog.showSaveDialog({
        defaultPath: options && options.defaultPath ? options.defaultPath : undefined
    });
    return res;
});
*/

async function callAzureChatCompletion(options) {
    const endpoint = options && options.endpoint ? options.endpoint : '';
    const apiKey = options && options.apiKey ? options.apiKey : '';
    const deployment = options && options.deployment ? options.deployment : '';
    const apiVersion = options && options.apiVersion ? options.apiVersion : '';
    const payload = options && options.payload ? options.payload : null;
    if (!endpoint || !apiKey || !deployment || !apiVersion || !payload) {
        throw new Error('Missing Azure configuration or payload');
    }
    const trimmedEndpoint = endpoint.replace(/\/+$/, '');
    const url =
        trimmedEndpoint +
        '/openai/deployments/' +
        deployment +
        '/chat/completions?api-version=' +
        encodeURIComponent(apiVersion);
    const response = await axios.post(url, payload, {
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        }
    });
    const dataJson = response && response.data ? response.data : {};
    const choices = dataJson && Array.isArray(dataJson.choices) ? dataJson.choices : [];
    const first = choices.length > 0 ? choices[0] : null;
    const content =
        first && first.message && typeof first.message.content === 'string' ? first.message.content : '';
    if (!content) {
        throw new Error('Empty Azure response');
    }
    return content;
}

ipcMain.handle('azure-chat-completion', async (event, options) => {
    try {
        const content = await callAzureChatCompletion(options || {});
        return { success: true, content };
    } catch (error) {
        const status = error && error.response && error.response.status ? error.response.status : null;
        const message = status ? `HTTP ${status}` : error.message || 'Azure request failed';
        console.error('[Main] Azure chat failed:', message);
        return { success: false, error: message };
    }
});

const { scrapeProductDetails } = require('./scraper/scrape-product-details');

ipcMain.handle('scrape-fepy-product-details', async (event, { url }) => {
    return await scrapeProductDetails(url);
});
