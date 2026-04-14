const axios = require('axios');

function buildBaseUrl(siteUrl) {
    if (!siteUrl) return '';
    return siteUrl.replace(/\/+$/, '');
}

async function fetchPlugins(siteUrl, token) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    const headers = {};
    const url = token
        ? `${baseUrl}/wp-json/pilehead/plugins?auth_token=${encodeURIComponent(token)}`
        : `${baseUrl}/wp-json/pilehead/plugins`;
    const res = await axios.get(url, { headers });
    if (!res.data || !Array.isArray(res.data.plugins)) {
        throw new Error('Invalid response from plugin list endpoint');
    }
    return res.data.plugins;
}

async function fetchPluginStructure(siteUrl, token, pluginSlug) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    if (!pluginSlug) throw new Error('Missing plugin slug');
    const headers = {};
    const url = token
        ? `${baseUrl}/wp-json/pilehead/plugin-structure?plugin=${encodeURIComponent(pluginSlug)}&auth_token=${encodeURIComponent(token)}`
        : `${baseUrl}/wp-json/pilehead/plugin-structure?plugin=${encodeURIComponent(pluginSlug)}`;
    const res = await axios.get(url, { headers });
    if (!res.data || !Array.isArray(res.data.files)) {
        throw new Error('Invalid response from plugin structure endpoint');
    }
    return res.data;
}

async function fetchPluginFile(siteUrl, token, pluginSlug, relPath) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    if (!pluginSlug || !relPath) throw new Error('Missing plugin or file path');
    const headers = {};
    const url = token
        ? `${baseUrl}/wp-json/pilehead/plugin-file?plugin=${encodeURIComponent(pluginSlug)}&file=${encodeURIComponent(relPath)}&auth_token=${encodeURIComponent(token)}`
        : `${baseUrl}/wp-json/pilehead/plugin-file?plugin=${encodeURIComponent(pluginSlug)}&file=${encodeURIComponent(relPath)}`;
    const res = await axios.get(url, { headers });
    if (!res.data || typeof res.data.content !== 'string') {
        throw new Error('Invalid response from plugin file endpoint');
    }
    return res.data;
}

async function savePluginFile(siteUrl, token, pluginSlug, relPath, content) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    if (!pluginSlug || !relPath) throw new Error('Missing plugin or file path');
    const headers = {
        'Content-Type': 'application/json'
    };
    const payload = {
        plugin: pluginSlug,
        file: relPath,
        content: Buffer.from(content, 'utf8').toString('base64'),
        auth_token: token || ''
    };
    const res = await axios.post(`${baseUrl}/wp-json/pilehead/plugin-file`, payload, { headers });
    if (!res.data || res.data.success !== true) {
        throw new Error('Save file failed');
    }
    return res.data;
}

async function fetchSiteStructure(siteUrl, token) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    const headers = {};
    const url = token
        ? `${baseUrl}/wp-json/pilehead/site-structure?auth_token=${encodeURIComponent(token)}`
        : `${baseUrl}/wp-json/pilehead/site-structure`;
    const res = await axios.get(url, { headers });
    if (!res.data || !Array.isArray(res.data.files)) {
        throw new Error('Invalid response from site structure endpoint');
    }
    return res.data;
}

async function fetchSiteFile(siteUrl, token, relPath) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    if (!relPath) throw new Error('Missing file path');
    const headers = {};
    const url = token
        ? `${baseUrl}/wp-json/pilehead/site-file?file=${encodeURIComponent(relPath)}&auth_token=${encodeURIComponent(token)}`
        : `${baseUrl}/wp-json/pilehead/site-file?file=${encodeURIComponent(relPath)}`;
    const res = await axios.get(url, { headers });
    if (!res.data || typeof res.data.content !== 'string') {
        throw new Error('Invalid response from site file endpoint');
    }
    return res.data;
}

async function saveSiteFile(siteUrl, token, relPath, content) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    if (!relPath) throw new Error('Missing file path');
    const headers = {
        'Content-Type': 'application/json'
    };
    const payload = {
        file: relPath,
        content: Buffer.from(content, 'utf8').toString('base64'),
        auth_token: token || ''
    };
    const res = await axios.post(`${baseUrl}/wp-json/pilehead/site-file`, payload, { headers });
    if (!res.data || res.data.success !== true) {
        throw new Error('Save site file failed');
    }
    return res.data;
}

async function operatePluginFile(siteUrl, token, pluginSlug, action, filePath, newFilePath) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    if (!pluginSlug || !filePath || !action) throw new Error('Missing plugin, file path, or action');
    const headers = {
        'Content-Type': 'application/json'
    };
    const payload = {
        plugin: pluginSlug,
        file: filePath,
        new_file: newFilePath || '',
        action,
        auth_token: token || ''
    };
    const res = await axios.post(`${baseUrl}/wp-json/pilehead/plugin-file-ops`, payload, { headers });
    if (!res.data || res.data.success !== true) {
        throw new Error('File operation failed');
    }
    return res.data;
}

async function operateSiteFile(siteUrl, token, action, filePath, newFilePath) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    if (!filePath || !action) throw new Error('Missing file path or action');
    const headers = {
        'Content-Type': 'application/json'
    };
    const payload = {
        file: filePath,
        new_file: newFilePath || '',
        action,
        auth_token: token || ''
    };
    const res = await axios.post(`${baseUrl}/wp-json/pilehead/site-file-ops`, payload, { headers });
    if (!res.data || res.data.success !== true) {
        throw new Error('Site file operation failed');
    }
    return res.data;
}

async function sendPluginUpdate(siteUrl, payload, token, onUploadProgress) {
    const baseUrl = buildBaseUrl(siteUrl);
    if (!baseUrl) throw new Error('Missing site URL');
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await axios.post(`${baseUrl}/wp-json/pilehead/update-plugin`, payload, {
        headers,
        httpsAgent: undefined,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        onUploadProgress: (event) => {
            if (onUploadProgress && event && typeof event.loaded === 'number' && typeof event.total === 'number' && event.total > 0) {
                const percent = Math.round((event.loaded / event.total) * 100);
                onUploadProgress(percent);
            }
        }
    });
    return res.data;
}

module.exports = {
    fetchPlugins,
    fetchPluginStructure,
    fetchPluginFile,
    savePluginFile,
    sendPluginUpdate,
    fetchSiteStructure,
    fetchSiteFile,
    saveSiteFile,
    operatePluginFile,
    operateSiteFile
};
