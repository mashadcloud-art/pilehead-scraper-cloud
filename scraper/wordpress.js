const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Configure axios to ignore SSL errors (for local WP / self-signed certs)
// Use explicit per-request agent setting instead of global default to avoid affecting HTTP requests
// axios.defaults.httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- GLOBAL FIX FOR ORACLE CLOUD / NGINX / LOAD BALANCERS ---
// Inject 'X-Forwarded-Proto: https' to bypass 401 Unauthorized or Redirect loops on strict Nginx configs.
// Also ensure a standard User-Agent is present for all outgoing requests.
axios.interceptors.request.use(config => {
    // Only apply if NOT localhost (internal calls to localhost usually don't need this)
    if (config.url && !config.url.includes('localhost')) {
         // Always force X-Forwarded-Proto to https for cloud environments
         config.headers['X-Forwarded-Proto'] = 'https';
         
         // Some Oracle Cloud Nginx setups also require X-Forwarded-Host if being proxied
         try {
             const urlObj = new URL(config.url);
             if (!config.headers['X-Forwarded-Host']) {
                 config.headers['X-Forwarded-Host'] = urlObj.hostname;
             }
         } catch(e) {}

         // Inject User-Agent if missing (some servers block empty UA)
         if (!config.headers['User-Agent']) {
            config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
         }
    }
    return config;
}, error => {
    return Promise.reject(error);
});

const { GoogleAuth } = require('google-auth-library');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

/**
 * Clean price string to number
 * @param {string} priceStr 
 * @returns {string}
 */
function cleanPrice(priceStr) {
    if (!priceStr) return '';
    // Remove non-numeric characters except dot and comma
    return priceStr.replace(/[^0-9.]/g, '');
}

function sanitizeUrl(value) {
    if (!value) return '';
    let clean = value.toString().trim();
    if (!clean || clean === 'null' || clean === 'undefined') return '';
    clean = clean.replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '').trim();
    if (clean.startsWith('//')) clean = 'https:' + clean;
    if (clean.endsWith('.')) clean = clean.slice(0, -1);
    return clean;
}

function normalizeToken(value) {
    if (!value) return '';
    let clean = value.toString().trim();
    if (!clean) return '';
    clean = clean.replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '').trim();
    clean = clean.replace(/^Bearer\s+/i, '');
    clean = clean.replace(/\s+/g, '');
    return clean;
}

function isPdfBuffer(buffer, contentType) {
    if (!buffer || buffer.length < 10240) return false;
    const type = (contentType || '').toString().toLowerCase();
    if (type.includes('pdf')) return true;
    const header = buffer.slice(0, 4).toString('utf8');
    return header === '%PDF';
}

function mapDatasheetFolder(type) {
    const t = (type || '').toString().toLowerCase();
    if (t.includes('tds') || t.includes('data sheet') || t.includes('datasheet')) return 'TDS';
    if (t.includes('sds') || t.includes('msds') || t.includes('safety')) return 'SDS';
    if (t.includes('ms') || t.includes('method')) return 'MS';
    return 'Others';
}

function mapDatasheetLabel(type) {
    const t = (type || '').toString().toUpperCase();
    if (t === 'SDS') return 'Safety Datasheet';
    if (t === 'MS') return 'Method Statement';
    return 'Datasheet';
}

function sanitizeGcsSegment(value, fallback) {
    let clean = (value || '').toString().trim();
    clean = clean.replace(/[\\/#?%*:|"<>]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) clean = fallback || 'Fosroc';
    return clean;
}

function joinFolder(baseFolder, typeFolder) {
    const base = (baseFolder || '').toString().replace(/^\/+|\/+$/g, '');
    const type = (typeFolder || '').toString().replace(/^\/+|\/+$/g, '');
    if (base && type) return `${base}/${type}`;
    if (base) return base;
    if (type) return type;
    return '';
}

function buildGcsPublicUrl(publicBase, objectName) {
    const base = (publicBase || '').replace(/\/+$/g, '');
    const encodedPath = (objectName || '')
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `${base}/${encodedPath}`;
}

function getGcsConfig(manualConfig) {
    // 1. Try manual config first
    if (manualConfig && manualConfig.bucket) {
        let saPath = manualConfig.serviceAccountPath || '';
        // Remove surrounding quotes if present (common when copying as path in Windows)
        if (saPath.startsWith('"') && saPath.endsWith('"')) {
            saPath = saPath.slice(1, -1);
        }
        
        return {
            bucket: manualConfig.bucket,
            token: manualConfig.token,
            publicBase: manualConfig.publicBase || `https://storage.googleapis.com/${manualConfig.bucket}`,
            folder: manualConfig.folder || '',
            imageFolder: manualConfig.imageFolder || '',
            fosrocImageFolder: manualConfig.fosrocImageFolder || '',
            serviceAccountPath: saPath,
            publicRead: manualConfig.publicRead
        };
    }

    // 2. Fallback to process.env
    const bucket = (process.env.GCS_BUCKET || '').trim();
    let token = process.env.GCS_ACCESS_TOKEN || '';
    const tokenFile = (process.env.GCS_ACCESS_TOKEN_FILE || '').trim();
    if ((!token || token.trim() === '') && tokenFile && fs.existsSync(tokenFile)) {
        try {
            token = fs.readFileSync(tokenFile, 'utf8');
        } catch (_) {
            token = '';
        }
    }
    const normalizedToken = normalizeToken(token);
    const serviceAccountPath = (process.env.GCS_SERVICE_ACCOUNT || process.env.GCS_SERVICE_ACCOUNT_FILE || '').trim();
    if (!bucket || (!normalizedToken && !serviceAccountPath)) return null;
    const publicBase = process.env.GCS_PUBLIC_BASE || `https://storage.googleapis.com/${bucket}`;
    const folder = process.env.GCS_FOLDER || '';
    const imageFolder = process.env.GCS_IMAGES_FOLDER || '';
    const fosrocImageFolder = process.env.GCS_FOSROC_IMAGES_FOLDER || '';
    const publicRead = String(process.env.GCS_PUBLIC_READ || '').trim().toLowerCase() === 'true';
    return { bucket, token: normalizedToken, publicBase, folder, imageFolder, fosrocImageFolder, serviceAccountPath, publicRead };
}

async function resolveGcsToken(gcsConfig) {
    if (!gcsConfig) return '';
    if (gcsConfig.token) return gcsConfig.token;
    
    if (gcsConfig.serviceAccountPath) {
        if (fs.existsSync(gcsConfig.serviceAccountPath)) {
            try {
                const auth = new GoogleAuth({
                    keyFile: gcsConfig.serviceAccountPath,
                    scopes: ['https://www.googleapis.com/auth/devstorage.read_write']
                });
                const client = await auth.getClient();
                const accessToken = await client.getAccessToken();
                if (typeof accessToken === 'string') return accessToken;
                if (accessToken && accessToken.token) return accessToken.token;
            } catch (err) {
                console.error(`GCS Auth Error: ${err.message}`);
                return '';
            }
        } else {
             console.error(`GCS Service Account file not found: ${gcsConfig.serviceAccountPath}`);
        }
    }
    return '';
}

async function uploadDatasheetToGcs(filePath, gcsConfig, overrideFolder, overrideFileName) {
    if (!filePath || !gcsConfig) return { url: '', error: 'missing_config' };
    if (!fs.existsSync(filePath)) return { url: '', error: 'missing_file' };
    const baseName = path.basename(filePath);
    const safeName = baseName.replace(/[^a-z0-9.]/gi, '_');
    const timeTag = Date.now().toString();
    const folderValue = overrideFolder !== undefined ? overrideFolder : gcsConfig.folder;
    const folderPrefix = folderValue ? folderValue.replace(/^\/+|\/+$/g, '') + '/' : '';
    let objectName = `${folderPrefix}${timeTag}_${safeName}`;
    if (overrideFileName) {
        const fallbackName = safeName || `datasheet_${Date.now()}.pdf`;
        let cleanName = sanitizeGcsSegment(overrideFileName, fallbackName);
        if (!path.extname(cleanName)) cleanName += path.extname(baseName) || '.pdf';
        objectName = `${folderPrefix}${cleanName}`;
    }
    const publicAcl = gcsConfig.publicRead ? '&predefinedAcl=publicRead' : '';
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${gcsConfig.bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}${publicAcl}`;
    const uploadUrlNoAcl = `https://storage.googleapis.com/upload/storage/v1/b/${gcsConfig.bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(baseName).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
    const authToken = await resolveGcsToken(gcsConfig);
    if (!authToken) return { url: '', error: 'missing_token' };
    try {
        console.log(`Uploading datasheet to GCS: ${objectName}`);
        await axios.post(uploadUrl, fileBuffer, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': contentType
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 60000 // 60s timeout
        });
        const publicUrl = buildGcsPublicUrl(gcsConfig.publicBase, objectName);
        console.log(`Datasheet uploaded to GCS: ${publicUrl}`);
        return { url: publicUrl, error: '' };
    } catch (error) {
        const status = error && error.response ? error.response.status : '';
        const payload = error && error.response ? error.response.data : null;
        const uniformAccessBlocked = status === 400 && payload && typeof payload === 'object' && payload.error && payload.error.message && payload.error.message.toLowerCase().includes('uniform');
        if (gcsConfig.publicRead && uniformAccessBlocked) {
            try {
                console.log('GCS public ACL blocked by uniform access, retrying without ACL');
                await axios.post(uploadUrlNoAcl, fileBuffer, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': contentType
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    timeout: 60000 // 60s timeout
                });
                const publicUrl = buildGcsPublicUrl(gcsConfig.publicBase, objectName);
                console.log(`Datasheet uploaded to GCS (no ACL): ${publicUrl}`);
                return { url: publicUrl, error: 'public_acl_skipped' };
            } catch (_) {
            }
        }
        console.error(`GCS datasheet upload failed${status ? ` (${status})` : ''}`);
        if (error && error.response && error.response.data) {
            try {
                console.error(`GCS upload response: ${JSON.stringify(error.response.data)}`);
            } catch (_) {
                console.error('GCS upload response: [unreadable]');
            }
        }
        return { url: '', error: status ? `http_${status}` : 'upload_failed' };
    }
}

// Upload product image (jpg/png/webp/gif) to GCS
async function uploadImageToGcs(filePath, gcsConfig, overrideFolder, overrideFileName) {
    if (!filePath || !gcsConfig) return { url: '', error: 'missing_config' };
    if (!fs.existsSync(filePath)) return { url: '', error: 'missing_file' };
    const baseName = path.basename(filePath);
    const safeName = baseName.replace(/[^a-z0-9.]/gi, '_');
    const timeTag = Date.now().toString();
    const folderValue = overrideFolder !== undefined ? overrideFolder : gcsConfig.folder;
    const folderPrefix = folderValue ? folderValue.replace(/^\/+|\/+$/g, '') + '/' : '';
    let objectName = `${folderPrefix}${timeTag}_${safeName}`;
    if (overrideFileName) {
        const fallbackName = safeName || `image_${Date.now()}.jpg`;
        let cleanName = sanitizeGcsSegment(overrideFileName, fallbackName);
        if (!path.extname(cleanName)) cleanName += path.extname(baseName) || '.jpg';
        objectName = `${folderPrefix}${cleanName}`;
    }
    const publicAcl = gcsConfig.publicRead ? '&predefinedAcl=publicRead' : '';
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${gcsConfig.bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}${publicAcl}`;
    const uploadUrlNoAcl = `https://storage.googleapis.com/upload/storage/v1/b/${gcsConfig.bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(baseName).toLowerCase();
    let contentType = IMAGE_EXT_MIME[ext] || 'image/jpeg';
    const authToken = await resolveGcsToken(gcsConfig);
    if (!authToken) return { url: '', error: 'missing_token' };
    try {
        console.log(`Uploading image to GCS: ${objectName}`);
        await axios.post(uploadUrl, fileBuffer, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': contentType
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 60000 // 60s timeout
        });
        const publicUrl = buildGcsPublicUrl(gcsConfig.publicBase, objectName);
        console.log(`Image uploaded to GCS: ${publicUrl}`);
        return { url: publicUrl, error: '' };
    } catch (error) {
        const status = error && error.response ? error.response.status : '';
        const payload = error && error.response ? error.response.data : null;
        const uniformAccessBlocked = status === 400 && payload && typeof payload === 'object' && payload.error && payload.error.message && payload.error.message.toLowerCase().includes('uniform');
        if (gcsConfig.publicRead && uniformAccessBlocked) {
            try {
                console.log('GCS public ACL blocked by uniform access for image, retrying without ACL');
                await axios.post(uploadUrlNoAcl, fileBuffer, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': contentType
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    timeout: 60000 // 60s timeout
                });
                const publicUrl = buildGcsPublicUrl(gcsConfig.publicBase, objectName);
                console.log(`Image uploaded to GCS (no ACL): ${publicUrl}`);
                return { url: publicUrl, error: 'public_acl_skipped' };
            } catch (_) {}
        }
        console.error(`GCS image upload failed${status ? ` (${status})` : ''}`);
        if (error && error.response && error.response.data) {
            try {
                console.error(`GCS image upload response: ${JSON.stringify(error.response.data)}`);
            } catch (_) {
                console.error('GCS image upload response: [unreadable]');
            }
        }
        return { url: '', error: status ? `http_${status}` : 'upload_failed' };
    }
}

async function downloadDatasheetFromUrl(url, baseUrl) {
    const cleaned = sanitizeUrl(url);
    if (!cleaned) return '';
    let resolved = cleaned;
    if (resolved.startsWith('/')) {
        try {
            resolved = new URL(resolved, baseUrl).href;
        } catch (_) {
            return '';
        }
    }
    if (!/^https?:\/\//i.test(resolved)) return '';
    try {
        const urlObj = new URL(resolved);
        const response = await axios.get(resolved, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': urlObj.origin + '/',
                'Accept': 'application/pdf,application/octet-stream,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 30000
        });
        const contentType = response.headers ? response.headers['content-type'] : '';
        const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data || []);
        
        // Removed strict isPdfBuffer check
        // if (!isPdfBuffer(buffer, contentType)) ...
        
        const tempDir = path.join(__dirname, '..', 'temp_files', 'datasheets');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        let filename = path.basename(new URL(resolved).pathname);
        if (!filename || filename.length < 3) filename = `document_${Date.now()}.bin`;
        filename = filename.replace(/[^a-z0-9.]/gi, '_');
        
        // Infer extension if missing
        if (!path.extname(filename)) {
            const header = buffer.slice(0, 50).toString('utf8').trim().toLowerCase();
            if (header.startsWith('%pdf')) filename += '.pdf';
            else if (contentType.includes('pdf')) filename += '.pdf';
            else filename += '.bin';
        }

        const localPath = path.join(tempDir, filename);
        fs.writeFileSync(localPath, buffer);
        return localPath;
    } catch (error) {
        console.error(`Datasheet download failed: ${error.message}`);
    }
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        const response = await page.goto(resolved, { waitUntil: 'networkidle0', timeout: 20000 });
        if (!response || !response.ok()) return '';
        const buffer = await response.buffer();
        const headers = response.headers ? response.headers() : {};
        const contentType = headers['content-type'] || '';
        if (!isPdfBuffer(buffer, contentType)) {
            console.log('Browser downloaded datasheet is not a valid PDF');
            return '';
        }
        const tempDir = path.join(__dirname, '..', 'temp_files', 'datasheets');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        let filename = path.basename(new URL(resolved).pathname);
        if (!filename || filename.length < 3) filename = `datasheet_${Date.now()}.pdf`;
        filename = filename.replace(/[^a-z0-9.]/gi, '_');
        if (!path.extname(filename)) filename += '.pdf';
        const localPath = path.join(tempDir, filename);
        fs.writeFileSync(localPath, buffer);
        return localPath;
    } catch (error) {
        console.error(`Datasheet browser download failed: ${error.message}`);
        return '';
    } finally {
        if (browser) await browser.close();
    }
}

// Known image extensions → mime types for fallback when server returns octet-stream
const IMAGE_EXT_MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif',  '.webp': 'image/webp', '.avif': 'image/avif',
    '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.tiff': 'image/tiff'
};

async function downloadImageToTemp(url, options = {}) {
    const cleaned = sanitizeUrl(url);
    if (!cleaned) return '';

    const tempDir = path.join(__dirname, '..', 'temp_files', 'images');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    function saveBuffer(data, contentType) {
        let filename = path.basename(new URL(cleaned).pathname) || `image_${Date.now()}.jpg`;
        if (!path.extname(filename)) {
            if (contentType.includes('png'))       filename += '.png';
            else if (contentType.includes('webp')) filename += '.webp';
            else if (contentType.includes('gif'))  filename += '.gif';
            else if (contentType.includes('avif')) filename += '.avif';
            else                                   filename += '.jpg';
        }
        filename = filename.replace(/[^a-z0-9.]/gi, '_');
        const localPath = path.join(tempDir, filename);
        fs.writeFileSync(localPath, Buffer.from(data));
        return localPath;
    }

    function resolveContentType(headers, urlStr) {
        let ct = (headers && headers['content-type']) ? headers['content-type'].split(';')[0].trim() : '';
        // Override with URL extension if server returns generic/wrong content-type
        const genericTypes = ['application/octet-stream', 'binary/octet-stream', 'text/plain', 'application/x-www-form-urlencoded', ''];
        if (genericTypes.includes(ct)) {
            const ext = path.extname(new URL(urlStr).pathname).toLowerCase();
            const mapped = IMAGE_EXT_MIME[ext] || '';
            if (mapped) ct = mapped;
        }
        return ct;
    }

    const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': new URL(cleaned).origin + '/'
    };

    // ── Attempt 1: WP Basic Auth (use when downloading from own WP site) ──
    if (options.authHeader) {
        try {
            const res = await axios.get(cleaned, {
                responseType: 'arraybuffer',
                headers: { ...baseHeaders, 'Authorization': options.authHeader },
                timeout: 15000, maxBodyLength: Infinity, maxContentLength: Infinity
            });
            const ct = resolveContentType(res.headers, cleaned);
            if (ct && /^image\//i.test(ct)) {
                console.log(`[download] ✓ Auth download OK: ${path.basename(cleaned)}`);
                return saveBuffer(res.data, ct);
            }
        } catch (e) {
            console.warn(`[download] Auth attempt failed (${e.response ? e.response.status : e.message}): ${path.basename(cleaned)}`);
        }
    }

    // ── Attempt 2: Plain browser-like request ──
    try {
        const res = await axios.get(cleaned, {
            responseType: 'arraybuffer',
            headers: baseHeaders,
            timeout: 15000, maxBodyLength: Infinity, maxContentLength: Infinity
        });
        const ct = resolveContentType(res.headers, cleaned);
        if (ct && /^image\//i.test(ct)) {
            console.log(`[download] ✓ Plain download OK: ${path.basename(cleaned)}`);
            return saveBuffer(res.data, ct);
        }
        console.warn(`[download] Plain: unexpected content-type "${ct}" for ${path.basename(cleaned)}`);
    } catch (e) {
        const st = e.response ? e.response.status : e.message;
        console.warn(`[download] Plain attempt failed (${st}) for: ${cleaned}`);
    }

    // ── Attempt 3: Try alternate image extension (.jpg/.jpeg/.png/.webp) ──
    const urlObj  = new URL(cleaned);
    const extOrig = path.extname(urlObj.pathname).toLowerCase();
    if (extOrig === '.avif' || extOrig === '.webp') {
        const base = urlObj.pathname.replace(/\.[^.]+$/, '');
        for (const alt of ['.jpg', '.jpeg', '.png', '.webp']) {
            if (alt === extOrig) continue;
            const altUrl = urlObj.origin + base + alt + (urlObj.search || '');
            try {
                const res = await axios.get(altUrl, {
                    responseType: 'arraybuffer',
                    headers: baseHeaders,
                    timeout: 10000, maxBodyLength: Infinity, maxContentLength: Infinity
                });
                const ct = resolveContentType(res.headers, altUrl);
                if (ct && /^image\//i.test(ct)) {
                    console.log(`[download] ✓ Fallback extension OK (${alt}): ${path.basename(altUrl)}`);
                    return saveBuffer(res.data, ct);
                }
            } catch (_) { /* try next */ }
        }
    }

    console.error(`[download] All attempts failed for: ${cleaned}`);
    return '';
}

/**
 * Uploads a local image file to WordPress Media Library using WooCommerce API
 * This matches the approach used in your WordPress plugin
 * @param {string} filePath - Absolute path to the local image file
 * @param {string} baseUrl - WordPress Site URL (e.g., https://myshop.com)
 * @param {string} authHeader - Basic Auth Header
 * @returns {Promise<number|null>} - Media ID or null
 */
async function uploadImageFromFile(filePath, baseUrl, authHeader) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Local file not found: ${filePath}`);
        }

        const filename = path.basename(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        
        // Simple MIME type detection based on extension
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.webp') mimeType = 'image/webp';

        console.log(`Uploading local file to WP: ${filename} (${mimeType})`);

        const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        const mediaEndpoint = `${cleanBaseUrl}/wp-json/wp/v2/media`;
        
        const uploadResponse = await axios.post(mediaEndpoint, fileBuffer, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': mimeType,
                'Content-Disposition': `attachment; filename="${filename}"`
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 60000
        });

        // WordPress returns the media object with ID
        if (uploadResponse.data && uploadResponse.data.id) {
            return uploadResponse.data.id;
        }
        
        return null;
    } catch (error) {
        console.error('Local Image Upload Error Details:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
            throw new Error(`Local Image Upload Failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

/**
 * Uploads a local datasheet/document to the WordPress Media Library via REST API
 * (Serves as replacing GCS/Oracle external upload by putting it directly on the Oracle WordPress Server).
 */
async function uploadDatasheetToWP(filePath, baseUrl, authHeader) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Local document not found: ${filePath}`);
        }

        const filename = path.basename(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'application/pdf'; // Default to PDF for datasheets
        if (ext === '.doc' || ext === '.docx') mimeType = 'application/msword';
        else if (ext === '.xls' || ext === '.xlsx') mimeType = 'application/vnd.ms-excel';

        console.log(`Uploading document to WP Media (Oracle Cloud): ${filename} (${mimeType})`);

        const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        const mediaEndpoint = `${cleanBaseUrl}/wp-json/wp/v2/media`;
        
        const uploadResponse = await axios.post(mediaEndpoint, fileBuffer, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': mimeType,
                'Content-Disposition': `attachment; filename="${filename}"`
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 120000 // 2 minutes just in case
        });

        // WordPress returns the media object with ID and source_url
        if (uploadResponse.data && uploadResponse.data.source_url) {
            console.log(`✓ Document uploaded to WP: ${uploadResponse.data.source_url}`);
            return {
                id: uploadResponse.data.id,
                url: uploadResponse.data.source_url
            };
        }
        return null;
    } catch (error) {
        console.error('WP Document Upload Error Details:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            return null;
        }
        throw error;
    }
}

/**
 * Upload image to WordPress Media Library by downloading it first
 * @param {string} imageUrl 
 * @param {string} baseUrl 
 * @param {string} authHeader 
 * @returns {Promise<number|null>} Image ID
 */
async function uploadImageFromUrl(imageUrl, baseUrl, authHeader) {
    try {
        // Clean URL (remove trailing dot if present)
        let cleanUrl = imageUrl;
        if (cleanUrl.endsWith('.')) cleanUrl = cleanUrl.slice(0, -1);
        
        // Ensure https
        if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;

        console.log(`Downloading image: ${cleanUrl}`);

        // 1. Download image locally
        // Use a standard browser User-Agent and headers to mimic a real visit
        const imageResponse = await axios.get(cleanUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': new URL(cleanUrl).origin + '/',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site'
            },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 20000
        });

        // Determine filename and mime type
        let filename = path.basename(new URL(cleanUrl).pathname);
        if (!filename || filename.length < 3) filename = 'image.jpg';
        if (!path.extname(filename)) filename += '.jpg'; // Ensure extension
        
        const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

        console.log(`Uploading to WP: ${filename} (${mimeType})`);

        // 2. Upload to WordPress
        const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        const mediaEndpoint = `${cleanBaseUrl}/wp-json/wp/v2/media`;
        const uploadResponse = await axios.post(mediaEndpoint, imageResponse.data, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': mimeType,
                'Content-Disposition': `attachment; filename="${filename}"`
            },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 60000
        });

        return uploadResponse.data.id;

    } catch (error) {
        console.error('Image Upload Error Details:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
            throw new Error(`Image Upload Failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw new Error(`Image Download Failed: ${error.message}`);
    }
}

/**
 * Ensure global attributes and terms exist in WooCommerce
 * @param {string} baseUrl 
 * @param {string} authHeader 
 * @param {Array} attributes 
 * @returns {Promise<Array>} Updated attributes with IDs
 */
async function ensureGlobalAttributes(baseUrl, authHeader, attributes) {
    if (!Array.isArray(attributes) || attributes.length === 0) return attributes;

    const updatedAttributes = [];
    let globalAttributes = [];

    try {
        // Fetch existing global attributes
        const response = await axios.get(`${baseUrl}/wp-json/wc/v3/products/attributes?per_page=100`, {
            headers: { 'Authorization': authHeader }
        });
        globalAttributes = response.data;
    } catch (e) {
        console.warn('Failed to fetch global attributes, proceeding with custom attributes:', e.message);
        return attributes;
    }

    for (const attr of attributes) {
        // Skip if attribute name is missing
        if (!attr.name) {
            updatedAttributes.push(attr);
            continue;
        }

        let globalAttr = globalAttributes.find(a => a.name.toLowerCase() === attr.name.toLowerCase());
        
        if (!globalAttr) {
            try {
                console.log(`Creating global attribute: ${attr.name}`);
                const createResponse = await axios.post(`${baseUrl}/wp-json/wc/v3/products/attributes`, {
                    name: attr.name,
                    slug: `pa_${attr.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    type: 'select',
                    order_by: 'menu_order',
                    has_archives: true
                }, {
                    headers: { 'Authorization': authHeader }
                });
                globalAttr = createResponse.data;
                // Update local cache
                globalAttributes.push(globalAttr);
            } catch (e) {
                console.error(`Failed to create attribute ${attr.name}:`, e.message);
                // Fallback to custom attribute
                updatedAttributes.push(attr);
                continue;
            }
        }

        // If we have a global attribute, ensure terms exist
        if (globalAttr && globalAttr.id) {
            // Use the global ID
            const newAttr = { ...attr, id: globalAttr.id };
            
            if (Array.isArray(attr.options) && attr.options.length > 0) {
                const termsEndpoint = `${baseUrl}/wp-json/wc/v3/products/attributes/${globalAttr.id}/terms`;
                
                // Create terms sequentially to avoid race conditions/rate limits
                for (const term of attr.options) {
                    try {
                        await axios.post(termsEndpoint, {
                            name: term
                        }, {
                            headers: { 'Authorization': authHeader }
                        });
                    } catch (e) {
                        // Ignore "term_exists" error, log others
                        if (e.response && e.response.data && e.response.data.code === 'term_exists') {
                            // Term already exists, which is fine
                        } else {
                            // Only log if it's not a duplicate error
                             // console.warn(`Note: Term "${term}" for attribute "${attr.name}" could not be created (might exist).`);
                        }
                    }
                }
            }
            updatedAttributes.push(newAttr);
        } else {
            updatedAttributes.push(attr);
        }
    }
    return updatedAttributes;
}

/**
 * Ensure category hierarchy exists
 * @param {string} baseUrl 
 * @param {string} authHeader 
 * @param {string[]} pathArray 
 * @returns {Promise<Array<{id: number}>>}
 */
async function ensureCategoryPath(baseUrl, authHeader, pathArray) {
    if (!Array.isArray(pathArray) || pathArray.length === 0) return [];
    
    let parentId = 0;
    const categoryIds = []; // We might want to assign just the leaf, or all. WP allows multiple. Usually leaf is enough, but assigning all is safe.

    for (const catName of pathArray) {
        if (!catName || typeof catName !== 'string') continue;
        const cleanName = catName.trim();
        if (!cleanName) continue;
        
        try {
            // 1. Check if exists
            // We use 'search' param, but it's partial match. We need to filter exact name and parent.
            const searchUrl = `${baseUrl}/wp-json/wc/v3/products/categories?search=${encodeURIComponent(cleanName)}`;
            const res = await axios.get(searchUrl, { headers: { 'Authorization': authHeader } });
            
            let category = null;
            if (res.data && Array.isArray(res.data)) {
                // Find exact match on name and parent
                category = res.data.find(c => 
                    c.name.toLowerCase() === cleanName.toLowerCase() && 
                    c.parent === parentId
                );
            }
            
            if (!category) {
                // 2. Create if missing
                console.log(`Creating category: "${cleanName}" (Parent ID: ${parentId})`);
                const createRes = await axios.post(`${baseUrl}/wp-json/wc/v3/products/categories`, {
                    name: cleanName,
                    parent: parentId
                }, { headers: { 'Authorization': authHeader } });
                category = createRes.data;
            }
            
            if (category && category.id) {
                parentId = category.id;
                // We only push the ID to the list if we want to assign the product to this category.
                // Usually, we assign to the leaf, but some setups assign to all.
                // Let's assign to all to be safe and ensure visibility in parent cats.
                categoryIds.push({ id: category.id });
            }
        } catch (e) {
            // Check for duplicate slug error (common race condition or conflict)
            if (e.response && e.response.data && e.response.data.code === 'term_exists') {
                 // Try to fetch it again by slug if possible, or just skip
                 console.warn(`Category "${cleanName}" exists but creation failed. Trying to find ID...`);
                 // Fallback: try to find by name again (maybe it was created by another process)
            } else {
                console.error(`Error ensuring category "${cleanName}":`, e.message);
            }
        }
    }
    
    // If we successfully resolved the path, return the IDs.
    // If we failed partway, return what we have.
    return categoryIds;
}

/**
 * Create a product in WooCommerce
 * @param {string} siteUrl - WordPress Site URL (e.g., https://myshop.com)
 * @param {string} consumerKey - WooCommerce Consumer Key
 * @param {string} consumerSecret - WooCommerce Consumer Secret
 * @param {object} productData - { title, price, description, image, url, category, localImagePath, galleryImages, localGalleryPaths }
 * @returns {Promise<object>} - Response data
 */
/**
 * Apply background removal to a local image file.
 * Returns path to a new temp PNG, or original path on failure.
 * @param {string}   filePath
 * @param {Function} removeBgFn  async(Buffer) => Buffer
 */
async function applyBgRemoveToFile(filePath, removeBgFn) {
    try {
        const inputBuf = fs.readFileSync(filePath);
        const pngBuf   = await removeBgFn(inputBuf);
        const outPath  = filePath.replace(/\.[^.]+$/, '_nbg.png');
        fs.writeFileSync(outPath, pngBuf);
        return outPath;
    } catch (err) {
        console.warn(`BG removal failed for ${path.basename(filePath)}: ${err.message} — using original`);
        return filePath;
    }
}

async function createProduct(siteUrl, consumerKey, consumerSecret, productData, options = {}) {
    const removeBgFn = options.removeBgFn || null;
    // Ensure URL doesn't have trailing slash
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/wc/v3/products`;

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const mediaAuthHeader = options.mediaAuthHeader || authHeader;
    const isWooKey = consumerKey.startsWith('ck_') && consumerSecret.startsWith('cs_');

    // Handle Image Upload First
    // Resolve GCS config at the top so we can skip WP media uploads when GCS is configured.
    // GCS-first strategy: images are stored in Google Cloud; GCS URLs are used as the source
    // for WooCommerce product images (WP sideloads once from GCS on first view).
    const gcsConfig = getGcsConfig(productData.gcs);
    let imageId = null;
    let cleanImageUrl = productData.image;
    // Pre-clean the image URL so it's valid for all subsequent logic
    if (typeof cleanImageUrl === 'string') {
        cleanImageUrl = cleanImageUrl.trim();
        if (!cleanImageUrl || cleanImageUrl === 'null' || cleanImageUrl === 'undefined') {
            cleanImageUrl = '';
        }
    } else {
        cleanImageUrl = '';
    }
    if (cleanImageUrl) {
        if (cleanImageUrl.endsWith('.')) cleanImageUrl = cleanImageUrl.slice(0, -1);
        if (cleanImageUrl.startsWith('//')) cleanImageUrl = 'https:' + cleanImageUrl;
        if (cleanImageUrl.startsWith('/')) cleanImageUrl = baseUrl + cleanImageUrl;
        if (!/^https?:\/\//i.test(cleanImageUrl)) cleanImageUrl = '';
    }

    const galleryUrls = Array.isArray(productData.galleryImages) ? productData.galleryImages : [];
    const localGallery = Array.isArray(productData.localGalleryPaths) ? productData.localGalleryPaths : [];
    const extractTokens = (value) => {
        if (!value) return [];
        return value
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .split(' ')
            .map((t) => t.trim())
            .filter((t) => t.length >= 4);
    };
    const baseTokens = Array.from(new Set([
        ...extractTokens(productData.url),
        ...extractTokens(productData.title),
        ...extractTokens(productData.name)
    ]));
    const digitTokens = baseTokens.filter((t) => /\d/.test(t));
    const matchTokens = digitTokens.length > 0 ? digitTokens : baseTokens;
    let filteredGalleryUrls = galleryUrls;
    if (matchTokens.length > 0) {
        const matches = galleryUrls.filter((u) => {
            const lower = (u || '').toLowerCase();
            return matchTokens.some((t) => lower.includes(t));
        });
        if (matches.length > 0) filteredGalleryUrls = matches;
    }
    let filteredLocalGallery = localGallery;
    if (matchTokens.length > 0) {
        const matches = localGallery.filter((p) => {
            const lower = (p || '').toLowerCase();
            return matchTokens.some((t) => lower.includes(t));
        });
        // If filter yields nothing, keep ALL local gallery files rather than silently dropping them
        filteredLocalGallery = matches.length > 0 ? matches : localGallery;
    }
    
    // Upload Main Image
    // imageStorage mode controls where images live:
    //   'gcs'   → GCS only — skip WP media; WC image src = GCS URL
    //   'wp'    → WP media only — upload to WP library; WC image src = WP attachment URL
    //   'both'  → Upload to BOTH WP media AND GCS; WC image src = GCS URL (WP copy is a backup)
    const imageStorageMode = (productData.gcs && productData.gcs.imageStorage) || (gcsConfig ? 'gcs' : 'wp');
    const useGcsForImages  = gcsConfig && imageStorageMode !== 'wp';   // true for 'gcs' and 'both'
    const useWpForImages   = imageStorageMode === 'wp' || imageStorageMode === 'both'; // true for 'wp' and 'both'
    if (useWpForImages && productData.localImagePath && !productData.localImagePath.startsWith('data:')) {
        try {
            let mainPath = productData.localImagePath;
            let bgTempCreated = false;
            if (removeBgFn) {
                console.log(`  [WP] 🎨 Removing background from main image...`);
                const processed = await applyBgRemoveToFile(mainPath, removeBgFn);
                if (processed !== mainPath) { mainPath = processed; bgTempCreated = true; }
            }
            imageId = await uploadImageFromFile(mainPath, baseUrl, mediaAuthHeader);
            if (bgTempCreated) try { fs.unlinkSync(mainPath); } catch(_){}
        } catch (localErr) {
            console.error('Local image upload failed:', localErr.message);
        }
    }

    if (useWpForImages && !imageId && cleanImageUrl && /^https?:\/\//i.test(cleanImageUrl)) {
        if (/fosroc/i.test(cleanImageUrl)) {
            console.log('Skipping Fosroc remote main image upload to WP due to hotlink protection; fallback to GCS if enabled.');
        } else {
            console.log(`[WP] Local main image missing. Downloading from ${cleanImageUrl} to upload to WP as main image...`);
            try {
                // Background removal for remote image? Not implemented here for simplicity, or we could download first.
                // Since uploadImageFromUrl handles download -> upload, let's just use it.
                // If we want bg removal, we would need to download manually, process, upload from file.
                // For now, let's keep it simple to fix the missing image issue.
                
                // Wait for uploadImageFromUrl
                let tempPath = null;
                if (removeBgFn) {
                   // Download to temp for BG removal
                   tempPath = await downloadImageToTemp(cleanImageUrl);
                   if (tempPath) {
                       console.log(`  [WP] 🎨 Removing background from downloaded main image...`);
                       const processed = await applyBgRemoveToFile(tempPath, removeBgFn);
                       if (processed !== tempPath) { 
                           try { fs.unlinkSync(tempPath); } catch(_){}
                           tempPath = processed; 
                       }
                       imageId = await uploadImageFromFile(tempPath, baseUrl, mediaAuthHeader);
                       try { fs.unlinkSync(tempPath); } catch(_){}
                   }
                } else {
                   imageId = await uploadImageFromUrl(cleanImageUrl, baseUrl, mediaAuthHeader);
                }
            } catch (remoteErr) {
                console.error('[WP] Main image remote upload failed:', remoteErr.message);
            }
        }
    }

    // (cleanImageUrl is already cleaned at top)

    // Prepare images array
    const images = [];
    
    // 1. Add Main Image
    if (imageId) {
        images.push({ id: imageId });
    } else if (cleanImageUrl && /^https?:\/\//i.test(cleanImageUrl)) {
        if (/fosroc/i.test(cleanImageUrl)) {
            console.log('Skipping Fosroc remote image for main to avoid 403 sideload.');
        } else {
            images.push({ src: cleanImageUrl });
        }
    }

    // 2. Add Gallery Images
    // Robust Strategy: Try local files first, then fallback to remote download/upload, then fallback to src links
    
    // Upload gallery to WP media when in 'wp' or 'both' mode.
    if (useWpForImages && filteredLocalGallery.length > 0) {
        console.log(`Found ${filteredLocalGallery.length} local gallery images. Uploading to WP media...`);
        for (const filePath of filteredLocalGallery) {
            try {
                let gallPath = filePath;
                let bgTempCreated = false;
                if (removeBgFn) {
                    const processed = await applyBgRemoveToFile(gallPath, removeBgFn);
                    if (processed !== gallPath) { gallPath = processed; bgTempCreated = true; }
                }
                const mediaId = await uploadImageFromFile(gallPath, baseUrl, mediaAuthHeader);
                if (bgTempCreated) try { fs.unlinkSync(gallPath); } catch(_){}
                if (mediaId) {
                    if (!images.some(img => img.id === mediaId)) {
                        images.push({ id: mediaId });
                    }
                }
            } catch (error) {
                console.error(`Gallery image upload failed for ${filePath}:`, error.message);
            }
        }
    }

    // Check if we have enough images. If not, try to fetch from remote URLs
    // We target having at least the number of unique gallery URLs found (up to a limit)
    // Note: localGalleryPaths might not map 1:1 to galleryUrls if downloads failed, so we use galleryUrls as the source of truth for "what we want"
    
    const targetGalleryCount = Math.min(filteredGalleryUrls.length, 8);
    const currentGalleryCount = images.length - (imageId ? 1 : 0); // Exclude main image from count
    const uploadedRemoteNormalized = new Set();

    if (currentGalleryCount < targetGalleryCount && filteredGalleryUrls.length > 0) {
        console.log(`Gallery incomplete (Have ${currentGalleryCount}, Want ${targetGalleryCount}). Attempting remote download...`);
        
        // Filter out URLs that might have already been uploaded (this is hard to know exactly without a map, but we can try)
        // For now, we'll just try to upload the URLs that weren't locally available
        // A simple heuristic: if we have 0 local files, upload all. If we have some, it's tricky.
        // Safer approach: Try to upload ALL gallery URLs that don't match the main image, and rely on WP/our logic to handle duplicates?
        // No, that's wasteful. 
        
        // Better approach: If localGallery was empty, we definitely need to use remote.
        // If localGallery had items but failed, we also need remote.
        
        // Let's iterate through galleryUrls and try to upload them if we don't have enough images
        // We will skip this if we already have a good number of images (e.g. > 3) to save time, unless localGallery was 0

        if (filteredLocalGallery.length === 0 || currentGalleryCount === 0) {
            const dedupedGallery = [];
            const seenKeys = new Set();

            for (const raw of filteredGalleryUrls) {
                if (typeof raw !== 'string') continue;
                const trimmed = raw.trim();
                if (!trimmed || trimmed === cleanImageUrl) continue;
                const normKey = normalizeUrl(trimmed);
                const key = normKey || trimmed;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                dedupedGallery.push(trimmed);
            }

            for (const url of dedupedGallery.slice(0, 8)) {
                // If we already have enough images, stop
                if (images.length >= 9) break; // 1 main + 8 gallery

                try {
                    // Try to download and upload to WP
                    if (/fosroc/i.test(url)) {
                        console.log('Skipping Fosroc remote gallery upload to avoid 403; will use GCS fallback.');
                        continue;
                    }
                    const mediaId = await uploadImageFromUrl(url, baseUrl, mediaAuthHeader);
                    if (mediaId) {
                        const norm = normalizeUrl(url);
                        if (norm) uploadedRemoteNormalized.add(norm);
                        if (!images.some(img => img.id === mediaId)) {
                            images.push({ id: mediaId });
                        }
                    }
                } catch (err) {
                    console.error(`Remote gallery upload failed for ${url}:`, err.message);
                    // Last resort: Add as external URL
                    // Only if it's a valid URL
                    if (/^https?:\/\//i.test(url) && !/fosroc/i.test(url)) {
                        images.push({ src: url });
                    }
                }
            }
        }
    }

    if (filteredGalleryUrls.length > 0) {
        const normalizedGallery = [];
        for (const url of filteredGalleryUrls) {
            if (typeof url !== 'string') continue;
            let cleaned = url.trim();
            if (!cleaned || cleaned === 'null' || cleaned === 'undefined') continue;
            if (cleaned.startsWith('//')) cleaned = 'https:' + cleaned;
            if (cleaned.startsWith('/')) cleaned = baseUrl + cleaned;
            if (!/^https?:\/\//i.test(cleaned)) continue;
            if (cleaned === cleanImageUrl) continue;
            const norm = normalizeUrl(cleaned);
            if (uploadedRemoteNormalized.has(norm)) continue;
            normalizedGallery.push(cleaned);
        }

        const existingSrcs = new Set(images.filter((img) => img.src).map((img) => img.src));
        for (const url of Array.from(new Set(normalizedGallery)).slice(0, 8)) {
            if (images.length >= 9) break;
            if (!existingSrcs.has(url)) {
                images.push({ src: url });
                existingSrcs.add(url);
            }
        }
    }

    function normalizeUrl(value) {
        if (!value) return '';
        if (typeof value === 'object') {
            value = value.src || value.url || '';
        }
        if (typeof value !== 'string') value = String(value);
        let cleaned = value.trim();
        if (!cleaned || cleaned === 'null' || cleaned === 'undefined') return '';
        if (cleaned.startsWith('//')) cleaned = 'https:' + cleaned;
        if (cleaned.startsWith('/')) cleaned = baseUrl + cleaned;
        if (cleaned.endsWith('.')) cleaned = cleaned.slice(0, -1);
        if (cleaned.includes('?')) cleaned = cleaned.split('?')[0];
        cleaned = cleaned.replace(/-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
        return cleaned;
    }

    const seen = new Set();
    const dedupedImages = [];
    const imageMap = {}; // Map normalized URL to image object (id or src)

    for (const img of images) {
        if (img && img.id) {
            const key = `id:${img.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const obj = { id: img.id };
            dedupedImages.push(obj);
            // If this ID came from an upload that we tracked (not easily possible here without more context),
            // but we can at least map it if we knew the source URL.
            // Since we don't map URL -> ID here easily for existing uploads, we rely on the loop below.
            continue;
        }
        if (img && typeof img.src === 'string') {
            const normalized = normalizeUrl(img.src);
            if (!normalized) continue;
            const key = `src:${normalized}`;
            if (seen.has(key)) continue;
            seen.add(key);
            
            const obj = { src: normalized };
            // Check if we have an ID for this source (from previous upload steps)
            // In the current code, 'images' array contains objects with 'id' (if uploaded) or 'src'.
            // If we have mixed types, we should preserve them.
            
            dedupedImages.push(obj);
            imageMap[normalized] = obj;
        }
    }

    const filteredImages = dedupedImages.filter((img) => {
        if (img.id) return true;
        if (typeof img.src === 'string' && img.src.trim() !== '' && img.src !== 'null' && img.src !== 'undefined') {
            return true;
        }
        return false;
    });

    const basePriceStr = cleanPrice(productData.price);
    const basePriceNum = parseFloat(basePriceStr);
    const pricedValue = Number.isFinite(basePriceNum) ? (basePriceNum * 1.1).toFixed(2) : basePriceStr;
    // gcsConfig was already resolved at the top of this function.
    const gcsInfo = {
        enabled: !!gcsConfig,
        attempted: false,
        success: false,
        url: '',
        error: ''
    };
    // Image mirroring to GCS (optional)
    const gcsImages = {
        enabled: !!gcsConfig,
        attempted: false,
        main: '',
        gallery: []
    };
    if (!gcsConfig) {
        console.log('GCS upload skipped: missing GCS_BUCKET or GCS_ACCESS_TOKEN');
    } else {
        console.log(`GCS config: bucket=${gcsConfig.bucket} folder=${gcsConfig.folder || ''} publicBase=${gcsConfig.publicBase}`);
    }
    if (gcsConfig) {
        try {
            const productFolder = sanitizeGcsSegment(productData.title || productData.name || 'Product', 'Product');
            const baseImagesDefault = gcsConfig.imageFolder && gcsConfig.imageFolder.trim() !== '' ? gcsConfig.imageFolder : joinFolder(gcsConfig.folder, 'images');
            const sourceMarker = `${productData.source || ''} ${productData.url || ''}`;
            const isFosrocSource = /fosroc/i.test(sourceMarker);
            let sourceScopedBase = baseImagesDefault;
            if (isFosrocSource) {
                if (gcsConfig.fosrocImageFolder && gcsConfig.fosrocImageFolder.trim() !== '') {
                    sourceScopedBase = gcsConfig.fosrocImageFolder;
                } else {
                    sourceScopedBase = joinFolder(baseImagesDefault, 'fosroc');
                }
            }
            const imagesFolder = joinFolder(sourceScopedBase, productFolder);
            const mainFolder = joinFolder(imagesFolder, 'main');
            const galleryFolder = joinFolder(imagesFolder, 'gallery');
            gcsImages.attempted = true;
            if (productData.localImagePath && fs.existsSync(productData.localImagePath)) {
                const up = await uploadImageToGcs(productData.localImagePath, gcsConfig, mainFolder, '');
                if (up.url) {
                    gcsImages.main = up.url;
                    console.log(`GCS image (main) uploaded: ${up.url}`);
                } else {
                    console.log(`GCS image (main) failed: ${up.error || 'unknown'}`);
                }
            } else if (cleanImageUrl) {
                const tempMain = await downloadImageToTemp(cleanImageUrl);
                if (tempMain) {
                    const up = await uploadImageToGcs(tempMain, gcsConfig, mainFolder, '');
                    if (up.url) gcsImages.main = up.url;
                }
            }
            for (const filePath of filteredLocalGallery.slice(0, 8)) {
                if (!filePath || !fs.existsSync(filePath)) continue;
                const up = await uploadImageToGcs(filePath, gcsConfig, galleryFolder, '');
                if (up.url) {
                    gcsImages.gallery.push(up.url);
                }
            }
            if (gcsImages.gallery.length === 0 && Array.isArray(filteredGalleryUrls) && filteredGalleryUrls.length > 0) {
                for (const u of Array.from(new Set(filteredGalleryUrls)).slice(0, 6)) {
                    const tmp = await downloadImageToTemp(u);
                    if (!tmp) continue;
                    const up = await uploadImageToGcs(tmp, gcsConfig, galleryFolder, '');
                    if (up.url) gcsImages.gallery.push(up.url);
                }
            }
            // After mirroring, prefer GCS main image if we did not get a media ID
            if (gcsImages.main && useGcsForImages) {
                // GCS-first: always rebuild filteredImages to use GCS URL as the main image.
                // Only when imageStorageMode is 'gcs' — when 'wp' mode the WP media ID is used directly.
                // WooCommerce will sideload the image from the GCS URL on first product view.
                const isFosrocHost = (src) => {
                    if (!src || typeof src !== 'string') return false;
                    try {
                        const host = new URL(src).hostname || '';
                        return /fosroc/i.test(host);
                    } catch (_) {
                        return false;
                    }
                };
                const existing = new Set();
                const rebuilt = [];
                // GCS main image goes first
                rebuilt.push({ src: gcsImages.main });
                existing.add(`src:${gcsImages.main}`);
                for (const img of filteredImages) {
                    if (img.id) continue; // skip legacy WP media IDs — GCS is the source
                    if (typeof img.src !== 'string') continue;
                    if (isFosrocHost(img.src)) continue;
                    const key = `src:${img.src}`;
                    if (existing.has(key)) continue;
                    existing.add(key);
                    rebuilt.push({ src: img.src });
                }
                // Replace filteredImages entirely with GCS-sourced list
                filteredImages.length = 0;
                for (const img of rebuilt) filteredImages.push(img);
            }

            // After mirroring, if product still lacks gallery images in payload, use GCS URLs as src so WooCommerce can sideload them
            if (Array.isArray(gcsImages.gallery) && gcsImages.gallery.length > 0) {
                const existingIds = new Set(filteredImages.filter((img) => img.id).map((img) => img.id));
                const existingSrcs = new Set(filteredImages.filter((img) => img.src).map((img) => img.src));
                for (const url of gcsImages.gallery) {
                    if (filteredImages.length >= 9) break; // 1 main + up to 8 gallery
                    if (!existingSrcs.has(url)) {
                        filteredImages.push({ src: url });
                        existingSrcs.add(url);
                    }
                }
            }
        } catch (e) {
            console.error(`GCS image mirror error: ${e.message}`);
        }
    }
    let datasheetStorageUrl = '';
    // Final safety: avoid passing Fosroc-hosted URLs to WooCommerce to prevent 403 sideload failures
    try {
        const isFosrocHost = (src) => {
            if (!src || typeof src !== 'string') return false;
            try {
                const host = new URL(src).hostname || '';
                return /fosroc/i.test(host);
            } catch (_) {
                return false;
            }
        };
        const cleanedList = [];
        const seenKeys = new Set();
        const allowedExt = /\.(jpe?g|png|gif|webp)$/i;
        const isAllowedSrc = (src) => {
            if (!src || typeof src !== 'string') return false;
            const stripped = src.split('?')[0].split('#')[0];
            return allowedExt.test(stripped);
        };
        for (const img of filteredImages) {
            if (img && typeof img.src === 'string') {
                if (isFosrocHost(img.src)) continue;
                if (!isAllowedSrc(img.src)) continue;
                const key = `src:${img.src}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                cleanedList.push({ src: img.src });
                continue;
            }
            if (img && img.id) {
                const key = `id:${img.id}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                cleanedList.push({ id: img.id });
            }
        }
        filteredImages.length = 0;
        for (const img of cleanedList) filteredImages.push(img);
    } catch (_) {}

    let datasheetUrl = sanitizeUrl(productData.datasheetUrl || '');
    if (datasheetUrl && datasheetUrl.startsWith('/')) {
        try {
            datasheetUrl = new URL(datasheetUrl, baseUrl).href;
        } catch (_) {
            datasheetUrl = '';
        }
    }
    if (datasheetUrl && !/^https?:\/\//i.test(datasheetUrl)) datasheetUrl = '';

    const safeDatasheets = Array.isArray(productData.datasheets) ? productData.datasheets : [];
    const safeDocuments = Array.isArray(productData.documents) ? productData.documents : [];
    const rawSheets = [...safeDatasheets, ...safeDocuments];

    const normalizedSheets = [];
    for (const sheet of rawSheets) {
        if (!sheet) continue;
        let sheetUrl = sanitizeUrl(sheet.url || sheet.href || '');
        if (sheetUrl && sheetUrl.startsWith('/')) {
            try {
                sheetUrl = new URL(sheetUrl, baseUrl).href;
            } catch (_) {
                sheetUrl = '';
            }
        }
        if (sheetUrl && !/^https?:\/\//i.test(sheetUrl)) sheetUrl = '';
        if (!sheetUrl) continue;
        normalizedSheets.push({
            url: sheetUrl,
            type: sheet.type || sheet.name || sheet.label || '',
            name: sheet.name || sheet.text || sheet.type || 'Document',
            localPath: sheet.localPath || sheet.localDatasheetPath || ''
        });
    }
    const primaryType = productData.datasheetType || 'TDS';
    if (datasheetUrl && !normalizedSheets.some((s) => s.url === datasheetUrl)) {
        normalizedSheets.unshift({
            url: datasheetUrl,
            type: primaryType,
            name: primaryType,
            localPath: productData.localDatasheetPath || ''
        });
    }
    const isFosroc = /fosroc/i.test(productData.url || '') || /fosroc/i.test(productData.source || '');
    const fosrocName = sanitizeGcsSegment(productData.title || productData.name || 'Fosroc Product', 'Fosroc Product');
    const finalByType = {};
    const finalAllDocs = []; // Store all processed docs for the dropdown list

    if (normalizedSheets.length > 0) {
        for (const sheet of normalizedSheets) {
            const typeFolder = mapDatasheetFolder(sheet.type) || 'TDS';
            const sheetTypeName = typeFolder === 'Others' ? 'Documents' : typeFolder;
            
            let finalUrl = sheet.url;
            let localSheet = sheet.localPath;

            // MANDATORY LOCAL HOSTING: If GCS is down OR it's a restricted site (Fosroc/Pilehead), 
            // we MUST upload to WP Media. External links from these sites will FAIL in all viewers.
            const isRestricted = /fosroc\.ae|fosroc\.com|pilehead\.com/i.test(sheet.url);
            const needsLocalUpload = isRestricted || !gcsConfig || gcsConfig.disabled || gcsConfig.error;

            if (needsLocalUpload) {
                console.log(`[WP-UPLOAD] Forcing local host for restricted/fallback asset: ${sheet.name || sheet.type}`);
                try {
                    let uploadPath = localSheet;
                    
                    // If no local path, download it now with aggressive browser emulation
                    if (!uploadPath || !fs.existsSync(uploadPath)) {
                        console.log(`[WP-UPLOAD] Downloading asset for local hosting: ${sheet.url}`);
                        uploadPath = await downloadDatasheetFromUrl(sheet.url, baseUrl);
                    }

                    if (uploadPath && fs.existsSync(uploadPath)) {
                        const wpUpload = await uploadDatasheetToWP(uploadPath, baseUrl, mediaAuthHeader);
                        if (wpUpload && wpUpload.url) {
                            finalUrl = wpUpload.url;
                            console.log(`[WP-UPLOAD] ✓ SUCCESS: File is now hosted on your domain: ${finalUrl}`);
                        }
                        // Cleanup
                        if (uploadPath.includes('temp_files')) {
                            try { fs.unlinkSync(uploadPath); } catch(_) {}
                        }
                    } else {
                        console.error(`[WP-UPLOAD] CRITICAL: Could not download from ${sheet.url}. Final link will remain external.`);
                    }
                } catch (err) {
                    console.error(`[WP-UPLOAD] FAILED to localize asset: ${err.message}`);
                }
            }

            // Save the final URL to finalByType
            if (finalUrl && !finalByType[sheetTypeName]) {
                finalByType[sheetTypeName] = finalUrl;
            }
            
            // Add to comprehensive list
            if (finalUrl) {
                finalAllDocs.push({
                    name: sheet.name || sheet.type || 'Document',
                    url: finalUrl
                });
            }
        }
    }

    // Helper: Check if URL is Fosroc-hosted
    function isFosrocHost(src) {
        if (!src || typeof src !== 'string') return false;
        try {
            const host = new URL(src).hostname || '';
            return /fosroc/i.test(host);
        } catch (_) {
            return false;
        }
    }

    // Helper: Get attachment URL from WP media ID
    async function getAttachmentUrl(mediaId, baseUrl, authHeader) {
        try {
            const url = `${baseUrl}/wp-json/wp/v2/media/${mediaId}`;
            const resp = await axios.get(url, { headers: { 'Authorization': authHeader } });
            return resp.data?.source_url || '';
        } catch (_) {
            return '';
        }
    }

    const metaData = [
        {
            key: '_scraped_url',
            value: productData.url || ''
        }
    ];
    if (productData.styleGroupKey) {
        metaData.push({
            key: 'style_group_key',
            value: productData.styleGroupKey
        });
    }
    if (productData.styleLabel) {
        metaData.push({
            key: 'style_label',
            value: productData.styleLabel
        });
    }

    // SEO Engine Fields
    if (productData.slug) {
        // payload.slug will be set later
    }
    if (productData.seo) {
        if (productData.seo.title) metaData.push({ key: '_yoast_wpseo_title', value: productData.seo.title });
        if (productData.seo.metaDescription) metaData.push({ key: '_yoast_wpseo_metadesc', value: productData.seo.metaDescription });
        if (productData.seo.focusKeywords) metaData.push({ key: '_yoast_wpseo_focuskw', value: productData.seo.focusKeywords });
    }
    if (productData.schema) {
        metaData.push({ key: '_schema_json_ld', value: productData.schema });
    }

    if (productData.url) {
        metaData.push({
            key: 'ph_source_url',
            value: productData.url
        });
    }

    if (gcsImages.main) {
        metaData.push({
            key: 'gcs_image_url',
            value: gcsImages.main
        });
    }
    if (gcsImages.gallery && gcsImages.gallery.length > 0) {
        metaData.push({
            key: 'gcs_gallery_urls',
            value: gcsImages.gallery.join('|')
        });
    }
    if (finalAllDocs.length > 0) {
        metaData.push({
            key: '_additional_datasheets',
            value: JSON.stringify(finalAllDocs)
        });
    }

    if (finalByType.TDS) {
        metaData.push({
            key: 'datasheet_url',
            value: finalByType.TDS
        });
    }
    if (finalByType.SDS) {
        metaData.push({
            key: 'sds_url',
            value: finalByType.SDS
        });
    }
    if (finalByType.MS) {
        metaData.push({
            key: 'ms_url',
            value: finalByType.MS
        });
    }
    if (finalByType.Documents && !finalByType.TDS && !finalByType.SDS && !finalByType.MS) {
        // Fallback: if we only have generic documents, save as TDS
        metaData.push({
            key: 'datasheet_url',
            value: finalByType.Documents
        });
    }
    // Support both 'tabs' (from JSON) and 'descriptionTabs' (from code) naming
    const tabsData = productData.descriptionTabs || productData.tabs || null;
    
    if (tabsData && typeof tabsData === 'object') {
        const tabs = tabsData;
        
        // Overview/Description tab
        const overviewHtml = tabs.overview || tabs.overviewHtml || tabs.descriptionHtml;
        if (overviewHtml) {
            metaData.push({
                key: 'ph_tab_overview_html',
                value: overviewHtml
            });
            metaData.push({
                key: 'ph_tab_description_html',
                value: overviewHtml
            });
        }
        
        // Benefits tab
        const benefitsHtml = tabs.benefits || tabs.benefitsHtml;
        if (benefitsHtml) {
            metaData.push({
                key: 'ph_tab_benefits_html',
                value: benefitsHtml
            });
            metaData.push({
                key: '_features_benefits',
                value: benefitsHtml
            });
        }
        
        // Specifications tab
        const specHtml = tabs.specifications || tabs.specificationsHtml;
        if (specHtml) {
            metaData.push({
                key: 'ph_tab_specifications_html',
                value: specHtml
            });
            metaData.push({
                key: 'specifications_html',
                value: specHtml
            });
        }
        
        // Applications tab
        const appHtml = tabs.applications || tabs.applicationsHtml || tabs.applicationHtml;
        if (appHtml) {
            metaData.push({
                key: 'ph_tab_applications_html',
                value: appHtml
            });
            metaData.push({
                key: 'ph_tab_application_html',
                value: appHtml
            });
            metaData.push({
                key: '_application_area',
                value: appHtml
            });
        }
        
        // FAQ tab
        const fHtml = tabs.faq || tabs.faqs || tabs.faqHtml || tabs.faqsHtml;
        if (fHtml) {
            metaData.push({
                key: 'ph_tab_faqs_html',
                value: fHtml
            });
        }

        // Estimating tab (new)
        const estimatingHtml = tabs.estimating || tabs.estimatingHtml;
        if (estimatingHtml) {
            metaData.push({
                key: 'ph_tab_estimating_html',
                value: estimatingHtml
            });
            metaData.push({
                key: 'estimating_html',
                value: estimatingHtml
            });
        }

        // Optional: Features tab (some pipelines produce tabs.features instead of benefits)
        const featuresHtml = tabs.features || tabs.featuresHtml;
        if (featuresHtml) {
            metaData.push({
                key: 'ph_tab_features_html',
                value: featuresHtml
            });
        }
        
        // Reviews tab
        if (tabs.reviews || tabs.reviewsHtml) {
            metaData.push({
                key: 'ph_tab_reviews_html',
                value: tabs.reviews || tabs.reviewsHtml
            });
        }
        
        // Delivery tab
        if (tabs.delivery || tabs.deliveryHtml) {
            metaData.push({
                key: 'ph_tab_delivery_html',
                value: tabs.delivery || tabs.deliveryHtml
            });
        }
    }
    
    // Determine product type
    let productType = productData.type || 'simple';
    if (Array.isArray(productData.variations) && productData.variations.length > 0) {
        productType = 'variable';
    }

    // Append downloads to description with Dropdown Style
    let downloadsHtml = '';
    if (finalAllDocs.length > 0) {
        // De-duplicate list by URL
        const uniqueDocs = [];
        const seenDocs = new Set();
        for (const d of finalAllDocs) {
            if (!seenDocs.has(d.url)) {
                seenDocs.add(d.url);
                uniqueDocs.push(d);
            }
        }

        // Use details/summary for a native dropdown feel
        downloadsHtml += `
        <div style="margin-top: 20px;">
            <details style="border: 1px solid #ccc; padding: 10px; border-radius: 5px; background-color: #f9f9f9;">
                <summary style="cursor: pointer; font-weight: bold; color: #333; outline: none;">
                    ⬇️ Downloads (${uniqueDocs.length})
                </summary>
                <ul style="margin-top: 10px; padding-left: 20px;">
                    ${uniqueDocs.map(d => `<li style="margin-bottom: 5px;"><a href="${d.url}" target="_blank" style="text-decoration: none; color: #0073aa;">${d.name}</a></li>`).join('')}
                </ul>
            </details>
        </div>`;
    }

    // Prefer PDF overview tab as WC description — the live template shows this
    // in the Overview tab via $product->get_description().
    const overviewFromTabs = tabsData && (
        tabsData.overview || tabsData.overviewHtml || tabsData.descriptionHtml
    );
    const baseDescription = overviewFromTabs ||
        productData.description ||
        `Scraped from: ${productData.url || ''}`;
    const fullDescription = baseDescription + downloadsHtml;

    // Ensure global attributes exist if configured
    let finalAttributes = productData.attributes || [];

    // Add Brand as Global Attribute if present
    if (productData.brand) {
        const hasBrand = finalAttributes.some(a => a.name.toLowerCase() === 'brand');
        if (!hasBrand) {
            finalAttributes.push({
                name: 'Brand',
                options: [productData.brand],
                visible: true,
                variation: false
            });
        }
    }

    try {
        if (finalAttributes.length > 0) {
            // console.log('Ensuring global attributes exist...');
            finalAttributes = await ensureGlobalAttributes(baseUrl, authHeader, finalAttributes);
            
            // If we have variations, we should update them to use the global attribute IDs
            if (Array.isArray(productData.variations) && productData.variations.length > 0) {
                const attrIdMap = {};
                for (const attr of finalAttributes) {
                    if (attr.id && attr.name) {
                        attrIdMap[attr.name.toLowerCase()] = attr.id;
                    }
                }
                
                // Update variations in place
                for (const v of productData.variations) {
                    if (Array.isArray(v.attributes)) {
                        v.attributes = v.attributes.map(va => {
                            const id = attrIdMap[(va.name || '').toLowerCase()];
                            // Handle 'value' (from scraper) or 'option' (standard WC)
                            const val = va.value || va.option;
                            if (id) {
                                return { id, option: val };
                            }
                            // If no global ID found, pass as custom attribute with name/option
                            return { name: va.name, option: val };
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error('Error ensuring global attributes:', e.message);
    }

    // Ensure category path exists
    let categoryIds = [];
    if (Array.isArray(productData.categoryPath) && productData.categoryPath.length > 0) {
        try {
            categoryIds = await ensureCategoryPath(baseUrl, authHeader, productData.categoryPath);
        } catch (e) {
            console.error('Category path creation failed:', e.message);
        }
    }
    // Fallback: If no path but category string exists
    if (categoryIds.length === 0 && productData.category && typeof productData.category === 'string') {
        categoryIds = [{ name: productData.category }];
    }

    const payload = {
        name: productData.title || productData.name, // Support both
        slug: productData.slug || '',
        type: productType,
        description: fullDescription,
        short_description: productData.shortDescription || productData.short_description || '',
        sku: productData.code || productData.sku || '',
        categories: categoryIds,
        images: filteredImages,
        meta_data: metaData
    };

    // Add attributes if present
    if (finalAttributes.length > 0) {
        payload.attributes = finalAttributes.map(attr => {
            const attrPayload = {
                name: attr.name,
                options: attr.options,
                visible: attr.visible !== undefined ? attr.visible : true,
                variation: attr.variation !== undefined ? attr.variation : true
            };
            if (attr.id) {
                attrPayload.id = attr.id;
            }
            return attrPayload;
        });
    }

    if (productType === 'simple') {
        payload.regular_price = pricedValue;
    } else if (productType === 'variable') {
        let parentPrice = pricedValue;
        if (!basePriceStr && Array.isArray(productData.variations) && productData.variations.length > 0) {
            const rawPrices = productData.variations
                .map(v => cleanPrice(v.regular_price || v.price || productData.price))
                .map(v => parseFloat(v))
                .filter(n => Number.isFinite(n));
            if (rawPrices.length > 0) {
                const minRaw = Math.min(...rawPrices);
                parentPrice = (minRaw * 1.1).toFixed(2);
            }
        }
        payload.regular_price = parentPrice;
    }

    // Set default attributes for variable products
    if (productType === 'variable') {
        if (Array.isArray(productData.default_attributes) && productData.default_attributes.length > 0) {
             // Use explicit default attributes if provided (e.g. from Split Mode)
             payload.default_attributes = productData.default_attributes;
        } else if (Array.isArray(productData.variations) && productData.variations.length > 0) {
            // Fallback: use first variation
            const firstVar = productData.variations[0];
            if (Array.isArray(firstVar.attributes)) {
                payload.default_attributes = firstVar.attributes.map(attr => {
                    if (attr.id) return { id: attr.id, option: attr.option };
                    return { name: attr.name, option: attr.option };
                });
            }
        }
    }
    
    // ── Dedup check: search for existing product by title before creating ──
    let existingProductId = null;
    try {
        const title = (payload.name || '').trim();
        if (title) {
            const searchResp = await axios.get(
                `${baseUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(title)}&per_page=5&status=any`,
                { headers: { 'Authorization': authHeader } }
            );
            if (searchResp.data && Array.isArray(searchResp.data)) {
                const match = searchResp.data.find(p =>
                    (p.name || '').toLowerCase().trim() === title.toLowerCase()
                );
                if (match) {
                    existingProductId = match.id;
                    console.log(`[Dedup] Found existing product ID ${existingProductId} for "${title}" — updating instead of creating.`);
                }
            }
        }
    } catch (dedupErr) {
        console.warn('[Dedup] Search failed, proceeding with create:', dedupErr.message);
    }

    try {
        const isUpdate = !!existingProductId;
        const response = isUpdate
            ? await axios.put(`${baseUrl}/wp-json/wc/v3/products/${existingProductId}`, payload, {
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
              })
            : await axios.post(endpoint, payload, {
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
              });

        // Handle Variations Creation
        if (productType === 'variable' && response.data.id && Array.isArray(productData.variations)) {
            const parentId = response.data.id;
            const variationEndpoint = `${baseUrl}/wp-json/wc/v3/products/${parentId}/variations`;
            
            console.log(`Creating ${productData.variations.length} variations for product ${parentId}...`);
            
            let successCount = 0;
            for (const variant of productData.variations) {
                // Add delay to prevent rate limiting
                await new Promise(r => setTimeout(r, 500));

                try {
                    // Calculate variant price (use variant specific or fallback to base)
                    // noon.js provides 'regular_price', others might provide 'price'
                    const vPriceRaw = variant.regular_price || variant.price || productData.price;
                    const vPriceClean = cleanPrice(vPriceRaw);
                    const vPriceNum = parseFloat(vPriceClean);
                    const vPricedValue = Number.isFinite(vPriceNum) ? (vPriceNum * 1.1).toFixed(2) : vPriceClean;

                    const varPayload = {
                        regular_price: vPricedValue,
                        attributes: variant.attributes.map(a => ({
                            id: a.id,
                            name: a.name,
                            option: a.option || a.value // ensure option is set
                        }))
                    };

                    if (variant.sku) {
                        varPayload.sku = variant.sku;
                    }
                    
                    // Link specific image to this variation
                    if (variant.image) {
                        const variantImgUrl = normalizeUrl(variant.image);
                        // Find this image in the already uploaded images (product or gallery)
                        // We check 'filteredImages' which contains { id: 123 } or { src: '...' }
                        
                        // Strategy:
                        // 1. Check if we have an uploaded ID for this image
                        // 2. If not, and it's a URL, pass it as 'image: { src: ... }' to let WC handle it (if supported for variations)
                        // Note: WC API for variations usually expects 'image' object with 'id' or 'src'
                        
                        // Check if this image matches any of the main product images we prepared
                        // Use imageMap if available, or scan filteredImages
                        let match = null;
                        if (imageMap && imageMap[variantImgUrl]) {
                            match = imageMap[variantImgUrl];
                        } else {
                            match = filteredImages.find(img => normalizeUrl(img.src) === variantImgUrl);
                        }
                        
                        if (match) {
                             if (match.id) {
                                 varPayload.image = { id: match.id };
                             } else if (match.src) {
                                 varPayload.image = { src: match.src };
                             }
                        } else {
                            // Fallback: If not in gallery, try to add it by src
                            if (variantImgUrl) {
                                varPayload.image = { src: variantImgUrl };
                            }
                        }
                    }

                    await axios.post(variationEndpoint, varPayload, {
                        headers: {
                            'Authorization': authHeader,
                            'Content-Type': 'application/json'
                        }
                    });
                    successCount++;
                    console.log(`Created variation SKU: ${variant.sku || 'N/A'}`);
                } catch (varErr) {
                    console.error(`Failed to create variation SKU ${variant.sku}: ${varErr.message}`);
                    if (varErr.response) console.error(JSON.stringify(varErr.response.data));
                }
            }
            console.log(`Variations creation completed. Created ${successCount}/${productData.variations.length}.`);
        }

        return {
            product: response.data,
            gcs: gcsInfo,
            gcs_images: gcsImages
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

/**
 * Test WooCommerce Connection
 */
async function testConnection(siteUrl, consumerKey, consumerSecret) {
    if (!consumerKey || !consumerSecret) {
        throw new Error('Consumer Key and Secret are required.');
    }

    // Ensure URL doesn't have trailing slash
    const baseUrl = siteUrl.replace(/\/$/, '');
    
    // Use /products endpoint with limit=1 to verify read access
    // This is more reliable than system_status which might require admin privileges
    const endpoint = `${baseUrl}/wp-json/wc/v3/products?per_page=1`; 
    
    // Auth string
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const axios = require('axios').default || require('axios'); // Ensure we get the module
    const https = require('https');
    const http = require('http');

    const agent = new https.Agent({  
      rejectUnauthorized: false
    });
    
    // Explicit HTTP agent for non-SSL connections
    const httpAgent = new http.Agent();

    console.log(`Testing connection to: ${endpoint}`);
    
    // Only pass httpsAgent for HTTPS URLs to avoid confusing Axios/Node
    const requestOptions = {
        headers: {
            'Authorization': authHeader,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        validateStatus: function (status) {
            return status >= 200 && status < 500; // Resolve even if 4xx to handle it manually
        },
        // Prevent axios from using global agents
        httpAgent: endpoint.startsWith('http:') ? httpAgent : undefined,
        httpsAgent: endpoint.startsWith('https:') ? agent : undefined
    };

    // Fix for Oracle Cloud / Nginx behind load balancer or strict HTTP checks
    if (endpoint.startsWith('http:')) {
        requestOptions.headers['X-Forwarded-Proto'] = 'https';
    }

    try {
        let response = await axios.get(endpoint, requestOptions);

        // Fallback for HTTP 401: Try query string auth
        if (response.status === 401 && endpoint.startsWith('http:')) {
            console.log('HTTP 401 received. Retrying with query string auth...');
            const fallbackUrl = `${endpoint}&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`;
            // Use query string params instead of header
            const fbOptions = { ...requestOptions };
            delete fbOptions.headers['Authorization']; // Remove header completely
            fbOptions.httpAgent = requestOptions.httpAgent; // Ensure using same agents
            fbOptions.httpsAgent = requestOptions.httpsAgent;
            
            response = await axios.get(fallbackUrl, fbOptions);
        }

        if (response.status === 200) {
            return true;
        } else if (response.status === 401) {
            throw new Error('401 Unauthorized. Check your Consumer Key and Secret.');
        } else if (response.status === 404) {
            throw new Error('404 Not Found. Check Site URL and ensure Permalinks are not set to "Plain".');
        } else {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

    } catch (error) {
        console.error(`WP Test Connection Error [${siteUrl}]:`, error.message);
        const urlSuffix = ` (URL: ${siteUrl})`;
        if (error.response) {
            throw new Error(`Connection Failed: ${error.response.status} - ${error.response.statusText}${urlSuffix}`);
        } else if (error.code === 'ENOTFOUND') {
             throw new Error('Site URL not found. Please check the hostname.' + urlSuffix);
        } else if (error.code === 'EPROTO' || error.message.includes('SSL') || error.message.includes('EPROTO')) {
             throw new Error('SSL/TLS Error: If using LocalWP, update app or trust SSL. Check console for details. (' + error.message + ')' + urlSuffix);
        }
        // Improve logging context
        error.message += urlSuffix;
        throw error;
    }
}

/**
 * Delete a product from WooCommerce
 * @param {string} siteUrl 
 * @param {string} consumerKey 
 * @param {string} consumerSecret 
 * @param {number} productId 
 * @returns {Promise<object>}
 */
async function deleteProduct(siteUrl, consumerKey, consumerSecret, productId) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/wc/v3/products/${productId}?force=true`;

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    try {
        const response = await axios.delete(endpoint, {
            headers: {
                'Authorization': authHeader
            }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress Delete Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listMedia(siteUrl, consumerKey, consumerSecret, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;
    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    // mediaType: explicit value overrides; undefined/empty = return all types
    if (options.mediaType) params.append('media_type', options.mediaType);
    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }
    const endpoint = `${baseUrl}/wp-json/wp/v2/media?${params.toString()}`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        const response = await axios.get(endpoint, {
            headers: {
                Authorization: authHeader
            }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            items: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress Media List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function deleteMedia(siteUrl, consumerKey, consumerSecret, mediaId) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/wp/v2/media/${mediaId}?force=true`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        const response = await axios.delete(endpoint, {
            headers: {
                Authorization: authHeader
            }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress Media Delete Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function bulkDeleteMedia(siteUrl, consumerKey, consumerSecret, options = {}) {
    const targetCountRaw = options.count;
    const targetCount = Number.isFinite(targetCountRaw) && targetCountRaw > 0 ? targetCountRaw : parseInt(targetCountRaw, 10) > 0 ? parseInt(targetCountRaw, 10) : 0;
    if (!targetCount) {
        return { deleted: 0, attempted: 0, pagesVisited: 0 };
    }
    let deleted = 0;
    let attempted = 0;
    let page = 1;
    let pagesVisited = 0;
    const perPage = 100;
    const concurrency = 5;
    while (deleted < targetCount) {
        const pageResult = await listMedia(siteUrl, consumerKey, consumerSecret, {
            page,
            perPage,
            search: options.search || ''
        });
        pagesVisited += 1;
        const items = Array.isArray(pageResult.items) ? pageResult.items : [];
        if (!items.length) {
            break;
        }
        let index = 0;
        while (index < items.length && deleted < targetCount) {
            const batch = [];
            const batchIds = [];
            while (batch.length < concurrency && index < items.length && deleted + batch.length < targetCount) {
                const item = items[index];
                index += 1;
                if (!item || typeof item.id !== 'number') {
                    continue;
                }
                const id = item.id;
                batchIds.push(id);
                batch.push(
                    deleteMedia(siteUrl, consumerKey, consumerSecret, id)
                        .then(() => true)
                        .catch(() => false)
                );
            }
            if (!batch.length) {
                continue;
            }
            const results = await Promise.all(batch);
            attempted += batchIds.length;
            for (const ok of results) {
                if (ok) {
                    deleted += 1;
                }
            }
        }
        if (deleted >= targetCount) {
            break;
        }
        if (pageResult.totalPages && page >= pageResult.totalPages) {
            break;
        }
        page += 1;
    }
    return {
        deleted,
        attempted,
        pagesVisited,
        requested: targetCount
    };
}

async function updateProductDescription(siteUrl, consumerKey, consumerSecret, productId, descriptionHtml, seo, descriptionTabs) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/wc/v3/products/${productId}`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const stripTags = (html) => {
        if (!html) return '';
        return html.replace(/<\/?[^>]+(>|$)/g, ' ');
    };
    let short = stripTags(descriptionHtml).trim();
    if (short.length > 150) {
        short = short.slice(0, 150) + '...';
    }
    const payload = {
        description: descriptionHtml,
        short_description: short
    };
    
    // Update slug if provided (to shorten URL)
    if (seo && seo.slug) {
        payload.slug = seo.slug;
    }
    
    const meta_data = [];
    if (seo && typeof seo === 'object') {
        if (seo.title) meta_data.push({ key: '_pilehead_seo_title', value: seo.title });
        if (seo.focusKeywords) {
            meta_data.push({ key: '_pilehead_seo_focus_keywords', value: seo.focusKeywords });
            meta_data.push({ key: 'rank_math_focus_keyword', value: seo.focusKeywords }); // Rank Math
        }
        if (seo.title) {
            meta_data.push({ key: '_pilehead_seo_title', value: seo.title });
            meta_data.push({ key: 'rank_math_title', value: seo.title }); // Rank Math
        }
        if (seo.metaDescription) {
            meta_data.push({ key: '_pilehead_seo_description', value: seo.metaDescription });
            meta_data.push({ key: 'rank_math_description', value: seo.metaDescription }); // Rank Math
        }
        if (seo.slug) meta_data.push({ key: '_pilehead_seo_slug', value: seo.slug });
        if (seo.ogTitle) meta_data.push({ key: '_pilehead_seo_og_title', value: seo.ogTitle });
        if (seo.ogDescription) meta_data.push({ key: '_pilehead_seo_og_description', value: seo.ogDescription });
        if (seo.ogImageAlt) meta_data.push({ key: '_pilehead_seo_og_image_alt', value: seo.ogImageAlt });
        if (seo.schemaJson) meta_data.push({ key: '_pilehead_seo_schema_json', value: seo.schemaJson });
        if (seo.shortDescription) {
            payload.short_description = seo.shortDescription;
        }
    }
    if (descriptionTabs && typeof descriptionTabs === 'object') {
        const overviewHtml = descriptionTabs.overviewHtml || descriptionTabs.descriptionHtml;
        if (overviewHtml) {
            meta_data.push({ key: 'ph_tab_overview_html', value: overviewHtml });
            meta_data.push({ key: 'ph_tab_description_html', value: overviewHtml });
        }
        if (descriptionTabs.benefitsHtml) {
            meta_data.push({ key: 'ph_tab_benefits_html', value: descriptionTabs.benefitsHtml });
            meta_data.push({ key: '_features_benefits', value: descriptionTabs.benefitsHtml });
        }
        if (descriptionTabs.specificationsHtml) {
            meta_data.push({ key: 'ph_tab_specifications_html', value: descriptionTabs.specificationsHtml });
            meta_data.push({ key: 'specifications_html', value: descriptionTabs.specificationsHtml });
        }
        const appHtml = descriptionTabs.applicationsHtml || descriptionTabs.applicationHtml;
        if (appHtml) {
            meta_data.push({ key: 'ph_tab_applications_html', value: appHtml });
            meta_data.push({ key: 'ph_tab_application_html', value: appHtml });
            meta_data.push({ key: '_application_area', value: appHtml });
        }
        const faqHtml = descriptionTabs.faqHtml || descriptionTabs.faqsHtml;
        if (faqHtml) {
            meta_data.push({ key: 'ph_tab_faqs_html', value: faqHtml });
        }
        if (descriptionTabs.reviewsHtml) {
            meta_data.push({ key: 'ph_tab_reviews_html', value: descriptionTabs.reviewsHtml });
        }
        if (descriptionTabs.deliveryHtml) {
            meta_data.push({ key: 'ph_tab_delivery_html', value: descriptionTabs.deliveryHtml });
        }
    }
    if (meta_data.length > 0) {
        payload.meta_data = meta_data;
    }
    try {
        const response = await axios.put(endpoint, payload, {
            headers: {
                'Authorization': authHeader
            }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress Update Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function updateProductDescriptionBearer(siteUrl, accessToken, productId, descriptionHtml, seo, descriptionTabs) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/wc/v3/products/${productId}`;
    const stripTags = (html) => {
        if (!html) return '';
        return html.replace(/<\/?[^>]+(>|$)/g, ' ');
    };
    let short = stripTags(descriptionHtml).trim();
    if (short.length > 150) {
        short = short.slice(0, 150) + '...';
    }
    const payload = {
        description: descriptionHtml,
        short_description: short
    };
    
    // Update slug if provided (to shorten URL)
    if (seo && seo.slug) {
        payload.slug = seo.slug;
    }
    
    const meta_data = [];
    if (seo && typeof seo === 'object') {
        if (seo.title) {
            meta_data.push({ key: '_pilehead_seo_title', value: seo.title });
            meta_data.push({ key: 'rank_math_title', value: seo.title }); // Rank Math
        }
        if (seo.slug) meta_data.push({ key: '_pilehead_seo_slug', value: seo.slug });
        if (seo.metaDescription) {
            meta_data.push({ key: '_pilehead_seo_description', value: seo.metaDescription });
            meta_data.push({ key: 'rank_math_description', value: seo.metaDescription }); // Rank Math
        }
        if (seo.focusKeywords) {
            meta_data.push({ key: '_pilehead_seo_focus_keywords', value: seo.focusKeywords });
            meta_data.push({ key: 'rank_math_focus_keyword', value: seo.focusKeywords }); // Rank Math
        }
        if (seo.ogTitle) meta_data.push({ key: '_pilehead_seo_og_title', value: seo.ogTitle });
        if (seo.ogDescription) meta_data.push({ key: '_pilehead_seo_og_description', value: seo.ogDescription });
        if (seo.ogImageAlt) meta_data.push({ key: '_pilehead_seo_og_image_alt', value: seo.ogImageAlt });
        if (seo.schemaJson) meta_data.push({ key: '_pilehead_seo_schema_json', value: seo.schemaJson });
        if (seo.shortDescription) {
            payload.short_description = seo.shortDescription;
        }
    }
    if (descriptionTabs && typeof descriptionTabs === 'object') {
        // ph_tab_* keys (new workspace template)
        if (descriptionTabs.overviewHtml || descriptionTabs.descriptionHtml)
            meta_data.push({ key: 'ph_tab_overview_html', value: descriptionTabs.overviewHtml || descriptionTabs.descriptionHtml });
        if (descriptionTabs.benefitsHtml) {
            meta_data.push({ key: 'ph_tab_benefits_html', value: descriptionTabs.benefitsHtml });
            // Live-template key
            meta_data.push({ key: 'features_html', value: descriptionTabs.benefitsHtml });
        }
        if (descriptionTabs.specificationsHtml) {
            meta_data.push({ key: 'ph_tab_specifications_html', value: descriptionTabs.specificationsHtml });
            meta_data.push({ key: 'specifications_html', value: descriptionTabs.specificationsHtml });
        }
        const appHtml = descriptionTabs.applicationsHtml || descriptionTabs.applicationHtml;
        if (appHtml) {
            meta_data.push({ key: 'ph_tab_applications_html', value: appHtml });
            // Live-template key
            meta_data.push({ key: 'applications_html', value: appHtml });
        }
        const faqHtml = descriptionTabs.faqsHtml || descriptionTabs.faqHtml;
        if (faqHtml) {
            meta_data.push({ key: 'ph_tab_faqs_html', value: faqHtml });
            // Live-template key
            meta_data.push({ key: 'faqs_html', value: faqHtml });
        }
        if (descriptionTabs.reviewsHtml) meta_data.push({ key: 'ph_tab_reviews_html', value: descriptionTabs.reviewsHtml });
        if (descriptionTabs.deliveryHtml) meta_data.push({ key: 'ph_tab_delivery_html', value: descriptionTabs.deliveryHtml });
    }
    payload.meta_data = meta_data;
    try {
        const response = await axios.put(endpoint, payload, {
            headers: {
                Authorization: `Bearer ${String(accessToken)}`
            }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress Update Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listProducts(siteUrl, consumerKey, consumerSecret, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;
    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    params.append('orderby', 'date');
    params.append('order', 'desc');
    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }
    if (options.parent !== undefined && options.parent !== null && String(options.parent).trim() !== '') {
        params.append('parent', String(options.parent));
    }
    const endpoint = `${baseUrl}/wp-json/wc/v3/products?${params.toString()}`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        const response = await axios.get(endpoint, {
            headers: {
                'Authorization': authHeader
            }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            products: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listProductsBearer(siteUrl, accessToken, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;
    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    params.append('orderby', 'date');
    params.append('order', 'desc');
    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }
    if (options.parent !== undefined && options.parent !== null && String(options.parent).trim() !== '') {
        params.append('parent', String(options.parent));
    }
    const endpoint = `${baseUrl}/wp-json/wc/v3/products?${params.toString()}`;
    try {
        const response = await axios.get(endpoint, {
            headers: {
                Authorization: `Bearer ${String(accessToken)}`
            }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            products: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}
async function listPosts(siteUrl, consumerKey, consumerSecret, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;
    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    params.append('orderby', 'date');
    params.append('order', 'desc');
    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }
    const endpoint = `${baseUrl}/wp-json/wp/v2/posts?${params.toString()}`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        const response = await axios.get(endpoint, {
            headers: {
                Authorization: authHeader
            }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            items: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listPostsBearer(siteUrl, accessToken, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;
    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    params.append('orderby', 'date');
    params.append('order', 'desc');
    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }
    const endpoint = `${baseUrl}/wp-json/wp/v2/posts?${params.toString()}`;
    try {
        const response = await axios.get(endpoint, {
            headers: {
                Authorization: `Bearer ${String(accessToken)}`
            }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            items: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listPages(siteUrl, consumerKey, consumerSecret, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;
    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    params.append('orderby', 'date');
    params.append('order', 'desc');
    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }
    const endpoint = `${baseUrl}/wp-json/wp/v2/pages?${params.toString()}`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        const response = await axios.get(endpoint, {
            headers: {
                Authorization: authHeader
            }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            items: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listPagesBearer(siteUrl, accessToken, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;
    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    params.append('orderby', 'date');
    params.append('order', 'desc');
    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }
    const endpoint = `${baseUrl}/wp-json/wp/v2/pages?${params.toString()}`;
    try {
        const response = await axios.get(endpoint, {
            headers: {
                Authorization: `Bearer ${String(accessToken)}`
            }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            items: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listCategories(siteUrl, consumerKey, consumerSecret, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;

    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    params.append('orderby', options.orderby || 'count');
    params.append('order', options.order || 'desc');
    params.append('hide_empty', 'false'); // Show empty categories too

    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }

    const endpoint = `${baseUrl}/wp-json/wc/v3/products/categories?${params.toString()}`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    try {
        const response = await axios.get(endpoint, {
            headers: { Authorization: authHeader }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            items: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listCategoriesBearer(siteUrl, accessToken, options = {}) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const pageRaw = options.page;
    const perPageRaw = options.perPage;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : parseInt(pageRaw, 10) > 0 ? parseInt(pageRaw, 10) : 1;
    const perPageLimit = 100;
    let perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : parseInt(perPageRaw, 10) > 0 ? parseInt(perPageRaw, 10) : 20;
    if (perPage > perPageLimit) perPage = perPageLimit;

    const params = new URLSearchParams();
    params.append('per_page', String(perPage));
    params.append('page', String(page));
    params.append('orderby', 'count');
    params.append('order', 'desc');
    params.append('hide_empty', 'false');

    if (options.search && typeof options.search === 'string' && options.search.trim() !== '') {
        params.append('search', options.search.trim());
    }

    const endpoint = `${baseUrl}/wp-json/wc/v3/products/categories?${params.toString()}`;

    try {
        const response = await axios.get(endpoint, {
            headers: { Authorization: `Bearer ${String(accessToken)}` }
        });
        const total = parseInt(response.headers['x-wp-total'] || '0', 10);
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
        return {
            items: response.data || [],
            total,
            totalPages,
            page,
            perPage
        };
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress List Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function listGcsFiles(manualConfig, options = {}) {
    const gcsConfig = getGcsConfig(manualConfig);
    if (!gcsConfig || !gcsConfig.bucket) throw new Error('Missing GCS bucket');
    const token = await resolveGcsToken(gcsConfig);
    if (!token) throw new Error('Missing GCS access token');
    const params = new URLSearchParams();
    params.append('maxResults', String(options.maxResults || 200));
    if (options.prefix) params.append('prefix', options.prefix);
    if (options.pageToken) params.append('pageToken', options.pageToken);
    if (options.delimiter) params.append('delimiter', options.delimiter);
    const apiUrl = `https://storage.googleapis.com/storage/v1/b/${gcsConfig.bucket}/o?${params.toString()}`;
    const res = await axios.get(apiUrl, { headers: { Authorization: `Bearer ${token}` } });
    const data = res.data || {};
    const bucket = gcsConfig.bucket;
    const publicBase = (gcsConfig.publicBase || `https://storage.googleapis.com/${bucket}`).replace(/\/+$/, '');
    const items = (data.items || []).map(item => ({
        name: item.name,
        size: parseInt(item.size || '0', 10),
        updated: item.updated,
        contentType: item.contentType || '',
        publicUrl: `${publicBase}/${item.name}`
    }));
    // prefixes = virtual sub-folder names returned when delimiter is used
    const prefixes = (data.prefixes || []);
    return { items, nextPageToken: data.nextPageToken || null, prefixes };
}

// Create a virtual GCS folder by uploading a zero-byte .keep placeholder object
async function createGcsFolder(manualConfig, folderPath) {
    if (!folderPath || typeof folderPath !== 'string') throw new Error('folderPath required');
    // ensure it ends with /
    const path = folderPath.replace(/\/+$/, '') + '/';
    const gcsConfig = getGcsConfig(manualConfig);
    if (!gcsConfig || !gcsConfig.bucket) throw new Error('Missing GCS bucket');
    const token = await resolveGcsToken(gcsConfig);
    if (!token) throw new Error('Missing GCS access token');
    const objectName = path + '.keep';
    const apiUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(gcsConfig.bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    await axios.post(apiUrl, '', {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'Content-Length': '0'
        }
    });
    return { folder: path, placeholder: objectName };
}

async function deleteGcsObjects(manualConfig, urls) {
    const list = Array.isArray(urls) ? urls.filter((u) => typeof u === 'string' && u.trim() !== '') : [];
    if (!list.length) {
        return { deleted: [], failed: [] };
    }
    const gcsConfig = getGcsConfig(manualConfig);
    if (!gcsConfig || !gcsConfig.bucket) {
        return { deleted: [], failed: list.map((u) => ({ url: u, error: 'missing_config' })) };
    }
    const token = await resolveGcsToken(gcsConfig);
    if (!token) {
        return { deleted: [], failed: list.map((u) => ({ url: u, error: 'missing_token' })) };
    }
    const bucket = gcsConfig.bucket;
    const deleted = [];
    const failed = [];
    for (const originalUrl of list) {
        try {
            const url = originalUrl.trim();
            const marker = `/${bucket}/`;
            const idx = url.indexOf(marker);
            if (idx === -1) {
                failed.push({ url, error: 'bucket_mismatch' });
                continue;
            }
            const objectPart = url.slice(idx + marker.length).split(/[?#]/)[0];
            if (!objectPart) {
                failed.push({ url, error: 'missing_object' });
                continue;
            }
            const apiUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectPart)}`;
            await axios.delete(apiUrl, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            deleted.push(objectPart);
        } catch (err) {
            failed.push({ url: originalUrl, error: err && err.message ? err.message : 'delete_failed' });
        }
    }
    return { deleted, failed };
}

async function testGcsConnection(manualConfig) {
    const gcsConfig = getGcsConfig(manualConfig);
    if (!gcsConfig || !gcsConfig.bucket) throw new Error('Missing GCS bucket');
    const token = await resolveGcsToken(gcsConfig);
    if (!token) throw new Error('Missing GCS access token');
    const folder = (gcsConfig.folder || '').replace(/^\/+|\/+$/g, '');
    const objectName = `${folder ? folder + '/' : ''}pilehead_test_${Date.now()}.txt`;
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${gcsConfig.bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    const content = Buffer.from('pilehead test');
    await axios.post(uploadUrl, content, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });
    const base = (gcsConfig.publicBase || `https://storage.googleapis.com/${gcsConfig.bucket}`).replace(/\/+$/g, '');
    const url = `${base}/${objectName}`;
    const metaUrl = `https://storage.googleapis.com/storage/v1/b/${gcsConfig.bucket}/o/${encodeURIComponent(objectName)}`;
    await axios.get(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
    const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${gcsConfig.bucket}/o/${encodeURIComponent(objectName)}`;
    await axios.delete(deleteUrl, { headers: { Authorization: `Bearer ${token}` } });
    return { url };
}

async function triggerSeoWriter(siteUrl, secretToken, postId, bearerToken = null) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/seo-writer/v1/generate`;
    try {
        const headers = {};
        if (secretToken) headers['X-SEO-Writer-Secret'] = String(secretToken);
        if (bearerToken) headers['Authorization'] = `Bearer ${String(bearerToken)}`;
        const res = await axios.post(endpoint, { post_id: postId }, { headers });
        return res.data || {};
    } catch (error) {
        if (error.response) {
            if (error.response.status === 404) {
                throw new Error('SEO Writer endpoint not found. Activate the SEO Writer plugin and ensure permalinks are not set to Plain.');
            }
            throw new Error(`SEO Writer Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function seoWriterStats(siteUrl, secretToken, bearerToken = null) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/seo-writer/v1/stats`;
    try {
        const headers = {};
        if (secretToken) headers['X-SEO-Writer-Secret'] = String(secretToken);
        if (bearerToken) headers['Authorization'] = `Bearer ${String(bearerToken)}`;
        const res = await axios.get(endpoint, { headers });
        return res.data || {};
    } catch (error) {
        if (error.response) {
            if (error.response.status === 404) {
                throw new Error('SEO Writer endpoint not found. Activate the SEO Writer plugin and ensure permalinks are not set to Plain.');
            }
            throw new Error(`SEO Writer Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function getProduct(siteUrl, consumerKey, consumerSecret, productId) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/wc/v3/products/${productId}`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    try {
        const response = await axios.get(endpoint, {
            headers: {
                Authorization: authHeader
            }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress Get Product Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function updateProduct(siteUrl, consumerKey, consumerSecret, productId, updateData) {
    const baseUrl = siteUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/wp-json/wc/v3/products/${productId}`;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    try {
        const response = await axios.put(endpoint, updateData, {
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(`WordPress Update Product Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

/**
 * Retroactive GCS Image Upload
 * Downloads a product's existing images from WP and uploads them to GCS,
 * then writes gcs_image_url + gcs_gallery_urls meta back to the WP product.
 *
 * @param {string} siteUrl
 * @param {string} consumerKey
 * @param {string} consumerSecret
 * @param {object} product     - WC product object (must have .id, .images[])
 * @param {object} gcsConfig   - from getGcsConfig()
 * @param {function} onProgress - optional callback(msg) for status updates
 */
async function retryUploadImagesToGcs(siteUrl, consumerKey, consumerSecret, product, gcsConfig, onProgress, options = {}) {
    const log = (msg) => { console.log(msg); if (onProgress) onProgress(msg); };
    const baseUrl = siteUrl.replace(/\/$/, '');
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    if (!product || !product.id) return { success: false, error: 'missing_product_id' };
    if (!gcsConfig || !gcsConfig.bucket) return { success: false, error: 'missing_gcs_config' };

    const productName = sanitizeGcsSegment(product.name || `product_${product.id}`, 'Product');
    const baseFolder  = gcsConfig.imageFolder && gcsConfig.imageFolder.trim()
        ? gcsConfig.imageFolder
        : (gcsConfig.folder ? `${gcsConfig.folder}/images` : 'images');
    const productFolder = `${baseFolder}/${productName}`;
    const mainFolder    = `${productFolder}/main`;
    const galleryFolder = `${productFolder}/gallery`;

    const images = Array.isArray(product.images) ? product.images : [];
    if (!images.length) return { success: false, error: 'no_images' };

    // Build per-request auth header so we can download from own WP site
    const dlOptions = { authHeader };

    let gcsMain      = '';
    const gcsGallery = [];
    let lastImgError = '';

    for (let i = 0; i < images.length; i++) {
        const imgSrc = images[i].src || '';
        if (!imgSrc) continue;
        log(`  [${product.id}] Downloading ${i + 1}/${images.length}: ${imgSrc}`);
        let tempPath = await downloadImageToTemp(imgSrc, dlOptions);
        if (!tempPath) {
            log(`  [${product.id}] ✗ Download failed for ${imgSrc.split('/').pop()} — check console for details.`);
            lastImgError = 'download_failed';
            continue;
        }

        // Apply free local BG removal if requested
        if (options.removeBgFn) {
            try {
                log(`  [${product.id}] 🎨 Removing background...`);
                const pngBuffer = await options.removeBgFn(fs.readFileSync(tempPath));
                const processedPath = tempPath.replace(/\.[^.]+$/, '_nbg.png');
                fs.writeFileSync(processedPath, pngBuffer);
                try { fs.unlinkSync(tempPath); } catch (_) {}
                tempPath = processedPath;
                log(`  [${product.id}] ✓ Background removed`);
            } catch (bgrErr) {
                log(`  [${product.id}] ⚠ BG removal failed, uploading original: ${bgrErr.message}`);
            }
        }

        const folder = i === 0 ? mainFolder : galleryFolder;
        const up = await uploadImageToGcs(tempPath, gcsConfig, folder, '');

        // Clean up temp file
        try { fs.unlinkSync(tempPath); } catch (_) {}

        if (up.url) {
            if (i === 0) { gcsMain = up.url; log(`  [${product.id}] ✓ Main GCS: ${up.url}`); }
            else         { gcsGallery.push(up.url); log(`  [${product.id}] ✓ Gallery[${i}] GCS: ${up.url}`); }
        } else {
            lastImgError = up.error || 'upload_failed';
            log(`  [${product.id}] ✗ Upload failed: ${up.error}`);
        }
    }

    if (!gcsMain && !gcsGallery.length) return { success: false, error: 'all_uploads_failed', reason: lastImgError || 'all_uploads_failed' };

    // Write meta back to WP product
    const metaUpdate = [];
    if (gcsMain)             metaUpdate.push({ key: 'gcs_image_url',    value: gcsMain });
    if (gcsGallery.length)   metaUpdate.push({ key: 'gcs_gallery_urls', value: gcsGallery.join('|') });

    try {
        // Use WC REST API to patch the product meta
        const endpoint = `${baseUrl}/wp-json/wc/v3/products/${product.id}`;
        // Build update payload: write GCS meta AND update the WC product images
        // so WooCommerce serves the featured image from GCS directly.
        const updatePayload = { meta_data: metaUpdate };
        if (gcsMain) {
            // Replace the first image src with the GCS URL so WC uses it as featured image
            const existingImages = Array.isArray(product.images) ? product.images : [];
            const updatedImages = [{ src: gcsMain }];
            for (let i = 1; i < existingImages.length && i < 8; i++) {
                const galleryGcs = gcsGallery[i - 1];
                updatedImages.push({ src: galleryGcs || existingImages[i].src });
            }
            updatePayload.images = updatedImages;
        }
        await axios.put(endpoint, updatePayload, {
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            timeout: 60000 // 60s — generous for slow WP hosts
        });
        log(`  [${product.id}] ✓ WP meta + images updated (gcs_image_url, gcs_gallery_urls)`);
    } catch (e) {
        log(`  [${product.id}] ✗ WP meta update failed: ${e.message}`);
        return { success: false, error: `meta_update_failed: ${e.message}`, gcsMain, gcsGallery };
    }

    return { success: true, gcsMain, gcsGallery };
}

module.exports = {
    createProduct,
    testConnection,
    deleteProduct,
    listProducts,
    listProductsBearer,
    listPosts,
    listPostsBearer,
    listPages,
    listPagesBearer,
    listCategories,
    listCategoriesBearer,
    listGcsFiles,
    createGcsFolder,
    deleteGcsObjects,
    updateProductDescription,
    updateProductDescriptionBearer,
    listMedia,
    deleteMedia,
    bulkDeleteMedia,
    testGcsConnection,
    triggerSeoWriter,
    seoWriterStats,
    getProduct,
    updateProduct,
    retryUploadImagesToGcs,
    resolveGcsToken,
};
