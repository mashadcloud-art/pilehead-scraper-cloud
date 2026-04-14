const fs = require('fs');
const path = require('path');

const code = fs.readFileSync('main.js', 'utf8');

// Match blocks: ipcMain.handle('channel-name', async (event, { args }) => { ... });
const regex = /ipcMain\.handle\('([^']+)',\s*async\s*(?:\(([^)]*)\))?\s*=>\s*\{([\s\S]*?)\}\);/g;

let output = `
const wordpress = require('./wordpress');
const helpers = require('./helpers');
const { scrapeProduct } = require('./scrapeProduct');
const bgremove = require('./bgremove');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function handle(channel, data) {
    console.log('[CloudIPC] Received channel:', channel);
    
    // Fallback un-destructure data payload based on channel args
    let event = {}; // mock event
    
    switch (channel) {
`;

let match;
while ((match = regex.exec(code)) !== null) {
    const channel = match[1];
    let argsStr = match[2] || '';
    let body = match[3];
    
    // Ignore UI-bound or local electron-only channels
    if (channel.startsWith('plugin-updater') || channel === 'app-restart' || channel === 'scrape-url') {
        continue;
    }
    
    // Parse args out. Usually it's `event, { url, key, secret }` or `event, args` or `_event, { delay }`
    let destructureArgs = '';
    
    if (argsStr.includes('{') && argsStr.includes('}')) {
        const inner = argsStr.substring(argsStr.indexOf('{') + 1, argsStr.indexOf('}')).trim();
        if (inner) {
            let keys = inner.split(',').map(s => s.trim()).filter(Boolean);
            destructureArgs = `const { ${keys.join(', ')} } = data || {};`;
        }
    } else if (argsStr.split(',').length >= 2) {
        // e.g. event, payload
        let argName = argsStr.split(',')[1].trim();
        destructureArgs = `const ${argName} = data || {};`;
    }
    
    // Remove references to `event.sender.send` for progressive UI (we don't have SSE natively here without io.emit)
    body = body.replace(/event\.sender\.send/g, 'global.io && global.io.emit');
    // For media-source-progress, change event name
    body = body.replace(/global\.io\.emit\('([^']+)'/g, "global.io.emit('log'");

    output += `
        case '${channel}': {
            try {
                ${destructureArgs}
                ${body}
            } catch (err) {
                console.error('[CloudIPC] Error in ${channel}:', err);
                return { success: false, error: err.message };
            }
            break;
        }
    `;
}

output += `
        default:
            console.log('[CloudIPC] Unhandled channel:', channel);
            return { success: false, error: 'Not implemented on Cloud Backend' };
    }
}

module.exports = { handle };
`;

fs.writeFileSync(path.join('scraper', 'cloud-ipc.js'), output);
console.log('Done mapping IPC!');
