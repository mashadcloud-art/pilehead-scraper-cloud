const fs = require('fs');

// 1. Get the original cloud-ipc.js BEFORE ANY of my injections
// Read it from the current git checkout to discard my broken regexes
require('child_process').execSync('git checkout -- scraper/cloud-ipc.js');

let target = fs.readFileSync('scraper/cloud-ipc.js', 'utf8');

// 2. Add dependencies at top
const requires = `
const fosroc = require('./fosroc');
const amazon = require('./amazon');
const noon = require('./noon');
const fepy = require('./fepy');
const karcher = require('./karcher');
const universal = require('./universal');
let orchestrator; try { orchestrator = require('./unified/orchestrator'); } catch (e) {}
let bgremove; try { bgremove = require('./bgremove'); } catch (e) {}
`;
target = target.replace("const path = require('path');", "const path = require('path');\n" + requires);

// 3. Extract logic from main.js manually via line numbers
const mainLines = fs.readFileSync('main.js', 'utf8').split(/\r?\n/);

// Find ipcMain.handle('scrape-url'...
let startLine = -1;
let endLine = -1;
for (let i = 0; i < mainLines.length; i++) {
    if (mainLines[i].includes("ipcMain.handle('scrape-url'")) {
        startLine = i;
    }
    // 'scrape-url' ends before the comment block /*
    if (startLine !== -1 && i > startLine && mainLines[i].includes("/*")) {
        endLine = i - 1; // back away from the comment and the });
        break;
    }
}

// Adjust endLine to stop squarely at the closing braces "    }"
while (endLine > 0 && !mainLines[endLine].includes("}")) {
    endLine--;
}

let block = "case 'scrape-url': {\n        const payload = data || {};\n";
block += mainLines.slice(startLine + 1, endLine).join('\n') + '\n';
block += "        break;\n    }\n";

// 4. Inject into target
target = target.replace("            default:\n                console.log('[CloudIPC] Unhandled channel:', channel);", block + "            default:\n                console.log('[CloudIPC] Unhandled channel:', channel);");

fs.writeFileSync('scraper/cloud-ipc.js', target);
console.log('Injection successful');
