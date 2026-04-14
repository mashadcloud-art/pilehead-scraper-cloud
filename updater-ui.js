// Fill Product Tab module logic for dashboard direct access
(function() {
    let _ipc;
    try {
        _ipc = require('electron').ipcRenderer;
    } catch (e) {
        _ipc = {
            invoke: async (channel, data) => {
                if (channel === 'scrape-fepy-product-details') {
                    const res = await fetch('/api/scrape-fepy-product-details', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    return await res.json();
                }
                throw new Error('ipcRenderer not available in web mode: ' + channel);
            },
            on: () => {},
            send: () => {},
            removeAllListeners: () => {}
        };
    }
    const ipcRenderer = _ipc;

    document.addEventListener('DOMContentLoaded', () => {
        const dashboard = document.getElementById('dashboard');
        if (!dashboard) return;
        const fillTabCard = dashboard.querySelector('.module-card[data-goto="fill-product-tab"]');
        if (!fillTabCard) return;
        fillTabCard.addEventListener('click', async () => {
            // Show a modal with both auto (scraped) and manual fill options
            let modal = document.getElementById('fill-product-tab-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'fill-product-tab-modal';
                modal.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;';
                modal.innerHTML = `
                    <div style="background:#232336;padding:32px 28px 24px 28px;border-radius:16px;min-width:340px;max-width:90vw;box-shadow:0 8px 40px #000a;position:relative;">
                        <button id="close-fill-tab-modal" style="position:absolute;top:12px;right:12px;background:none;border:none;font-size:20px;color:#fff;cursor:pointer;">×</button>
                        <h2 style="margin-bottom:18px;font-size:20px;color:#fff;">Universal Product Tab</h2>
                        <div style="margin-bottom:16px;">
                          <button id="tab-auto-btn" style="margin-right:8px;padding:6px 16px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Auto (Any Website)</button>
                          <button id="tab-manual-btn" style="padding:6px 16px;border-radius:6px;border:none;background:#444;color:#fff;font-weight:600;cursor:pointer;">Manual</button>
                        </div>
                        <div id="tab-auto-section">
                          <input id="fill-tab-url" type="text" placeholder="Paste product URL here..." style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #444;background:#181828;color:#fff;font-size:14px;margin-bottom:12px;">
                          <button id="fill-tab-fetch" style="width:100%;padding:10px 0;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;">Fetch Tab Details</button>
                          <div id="fill-tab-result" style="margin-top:18px;max-height:320px;overflow:auto;background:#181828;border-radius:8px;padding:12px 10px;color:#fff;font-size:13px;display:none;"></div>
                        </div>
                        <div id="tab-manual-section" style="display:none;">
                          <textarea id="manual-tab-content" placeholder="Paste or type product tab HTML/details here..." style="width:100%;min-height:120px;padding:8px 12px;border-radius:6px;border:1px solid #444;background:#181828;color:#fff;font-size:14px;margin-bottom:12px;"></textarea>
                          <button id="manual-tab-apply" style="width:100%;padding:10px 0;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;">Apply Tab Details</button>
                          <div id="manual-tab-result" style="margin-top:18px;max-height:320px;overflow:auto;background:#181828;border-radius:8px;padding:12px 10px;color:#fff;font-size:13px;display:none;"></div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.querySelector('#close-fill-tab-modal').onclick = () => modal.remove();
                // Tab switching
                const autoBtn = modal.querySelector('#tab-auto-btn');
                const manualBtn = modal.querySelector('#tab-manual-btn');
                const autoSection = modal.querySelector('#tab-auto-section');
                const manualSection = modal.querySelector('#tab-manual-section');
                autoBtn.onclick = () => {
                    autoSection.style.display = '';
                    manualSection.style.display = 'none';
                    autoBtn.style.background = '#2563eb';
                    manualBtn.style.background = '#444';
                };
                manualBtn.onclick = () => {
                    autoSection.style.display = 'none';
                    manualSection.style.display = '';
                    autoBtn.style.background = '#444';
                    manualBtn.style.background = '#2563eb';
                };
                // Auto (scraped)
                modal.querySelector('#fill-tab-fetch').onclick = async () => {
                    const url = modal.querySelector('#fill-tab-url').value.trim();
                    const resultDiv = modal.querySelector('#fill-tab-result');
                    if (!url) {
                        resultDiv.style.display = 'block';
                        resultDiv.innerHTML = '<span style="color:#f55;">Please enter a product URL.</span>';
                        return;
                    }
                    resultDiv.style.display = 'block';
                    resultDiv.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner" style="margin-bottom:10px;"></div>Fetching comprehensive details...</div>';
                    try {
                        const result = await ipcRenderer.invoke('scrape-fepy-product-details', { url });
                    if (result.success && result.data.tabs && result.data.tabs.productDetails) {
                        const d = result.data;
                        let html = `
                            <div style="margin-bottom:15px;display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-weight:bold;color:var(--blue-2);font-size:14px;">Extracted Product Summary</span>
                                <button id="copy-details-html" style="padding:5px 12px;background:var(--blue);color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Copy HTML Tab</button>
                            </div>
                            
                            <!-- Detailed Metadata Preview -->
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;background:#0f0f1a;padding:15px;border-radius:8px;border:1px solid #334;">
                                <div style="color:#888;font-size:11px;">Title: <span style="color:#fff;display:block;font-size:13px;margin-top:3px;">${d.title || '—'}</span></div>
                                <div style="color:#888;font-size:11px;">Price: <span style="color:var(--green);display:block;font-size:13px;margin-top:3px;font-weight:bold;">${d.price || '—'}</span></div>
                                <div style="color:#888;font-size:11px;">Brand: <span style="color:var(--amber);display:block;font-size:13px;margin-top:3px;">${d.brand || '—'}</span></div>
                                <div style="color:#888;font-size:11px;">SKU: <span style="color:var(--purple);display:block;font-size:13px;margin-top:3px;">${d.sku || '—'}</span></div>
                                <div style="color:#888;font-size:11px;">Availability: <span style="color:#fff;display:block;font-size:13px;margin-top:3px;">${d.availability || '—'}</span></div>
                                <div style="color:#888;font-size:11px;">Rating: <span style="color:var(--amber);display:block;font-size:13px;margin-top:3px;">${d.rating ? d.rating + '/5' : '—'}</span></div>
                            </div>

                            <div style="margin-bottom:10px;font-weight:bold;color:#aaa;font-size:12px;">Generated HTML Preview:</div>
                            <div class="scraped-content-preview" style="background:#fff;padding:15px;border-radius:8px;border:1px solid #ddd;margin-bottom:15px;color:#333;overflow-x:hidden;max-height:400px;overflow-y:auto;">
                                ${d.tabs.productDetails}
                            </div>
                        `;
                            
                            if (result.data.similarUrls && result.data.similarUrls.length > 0) {
                                html += `
                                    <div style="margin-top:20px;padding-top:15px;border-top:1px solid #334;">
                                        <span style="font-weight:bold;color:var(--amber);display:block;margin-bottom:8px;">Similar Products Found:</span>
                                        <div style="max-height:100px;overflow-y:auto;font-size:11px;color:#888;">
                                            ${result.data.similarUrls.slice(0, 5).map(u => `<div style="margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🔗 ${u}</div>`).join('')}
                                            ${result.data.similarUrls.length > 5 ? `<div style="font-style:italic;">...and ${result.data.similarUrls.length - 5} more</div>` : ''}
                                        </div>
                                    </div>
                                `;
                            }
                            
                            resultDiv.innerHTML = html;
                            
                            const copyBtn = resultDiv.querySelector('#copy-details-html');
                            if (copyBtn) {
                                copyBtn.onclick = () => {
                                    navigator.clipboard.writeText(result.data.tabs.productDetails).then(() => {
                                        copyBtn.textContent = 'Copied!';
                                        copyBtn.style.background = '#059669';
                                        setTimeout(() => {
                                            copyBtn.textContent = 'Copy HTML';
                                            copyBtn.style.background = '#333';
                                        }, 2000);
                                    });
                                };
                            }
                        } else {
                            resultDiv.innerHTML = '<span style="color:#f55;">Failed: ' + (result.error || 'No details') + '</span>';
                        }
                    } catch (e) {
                        resultDiv.innerHTML = '<span style="color:#f55;">Error: ' + e.message + '</span>';
                    }
                };
                // Manual
                modal.querySelector('#manual-tab-apply').onclick = () => {
                    const content = modal.querySelector('#manual-tab-content').value.trim();
                    const resultDiv = modal.querySelector('#manual-tab-result');
                    if (!content) {
                        resultDiv.style.display = 'block';
                        resultDiv.innerHTML = '<span style="color:#f55;">Please enter product tab details.</span>';
                        return;
                    }
                    resultDiv.style.display = 'block';
                    resultDiv.innerHTML = content;
                };
            } else {
                modal.style.display = 'flex';
            }
        });
    });
let fs, path, os, updaterService = {};
try {
    fs = require('fs');
    path = require('path');
    os = require('os');
    updaterService = require('./updater-service');
} catch (e) {
    console.warn('Node modules (fs, path, os, updater-service) not available in web mode');
}

const {
    listFilesRecursive = () => [],
    buildTree = () => ({}),
    loadServerPlugins = async () => [],
    loadServerPluginStructure = async () => ({}),
    loadServerPluginFile = async () => '',
    saveServerPluginFile = async () => ({ success: false }),
    prepareFolderUpdate = async () => ({ success: false }),
    prepareFilesUpdate = async () => ({ success: false }),
    loadServerSiteStructure = async () => ({}),
    loadServerSiteFile = async () => '',
    saveServerSiteFile = async () => ({ success: false })
} = updaterService;

function ensureBackupDir(dir) {
    if (fs && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getBackupBaseDir() {
    if (!os) return '';
    const root = path.join(os.homedir(), 'pilehead-backups');
    ensureBackupDir(root);
    return root;
}

function saveServerFileBackup(elements, state, context, relPath, originalContent) {
    if (!originalContent || !fs) {
        return;
    }
    try {
        const baseDir = getBackupBaseDir();
        if (!baseDir) return;
        const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value.trim() : '';
        const sitePart = rawSiteUrl ? rawSiteUrl.replace(/(^\w+:\/\/|[^\w.-]+)/g, '_') : 'default-site';
        const ctxPart = context === 'site' ? 'site' : 'plugin';
        const dir = path.join(baseDir, ctxPart, sitePart);
        ensureBackupDir(dir);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const relSafe = relPath.replace(/[\\/]+/g, '__');
        const fileName = `${relSafe}__${ts}.bak`;
        const fullPath = path.join(dir, fileName);
        fs.writeFileSync(fullPath, originalContent, 'utf8');
        if (elements.logContainer) {
            appendLog(elements.logContainer, `Backup saved: ${fullPath}`);
        }
    } catch (err) {
        if (elements.logContainer) {
            appendLog(elements.logContainer, `Backup failed: ${err.message}`);
        }
    }
}

const versionStore = {};

function normalizeSiteUrl(value) {
    if (!value) return '';
    let url = String(value).trim();
    while (url.startsWith('`') || url.startsWith("'")) {
        url = url.slice(1).trim();
    }
    while (url.endsWith('`') || url.endsWith("'") || url.endsWith(')')) {
        url = url.slice(0, -1).trim();
    }
    return url;
}

function getElements() {
    return {
        pluginSelect: document.getElementById('plugin-updater-plugin-select'),
        refreshBtn: document.getElementById('plugin-updater-refresh-plugins'),
        loadServerFilesBtn: document.getElementById('plugin-updater-load-server-files'),
        selectFolderBtn: document.getElementById('plugin-updater-select-folder'),
        selectZipBtn: document.getElementById('plugin-updater-select-zip'),
        selectFilesBtn: document.getElementById('plugin-updater-select-files'),
        uploadBtn: document.getElementById('plugin-updater-upload-btn'),
        sourceLabel: document.getElementById('plugin-updater-source-label'),
        fileTree: document.getElementById('plugin-updater-file-tree'),
        serverFileTree: document.getElementById('plugin-updater-server-file-tree'),
        serverFileContent: document.getElementById('plugin-updater-server-file-content'),
        serverFilePath: document.getElementById('plugin-updater-server-file-path'),
        serverFileSaveBtn: document.getElementById('plugin-updater-server-save'),
        versionSelect: document.getElementById('plugin-updater-version-select'),
        restoreVersionBtn: document.getElementById('plugin-updater-restore-version'),
        compareVersionBtn: document.getElementById('plugin-updater-compare-version'),
        comparePanel: document.getElementById('plugin-updater-compare-panel'),
        compareCloseBtn: document.getElementById('plugin-updater-close-compare'),
        compareBefore: document.getElementById('plugin-updater-version-before'),
        compareCurrent: document.getElementById('plugin-updater-version-current'),
        downloadBtn: document.getElementById('plugin-updater-download-file'),
        progressBar: document.getElementById('plugin-updater-progress'),
        logContainer: document.getElementById('plugin-updater-log'),
        tokenInput: document.getElementById('plugin-updater-token'),
        siteTokenInput: document.getElementById('plugin-updater-site-token'),
        wpUrlInput: document.getElementById('plugin-updater-site-url') || document.getElementById('wp-url'),
        sourceFileContent: document.getElementById('plugin-updater-source-file-content'),
        sourceFileSaveBtn: document.getElementById('plugin-updater-source-save'),
        pluginSearchInput: document.getElementById('plugin-updater-plugin-search'),
        pluginTable: document.getElementById('plugin-updater-plugin-table'),
        pluginShowBtn: document.getElementById('plugin-updater-show-plugins'),
        deletePluginBtn: document.getElementById('plugin-updater-delete-plugin'),
        siteFileTree: document.getElementById('plugin-updater-site-file-tree'),
        loadSiteFilesBtn: document.getElementById('plugin-updater-load-site-files'),
        uploadActivateBtn: document.getElementById('plugin-updater-upload-activate-btn'),
        fileManagerOpenPluginBtn: document.getElementById('file-manager-open-plugin-btn'),
        fileManagerOpenSiteBtn: document.getElementById('file-manager-open-site-btn'),
        fileManagerOverlay: document.getElementById('file-manager-overlay'),
        fileManagerCloseBtn: document.getElementById('file-manager-close-btn'),
        fileManagerMode: document.getElementById('file-manager-mode'),
        fileManagerTree: document.getElementById('file-manager-tree'),
        fileManagerSearch: document.getElementById('file-manager-search'),
        fileManagerEditor: document.getElementById('file-manager-editor'),
        fileManagerPath: document.getElementById('file-manager-path'),
        fileManagerPluginName: document.getElementById('file-manager-plugin-name'),
        fileManagerPluginSelect: document.getElementById('file-manager-plugin-select'),
        fileManagerSaveBtn: document.getElementById('file-manager-save-btn'),
        fileManagerRenameBtn: document.getElementById('file-manager-rename-btn'),
        fileManagerDeleteBtn: document.getElementById('file-manager-delete-btn'),
        fileManagerEditTraeBtn: document.getElementById('file-manager-edit-trae-btn')
    };
}

function getVersionKey(state) {
    if (!state.serverPlugin || !state.serverCurrentFile) return null;
    return `${state.serverPlugin}:${state.serverCurrentFile}`;
}

function refreshVersionSelect(elements, state) {
    if (!elements.versionSelect) return;
    const key = getVersionKey(state);
    const select = elements.versionSelect;
    select.innerHTML = '';
    const currentOpt = document.createElement('option');
    currentOpt.value = '';
    currentOpt.textContent = 'Current version';
    select.appendChild(currentOpt);
    if (!key || !versionStore[key] || !versionStore[key].length) {
        return;
    }
    const list = versionStore[key];
    for (let i = list.length - 1; i >= 0; i--) {
        const v = list[i];
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = v.label;
        select.appendChild(opt);
    }
}

function appendLog(logContainer, message) {
    if (!logContainer) return;
    const div = document.createElement('div');
    div.textContent = message;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function renderTree(container, rootPath, tree, onFileClick) {
    if (!container) return;
    container.innerHTML = '';
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '12px';
    function renderNode(node, currentPath, parentUl) {
        Object.keys(node)
            .filter((k) => k !== '__children')
            .sort()
            .forEach((name) => {
                const li = document.createElement('li');
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '6px';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                const relPath = currentPath ? `${currentPath}/${name}` : name;
                checkbox.dataset.relPath = relPath;
                label.appendChild(checkbox);
                const span = document.createElement('span');
                span.textContent = name;
                span.style.cursor = 'pointer';
                span.dataset.relPath = relPath;
                if (onFileClick) {
                    span.addEventListener('click', () => {
                        onFileClick(relPath);
                    });
                }
                label.appendChild(span);
                li.appendChild(label);
                parentUl.appendChild(li);
                const children = node[name].__children;
                const keys = Object.keys(children).filter((k) => k !== '__children');
                if (keys.length > 0) {
                    const childUl = document.createElement('ul');
                    childUl.style.listStyle = 'none';
                    childUl.style.paddingLeft = '14px';
                    li.appendChild(childUl);
                    renderNode(children, relPath, childUl);
                }
            });
    }
    renderNode(tree, '', ul);
    container.appendChild(ul);
}

function collectSelectedRelPaths(container) {
    if (!container) return [];
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"][data-rel-path]'));
    const selected = checkboxes
        .filter((c) => c.checked)
        .map((c) => c.dataset.relPath)
        .filter(Boolean);
    return Array.from(new Set(selected));
}

function renderServerTree(container, files, onFileClick) {
    if (!container) return;
    container.innerHTML = '';
    const root = {};
    files.forEach((item) => {
        const parts = item.path.split('/');
        let node = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!node[part]) {
                node[part] = {};
            }
            if (i === parts.length - 1) {
                node[part].__file = true;
            } else {
                node = node[part];
            }
        }
    });
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '12px';
    function renderNode(node, currentPath, parentUl) {
        Object.keys(node)
            .filter((k) => k !== '__file')
            .sort()
            .forEach((name) => {
                const rel = currentPath ? `${currentPath}/${name}` : name;
                const li = document.createElement('li');
                const span = document.createElement('span');
                span.textContent = name;
                const nodeData = node[name];
                const hasChildren = nodeData && Object.keys(nodeData).some((k) => k !== '__file');
                const isFile = !!(nodeData && nodeData.__file) && !hasChildren;
                const isFolder = hasChildren;
                span.style.cursor = 'pointer';
                span.dataset.relPath = rel;
                li.appendChild(span);
                parentUl.appendChild(li);
                const children = nodeData;
                let childUl = null;
                if (isFolder) {
                    childUl = document.createElement('ul');
                    childUl.style.listStyle = 'none';
                    childUl.style.paddingLeft = '14px';
                    childUl.style.display = 'none';
                    li.appendChild(childUl);
                    renderNode(children, rel, childUl);
                }
                span.addEventListener('click', () => {
                    if (isFolder && childUl) {
                        childUl.style.display = childUl.style.display === 'none' ? 'block' : 'none';
                    } else if (isFile && onFileClick) {
                        onFileClick(rel);
                    }
                });
            });
    }
    renderNode(root, '', ul);
    container.appendChild(ul);
}

async function loadPluginFileWithFallback(siteUrl, pluginToken, siteToken, pluginSlug, relPath) {
    try {
        return await loadServerPluginFile(siteUrl, pluginToken, pluginSlug, relPath);
    } catch (err) {
        if (!err || !err.response || err.response.status !== 404) {
            throw err;
        }
        const baseUrl = siteUrl.replace(/\/+$/, '');
        const rootPath = `wp-content/plugins/${pluginSlug}/${relPath}`;
        const token = siteToken || pluginToken || '';
        const resp = await fetch(
            `${baseUrl}/wp-json/pilehead/site-file?file=${encodeURIComponent(rootPath)}&auth_token=${encodeURIComponent(token)}`,
            {
                method: 'GET',
                credentials: 'omit',
                headers: {
                    Accept: 'application/json, text/plain, */*'
                }
            }
        );
        if (!resp.ok) {
            throw err;
        }
        const data = await resp.json();
        if (!data || typeof data.content !== 'string') {
            throw err;
        }
        return data;
    }
}

function filterFileList(files, term) {
    if (!term) return files;
    const lower = term.toLowerCase();
    return files.filter((item) => {
        const p = item && item.path ? String(item.path) : '';
        return p.toLowerCase().includes(lower);
    });
}

function renderPluginTable(elements, state) {
    if (!elements.pluginTable) return;
    const container = elements.pluginTable;
    const list = Array.isArray(state.pluginsList) ? state.pluginsList : [];
    const term = state.pluginSearchTerm || '';
    const lower = term.toLowerCase();
    const filtered = term
        ? list.filter((p) => {
            const name = (p.name || p.slug || '').toString().toLowerCase();
            const slug = (p.slug || '').toString().toLowerCase();
            return name.includes(lower) || slug.includes(lower);
        })
        : list;
    if (!filtered.length) {
        container.innerHTML = '<div style="font-size:11px;color:var(--muted);">No plugins found.</div>';
        return;
    }
    const rows = [];
    rows.push('<div style="display:flex; align-items:center; margin-bottom:4px; font-size:11px; color:var(--muted); gap:6px;"><div style="width:18px;"></div><div style="flex:1;">Plugin</div><div style="width:70px;text-align:center;">Status</div><div style="width:160px;text-align:right;">Actions</div></div>');
    filtered.forEach((p) => {
        const slug = p.slug || '';
        const name = p.name || slug;
        const active = !!p.active;
        const statusLabel = active ? 'Active' : 'Inactive';
        const statusColor = active ? '#bbf7d0' : '#fecaca';
        rows.push(
            '<div style="display:flex; align-items:center; padding:2px 0; gap:6px;">' +
            `<input type="checkbox" class="plugin-row-check" data-slug="${slug}">` +
            `<div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</div>` +
            `<div style="width:70px; text-align:center; color:${statusColor};">${statusLabel}</div>` +
            '<div style="width:160px; text-align:right; display:flex; justify-content:flex-end; gap:4px;">' +
            `<button class="plugin-row-toggle pill-button" data-slug="${slug}" data-active="${active ? '1' : '0'}" style="font-size:10px; padding:2px 6px;">${active ? 'Deactivate' : 'Activate'}</button>` +
            `<button class="plugin-row-delete pill-button" data-slug="${slug}" style="font-size:10px; padding:2px 6px; background:var(--danger-soft); color:#fecaca; border-color:rgba(248,113,113,0.85);">Delete</button>` +
            '</div>' +
            '</div>'
        );
    });
    rows.push('<div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center; gap:6px;"><button id="plugin-updater-plugin-bulk-delete" class="pill-button" style="background:var(--danger-soft); color:#fecaca; border-color:rgba(248,113,113,0.85); font-size:10px; padding:2px 8px;">Bulk Delete</button><div style="font-size:10px; color:var(--muted);">' + filtered.length + ' plugin(s)</div></div>');
    container.innerHTML = rows.join('');
}

async function refreshFileManagerTree(elements, state) {
    if (!elements.fileManagerTree || !elements.fileManagerMode) return;
    const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value : '';
    const siteUrl = normalizeSiteUrl(rawSiteUrl);
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    const pluginToken = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    const siteToken = elements.siteTokenInput && elements.siteTokenInput.value.trim()
        ? elements.siteTokenInput.value.trim()
        : pluginToken;
    const mode = elements.fileManagerMode.value === 'site' ? 'site' : 'plugin';
    if (mode === 'plugin') {
        let pluginSlug = '';
        let pluginLabel = '';
        if (elements.fileManagerPluginSelect && elements.fileManagerPluginSelect.value) {
            pluginSlug = elements.fileManagerPluginSelect.value;
            const stateObj = elements._pluginState || {};
            const list = Array.isArray(stateObj.pluginsList) ? stateObj.pluginsList : [];
            const match = list.find((p) => (p.slug || '') === pluginSlug);
            if (match) {
                pluginLabel = match.name || match.slug || pluginSlug;
            }
        } else if (elements.pluginSelect && elements.pluginSelect.value) {
            pluginSlug = elements.pluginSelect.value;
            const opt = elements.pluginSelect.options[elements.pluginSelect.selectedIndex];
            pluginLabel = opt ? opt.textContent : pluginSlug;
        }
        if (!pluginSlug) {
            alert('Select a plugin first (use the dropdown in File Manager or Installed Plugins).');
            return;
        }
        if (elements.fileManagerPluginName) {
            elements.fileManagerPluginName.textContent = pluginLabel || pluginSlug;
        }
        try {
            const data = await loadServerPluginStructure(siteUrl, pluginToken, pluginSlug);
            const files = Array.isArray(data.files) ? data.files : [];
            const filtered = filterFileList(files, state.fmSearch);
            renderServerTree(elements.fileManagerTree, filtered, async (relPath) => {
                try {
                    const fileData = await loadPluginFileWithFallback(siteUrl, pluginToken, siteToken, pluginSlug, relPath);
                    const decoded = Buffer.from(fileData.content, 'base64').toString('utf8');
                    state.fmContext = 'plugin';
                    state.fmPlugin = pluginSlug;
                    state.fmCurrentFile = relPath;
                    state.fmCurrentContent = decoded;
                    if (elements.fileManagerPath) {
                        elements.fileManagerPath.textContent = relPath;
                    }
                    if (elements.fileManagerEditor) {
                        elements.fileManagerEditor.value = decoded;
                    }
                } catch (err) {
                    appendLog(elements.logContainer, `Failed to load file: ${err.message}`);
                    alert(`Failed to load file: ${err.message}`);
                }
            });
        } catch (err) {
            appendLog(elements.logContainer, `Failed to load server files: ${err.message}`);
            alert(`Failed to load server files: ${err.message}`);
        }
        return;
    }
    try {
        const baseUrl = siteUrl.replace(/\/+$/, '');
        const resp = await fetch(
            `${baseUrl}/wp-json/pilehead/site-structure?auth_token=${encodeURIComponent(siteToken || '')}`,
            {
                method: 'GET',
                credentials: 'omit',
                headers: {
                    Accept: 'application/json, text/plain, */*'
                }
            }
        );
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const files = Array.isArray(data.files) ? data.files : [];
        if (elements.fileManagerPluginName) {
            elements.fileManagerPluginName.textContent = 'Public_html';
        }
        const filtered = filterFileList(files, state.fmSearch);
        renderServerTree(elements.fileManagerTree, filtered, async (relPath) => {
            try {
                const fileResp = await fetch(
                    `${baseUrl}/wp-json/pilehead/site-file?file=${encodeURIComponent(relPath)}&auth_token=${encodeURIComponent(siteToken || '')}`,
                    {
                        method: 'GET',
                        credentials: 'omit',
                        headers: {
                            Accept: 'application/json, text/plain, */*'
                        }
                    }
                );
                if (!fileResp.ok) {
                    throw new Error(`HTTP ${fileResp.status}`);
                }
                const fileData = await fileResp.json();
                const decoded = typeof fileData.content === 'string'
                    ? Buffer.from(fileData.content, 'base64').toString('utf8')
                    : '';
                state.fmContext = 'site';
                state.fmPlugin = null;
                state.fmCurrentFile = relPath;
                state.fmCurrentContent = decoded;
                if (elements.fileManagerPath) {
                    elements.fileManagerPath.textContent = relPath;
                }
                if (elements.fileManagerEditor) {
                    elements.fileManagerEditor.value = decoded;
                }
            } catch (err) {
                appendLog(elements.logContainer, `Failed to load site file: ${err.message}`);
                alert(`Failed to load site file: ${err.message}`);
            }
        });
    } catch (err) {
        appendLog(elements.logContainer, `Failed to load public_html files: ${err.message}`);
        alert(`Failed to load public_html files: ${err.message}`);
    }
}

function openFileManager(elements, state, context) {
    if (!elements.fileManagerOverlay) return;
    elements.fileManagerOverlay.classList.remove('hidden');
    elements.fileManagerOverlay.style.display = 'flex';
    state.fmContext = null;
    state.fmPlugin = null;
    state.fmCurrentFile = null;
    state.fmCurrentContent = '';
    if (elements.fileManagerEditor) {
        elements.fileManagerEditor.value = '';
    }
    if (elements.fileManagerPath) {
        elements.fileManagerPath.textContent = '';
    }
    if (elements.fileManagerMode) {
        if (context === 'site') {
            elements.fileManagerMode.value = 'site';
        } else {
            elements.fileManagerMode.value = 'plugin';
        }
    }
    refreshFileManagerTree(elements, state);
}

function closeFileManager(elements) {
    if (elements.fileManagerOverlay) {
        elements.fileManagerOverlay.classList.add('hidden');
        elements.fileManagerOverlay.style.display = 'none';
    }
}

async function handleFileManagerSave(elements, state) {
    if (!elements.fileManagerEditor) return;
    const content = elements.fileManagerEditor.value;
    const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value : '';
    const siteUrl = normalizeSiteUrl(rawSiteUrl);
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    if (!state.fmContext || !state.fmCurrentFile) {
        alert('Select a file in the File Manager first.');
        return;
    }
    const pluginToken = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    const siteToken = elements.siteTokenInput && elements.siteTokenInput.value.trim()
        ? elements.siteTokenInput.value.trim()
        : pluginToken;
    try {
        if (state.fmContext === 'plugin') {
            if (!state.fmPlugin) {
                alert('Select a plugin first.');
                return;
            }
            await saveServerPluginFile(siteUrl, pluginToken, state.fmPlugin, state.fmCurrentFile, content);
            appendLog(elements.logContainer, `Saved plugin file "${state.fmCurrentFile}" from File Manager.`);
        } else {
            const baseUrl = siteUrl.replace(/\/+$/, '');
            const resp = await fetch(`${baseUrl}/wp-json/pilehead/site-file`, {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*'
                },
                body: JSON.stringify({
                    file: state.fmCurrentFile,
                    content: Buffer.from(content, 'utf8').toString('base64'),
                    auth_token: siteToken || ''
                })
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            appendLog(elements.logContainer, `Saved site file "${state.fmCurrentFile}" from File Manager.`);
        }
        alert('File saved successfully.');
        state.fmCurrentContent = content;
    } catch (err) {
        appendLog(elements.logContainer, `File Manager save failed: ${err.message}`);
        alert(`File Manager save failed: ${err.message}`);
    }
}

async function handleFileManagerEditWithTrae(elements, state) {
    if (!state.fmContext || !state.fmCurrentFile || !state.fmPlugin) {
        alert('Select a plugin file in the File Manager first.');
        return;
    }
    if (state.fmContext !== 'plugin') {
        alert('Edit with Trae is only available for plugin files.');
        return;
    }
    const content = typeof state.fmCurrentContent === 'string' ? state.fmCurrentContent : '';
    if (!content) {
        alert('No file content loaded. Click a file in the tree first.');
        return;
    }
    try {
        const pluginSlug = state.fmPlugin;
        const relPath = state.fmCurrentFile.replace(/\\/g, '/');
        const baseDir = path.join(process.cwd(), 'wp-plugins', pluginSlug);
        const fullPath = path.join(baseDir, relPath);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
        appendLog(elements.logContainer, `Saved copy for Trae: ${fullPath}`);
        alert('File saved to local project for editing in Trae.');
    } catch (err) {
        appendLog(elements.logContainer, `Edit with Trae failed: ${err.message}`);
        alert(`Edit with Trae failed: ${err.message}`);
    }
}

async function handleFileManagerDelete(elements, state) {
    if (!state.fmContext || !state.fmCurrentFile) {
        alert('Select a file in the File Manager first.');
        return;
    }
    if (!confirm(`Delete "${state.fmCurrentFile}" from server? This cannot be undone.`)) {
        return;
    }
    const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value : '';
    const siteUrl = normalizeSiteUrl(rawSiteUrl);
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    const pluginToken = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    const siteToken = elements.siteTokenInput && elements.siteTokenInput.value.trim()
        ? elements.siteTokenInput.value.trim()
        : pluginToken;
    const baseUrl = siteUrl.replace(/\/+$/, '');
    try {
        if (state.fmContext === 'plugin') {
            if (!state.fmPlugin) {
                alert('Select a plugin first.');
                return;
            }
            const resp = await fetch(`${baseUrl}/wp-json/pilehead/plugin-file-ops`, {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*'
                },
                body: JSON.stringify({
                    plugin: state.fmPlugin,
                    file: state.fmCurrentFile,
                    action: 'delete',
                    auth_token: pluginToken || ''
                })
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
        } else {
            const resp = await fetch(`${baseUrl}/wp-json/pilehead/site-file-ops`, {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*'
                },
                body: JSON.stringify({
                    file: state.fmCurrentFile,
                    action: 'delete',
                    auth_token: siteToken || ''
                })
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
        }
        appendLog(elements.logContainer, `Deleted "${state.fmCurrentFile}" from File Manager.`);
        alert('File deleted from server.');
        state.fmCurrentFile = null;
        state.fmCurrentContent = '';
        if (elements.fileManagerPath) elements.fileManagerPath.textContent = '';
        if (elements.fileManagerEditor) elements.fileManagerEditor.value = '';
        refreshFileManagerTree(elements, state);
    } catch (err) {
        appendLog(elements.logContainer, `File Manager delete failed: ${err.message}`);
        alert(`File Manager delete failed: ${err.message}`);
    }
}

async function handleFileManagerRename(elements, state) {
    if (!state.fmContext || !state.fmCurrentFile) {
        alert('Select a file in the File Manager first.');
        return;
    }
    const newName = prompt('Enter new relative path for this file:', state.fmCurrentFile);
    if (!newName || newName === state.fmCurrentFile) {
        return;
    }
    const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value : '';
    const siteUrl = normalizeSiteUrl(rawSiteUrl);
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    const pluginToken = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    const siteToken = elements.siteTokenInput && elements.siteTokenInput.value.trim()
        ? elements.siteTokenInput.value.trim()
        : pluginToken;
    const baseUrl = siteUrl.replace(/\/+$/, '');
    try {
        if (state.fmContext === 'plugin') {
            if (!state.fmPlugin) {
                alert('Select a plugin first.');
                return;
            }
            const resp = await fetch(`${baseUrl}/wp-json/pilehead/plugin-file-ops`, {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*'
                },
                body: JSON.stringify({
                    plugin: state.fmPlugin,
                    file: state.fmCurrentFile,
                    new_file: newName,
                    action: 'rename',
                    auth_token: pluginToken || ''
                })
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
        } else {
            const resp = await fetch(`${baseUrl}/wp-json/pilehead/site-file-ops`, {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*'
                },
                body: JSON.stringify({
                    file: state.fmCurrentFile,
                    new_file: newName,
                    action: 'rename',
                    auth_token: siteToken || ''
                })
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
        }
        appendLog(elements.logContainer, `Renamed "${state.fmCurrentFile}" to "${newName}" from File Manager.`);
        alert('File renamed successfully.');
        state.fmCurrentFile = newName;
        if (elements.fileManagerPath) elements.fileManagerPath.textContent = newName;
        refreshFileManagerTree(elements, state);
    } catch (err) {
        appendLog(elements.logContainer, `File Manager rename failed: ${err.message}`);
        alert(`File Manager rename failed: ${err.message}`);
    }
}

async function handleDeletePlugin(elements, state) {
    const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value : '';
    const siteUrl = normalizeSiteUrl(rawSiteUrl);
    const token = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    const pluginName = elements.pluginSelect ? elements.pluginSelect.value : '';
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    if (!pluginName) {
        alert('Select a plugin from the server list first.');
        return;
    }
    if (!confirm(`Delete plugin "${pluginName}" from WordPress? This will remove its files and cannot be undone.`)) {
        return;
    }
    const baseUrl = siteUrl.replace(/\/+$/, '');
    try {
        const resp = await fetch(`${baseUrl}/wp-json/pilehead/plugin-delete`, {
            method: 'POST',
            credentials: 'omit',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*'
            },
            body: JSON.stringify({
                plugin: pluginName,
                auth_token: token || ''
            })
        });
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        appendLog(elements.logContainer, `Deleted plugin "${pluginName}".`);
        alert('Plugin deleted from WordPress.');
        elements.pluginSelect.value = '';
        state.serverPlugin = null;
        state.serverCurrentFile = null;
        state.serverCurrentContent = '';
        if (elements.serverFilePath) {
            elements.serverFilePath.textContent = '';
        }
        if (elements.serverFileContent) {
            elements.serverFileContent.value = '';
        }
        if (elements.serverFileTree) {
            elements.serverFileTree.innerHTML = '';
        }
        await handleLoadPlugins(elements);
    } catch (err) {
        appendLog(elements.logContainer, `Delete plugin failed: ${err.message}`);
        alert(`Delete plugin failed: ${err.message}`);
    }
}

async function handlePluginToggle(siteUrl, token, slug, shouldActivate, logContainer) {
    const baseUrl = siteUrl.replace(/\/+$/, '');
    const action = shouldActivate ? 'activate' : 'deactivate';
    const resp = await fetch(`${baseUrl}/wp-json/pilehead/plugin-toggle`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/plain, */*'
        },
        body: JSON.stringify({
            plugin: slug,
            action,
            auth_token: token || ''
        })
    });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const label = shouldActivate ? 'activated' : 'deactivated';
    appendLog(logContainer, `Plugin "${slug}" ${label}.`);
    return data;
}

async function handlePluginDelete(siteUrl, token, slug, logContainer) {
    const baseUrl = siteUrl.replace(/\/+$/, '');
    const resp = await fetch(`${baseUrl}/wp-json/pilehead/plugin-delete`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/plain, */*'
        },
        body: JSON.stringify({
            plugin: slug,
            auth_token: token || ''
        })
    });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    appendLog(logContainer, `Deleted plugin "${slug}" from plugin table.`);
    return data;
}

async function handleLoadPlugins(elements) {
    const siteUrl = elements.wpUrlInput ? elements.wpUrlInput.value.trim() : '';
    const token = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    appendLog(elements.logContainer, 'Loading plugins from server...');
    try {
        const plugins = await loadServerPlugins(siteUrl, token);
        const list = Array.isArray(plugins) ? plugins : [];
        const stateObj = elements._pluginState || {};
        stateObj.pluginsList = list;
        stateObj.pluginSearchTerm = stateObj.pluginSearchTerm || '';
        elements._pluginState = stateObj;
        elements.pluginSelect.innerHTML = '<option value="">Select plugin...</option>';
        list.forEach((p) => {
            const value = p.slug || p.name || p;
            const label = p.name || p.slug || p;
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            elements.pluginSelect.appendChild(opt);
        });
        if (elements.fileManagerPluginSelect) {
            elements.fileManagerPluginSelect.innerHTML = '<option value="">Select plugin...</option>';
            list.forEach((p) => {
                const value = p.slug || p.name || p;
                const label = p.name || p.slug || p;
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                elements.fileManagerPluginSelect.appendChild(opt);
            });
        }
        if (elements.pluginTable) {
            elements.pluginTable.style.display = elements.pluginTable.style.display || 'none';
        }
        renderPluginTable(elements, stateObj);
        appendLog(elements.logContainer, `Loaded ${list.length} plugin(s) from server.`);
    } catch (err) {
        appendLog(elements.logContainer, `Failed to load plugins: ${err.message}`);
        alert(`Failed to load plugins: ${err.message}`);
    }
}

async function handleSelectFolder(elements, state) {
    const res = await ipcRenderer.invoke('plugin-updater-select-folder');
    if (!res || res.canceled || !Array.isArray(res.filePaths) || res.filePaths.length === 0) {
        return;
    }
    const rootPath = res.filePaths[0];
    const files = listFilesRecursive(rootPath);
    const tree = buildTree(rootPath, files);
    state.mode = 'folder';
    state.rootPath = rootPath;
    state.files = files;
    state.selectedFiles = [];
    elements.sourceLabel.textContent = rootPath;
    renderTree(elements.fileTree, rootPath, tree, (relPath) => {
        if (!elements.sourceFileContent) return;
        const fullPath = path.join(rootPath, relPath);
        try {
            const stat = fs.statSync(fullPath);
            if (!stat.isFile()) return;
            const content = fs.readFileSync(fullPath, 'utf8');
            elements.sourceFileContent.value = content;
            state.sourceCurrentFile = relPath;
            appendLog(elements.logContainer, `Opened local file "${relPath}"`);
        } catch (err) {
            appendLog(elements.logContainer, `Failed to open local file "${relPath}": ${err.message}`);
        }
    });
    appendLog(elements.logContainer, `Loaded folder with ${files.length} file(s).`);
}

async function handleSelectFiles(elements, state) {
    const res = await ipcRenderer.invoke('plugin-updater-select-files');
    if (!res || res.canceled || !Array.isArray(res.filePaths) || res.filePaths.length === 0) {
        return;
    }
    const files = res.filePaths;
    const rootPath = path.dirname(files[0]);
    const tree = buildTree(rootPath, files);
    state.mode = 'files';
    state.rootPath = rootPath;
    state.files = files;
    state.selectedFiles = [];
    elements.sourceLabel.textContent = `${files.length} file(s) selected`;
    renderTree(elements.fileTree, rootPath, tree, (relPath) => {
        if (!elements.sourceFileContent) return;
        const fullPath = path.join(rootPath, relPath);
        try {
            const stat = fs.statSync(fullPath);
            if (!stat.isFile()) return;
            const content = fs.readFileSync(fullPath, 'utf8');
            elements.sourceFileContent.value = content;
            state.sourceCurrentFile = relPath;
            appendLog(elements.logContainer, `Opened local file "${relPath}"`);
        } catch (err) {
            appendLog(elements.logContainer, `Failed to open local file "${relPath}": ${err.message}`);
        }
    });
    appendLog(elements.logContainer, `Selected ${files.length} file(s).`);
}

async function handleSelectZip(elements, state) {
    const res = await ipcRenderer.invoke('plugin-updater-select-zip');
    if (!res || res.canceled || !Array.isArray(res.filePaths) || res.filePaths.length === 0) {
        return;
    }
    const zipPath = res.filePaths[0];
    state.mode = 'zip';
    state.rootPath = zipPath;
    state.files = [zipPath];
    state.selectedFiles = [zipPath];
    elements.sourceLabel.textContent = zipPath;
    elements.fileTree.innerHTML = '';
    appendLog(elements.logContainer, `Selected ZIP file: ${zipPath}`);
}

async function handleLoadServerFiles(elements, state) {
    const siteUrl = elements.wpUrlInput ? elements.wpUrlInput.value.trim() : '';
    const pluginToken = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    const siteToken = elements.siteTokenInput && elements.siteTokenInput.value.trim()
        ? elements.siteTokenInput.value.trim()
        : pluginToken;
    const pluginName = elements.pluginSelect ? elements.pluginSelect.value : '';
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    if (!pluginName) {
        alert('Select a plugin from the server list first.');
        return;
    }
    state.serverPlugin = pluginName;
    state.serverCurrentFile = null;
    state.serverContext = 'plugin';
    appendLog(elements.logContainer, `Loading server files for plugin "${pluginName}"...`);
    try {
        const data = await loadServerPluginStructure(siteUrl, pluginToken, pluginName);
        const files = Array.isArray(data.files) ? data.files : [];
        renderServerTree(elements.serverFileTree, files, async (relPath) => {
            try {
                const fileData = await loadPluginFileWithFallback(siteUrl, pluginToken, siteToken, pluginName, relPath);
                state.serverCurrentFile = relPath;
                state.serverCurrentContent = '';
                state.serverContext = 'plugin';
                if (elements.serverFilePath) {
                    elements.serverFilePath.textContent = relPath;
                }
                if (elements.serverFileContent) {
                    const decoded = Buffer.from(fileData.content, 'base64').toString('utf8');
                    elements.serverFileContent.value = decoded;
                    state.serverCurrentContent = decoded;
                }
                refreshVersionSelect(elements, state);
            } catch (err) {
                appendLog(elements.logContainer, `Failed to load file: ${err.message}`);
                alert(`Failed to load file: ${err.message}`);
            }
        });
        appendLog(elements.logContainer, `Loaded ${files.length} file(s) from server plugin.`);
    } catch (err) {
        appendLog(elements.logContainer, `Failed to load server files: ${err.message}`);
        alert(`Failed to load server files: ${err.message}`);
    }
}

async function handleSaveServerFile(elements, state) {
    const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value : '';
    const siteUrl = normalizeSiteUrl(rawSiteUrl);
    const token = state.serverContext === 'site'
        ? (elements.siteTokenInput && elements.siteTokenInput.value.trim()
            ? elements.siteTokenInput.value.trim()
            : (elements.tokenInput ? elements.tokenInput.value.trim() : ''))
        : (elements.tokenInput ? elements.tokenInput.value.trim() : '');
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    if (!elements.serverFileContent) {
        return;
    }
    const content = elements.serverFileContent.value;
    if (state.serverContext === 'site') {
        if (!state.serverSiteCurrentFile) {
            alert('Select a public_html file to edit first.');
            return;
        }
        const original = typeof state.serverCurrentContent === 'string' ? state.serverCurrentContent : '';
        saveServerFileBackup(elements, state, 'site', state.serverSiteCurrentFile, original);
        appendLog(elements.logContainer, `Saving site file "${state.serverSiteCurrentFile}"...`);
        try {
            const baseUrl = siteUrl.replace(/\/+$/, '');
            const resp = await fetch(`${baseUrl}/wp-json/pilehead/site-file`, {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*'
                },
                body: JSON.stringify({
                    file: state.serverSiteCurrentFile,
                    content: Buffer.from(content, 'utf8').toString('base64'),
                    auth_token: token || ''
                })
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            appendLog(elements.logContainer, 'Site file saved successfully.');
            alert('Site file saved successfully.');
        } catch (err) {
            appendLog(elements.logContainer, `Failed to save site file: ${err.message}`);
            alert(`Failed to save site file: ${err.message}`);
        }
        return;
    }
    if (!state.serverPlugin || !state.serverCurrentFile) {
        alert('Select a server plugin file to edit first.');
        return;
    }
    const currentContent = typeof state.serverCurrentContent === 'string' ? state.serverCurrentContent : '';
    appendLog(elements.logContainer, `Saving server file "${state.serverCurrentFile}"...`);
    try {
        const key = getVersionKey(state);
        if (key && currentContent) {
            const list = versionStore[key] || [];
            const label = `v${list.length + 1} · ${new Date().toLocaleString()}`;
            list.push({
                label,
                content: currentContent
            });
            versionStore[key] = list;
        }
        saveServerFileBackup(elements, state, 'plugin', state.serverCurrentFile, currentContent);
        await saveServerPluginFile(siteUrl, token, state.serverPlugin, state.serverCurrentFile, content);
        appendLog(elements.logContainer, 'Server file saved successfully.');
        alert('Server file saved successfully.');
        state.serverCurrentContent = content;
        refreshVersionSelect(elements, state);
    } catch (err) {
        appendLog(elements.logContainer, `Failed to save server file: ${err.message}`);
        alert(`Failed to save server file: ${err.message}`);
    }
}

async function handleLoadSiteFiles(elements, state) {
    const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value : '';
    const siteUrl = normalizeSiteUrl(rawSiteUrl);
    const token = elements.siteTokenInput && elements.siteTokenInput.value.trim()
        ? elements.siteTokenInput.value.trim()
        : (elements.tokenInput ? elements.tokenInput.value.trim() : '');
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    appendLog(elements.logContainer, `Loading public_html files from server... (siteUrl=${siteUrl})`);
    try {
        const baseUrl = siteUrl.replace(/\/+$/, '');
        const resp = await fetch(
            `${baseUrl}/wp-json/pilehead/site-structure?auth_token=${encodeURIComponent(token || '')}`,
            {
                method: 'GET',
                credentials: 'omit',
                headers: {
                    Accept: 'application/json, text/plain, */*'
                }
            }
        );
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const files = Array.isArray(data.files) ? data.files : [];
        renderServerTree(elements.siteFileTree, files, async (relPath) => {
            try {
                const fileResp = await fetch(
                    `${baseUrl}/wp-json/pilehead/site-file?file=${encodeURIComponent(relPath)}&auth_token=${encodeURIComponent(token || '')}`,
                    {
                        method: 'GET',
                        credentials: 'omit',
                        headers: {
                            Accept: 'application/json, text/plain, */*'
                        }
                    }
                );
                if (!fileResp.ok) {
                    throw new Error(`HTTP ${fileResp.status}`);
                }
                const fileData = await fileResp.json();
                const decoded = typeof fileData.content === 'string'
                    ? Buffer.from(fileData.content, 'base64').toString('utf8')
                    : '';
                state.serverContext = 'site';
                state.serverSiteCurrentFile = relPath;
                state.serverCurrentFile = relPath;
                state.serverCurrentContent = decoded;
                if (elements.serverFilePath) {
                    elements.serverFilePath.textContent = relPath;
                }
                if (elements.serverFileContent) {
                    elements.serverFileContent.value = decoded;
                }
            } catch (err) {
                appendLog(elements.logContainer, `Failed to load site file: ${err.message}`);
            }
        });
        appendLog(elements.logContainer, `Loaded ${files.length} site file(s) from public_html.`);
    } catch (err) {
        appendLog(elements.logContainer, `Failed to load public_html files: ${err.message}`);
        alert(`Failed to load public_html files: ${err.message}`);
    }
}

async function handleSaveSourceFile(elements, state) {
    if (!elements.sourceFileContent) {
        return;
    }
    if (!state.rootPath || !state.sourceCurrentFile) {
        alert('Select a local source file first.');
        return;
    }
    const fullPath = path.join(state.rootPath, state.sourceCurrentFile);
    const content = elements.sourceFileContent.value;
    try {
        fs.writeFileSync(fullPath, content, 'utf8');
        appendLog(elements.logContainer, `Saved local file "${state.sourceCurrentFile}"`);
        alert('Local file saved successfully.');
    } catch (err) {
        appendLog(elements.logContainer, `Failed to save local file: ${err.message}`);
        alert(`Failed to save local file: ${err.message}`);
    }
}

function handleRestoreVersion(elements, state) {
    if (!elements.versionSelect || !elements.serverFileContent) return;
    const key = getVersionKey(state);
    if (!key || !versionStore[key] || !versionStore[key].length) return;
    const idxValue = elements.versionSelect.value;
    if (!idxValue) return;
    const idx = parseInt(idxValue, 10);
    if (Number.isNaN(idx) || !versionStore[key][idx]) return;
    const v = versionStore[key][idx];
    elements.serverFileContent.value = v.content;
}

function handleCompareVersion(elements, state) {
    if (!elements.versionSelect || !elements.serverFileContent || !elements.comparePanel || !elements.compareBefore || !elements.compareCurrent) return;
    const key = getVersionKey(state);
    if (!key || !versionStore[key] || !versionStore[key].length) return;
    const idxValue = elements.versionSelect.value;
    if (!idxValue) return;
    const idx = parseInt(idxValue, 10);
    if (Number.isNaN(idx) || !versionStore[key][idx]) return;
    const v = versionStore[key][idx];
    elements.compareBefore.value = v.content;
    elements.compareCurrent.value = elements.serverFileContent.value;
    elements.comparePanel.style.display = 'block';
}

function handleCloseCompare(elements) {
    if (elements.comparePanel) {
        elements.comparePanel.style.display = 'none';
    }
}

async function handleDownloadServerFile(elements, state) {
    const siteUrl = elements.wpUrlInput ? elements.wpUrlInput.value.trim() : '';
    const token = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    if (!state.serverPlugin || !state.serverCurrentFile) {
        alert('Select a server file to download first.');
        return;
    }
    try {
        const data = await loadServerPluginFile(siteUrl, token, state.serverPlugin, state.serverCurrentFile);
        const decoded = Buffer.from(data.content, 'base64').toString('utf8');
        const saveRes = await ipcRenderer.invoke('plugin-updater-save-as', {
            defaultPath: path.basename(state.serverCurrentFile)
        });
        if (!saveRes || saveRes.canceled || !saveRes.filePath) {
            return;
        }
        fs.writeFileSync(saveRes.filePath, decoded, 'utf8');
        appendLog(elements.logContainer, `Saved server file to ${saveRes.filePath}`);
        alert('File downloaded to your computer.');
    } catch (err) {
        appendLog(elements.logContainer, `Download failed: ${err.message}`);
        alert(`Download failed: ${err.message}`);
    }
}

async function handleUpload(elements, state) {
    const pluginName = elements.pluginSelect ? elements.pluginSelect.value : '';
    const siteUrl = elements.wpUrlInput ? elements.wpUrlInput.value.trim() : '';
    const token = elements.tokenInput ? elements.tokenInput.value.trim() : '';
    const authToken = token;
    if (!siteUrl) {
        alert('Enter the WordPress Site URL in Settings first.');
        return;
    }
    if (!pluginName) {
        alert('Select a plugin from the server list first.');
        return;
    }
    if (!state.mode || !state.rootPath) {
        alert('Select a source folder, ZIP, or files first.');
        return;
    }
    elements.progressBar.style.width = '0%';
    elements.progressBar.textContent = '0%';
    const activate = !!state.forceActivate;
    appendLog(elements.logContainer, `Uploading update for plugin "${pluginName}"${activate ? ' (with activation)' : ''}...`);
    try {
        let res;
        if (state.mode === 'folder') {
            const selectedRel = collectSelectedRelPaths(elements.fileTree);
            if (!selectedRel.length) {
                appendLog(elements.logContainer, 'No files selected in tree; selecting all files by default.');
                const allRel = state.files.map((f) => f.slice(state.rootPath.length + 1).replace(/\\/g, '/'));
                res = await prepareFolderUpdate(siteUrl, token, pluginName, state.rootPath, allRel, authToken, activate);
            } else {
                res = await prepareFolderUpdate(siteUrl, token, pluginName, state.rootPath, selectedRel, authToken, activate);
            }
        } else if (state.mode === 'files') {
            res = await prepareFilesUpdate(siteUrl, token, pluginName, state.files, authToken, activate);
        } else if (state.mode === 'zip') {
            res = await prepareFilesUpdate(siteUrl, token, pluginName, state.files, authToken, activate);
        } else {
            throw new Error('Unknown source mode');
        }
        elements.progressBar.style.width = '100%';
        elements.progressBar.textContent = '100%';
        if (res && res.success) {
            const updatedCount = (res.updated_files || []).length;
            appendLog(elements.logContainer, `Update successful. Updated files: ${updatedCount}.`);
            if (activate) {
                if (res.activated) {
                    appendLog(elements.logContainer, 'Plugin activated successfully.');
                    alert('Plugin update and activation successful.');
                } else if (res.activation_error) {
                    appendLog(elements.logContainer, `Activation failed: ${res.activation_error}`);
                    alert(`Plugin updated, but activation failed: ${res.activation_error}`);
                } else {
                    appendLog(elements.logContainer, 'Activation status unknown.');
                    alert('Plugin update successful (activation status unknown).');
                }
            } else {
                alert('Plugin update successful.');
            }
        } else {
            const msg = res && res.error_message ? res.error_message : 'Unknown error';
            appendLog(elements.logContainer, `Update failed: ${msg}`);
            alert(`Plugin update failed: ${msg}`);
        }
    } catch (err) {
        appendLog(elements.logContainer, `Upload error: ${err.message}`);
        alert(`Upload error: ${err.message}`);
    }
}

window.initPluginUpdaterUI = function() {
    const elements = getElements();
    if (!elements.pluginSelect || !elements.uploadBtn) return;
    const state = {
        mode: null,
        rootPath: null,
        files: [],
        selectedFiles: [],
        serverPlugin: null,
        serverCurrentFile: null,
        serverCurrentContent: '',
        sourceCurrentFile: null,
        serverContext: null,
        serverSiteCurrentFile: null,
        forceActivate: false,
        fmContext: null,
        fmPlugin: null,
        fmCurrentFile: null,
        fmCurrentContent: ''
    };
    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', () => {
            handleLoadPlugins(elements);
        });
    }
    if (elements.selectFolderBtn) {
        elements.selectFolderBtn.addEventListener('click', () => {
            handleSelectFolder(elements, state);
        });
    }
    if (elements.selectFilesBtn) {
        elements.selectFilesBtn.addEventListener('click', () => {
            handleSelectFiles(elements, state);
        });
    }
    if (elements.selectZipBtn) {
        elements.selectZipBtn.addEventListener('click', () => {
            handleSelectZip(elements, state);
        });
    }
    if (elements.loadServerFilesBtn) {
        elements.loadServerFilesBtn.addEventListener('click', () => {
            handleLoadServerFiles(elements, state);
        });
    }
    if (elements.serverFileSaveBtn) {
        elements.serverFileSaveBtn.addEventListener('click', () => {
            handleSaveServerFile(elements, state);
        });
    }
    if (elements.sourceFileSaveBtn) {
        elements.sourceFileSaveBtn.addEventListener('click', () => {
            handleSaveSourceFile(elements, state);
        });
    }
    if (elements.restoreVersionBtn) {
        elements.restoreVersionBtn.addEventListener('click', () => {
            handleRestoreVersion(elements, state);
        });
    }
    if (elements.compareVersionBtn) {
        elements.compareVersionBtn.addEventListener('click', () => {
            handleCompareVersion(elements, state);
        });
    }
    if (elements.compareCloseBtn) {
        elements.compareCloseBtn.addEventListener('click', () => {
            handleCloseCompare(elements);
        });
    }
    if (elements.downloadBtn) {
        elements.downloadBtn.addEventListener('click', () => {
            handleDownloadServerFile(elements, state);
        });
    }
    if (elements.loadSiteFilesBtn) {
        elements.loadSiteFilesBtn.addEventListener('click', () => {
            handleLoadSiteFiles(elements, state);
        });
    }
    if (elements.pluginSearchInput) {
        elements.pluginSearchInput.addEventListener('input', () => {
            if (!elements._pluginState) {
                elements._pluginState = { pluginsList: [], pluginSearchTerm: '' };
            }
            elements._pluginState.pluginSearchTerm = elements.pluginSearchInput.value.trim();
            renderPluginTable(elements, elements._pluginState);
            if (elements.pluginTable) {
                elements.pluginTable.style.display = 'block';
            }
        });
    }
    if (elements.pluginShowBtn && elements.pluginTable) {
        elements.pluginShowBtn.addEventListener('click', () => {
            if (!elements._pluginState) {
                elements._pluginState = { pluginsList: [], pluginSearchTerm: '' };
            }
            renderPluginTable(elements, elements._pluginState);
            elements.pluginTable.style.display = elements.pluginTable.style.display === 'none' || !elements.pluginTable.style.display
                ? 'block'
                : 'none';
        });
    }
    if (elements.pluginTable) {
        elements.pluginTable.addEventListener('click', async (event) => {
            const target = event.target;
            const rawSiteUrl = elements.wpUrlInput ? elements.wpUrlInput.value.trim() : '';
            const siteUrl = normalizeSiteUrl(rawSiteUrl);
            const token = elements.tokenInput ? elements.tokenInput.value.trim() : '';
            if (!siteUrl) {
                return;
            }
            if (target.classList.contains('plugin-row-toggle')) {
                const slug = target.getAttribute('data-slug') || '';
                const activeFlag = target.getAttribute('data-active') === '1';
                try {
                    await handlePluginToggle(siteUrl, token, slug, !activeFlag, elements.logContainer);
                    await handleLoadPlugins(elements);
                } catch (err) {
                    appendLog(elements.logContainer, `Toggle plugin failed: ${err.message}`);
                    alert(`Toggle plugin failed: ${err.message}`);
                }
            } else if (target.classList.contains('plugin-row-delete')) {
                const slug = target.getAttribute('data-slug') || '';
                if (!slug) return;
                if (!confirm(`Delete plugin "${slug}" from WordPress? This will remove its files and cannot be undone.`)) {
                    return;
                }
                try {
                    await handlePluginDelete(siteUrl, token, slug, elements.logContainer);
                    await handleLoadPlugins(elements);
                } catch (err) {
                    appendLog(elements.logContainer, `Delete plugin failed: ${err.message}`);
                    alert(`Delete plugin failed: ${err.message}`);
                }
            } else if (target.id === 'plugin-updater-plugin-bulk-delete') {
                const checks = elements.pluginTable.querySelectorAll('.plugin-row-check:checked');
                if (!checks.length) {
                    alert('Select at least one plugin to bulk delete.');
                    return;
                }
                const slugs = [];
                checks.forEach((c) => {
                    const s = c.getAttribute('data-slug') || '';
                    if (s) slugs.push(s);
                });
                if (!slugs.length) return;
                if (!confirm(`Bulk delete ${slugs.length} plugin(s) from WordPress? This cannot be undone.`)) {
                    return;
                }
                for (const slug of slugs) {
                    try {
                        await handlePluginDelete(siteUrl, token, slug, elements.logContainer);
                    } catch (err) {
                        appendLog(elements.logContainer, `Bulk delete failed for "${slug}": ${err.message}`);
                    }
                }
                await handleLoadPlugins(elements);
            }
        });
    }
    if (elements.deletePluginBtn) {
        elements.deletePluginBtn.addEventListener('click', () => {
            handleDeletePlugin(elements, state);
        });
    }
    if (elements.fileManagerOpenPluginBtn && elements.fileManagerOverlay) {
        elements.fileManagerOpenPluginBtn.addEventListener('click', () => {
            openFileManager(elements, state, 'plugin');
        });
    }
    if (elements.fileManagerOpenSiteBtn && elements.fileManagerOverlay) {
        elements.fileManagerOpenSiteBtn.addEventListener('click', () => {
            openFileManager(elements, state, 'site');
        });
    }
    if (elements.fileManagerCloseBtn) {
        elements.fileManagerCloseBtn.addEventListener('click', () => {
            closeFileManager(elements);
        });
    }
    if (elements.fileManagerMode) {
        elements.fileManagerMode.addEventListener('change', () => {
            refreshFileManagerTree(elements, state);
        });
    }
    if (elements.fileManagerPluginSelect) {
        elements.fileManagerPluginSelect.addEventListener('change', () => {
            state.fmPlugin = elements.fileManagerPluginSelect.value || null;
            if (elements.fileManagerPluginName) {
                const stateObj = elements._pluginState || {};
                const list = Array.isArray(stateObj.pluginsList) ? stateObj.pluginsList : [];
                const match = list.find((p) => (p.slug || '') === state.fmPlugin);
                const label = match ? (match.name || match.slug || state.fmPlugin) : (state.fmPlugin || 'None selected');
                elements.fileManagerPluginName.textContent = label;
            }
            if (elements.fileManagerMode && elements.fileManagerMode.value === 'plugin') {
                refreshFileManagerTree(elements, state);
            }
        });
    }
    if (elements.fileManagerSearch) {
        elements.fileManagerSearch.addEventListener('input', () => {
            state.fmSearch = elements.fileManagerSearch.value.trim();
            refreshFileManagerTree(elements, state);
        });
    }
    if (elements.fileManagerSaveBtn) {
        elements.fileManagerSaveBtn.addEventListener('click', () => {
            handleFileManagerSave(elements, state);
        });
    }
    if (elements.fileManagerEditTraeBtn) {
        elements.fileManagerEditTraeBtn.addEventListener('click', () => {
            handleFileManagerEditWithTrae(elements, state);
        });
    }
    if (elements.fileManagerDeleteBtn) {
        elements.fileManagerDeleteBtn.addEventListener('click', () => {
            handleFileManagerDelete(elements, state);
        });
    }
    if (elements.fileManagerRenameBtn) {
        elements.fileManagerRenameBtn.addEventListener('click', () => {
            handleFileManagerRename(elements, state);
        });
    }
    elements.uploadBtn.addEventListener('click', () => {
        state.forceActivate = false;
        handleUpload(elements, state);
    });
    if (elements.uploadActivateBtn) {
        elements.uploadActivateBtn.addEventListener('click', () => {
            state.forceActivate = true;
            handleUpload(elements, state);
        });
    }
}


// Add logic for Fill Product Tab button in Domain Manager
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    // Enable Fill Product Tab button when a product is selected
    const fillTabBtns = document.querySelectorAll('.dm-fill-tab-btn');
    const dmLists = document.querySelectorAll('.dm-list');
    dmLists.forEach(list => {
        list.addEventListener('change', (e) => {
            const domain = list.dataset.domain;
            const fillBtn = document.querySelector('.dm-fill-tab-btn[data-domain="' + domain + '"]');
            const checked = list.querySelector('input[type="checkbox"].dm-chk:checked');
            fillBtn.disabled = !checked;
        });
    });

    fillTabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const domain = btn.dataset.domain;
            const list = document.querySelector('.dm-list[data-domain="' + domain + '"]');
            const checked = list.querySelector('input[type="checkbox"].dm-chk:checked');
            if (!checked) return;
            const productId = checked.dataset.id;
            const productName = checked.dataset.name;
            btn.disabled = true;
            btn.textContent = 'Filling...';
            try {
                // For demo, prompt for product URL. In real use, fetch URL from product data.
                let url = prompt('Enter product URL for "' + productName + '":');
                if (!url) throw new Error('No URL provided');
                const result = await ipcRenderer.invoke('scrape-fepy-product-details', { url });
                if (result.success && result.data.tabs && result.data.tabs.productDetails) {
                    const detailsDiv = document.querySelector('.dm-product-tab-details[data-domain="' + domain + '"]');
                    detailsDiv.style.display = 'block';
                    detailsDiv.innerHTML = result.data.tabs.productDetails;
                } else {
                    alert('Failed to fetch product tab details: ' + (result.error || 'No details'));
                }
            } catch (e) {
                alert('Error: ' + e.message);
            }
            btn.disabled = false;
            btn.textContent = '📄 Universal Product Tab';
        });
    });
});

})();

if (typeof module !== 'undefined') {
    module.exports = {
        initPluginUpdaterUI: window.initPluginUpdaterUI
    };
}
