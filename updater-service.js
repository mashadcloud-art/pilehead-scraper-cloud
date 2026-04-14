const fs = require('fs');
const path = require('path');
const {
    fetchPlugins,
    sendPluginUpdate,
    fetchPluginStructure,
    fetchPluginFile,
    savePluginFile,
    fetchSiteStructure,
    fetchSiteFile,
    saveSiteFile
} = require('./updater-api');

function listFilesRecursive(rootPath) {
    const results = [];
    function walk(currentPath) {
        const stat = fs.statSync(currentPath);
        if (stat.isDirectory()) {
            const entries = fs.readdirSync(currentPath);
            for (const entry of entries) {
                walk(path.join(currentPath, entry));
            }
        } else if (stat.isFile()) {
            results.push(currentPath);
        }
    }
    walk(rootPath);
    return results;
}

function buildTree(rootPath, filePaths) {
    const tree = {};
    const rootLen = rootPath.length + 1;
    filePaths.forEach((full) => {
        const rel = full.slice(rootLen).replace(/\\/g, '/');
        const parts = rel.split('/');
        let node = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!node[part]) {
                node[part] = {
                    __children: {}
                };
            }
            node = node[part].__children;
        }
    });
    return tree;
}

function encodeFiles(rootPath, selectedRelPaths) {
    const filePaths = [];
    const contents = [];
    selectedRelPaths.forEach((rel) => {
        const full = path.join(rootPath, rel);
        const stat = fs.statSync(full);
        if (!stat.isFile()) return;
        const buf = fs.readFileSync(full);
        filePaths.push(rel.replace(/\\/g, '/'));
        contents.push(buf.toString('base64'));
    });
    return { filePaths, contents };
}

async function loadServerPlugins(siteUrl, token) {
    return await fetchPlugins(siteUrl, token);
}

async function loadServerPluginStructure(siteUrl, token, pluginSlug) {
    return await fetchPluginStructure(siteUrl, token, pluginSlug);
}

async function loadServerPluginFile(siteUrl, token, pluginSlug, relPath) {
    return await fetchPluginFile(siteUrl, token, pluginSlug, relPath);
}

async function saveServerPluginFile(siteUrl, token, pluginSlug, relPath, content) {
    return await savePluginFile(siteUrl, token, pluginSlug, relPath, content);
}

async function loadServerSiteStructure(siteUrl, token) {
    return await fetchSiteStructure(siteUrl, token);
}

async function loadServerSiteFile(siteUrl, token, relPath) {
    return await fetchSiteFile(siteUrl, token, relPath);
}

async function saveServerSiteFile(siteUrl, token, relPath, content) {
    return await saveSiteFile(siteUrl, token, relPath, content);
}

async function prepareFolderUpdate(siteUrl, token, pluginName, rootPath, selectedRelPaths, authToken, activate) {
    const encoded = encodeFiles(rootPath, selectedRelPaths);
    const payload = {
        plugin_name: pluginName,
        file_paths: encoded.filePaths,
        file_contents: encoded.contents,
        auth_token: authToken || '',
        activate: !!activate
    };
    return await sendPluginUpdate(siteUrl, payload, token);
}

async function prepareFilesUpdate(siteUrl, token, pluginName, files, authToken, activate) {
    const filePaths = [];
    const contents = [];
    files.forEach((file) => {
        const stat = fs.statSync(file);
        if (!stat.isFile()) return;
        const buf = fs.readFileSync(file);
        const rel = path.basename(file);
        filePaths.push(rel);
        contents.push(buf.toString('base64'));
    });
    const payload = {
        plugin_name: pluginName,
        file_paths: filePaths,
        file_contents: contents,
        auth_token: authToken || '',
        activate: !!activate
    };
    return await sendPluginUpdate(siteUrl, payload, token);
}

module.exports = {
    listFilesRecursive,
    buildTree,
    encodeFiles,
    loadServerPlugins,
    loadServerPluginStructure,
    loadServerPluginFile,
    saveServerPluginFile,
    prepareFolderUpdate,
    prepareFilesUpdate,
    loadServerSiteStructure,
    loadServerSiteFile,
    saveServerSiteFile
};
