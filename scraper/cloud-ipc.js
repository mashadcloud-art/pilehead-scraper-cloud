const wordpress = require('./wordpress');
const helpers = require('./helpers');
const { scrapeProduct } = require('./scrapeProduct');
const bgremove = require('./bgremove');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
                const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'settings.json'), 'utf8'));
                const source = (cfg.gcs && cfg.gcs.imageStorage) || 'gcs';
                const bucket = (cfg.gcs && cfg.gcs.bucket) || '';
                const saPath = (cfg.gcs && cfg.gcs.serviceAccountPath) || '';
                return { success: true, source, bucket, saPath };
            }
            case 'media-source-set': {
                const { source } = data || {};
                const cfgPath = path.join(__dirname, '..', 'config', 'settings.json');
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
