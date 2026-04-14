const fs = require('fs');
let code = fs.readFileSync('scraper/cloud-ipc.js', 'utf8');

// Inject requires
const requires = `
const fosroc = require('./fosroc');
const amazon = require('./amazon');
const noon = require('./noon');
const fepy = require('./fepy');
const karcher = require('./karcher');
const universal = require('./universal');
let orchestrator; try { orchestrator = require('./unified/orchestrator'); } catch (e) {}
`;

if (!code.includes('const fosroc = require')) {
    code = code.replace("const path = require('path');", "const path = require('path');\n" + requires);
}

// Get the raw scrape logic from temp_scrape.txt
let scrapeBlock = fs.readFileSync('temp_scrape.txt', 'utf8');

// Fix the trailing block (convert }); into break; })
scrapeBlock = scrapeBlock.replace(/\}\n    \}\n\}\);?(\s*)$/, "}\n    }\n    break;\n}\n");

if (!code.includes("case 'scrape-url': {")) {
    code = code.replace("            default:\n                console.log('[CloudIPC] Unhandled channel:', channel);",
        scrapeBlock + "\n            default:\n                console.log('[CloudIPC] Unhandled channel:', channel);"
    );
}

fs.writeFileSync('scraper/cloud-ipc.js', code);
console.log('Successfully injected scrape-url into cloud-ipc.js');
