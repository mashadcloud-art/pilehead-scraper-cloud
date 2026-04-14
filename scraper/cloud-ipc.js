const wordpress = require('./wordpress');
const helpers = require('./helpers');
const { scrapeProduct } = require('./scrapeProduct');
const bgremove = require('./bgremove');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const fosroc = require('./fosroc');
const amazon = require('./amazon');
const noon = require('./noon');
const fepy = require('./fepy');
const karcher = require('./karcher');
const universal = require('./universal');
let orchestrator; try { orchestrator = require('./unified/orchestrator'); } catch (e) {}




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

async function handle(channel, data) {
    console.log('[CloudIPC] Received channel:', channel);
    try {
        switch (channel) {
            case 'wp-test-connection': {
                const { url, key, secret } = data || {};
                const result = await wordpress.testConnection(url, key, secret);
                return { success: true, data: result };
            }
            case 'wp-create-product': {
                const { url, key, secret, data: prodData } = data || {};
                const result = await wordpress.createProduct(url, key, secret, prodData);
                return { success: true, data: result };
            }
            case 'wp-delete-product': {
                const { url, key, secret, productId } = data || {};
                const result = await wordpress.deleteProduct(url, key, secret, productId);
                return { success: true, data: result };
            }
            case 'wp-list-products': {
                const { url, key, secret, page, perPage, search, orderby, order } = data || {};
                const want = parseInt(perPage, 10) || 50;
                const apiMax = 100;
                if (want <= apiMax) {
                    const result = await wordpress.listProducts(url, key, secret, { page, perPage: want, search, orderby, order });
                    return { success: true, data: result };
                }
                const pages = Math.ceil(want / apiMax);
                const results = await Promise.all(
                    Array.from({ length: pages }, (_, i) =>
                        wordpress.listProducts(url, key, secret, { page: (page || 1) + i, perPage: apiMax, search, orderby, order })
                    )
                );
                const products = results.flatMap(r => r.products || []).slice(0, want);
                const total = results[0].total;
                const totalPages = results[0].totalPages;
                return { success: true, data: { products, total, totalPages, page: page || 1, perPage: want } };
            }
            case 'wp-list-categories': {
                const { url, key, secret, page, perPage, search, orderby, order } = data || {};
                const result = await wordpress.listCategories(url, key, secret, { page, perPage, search, orderby, order });
                return { success: true, data: result };
            }
            case 'wp-list-pages': {
                const { url, key, secret, page, perPage, search, orderby, order } = data || {};
                const result = await wordpress.listPages(url, key, secret, { page, perPage, search, orderby, order });
                return { success: true, data: result };
            }
            case 'wp-list-media': {
                const { url, key, secret, page, perPage, search, mediaType } = data || {};
                const want = parseInt(perPage, 10) || 50;
                const apiMax = 100;
                if (want <= apiMax) {
                    const result = await wordpress.listMedia(url, key, secret, { page, perPage: want, search, mediaType });
                    return { success: true, data: result };
                }
                const pages = Math.ceil(want / apiMax);
                const results = await Promise.all(
                    Array.from({ length: pages }, (_, i) =>
                        wordpress.listMedia(url, key, secret, { page: (page || 1) + i, perPage: apiMax, search, mediaType })
                    )
                );
                const items = results.flatMap(r => r.items || []).slice(0, want);
                const total = results[0].total;
                const totalPages = results[0].totalPages;
                return { success: true, data: { items, total, totalPages, page: page || 1, perPage: want } };
            }
            case 'wp-delete-media': {
                const { url, key, secret, mediaId } = data || {};
                const result = await wordpress.deleteMedia(url, key, secret, mediaId);
                return { success: true, data: result };
            }
            case 'wp-bulk-delete-media': {
                const { url, key, secret, count, search } = data || {};
                const result = await wordpress.bulkDeleteMedia(url, key, secret, { count, search });
                return { success: true, data: result };
            }
            case 'gcs-list-files': {
                const { gcsConfig, prefix, maxResults, pageToken, delimiter } = data || {};
                const result = await wordpress.listGcsFiles(gcsConfig || {}, { prefix, maxResults, pageToken, delimiter });
                return { success: true, data: result };
            }
            case 'gcs-delete-assets': {
                const { gcsConfig, urls } = data || {};
                const result = await wordpress.deleteGcsObjects(gcsConfig || {}, urls || []);
                return { success: true, data: result };
            }
            case 'gcs-test-connection': {
                const { gcsConfig } = data || {};
                const result = await wordpress.testGcsConnection(gcsConfig || {});
                return { success: true, data: result };
            }
            case 'gcs-create-folder': {
                const { gcsConfig, folderPath } = data || {};
                const result = await wordpress.createGcsFolder(gcsConfig || {}, folderPath);
                return { success: true, data: result };
            }
            case 'media-source-get': {
                const username = (data && data._username) ? data._username : 'mashad';
                const cfgPathObj = path.join(__dirname, '..', 'config', 'profiles', `settings_${username}.json`);
                const cfg = fs.existsSync(cfgPathObj) ? JSON.parse(fs.readFileSync(cfgPathObj, 'utf8')) : {};
                const source = (cfg.gcs && cfg.gcs.imageStorage) || 'gcs';
                const bucket = (cfg.gcs && cfg.gcs.bucket) || '';
                const saPath = (cfg.gcs && cfg.gcs.serviceAccountPath) || '';
                return { success: true, source, bucket, saPath };
            }
            case 'media-source-set': {
                const { source } = data || {};
                const username = (data && data._username) ? data._username : 'mashad';
                const cfgPath = path.join(__dirname, '..', 'config', 'profiles', `settings_${username}.json`);
                const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
                cfg.gcs = cfg.gcs || {};
                cfg.gcs.imageStorage = source;
                fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 4));
                return { success: true, source };
            }
            default:
                console.log('[CloudIPC] Unhandled channel:', channel);
                return { success: false, error: 'Not implemented on Cloud Backend via IPC Bridge' };
        }
    } catch (e) {
        console.error(`[CloudIPC] Error executing ${channel}:`, e);
        return { success: false, error: e.message };
    }
}
module.exports = { handle };

