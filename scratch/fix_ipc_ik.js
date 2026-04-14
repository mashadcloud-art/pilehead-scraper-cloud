const fs = require('fs');

let mainCode = fs.readFileSync('main.js', 'utf8');
let ipcCode = fs.readFileSync('scraper/cloud-ipc.js', 'utf8');

const mainLines = mainCode.split('\n');

function extractFunc(funcStarter) {
    let start = -1, end = -1;
    for (let i = 0; i < mainLines.length; i++) {
        if (mainLines[i].includes(funcStarter)) start = i;
        if (start !== -1 && i > start && mainLines[i].startsWith('}')) {
            end = i;
            break;
        }
    }
    return start !== -1 ? mainLines.slice(start, end + 1).join('\n') + '\n' : '';
}

const f1 = extractFunc('function makeIkUploader(');
const f2 = extractFunc('async function autoUploadGcsToIK(');

// Ensure we don't inject multiple times
if (!ipcCode.includes('function makeIkUploader(')) {
    ipcCode = ipcCode.replace("async function autoUploadGcsToIK(", f1 + "\nasync function autoUploadGcsToIK(");
    fs.writeFileSync('scraper/cloud-ipc.js', ipcCode);
    console.log('Injected makeIkUploader');
} else {
    console.log('Already injected');
}

