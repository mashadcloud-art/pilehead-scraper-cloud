// --- WEB APP REWRITE STARTED ---
// Removed Electron-specific require() statements.
let isWebMode = true; // Indicates we are running in the browser
const socket = typeof io !== 'undefined' ? io() : null;

if (socket) {
    socket.on('log', (msg) => {
        // Will hook this into your log panel later
        console.log('[Server Log]', msg);
    });
}

// Mocking some missing Desktop modules to prevent crashes
var productTabbedView = {
    render: () => { console.warn('Tabbed view not ported yet'); }
};
let showProgressBar = {
    show: () => { console.warn('Progress bar not ported yet'); },
    hide: () => {}
};

// Global State
let config = {};
let products = [];
let isScraping = false;
let currentModule = null;
let currentUrls = [];
let previewRows = new Map();

// Error Handler
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global Error:', message, error);
    alert(`Uncaught Error: ${message}\nLine: ${lineno}`);
};

// Removed Electron IK Delay
window.setIkUploadDelay = async function(ms) {
    console.log('[Renderer] IK upload delay disabled in Web API');
    return { delay: ms };
};

// --- Config Management ---

function loadConfig() {
    fetch('/api/config')
        .then(res => res.json())
        .then(data => {
            config = data || {};
            console.log('Config loaded from server:', config);
            
            // Apply to UI
            const wp = config.wp || {};
            if (document.getElementById('wp-url')) document.getElementById('wp-url').value = wp.url || config.wpUrl || '';
            if (document.getElementById('wp-key')) document.getElementById('wp-key').value = wp.key || config.wpKey || '';
            if (document.getElementById('wp-secret')) document.getElementById('wp-secret').value = wp.secret || config.wpSecret || '';
            if (document.getElementById('wp-auto-upload')) document.getElementById('wp-auto-upload').checked = wp.autoUpload !== undefined ? wp.autoUpload : (config.autoUpload || false);

            const azure = config.azure || {};
            if (document.getElementById('azure-endpoint')) document.getElementById('azure-endpoint').value = azure.endpoint || config.azureEndpoint || '';
            if (document.getElementById('azure-api-key')) document.getElementById('azure-api-key').value = azure.apiKey || config.azureKey || '';
            if (document.getElementById('azure-deployment')) document.getElementById('azure-deployment').value = azure.deployment || config.azureDeployment || '';
            if (document.getElementById('azure-api-version')) document.getElementById('azure-api-version').value = azure.apiVersion || config.azureApiVersion || '';

            const gcs = config.gcs || {};
            if (document.getElementById('gcs-bucket')) document.getElementById('gcs-bucket').value = gcs.bucket || '';
            if (document.getElementById('gcs-token')) document.getElementById('gcs-token').value = gcs.token || '';
            if (document.getElementById('gcs-sa-path')) document.getElementById('gcs-sa-path').value = gcs.serviceAccountPath || '';
            if (document.getElementById('gcs-folder')) document.getElementById('gcs-folder').value = gcs.folder || '';
            if (document.getElementById('gcs-image-folder')) document.getElementById('gcs-image-folder').value = gcs.imageFolder || '';
            if (document.getElementById('gcs-fosroc-image-folder')) document.getElementById('gcs-fosroc-image-folder').value = gcs.fosrocImageFolder || '';
            if (document.getElementById('gcs-public-read')) document.getElementById('gcs-public-read').checked = gcs.publicRead || false;

            config.oauth = config.oauth || {};
            if (document.getElementById('wp-login-username')) document.getElementById('wp-login-username').value = config.oauth.wpLoginUsername || '';
            if (document.getElementById('wp-login-remember')) document.getElementById('wp-login-remember').checked = !!config.oauth.rememberWpLogin;
            if (document.getElementById('wp-login-password')) document.getElementById('wp-login-password').value = '';
        })
        .catch(e => console.error('Failed to load config from server:', e));
}

function saveConfig() {
    try {
        config.wp = config.wp || {};
        config.azure = config.azure || {};
        config.gcs = config.gcs || {};

        if (document.getElementById('wp-url')) config.wp.url = document.getElementById('wp-url').value;
        if (document.getElementById('wp-key')) config.wp.key = document.getElementById('wp-key').value;
        if (document.getElementById('wp-secret')) config.wp.secret = document.getElementById('wp-secret').value;
        if (document.getElementById('wp-auto-upload')) config.wp.autoUpload = document.getElementById('wp-auto-upload').checked;

        if (document.getElementById('azure-endpoint')) config.azure.endpoint = document.getElementById('azure-endpoint').value;
        if (document.getElementById('azure-api-key')) config.azure.apiKey = document.getElementById('azure-api-key').value;
        if (document.getElementById('azure-deployment')) config.azure.deployment = document.getElementById('azure-deployment').value;
        if (document.getElementById('azure-api-version')) config.azure.apiVersion = document.getElementById('azure-api-version').value;

        if (document.getElementById('gcs-bucket')) config.gcs.bucket = document.getElementById('gcs-bucket').value;
        if (document.getElementById('gcs-token')) config.gcs.token = document.getElementById('gcs-token').value;
        if (document.getElementById('gcs-sa-path')) config.gcs.serviceAccountPath = document.getElementById('gcs-sa-path').value;
        if (document.getElementById('gcs-folder')) config.gcs.folder = document.getElementById('gcs-folder').value;
        if (document.getElementById('gcs-image-folder')) config.gcs.imageFolder = document.getElementById('gcs-image-folder').value;
        if (document.getElementById('gcs-fosroc-image-folder')) config.gcs.fosrocImageFolder = document.getElementById('gcs-fosroc-image-folder').value;
        if (document.getElementById('gcs-public-read')) config.gcs.publicRead = document.getElementById('gcs-public-read').checked;

        config.oauth = config.oauth || {};
        const rememberWpLogin = document.getElementById('wp-login-remember')?.checked;
        config.oauth.rememberWpLogin = !!rememberWpLogin;
        if (rememberWpLogin) {
            config.oauth.wpLoginUsername = document.getElementById('wp-login-username')?.value || '';
        } else {
            config.oauth.wpLoginUsername = '';
        }

        fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        })
        .then(res => res.json())
        .then(data => {
            console.log('Config saved to server');
            alert('Settings saved successfully to cloud!');
        })
        .catch(e => {
            console.error('Failed to save config:', e);
            alert('Failed to save settings: ' + e.message);
        });
    } catch (e) {
        console.error('Save error:', e);
    }
}

// --- Navigation ---

function setupNavigation() {
    console.log('Setting up navigation...');
    // alert('DEBUG: Setting up navigation...'); // Temporary debug

    const dashboardView = document.getElementById('dashboard');
    const moduleView = document.getElementById('module-view');
    // const homeBtn = document.getElementById('top-home-btn'); // Removed as not in HTML
    const cards = document.querySelectorAll('.module-card:not(.disabled)');
    const tabButtons = document.querySelectorAll('.tab-bar .tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const sidebarItems = document.querySelectorAll('.sb-item[data-sbnav]');
    const pageViews = document.querySelectorAll('.pv');
    const pageCrumb = document.getElementById('page-crumb');
    const backToDashBtn = document.getElementById('back-to-dash');
    const homeNavBtn = document.getElementById('home-btn');
    
    // Top bar buttons
    const refreshBtn = document.getElementById('refresh-btn'); // Fixed ID
    // const helpBtn = document.getElementById('top-help-btn'); // Likely missing in HTML too, but keeping logic safe
    // const settingsBtn = document.getElementById('top-settings-btn'); // Likely missing

    // alert('DEBUG: Found ' + cards.length + ' dashboard cards');

    if (!dashboardView || !moduleView) {
        console.error('Critical UI elements missing: dashboard or module-view');
        alert('Critical Error: dashboard or module-view missing from DOM');
        return;
    }

    // Ensure initial state
    if (!moduleView.classList.contains('visible') && !dashboardView.classList.contains('hidden-out')) {
        // Normal state
    } else {
        // Force dashboard
        showDashboard();
    }

    // Sidebar Navigation (the missing piece!)
    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetPage = item.getAttribute('data-sbnav');
            console.log('Sidebar item clicked:', targetPage);
            
            // Update active state in sidebar
            sidebarItems.forEach(si => si.classList.remove('active'));
            item.classList.add('active');
            
            // Show the corresponding page view
            showPageView(targetPage);
        });
    });

    // Back to Dashboard button
    if (backToDashBtn) {
        backToDashBtn.addEventListener('click', () => {
            console.log('Back to dashboard clicked');
            showDashboard();
        });
    }

    // Home button in sidebar
    if (homeNavBtn) {
        homeNavBtn.addEventListener('click', () => {
            console.log('Home nav button clicked');
            showDashboard();
        });
    }

    // Helper function to show a specific page view
    function showPageView(pageName) {
        console.log('Showing page view:', pageName);
        
        // Hide all page views
        pageViews.forEach(pv => {
            pv.classList.remove('active');
        });
        
        // Show the target page view
        const targetView = document.getElementById(`pv-${pageName}`);
        if (targetView) {
            
            // Fix for Web Migration: Directly modify CSS display to ensure it shows up in Chrome
            pageViews.forEach(pv => { pv.style.display = 'none'; });
              targetView.style.display = 'block';
            
            // Update breadcrumb
            if (pageCrumb) {
                const labels = {
                    'scraper': 'Scraper',
                    'settings': 'Settings',
                    'cloud': 'Cloud / GCS',
                    'gcs-retro': 'Retro GCS Upload',
                    'media-source': 'Media Source'
                };
                pageCrumb.textContent = labels[pageName] || pageName;
            }
        } else {
            console.error('Page view not found:', `pv-${pageName}`);
        }
    }

    function showDashboard() {
        if (dashboardView) {
            dashboardView.classList.remove('hidden-out');
            dashboardView.style.display = 'flex'; // Fix for Chrome display
        }
        if (moduleView) {
            moduleView.classList.remove('visible');
            moduleView.style.display = 'none'; // Fix for Chrome display
        }
    }

    // Dashboard Card Click
    if (cards.length === 0) {
        console.warn('No dashboard cards found!');
        // alert('Warning: No dashboard cards found via querySelector');
    }

    cards.forEach(card => {
        card.addEventListener('click', () => {
            const moduleName = card.getAttribute('data-module') || card.getAttribute('data-goto');
            console.log('Dashboard card clicked:', moduleName);
            // alert('DEBUG: Clicked module: ' + moduleName);
            
            if (!moduleName) {
                console.warn('Card has no data-module or data-goto attribute');
                return;
            }
            
            try {
                openModule(moduleName);
            } catch (err) {
                alert('Error opening module: ' + err.message);
                console.error(err);
            }
        });
    });

    // Home Button Logic (if exists)
    // if (homeBtn) { ... }

    // Refresh Button Logic
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (confirm('Reload the application?')) location.reload();
        });
    }

    // Help and Settings buttons are placeholders for now as they lack IDs in HTML


    // Tab Switching
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab-target');
            console.log('Tab button clicked:', targetId);

            // Deactivate all
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => {
                p.classList.remove('active');
                p.style.display = 'none'; // Force hide
            });

            // Activate clicked
            btn.classList.add('active');
            
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
                targetPanel.style.display = 'block'; // Force show
                console.log('Activated panel:', targetId);
                
            } else {
                console.warn('Target panel not found:', targetId);
            }
        });
    });

    function openModule(moduleName) {
        if (!moduleName) return;
        
        console.log('Opening module:', moduleName);
        
        // Hide dashboard, show module view (Web App Fix)
        if (dashboardView) {
            dashboardView.classList.add('hidden-out');
            dashboardView.style.display = 'none'; // Force hide for browser
        }
        
        if (moduleView) {
            moduleView.style.display = 'flex'; // Force show for browser
            setTimeout(() => {
                moduleView.classList.add('visible');
            }, 50);
        }

        // Show the corresponding page view
        showPageView(moduleName);
        
        // Update sidebar active state
        sidebarItems.forEach(item => {
            if (item.getAttribute('data-sbnav') === moduleName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
}

// --- Scraper UI ---

function setupScraperUI() {
    console.log('Initializing Scraper UI...');
    
    // Core Scraper Controls
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    // Inputs
    const productUrlsInput = document.getElementById('url-input');
    const categoryUrlInput = document.getElementById('category-input');
    const modeSelect = document.getElementById('mode-select');
    const websiteSelect = document.getElementById('website-select');
    const delaySelect = document.getElementById('delay-select');
    // Secondary Controls
    const previewCsvBtn = document.getElementById('preview-csv-btn');
    const openFolderBtn = document.getElementById('open-folder-btn');
    const importCsvWpBtn = document.getElementById('import-csv-wp-btn');
    const restartAppBtn = document.getElementById('restart-app-btn');
    const closePreviewBtn = document.getElementById('close-preview-btn');
    const previewContainer = document.getElementById('preview-container');
    const temuExtractBtn = document.getElementById('temu-extract-btn');
    const previewTargetBtn = document.getElementById('preview-target-tab');
    const previewPileheadBtn = document.getElementById('preview-pilehead-tab');
    const previewView = document.getElementById('browser-preview');

    // Debug missing elements
    if (!startBtn) console.warn('Scraper UI: start-btn missing');
    if (!stopBtn) console.warn('Scraper UI: stop-btn missing');
    if (!productUrlsInput) console.warn('Scraper UI: url-input missing');

    // Website Select Logic
    if (websiteSelect) {
        websiteSelect.addEventListener('change', () => {
            console.log('Website selected:', websiteSelect.value);
            // Toggle specific options based on website
            const noonModeContainer = document.getElementById('noon-mode-container');
            const amazonModeContainer = document.getElementById('amazon-style-mode-container');
            
            if (noonModeContainer) noonModeContainer.style.display = (websiteSelect.value === 'noon') ? 'block' : 'none';
            if (amazonModeContainer) amazonModeContainer.style.display = (websiteSelect.value === 'amazon') ? 'block' : 'none';
        });
    }

    // Mode Select Logic
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            const productInputGroup = document.getElementById('product-input-group');
            const categoryInputGroup = document.getElementById('category-input-group');
            
            if (modeSelect.value === 'product') {
                if (productInputGroup) productInputGroup.classList.remove('hidden');
                if (categoryInputGroup) categoryInputGroup.classList.add('hidden');
            } else {
                if (productInputGroup) productInputGroup.classList.add('hidden');
                if (categoryInputGroup) categoryInputGroup.classList.remove('hidden');
            }
        });
    }

    // Start Scraping
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            console.log('Start Scraping Clicked');
            
            // Save config
            saveConfig();
            
            if (isScraping) {
                console.warn('Already scraping');
                return;
            }
            
            const mode = modeSelect ? modeSelect.value : 'product';
            let urls = [];
            
            if (mode === 'product') {
                if (productUrlsInput) {
                    urls = productUrlsInput.value.split('\n').filter(u => u.trim());
                }
            } else {
                if (categoryUrlInput && categoryUrlInput.value.trim()) {
                     urls = [categoryUrlInput.value.trim()];
                }
            }

            if (urls.length === 0) {
                alert('Please enter URLs or a Category to scrape.');
                return;
            }

            isScraping = true;
            startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            
            // Set delay config
            if (delaySelect) config.delay = delaySelect.value;
            
            try {
                await runScraper(urls, mode, websiteSelect ? websiteSelect.value : 'auto');
            } catch (err) {
                console.error('Scraping failed:', err);
                alert('Scraping failed: ' + err.message);
            } finally {
                isScraping = false;
                startBtn.disabled = false;
                if (stopBtn) stopBtn.disabled = true;
            }
        });
    }
    
    // Stop Scraping
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            console.log('Stop Scraping Clicked');
            isScraping = false;
            if (startBtn) startBtn.disabled = false;
            stopBtn.disabled = true;
        });
    }
    
    // Clear Inputs
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (productUrlsInput) productUrlsInput.value = '';
            if (categoryUrlInput) categoryUrlInput.value = '';
            // Also clear logs or table if desired
        });
    }

    // Close Preview
    if (closePreviewBtn) {
        closePreviewBtn.addEventListener('click', () => {
            if (previewContainer) {
                previewContainer.classList.add('hidden');
                previewContainer.style.display = 'none';
            }
        });
    }

    if (previewTargetBtn && previewView) {
        previewTargetBtn.addEventListener('click', () => {
            const last = currentUrls.length ? currentUrls[currentUrls.length - 1] : '';
            if (last) previewView.src = last;
        });
    }
    if (previewPileheadBtn && previewView) {
        previewPileheadBtn.addEventListener('click', () => {
            const site = config && config.wp && config.wp.url ? config.wp.url : '';
            if (site) previewView.src = site;
        });
    }

    // Open Folder
    if (openFolderBtn) {
        openFolderBtn.addEventListener('click', () => {
            alert('Cannot open local folder from the web version.');
        });
    }

    // Restart App
    if (restartAppBtn) {
        restartAppBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to restart the app?')) {
                // Check if we are in Electron
                if (window.require) {
                    try {
                        const { ipcRenderer } = window.require('electron');
                        ipcRenderer.invoke('app-restart');
                    } catch (e) {
                        console.error('Failed to restart via IPC, falling back to reload', e);
                        location.reload();
                    }
                } else {
                    location.reload();
                }
            }
        });
    }

    // Preview Data (Simple toggle for now)
    if (previewCsvBtn) {
        previewCsvBtn.addEventListener('click', () => {
            if (previewContainer) {
                previewContainer.classList.remove('hidden');
                previewContainer.style.display = 'block';
            }
        });
    }

    // Import CSV (Placeholder)
    if (importCsvWpBtn) {
        importCsvWpBtn.addEventListener('click', () => {
            alert('Import functionality coming soon. Please use the "Importer" module.');
        });
    }

    // Temu Extract (Placeholder)
    if (temuExtractBtn) {
        temuExtractBtn.addEventListener('click', () => {
            const temuUrl = document.getElementById('temu-url-input')?.value;
            const temuHtml = document.getElementById('temu-html-input')?.value;
            if (!temuHtml) {
                alert('Please paste the Temu HTML first.');
                return;
            }
            alert('Temu extraction logic initiated (simulated).');
            // Add extraction logic here
        });
    }
}

// Main Scraping Logic (Rewritten for Web App)
async function runScraper(urls, mode, selectedWebsite) {
    console.log('Running scraper via Cloud API...', { mode, selectedWebsite, urls });
    
    const progressContainer = document.getElementById('progress-bar');
    const statusLog = document.getElementById('status-log');
    
    function log(msg) {
        console.log(msg);
        if (statusLog) {
            const div = document.createElement('div');
            div.innerText = msg;
            statusLog.appendChild(div);
            statusLog.scrollTop = statusLog.scrollHeight;
        }
    }
    
    log('Sending scraping request to Oracle Cloud Engine...');
    
    if (urls.length === 0) {
        log('No URLs provided to scrape.');
        return;
    }

    try {
        const response = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls, mode, selectedWebsite, config })
        });
        
        if (!response.ok) {
            throw new Error(`Cloud API Error: ${response.statusText}`);
        }
        
        const data = await response.json();
        log('Cloud Engine started successfully! Check Live Logs for progress.');
        
    } catch (err) {
        console.error('Cloud Engine connection failed:', err);
        log('Connection to Cloud Engine failed. Is the server running?');
        alert('Failed to start scraper. See logs.');
    }
}

function addProductToTable(data, url, wpProductArg, gcsImagesArg, gcsInfoArg) {
    const table = document.getElementById('preview-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const key = String(url || '').trim();
    const normalizeKey = (v) => String(v || '').trim();
    const k = normalizeKey(key);
    
    // Normalize inputs to handle both single result and multi-profile array
    let results = [];
    if (Array.isArray(wpProductArg)) {
        results = wpProductArg;
    } else if (wpProductArg && typeof wpProductArg === 'object') {
        results = [wpProductArg];
    }
    const primaryResult = results.find(r => r && !r.error && r.id) || results[0] || null;
    
    const row = document.createElement('tr');
    row.setAttribute('data-url', k);
    
    let buttonsHtml = `<button class="pill-button btn-open-target" style="background: rgba(56, 189, 248, 0.22); color: #7dd3fc; border-color: rgba(56, 189, 248, 0.9); font-size: 11px; padding:2px 8px;">Target</button>`;
    
    if (results.length > 0) {
        results.forEach(res => {
            if (res.id && !res.error) {
                // Determine label
                let label = "WP";
                if (res._profileName) {
                    label = res._profileName.replace('Pilehead', 'PH').replace('Oracle', 'OC').replace('Local', 'Loc').trim().substring(0, 8);
                } else if (results.length > 1) {
                    label = `WP${res.id}`; 
                }
                
                // Fix permalink protocol mismatch (HTTPS on HTTP server)
                let link = res.permalink;
                if (res._profileUrl && res._profileUrl.startsWith('http:') && link && link.startsWith('https:')) {
                    link = link.replace(/^https:/, 'http:');
                }
                
                if (link) {
                    buttonsHtml += ` <button class="pill-button btn-open-wp-multi" data-link="${link}" style="background: rgba(34, 197, 94, 0.22); color: #bbf7d0; border-color: rgba(34, 197, 94, 0.9); font-size: 11px; padding:2px 8px;">${label}</button>`;
                }
            }
        });
    }

    // GCS Button (from primary result or args)
    let finalGcsImages = gcsImagesArg;
    let finalGcsInfo = gcsInfoArg;
    if ((!finalGcsImages || Object.keys(finalGcsImages).length === 0) && primaryResult && primaryResult.gcs_images) {
        finalGcsImages = primaryResult.gcs_images;
    }
    
    const targetGcs = (finalGcsImages && finalGcsImages.main) ? finalGcsImages.main : (finalGcsInfo && finalGcsInfo.url ? finalGcsInfo.url : '');

    const toFileUrl = (filePath) => {
        if (!filePath) return '';
        return filePath; // Changed for Web UI
    };

    const resolvePreviewImage = () => {
        const remote = (data.image || '').trim();
        const local = (data.localImagePath || '').trim();
        if (local) return toFileUrl(local);
        return remote;
    };
    const previewImage = resolvePreviewImage();

    if (targetGcs) {
        buttonsHtml += ` <button class="pill-button btn-open-gcs" data-link="${targetGcs}" style="background: rgba(129, 140, 248, 0.22); color: #c7d2fe; border-color: rgba(129, 140, 248, 0.85); font-size: 11px; padding:2px 8px;">GCS</button>`;
    }

        row.innerHTML = `
            <td>${data.title || data.name || 'N/A'}</td>
            <td>${data.price || 'N/A'}</td>
            <td>
                ${previewImage ? `<img src="${previewImage}" style="width:48px;height:36px;object-fit:cover;border-radius:4px;margin-right:8px;" onerror="this.onerror=null;this.src='https://via.placeholder.com/48x36?text=No+Image';">` : '<span style="color:var(--fg-4);font-size:16px;">🖼️</span>'}
            </td>
            <td style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                 ${buttonsHtml}
                 ${primaryResult ? `<span class="pill" style="margin-left: 6px;">Done (${results.filter(r=>!r.error).length})</span>` : ''}
            </td>
        `;
    
    if (previewRows.has(k)) {
        const old = previewRows.get(k);
        try { old.replaceWith(row); } catch (_) { tbody.appendChild(row); }
        previewRows.set(k, row);
    } else {
        tbody.appendChild(row);
        previewRows.set(k, row);
    }
    
    // Show preview container
    const previewContainer = document.getElementById('preview-container');
    if (previewContainer) {
        previewContainer.classList.remove('hidden');
        previewContainer.style.display = 'block';
    }

    // Listeners
    const openTargetBtn = row.querySelector('.btn-open-target');
    if (openTargetBtn) openTargetBtn.addEventListener('click', () => { try { shell.openExternal(url); } catch (_) {} });

    row.querySelectorAll('.btn-open-wp-multi').forEach(btn => {
         btn.addEventListener('click', () => {
             const link = btn.getAttribute('data-link');
             if (link) try { shell.openExternal(link); } catch (_) {}
        });
    });

    const openGcsBtn = row.querySelector('.btn-open-gcs');
    if (openGcsBtn) {
         openGcsBtn.addEventListener('click', () => { 
             const link = openGcsBtn.getAttribute('data-link');
             if (link) try { shell.openExternal(link); } catch (_) {} 
        });
    }
}

function updateUIState(running) {
    const startBtn = document.getElementById('start-scraping-btn');
    const stopBtn = document.getElementById('stop-scraping-btn');
    if (startBtn) startBtn.disabled = running;
    if (stopBtn) stopBtn.disabled = !running;
}

// --- Product Manager UI ---

function setupProductManagerUI() {
    const productSelect = document.getElementById('product-select');
    // Product Manager Buttons
    const viewWpBtn = document.getElementById('pm-view-wp-btn');
    const editWpBtn = document.getElementById('pm-edit-wp-btn');

    // WP List Buttons
    const wpListRefreshBtn = document.getElementById('wp-list-refresh-btn');
    const wpListPrevBtn = document.getElementById('wp-list-prev-btn');
    const wpListNextBtn = document.getElementById('wp-list-next-btn');
    const wpRewriteSelectedBtn = document.getElementById('wp-rewrite-selected-btn');
    const wpRewritePageBtn = document.getElementById('wp-rewrite-page-btn');
    const wpDeleteSelectedBtn = document.getElementById('wp-delete-selected-btn');

    // WP Media Buttons
    const wpMediaRefreshBtn = document.getElementById('wp-media-refresh-btn');
    const wpMediaPrevBtn = document.getElementById('wp-media-prev-btn');
    const wpMediaNextBtn = document.getElementById('wp-media-next-btn');
    const wpMediaDeleteSelectedBtn = document.getElementById('wp-media-delete-selected-btn');

    if (productSelect) {
        productSelect.addEventListener('change', () => {
            const selectedUrl = productSelect.value;
            const product = products.find(p => p.url === selectedUrl);
            if (product) {
                displayProductDetails(product);
            }
        });
    }

    if (viewWpBtn) {
        viewWpBtn.addEventListener('click', () => {
             const url = productSelect ? productSelect.value : null;
             if (url) {
                 shell.openExternal(url); // Assuming URL is the product URL
             } else {
                 alert('Select a product first.');
             }
        });
    }

    if (editWpBtn) {
        editWpBtn.addEventListener('click', () => {
             alert('Edit in WordPress (opens admin panel).');
        });
    }
    

    // List Controls
    if (wpListRefreshBtn) wpListRefreshBtn.addEventListener('click', () => alert('Refreshing Product List...'));
    if (wpListPrevBtn) wpListPrevBtn.addEventListener('click', () => alert('Previous Page'));
    if (wpListNextBtn) wpListNextBtn.addEventListener('click', () => alert('Next Page'));
    
    if (wpRewriteSelectedBtn) wpRewriteSelectedBtn.addEventListener('click', () => alert('Rewriting Selected Products...'));
    if (wpRewritePageBtn) wpRewritePageBtn.addEventListener('click', () => alert('Rewriting Current Page...'));
    if (wpDeleteSelectedBtn) wpDeleteSelectedBtn.addEventListener('click', () => alert('Deleting Selected Products...'));

    // Media Controls
    if (wpMediaRefreshBtn) wpMediaRefreshBtn.addEventListener('click', () => alert('Refreshing Media Library...'));
    if (wpMediaPrevBtn) wpMediaPrevBtn.addEventListener('click', () => alert('Previous Media Page'));
    if (wpMediaNextBtn) wpMediaNextBtn.addEventListener('click', () => alert('Next Media Page'));
    if (wpMediaDeleteSelectedBtn) wpMediaDeleteSelectedBtn.addEventListener('click', () => alert('Deleting Selected Media...'));
}

function updateSelect() {
    const select = document.getElementById('product-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select a product...</option>';
    products.forEach(p => {
        const option = document.createElement('option');
        option.value = p.url;
        option.textContent = p.productName || p.url;
        select.appendChild(option);
    });
}

function displayProductDetails(product) {
    // Fill in details in the product manager tab
    // Implementation needed based on HTML structure
}

// --- Plugin Updater UI ---

function setupPluginUpdaterUI() {
    console.log('Initializing Plugin Updater UI...');
    
    // Call the external UI initializer which handles file manager logic
    if (typeof initPluginUpdaterUI === 'function') {
        try {
            initPluginUpdaterUI();
            console.log('Plugin Updater UI (updater-ui.js) initialized.');
        } catch (err) {
            console.error('Failed to initialize updater-ui:', err);
        }
    } else {
        console.warn('initPluginUpdaterUI is not a function (module loading issue?)');
    }
    
    // The rest of the setup is handled by updater-ui.js
    // We only need to ensure the overlay logic is correct if updater-ui doesn't cover it fully
    // updater-ui.js handles most buttons, so we can rely on it.
}

// Global Status Update
function updateStatus(msg, current, total) {
    const statusBar = document.getElementById('pm-status-bar');
    const progressText = document.getElementById('pm-progress');
    const progressBar = document.getElementById('pm-progress-bar');

    if (msg && statusBar) statusBar.innerText = msg;
    if (progressText && current !== undefined && total !== undefined) {
        progressText.innerText = `${current} / ${total}`;
    }
    if (progressBar && current !== undefined && total !== undefined) {
        const percent = Math.round((current / total) * 100);
        progressBar.style.width = `${percent}%`;
    }
}

// --- Initialization ---

function initApp() {
    console.log('App Initializing...');
    
    // Load config first
    loadConfig();
    
    // Setup Navigation
    setupNavigation();
    
    // Setup Scraper UI
    setupScraperUI();
    
    // Setup Plugin Updater
    setupPluginUpdaterUI();

    // Setup Settings UI
    setupSettingsUI();
    setupAuthUI();
    
    console.log('App Initialization Complete');
}

function setupAiModuleUI() {
    console.log('Initializing AI Module UI...');
    
    // AI Module Buttons
    const useLastBtn = document.getElementById('ai-module-use-last-btn');
    const clearBtn = document.getElementById('ai-module-clear-btn');
    const updateWpBtn = document.getElementById('ai-module-update-wp-btn');
    const previewRefreshBtn = document.getElementById('ai-module-preview-refresh-btn');
    
    const copyDescBtn = document.getElementById('ai-module-copy-description-btn');
    const copySeoBtn = document.getElementById('ai-module-copy-seo-btn');
    const copySchemaBtn = document.getElementById('ai-module-copy-schema-btn');
    
    if (useLastBtn) {
        useLastBtn.addEventListener('click', () => {
            if (lastScrapedRecord) {
                populateAiModuleFromRecord(lastScrapedRecord);
            } else {
                alert('No scraped products available.');
            }
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            // Clear inputs
            const inputs = document.querySelectorAll('#ai-module-content textarea, #ai-module-content input');
            inputs.forEach(input => input.value = '');
            alert('AI Module inputs cleared.');
        });
    }
    
    if (updateWpBtn) {
        updateWpBtn.addEventListener('click', async () => {
            try {
                if (!lastScrapedRecord || !lastScrapedRecord.productId) {
                    alert('No uploaded product found to update.');
                    return;
                }
                if (!config.wp || !config.wp.url || !config.wp.key || !config.wp.secret) {
                    alert('Fill WordPress Site URL, Key, Secret in Settings first.');
                    return;
                }
                const productId = lastScrapedRecord.productId;
                const descriptionHtml = document.getElementById('ai-module-description-html')?.value || '';
                const seo = {
                    title: document.getElementById('ai-module-seo-title')?.value || '',
                    slug: document.getElementById('ai-module-seo-slug')?.value || '',
                    metaDescription: document.getElementById('ai-module-meta-description')?.value || '',
                    focusKeywords: document.getElementById('ai-module-focus-keywords')?.value || '',
                    ogTitle: document.getElementById('ai-module-og-title')?.value || '',
                    ogDescription: document.getElementById('ai-module-og-description')?.value || ''
                };
                const schemaJson = document.getElementById('ai-module-schema-json')?.value || '';
                const descriptionTabs = {
                    ...(lastScrapedRecord.tabs || {}),
                    previewHtml: descriptionHtml,
                    schemaJson
                };
                const res = { success: false, error: 'Removed inside Web API' };
                if (res && res.success) {
                    alert('WordPress product updated with SEO and description.');
                } else {
                    alert('Update failed: ' + (res && res.error ? res.error : 'unknown'));
                }
            } catch (e) {
                alert('Update error: ' + e.message);
            }
        });
    }
    
    if (previewRefreshBtn) {
        previewRefreshBtn.addEventListener('click', () => {
            alert('Preview refreshed.');
        });
    }
    
    function copyToClipboard(id, name) {
        const el = document.getElementById(id);
        if (el) {
            navigator.clipboard.writeText(el.value || el.innerText).then(() => {
                alert(`${name} copied to clipboard!`);
            }).catch(err => {
                console.error('Copy failed', err);
                alert('Copy failed');
            });
        }
    }
    
    if (copyDescBtn) copyDescBtn.addEventListener('click', () => copyToClipboard('ai-description-preview', 'Description'));
    if (copySeoBtn) copySeoBtn.addEventListener('click', () => copyToClipboard('ai-seo-preview', 'SEO Content'));
    if (copySchemaBtn) copySchemaBtn.addEventListener('click', () => copyToClipboard('ai-schema-preview', 'Schema'));
}

function persistConfig() {
    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    }).catch(e => console.error('Failed to persist config', e));
}

function setupAuthUI() {
    const issuerInput = document.getElementById('oauth-issuer');
    const clientIdInput = document.getElementById('oauth-client-id');
    const audienceInput = document.getElementById('oauth-audience');
    const loginBtn = document.getElementById('oauth-login-btn');
    const logoutBtn = document.getElementById('oauth-logout-btn');
    const wpLoginBtn = document.getElementById('wp-login-btn');
    const wpUserInput = document.getElementById('wp-login-username');
    const wpPassInput = document.getElementById('wp-login-password');
    const wpRememberInput = document.getElementById('wp-login-remember');
    const saveConfigFields = () => {
        if (!window.config) window.config = {};
        if (!window.config.oauth) window.config.oauth = {};
        window.config.oauth.issuer = issuerInput?.value || window.config.oauth.issuer || '';
        window.config.oauth.clientId = clientIdInput?.value || window.config.oauth.clientId || '';
        window.config.oauth.audience = audienceInput?.value || window.config.oauth.audience || '';
    };
    const generateVerifier = () => crypto.randomBytes(32).toString('base64url');
    const sha256 = (v) => crypto.createHash('sha256').update(v).digest();
    const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const startLoopback = () => {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                try {
                    if (req.url.startsWith('/callback')) {
                        const u = new URL(req.url, 'http://localhost:8400');
                        const code = u.searchParams.get('code');
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end('<html><body>Login complete. You can close this window.</body></html>');
                        server.close();
                        resolve(code);
                    } else {
                        res.writeHead(404); res.end();
                    }
                } catch (e) { reject(e); }
            }).listen(8400, '127.0.0.1', () => {});
        });
    };
    const exchangeToken = async (issuer, clientId, code, verifier, audience) => {
        const tokenUrl = `${issuer.replace(/\/+$/,'')}/oauth/token`;
        const body = {
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            code_verifier: verifier,
            redirect_uri: 'http://localhost:8400/callback'
        };
        if (audience) body.audience = audience;
        const res = await axios.post(tokenUrl, body, { headers: { 'Content-Type': 'application/json' } });
        return res.data;
    };
    const startLogin = async () => {
        try {
            saveConfigFields();
            const issuer = window.config?.oauth?.issuer || '';
            const clientId = window.config?.oauth?.clientId || '';
            const audience = window.config?.oauth?.audience || '';
            if (!issuer || !clientId) { alert('Set Issuer and Client ID first.'); return; }
            const verifier = generateVerifier();
            const challenge = base64url(sha256(verifier));
            const authorizeUrl = `${issuer.replace(/\/+$/,'')}/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent('http://localhost:8400/callback')}&code_challenge=${challenge}&code_challenge_method=S256${audience ? '&audience='+encodeURIComponent(audience):''}`;
            shell.openExternal(authorizeUrl);
            const code = await startLoopback();
            const tok = await exchangeToken(issuer, clientId, code, verifier, audience);
            authTokens = { accessToken: tok.access_token, refreshToken: tok.refresh_token, idToken: tok.id_token, expiresIn: tok.expires_in };
            if (!window.config) window.config = {};
            window.config.oauth = { ...(window.config.oauth || {}), tokens: authTokens };
            alert('Login successful.');
        } catch (e) {
            alert('Login failed: ' + e.message);
        }
    };
    if (loginBtn) loginBtn.addEventListener('click', startLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
        authTokens = null;
        if (window.config && window.config.oauth) window.config.oauth.tokens = null;
        alert('Logged out.');
    });
    if (wpLoginBtn) wpLoginBtn.addEventListener('click', async () => {
        try {
            const url = (config && config.wp && config.wp.url) ? config.wp.url : '';
            if (!url) { alert('Set WordPress Site URL in Settings first.'); return; }
            const username = wpUserInput?.value || '';
            const password = wpPassInput?.value || '';
            if (!username || !password) { alert('Enter username and password.'); return; }
            const bridgeEndpoint = `${url.replace(/\/+$/,'')}/wp-json/pilehead-bridge/v1/app-login`;
            let res = null;
            try {
                res = await axios.post(bridgeEndpoint, { username, password, audience: (window.config?.oauth?.audience || '') }, { headers: { 'Content-Type': 'application/json' } });
            } catch (_) {
                const loginEndpoint = `${url.replace(/\/+$/,'')}/wp-json/pilehead-oidc/v1/login`;
                res = await axios.post(loginEndpoint, { username, password, audience: (window.config?.oauth?.audience || '') }, { headers: { 'Content-Type': 'application/json' } });
            }
            const tok = res.data;
            if (!tok || !tok.access_token) throw new Error('No token received');
            authTokens = { accessToken: tok.access_token, refreshToken: null, idToken: null, expiresIn: tok.expires_in };
            if (!window.config) window.config = {};
            window.config.oauth = { ...(window.config.oauth || {}), tokens: authTokens };
            if (wpRememberInput && wpRememberInput.checked) {
                config.oauth = config.oauth || {};
                config.oauth.wpLoginUsername = username;
                config.oauth.rememberWpLogin = true;
                persistConfig();
            } else {
                config.oauth = config.oauth || {};
                config.oauth.wpLoginUsername = '';
                config.oauth.rememberWpLogin = false;
                persistConfig();
            }
            if (wpPassInput) wpPassInput.value = '';
            alert('WordPress login successful.');
        } catch (e) {
            if (wpPassInput) wpPassInput.value = '';
            alert('WordPress login failed: ' + e.message);
        }
    });
}

function setupSettingsUI() {
    console.log('Initializing Settings UI...');
    
    // Save Settings
    const saveConfigBtn = document.getElementById('save-config-btn');
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', () => {
            saveConfig();
        });
    }

    // WordPress Test
    // wp-test-btn is handled by the main app script (index.html) via IPC — no duplicate handler needed here

    // Auto-save on change
    ['wp-url', 'wp-key', 'wp-secret', 'wp-auto-upload', 
     'azure-endpoint', 'azure-api-key', 'azure-deployment', 'azure-api-version',
     'gcs-bucket', 'gcs-token', 'gcs-sa-path', 'gcs-folder', 'gcs-image-folder', 'gcs-fosroc-image-folder', 'gcs-public-read'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', saveConfig);
            el.addEventListener('blur', saveConfig);
        }
    });


    // azure-test-btn is handled by the main app script (index.html) via IPC — no duplicate handler needed here

    // gcs-test-btn is handled by the main app script (index.html) via IPC — no duplicate handler needed here

    // Plugin Updater Save
    const pluginUpdaterSaveBtn = document.getElementById('plugin-updater-save-btn');
    if (pluginUpdaterSaveBtn) {
        pluginUpdaterSaveBtn.addEventListener('click', () => {
            saveConfig();
            alert('Plugin Updater tokens saved.');
        });
    }

    // Plugin Updater Test
    const pluginUpdaterTestBtn = document.getElementById('plugin-updater-test-btn');
    if (pluginUpdaterTestBtn) {
        pluginUpdaterTestBtn.addEventListener('click', async () => {
            saveConfig();
            const originalText = pluginUpdaterTestBtn.innerText;
            pluginUpdaterTestBtn.innerText = 'Testing...';
            pluginUpdaterTestBtn.disabled = true;
            
            try {
                const siteUrl = config.pluginUpdater?.siteUrl || config.wp?.url;
                const token = config.pluginUpdater?.token;
                
                if (!siteUrl) throw new Error('Site URL is missing.');
                if (!token) throw new Error('Plugin Secret is missing.');
                
                // We would call a helper function here. 
                // Since we don't have the exact helper visible in this file (it might be in 'helpers' or 'wordpress'),
                // we'll simulate a check or alert.
                // Actually, let's look for loadServerPlugins or similar.
                
                alert('Tokens saved. Please use the "Open Plugin Manager" button to verify connection by listing plugins.');
                
            } catch (err) {
                alert('Test Failed: ' + err.message);
            } finally {
                pluginUpdaterTestBtn.innerText = originalText;
                pluginUpdaterTestBtn.disabled = false;
            }
        });
    }

    // Data Management
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const deleteLastUploadBtn = document.getElementById('delete-last-upload-btn');
    const deleteAllUploadsBtn = document.getElementById('delete-all-uploads-btn');

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Clear local scraping history?')) {
                products = [];
                updateSelect();
                alert('History cleared.');
            }
        });
    }

    if (deleteLastUploadBtn) {
        deleteLastUploadBtn.addEventListener('click', () => {
             alert('Delete last upload from WP (logic pending).');
        });
    }

    if (deleteAllUploadsBtn) {
        deleteAllUploadsBtn.addEventListener('click', () => {
             if (confirm('Delete ALL uploaded products from WordPress? This cannot be undone.')) {
                 alert('Bulk delete initiated (logic pending).');
             }
        });
    }

    // Fix Fosroc Datasheets
    const fixDatasheetsBtn = document.getElementById('fix-datasheets-btn');
    if (fixDatasheetsBtn) {
        fixDatasheetsBtn.addEventListener('click', () => fixFosrocDatasheets());
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function normalizeText(value) {
    return (value || '').toString().replace(/\s+/g, ' ').trim();
}

async function fixFosrocDatasheets() {
    const btn = document.getElementById('fix-datasheets-btn');
    const log = document.getElementById('fix-datasheets-log');
    if (!btn || !log) return;

    btn.disabled = true;
    btn.textContent = '⏳ Working...';
    log.style.display = 'block';
    log.innerHTML = '';

    function appendLog(msg, color) {
        const line = document.createElement('div');
        line.style.color = color || 'inherit';
        line.textContent = msg;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
    }

    try {
        appendLog('❌ Offline bulk processing removed for Cloud Web Version.', '#ff453a');
        btn.textContent = '❌ Deprecated Web API';
        btn.disabled = false;
        return;
        const authHeader = 'Basic ' + btoa(`${ck}:${cs}`);
        const headers = { 'Authorization': authHeader, 'X-Forwarded-Proto': 'https' };

        let success = 0, skipped = 0, failed = 0;

        for (const target of targets) {
            appendLog(`\n→ ${target.name}`, '#ebebf5');
            appendLog(`  URL: ${target.url}`, '#8e8e93');
            try {
                // Re-scrape
                appendLog('  Scraping Fosroc...', '#8e8e93');
                const product = await fosroc.scrapeProduct(target.url, { headless: false, timeout: 60000 });

                if (!product || !product.datasheets || product.datasheets.length === 0) {
                    appendLog('  ⊘ No datasheets found on Fosroc — skipping', '#ff9f0a');
                    skipped++;
                    continue;
                }

                appendLog(`  ✓ Got ${product.datasheets.length} datasheets`, '#30d158');

                // Find in WordPress
                const searchRes = await axios.get(`${wpUrl}/wp-json/wc/v3/products`, {
                    headers,
                    params: { search: target.name, per_page: 3 }
                });

                const wpProducts = searchRes.data;
                if (!wpProducts || wpProducts.length === 0) {
                    appendLog('  ✗ Not found in WordPress — skipping', '#ff453a');
                    skipped++;
                    continue;
                }

                const wpProduct = wpProducts.find(p =>
                    p.name.toLowerCase().trim() === target.name.toLowerCase().trim()
                ) || wpProducts[0];
                const wpId = wpProduct.id;
                appendLog(`  ✓ Found WP ID: ${wpId}`, '#30d158');

                // Build meta_data
                const tds = product.datasheets.find(d => d.type === 'TDS');
                const sds = product.datasheets.find(d => d.type === 'SDS');
                const ms  = product.datasheets.find(d => d.type === 'MS');
                const metaData = [];
                if (tds) { metaData.push({ key: 'datasheet_url', value: tds.url }); appendLog(`     TDS: ${tds.url}`, '#5e5ce6'); }
                if (sds) { metaData.push({ key: 'sds_url',       value: sds.url }); appendLog(`     SDS: ${sds.url}`, '#5e5ce6'); }
                if (ms)  { metaData.push({ key: 'ms_url',        value: ms.url  }); appendLog(`     MS:  ${ms.url}`,  '#5e5ce6'); }

                if (metaData.length === 0) {
                    appendLog('  ⊘ No classifiable datasheets — skipping', '#ff9f0a');
                    skipped++;
                    continue;
                }

                // Update WordPress
                await axios.post(`${wpUrl}/wp-json/wc/v3/products/${wpId}`, { meta_data: metaData }, { headers });
                appendLog(`  ✅ Updated WP product ${wpId}`, '#30d158');
                success++;

            } catch (err) {
                appendLog(`  ✗ Error: ${err.message}`, '#ff453a');
                failed++;
            }
        }

        appendLog(`\n── Done ──  ✅ ${success} updated  |  ⊘ ${skipped} skipped  |  ✗ ${failed} failed`, '#ffd60a');

    } catch (e) {
        appendLog(`Fatal error: ${e.message}`, '#ff453a');
    }

    btn.textContent = '🔧 Fix All Fosroc Datasheets';
    btn.disabled = false;
}