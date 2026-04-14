const fs = require('fs');

let mainCode = fs.readFileSync('main.js', 'utf8');
let ipcCode = fs.readFileSync('scraper/cloud-ipc.js', 'utf8');

// Use regex to locate writeWpMeta
const wpMetaMatch = mainCode.match(/async function writeWpMeta[\s\S]*?\}\n/);
const writeWpMetaStr = wpMetaMatch ? wpMetaMatch[0] : '';

// Use regex to locate autoUploadGcsToIK
// Since autoUploadGcsToIK might be long, let's find it by line matching
const mainLines = mainCode.split('\n');
let ikStart = -1, ikEnd = -1;
for (let i = 0; i < mainLines.length; i++) {
    if (mainLines[i].includes('async function autoUploadGcsToIK')) ikStart = i;
    if (ikStart !== -1 && i > ikStart && mainLines[i].startsWith('}')) {
        ikEnd = i;
        break;
    }
}
const ikStr = ikStart !== -1 ? mainLines.slice(ikStart, ikEnd + 1).join('\n') + '\n' : '';

// Inject before async function handle(
ipcCode = ipcCode.replace("async function handle(", writeWpMetaStr + "\n" + ikStr + "\nasync function handle(");

fs.writeFileSync('scraper/cloud-ipc.js', ipcCode);
console.log('Helpers injected');
