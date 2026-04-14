const axios = require('axios');
// User provided keys
const url = 'http://129.159.235.164';
const ck = 'ck_4c94723145465228525042875150534c03432130';
const cs = 'cs_8673738083838383838383838383838383838383'; // Placeholder based on context, user mentioned new keys earlier but I don't have the full CS. 
// Wait, I need the full keys from settings.json to test properly. 
// Let me read settings.json first to get the actual keys.
console.log("Reading settings.json...");
const fs = require('fs');
const path = require('path');
const settingsPath = path.join(__dirname, 'config', 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

// Correct property name based on reading settings.json: "wpProfiles"
const oracleProfile = settings.wpProfiles.find(p => p.url.includes('129.159.235.164'));

if (!oracleProfile) {
    console.error("Oracle profile not found in settings! Checking available profiles...");
    console.log(settings.wpProfiles.map(p => p.name).join(", "));
    process.exit(1);
}

const targetUrl = oracleProfile.url.replace(/\/$/, ""); // Remove trailing slash
const consumerKey = oracleProfile.key;      // Property is "key"
const consumerSecret = oracleProfile.secret;// Property is "secret"

console.log(`Testing connection to: ${targetUrl}`);
console.log(`Key: ${consumerKey}`);

async function test(name, headers, agent) {
    console.log(`\n--- Test: ${name} ---`);
    try {
        const response = await axios.get(`${targetUrl}/wp-json/wc/v3/products`, {
            params: {
                consumer_key: consumerKey,
                consumer_secret: consumerSecret,
                per_page: 1
            },
            headers: headers,
            httpAgent: agent,
            timeout: 5000
        });
        console.log("SUCCESS!");
        console.log("Status:", response.status);
    } catch (error) {
        console.log("FAILED.");
        if (error.response) {
            console.log("Status:", error.response.status);
            console.log("Data:", JSON.stringify(error.response.data, null, 2));
            console.log("Headers:", JSON.stringify(error.response.headers, null, 2));
        } else {
            console.log("Error:", error.message);
        }
    }
}

async function runTests() {
    // 1. Basic Request
    await test("Basic Request (No extra headers)", {}, undefined);

    // 2. HTTP Agent (keepAlive: true)
    const http = require('http');
    const httpAgent = new http.Agent({ keepAlive: true });
    await test("HTTP Agent", {}, httpAgent);

    // 3. Header Spoofing (HTTPS Proto)
    await test("Header Spoofing (X-Forwarded-Proto: https)", {
        'X-Forwarded-Proto': 'https'
    }, undefined);

    // 4. User Agent Spoofing + Proto
    await test("Full Spoofing (Agent + Proto)", {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'X-Forwarded-Proto': 'https'
    }, undefined);
    
    // 5. Query Auth vs Header Auth check
    // Try forcing basic auth header manually instead of params
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    await test("Explicit Basic Auth Header", {
        'Authorization': authHeader
    }, undefined);
}

runTests();
