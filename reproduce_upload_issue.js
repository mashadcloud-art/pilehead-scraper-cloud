const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load settings
const settingsPath = path.join(__dirname, 'config', 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const oracleProfile = settings.wpProfiles.find(p => p.url.includes('129.159.235.164'));

if (!oracleProfile) {
    console.error("Profile not found");
    process.exit(1);
}

const targetUrl = oracleProfile.url.replace(/\/$/, "");
const consumerKey = oracleProfile.key;
const consumerSecret = oracleProfile.secret;

// Apply the same interceptor fix strictly for this test
axios.interceptors.request.use(config => {
    if (config.url && config.url.startsWith('http:') && !config.url.includes('localhost')) {
         config.headers['X-Forwarded-Proto'] = 'https';
         if (!config.headers['User-Agent']) {
            config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
         }
    }
    return config;
});

async function testUpdate() {
    console.log(`Target: ${targetUrl}`);
    console.log("Attempting to fetch product 9736...");

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const headers = { 
        'Authorization': authHeader,
        'Content-Type': 'application/json'
    };

    // 1. Fetch
    try {
        const getRes = await axios.get(`${targetUrl}/wp-json/wc/v3/products/9736`, { headers });
        console.log(`Found Product: ${getRes.data.name}`);
        console.log(`Current Price: ${getRes.data.regular_price}`);
    } catch (err) {
        console.error("Fetch Failed:", err.message);
        if(err.response) console.error("Status:", err.response.status);
        return;
    }

    // 2. Update (Dry run - changing description slightly or just price)
    // We'll just touch the regular_price or name to see if PUT works
    // This replicates the logic in wordpress.js createProduct -> PUT
    console.log("Attempting PUT update...");
    try {
        const updatePayload = {
            short_description: `Updated by scraper diagnostic ${new Date().toISOString()}`
        };
        
        const putRes = await axios.put(`${targetUrl}/wp-json/wc/v3/products/9736`, updatePayload, { 
            headers,
            maxRedirects: 0, // IMPORTANT: Detect if it tries to redirect to HTTPS
            validateStatus: status => status < 400 // Throw on 3xx
        });
        
        console.log("Update SUCCESS!");
        console.log("Response Status:", putRes.status);
    } catch (err) {
        console.error("Update FAILED:", err.message);
        if (err.response) {
            console.error("Status:", err.response.status);
            if (err.response.status >= 300 && err.response.status < 400) {
                console.error("Redirect Location:", err.response.headers.location);
            }
            console.error("Data:", JSON.stringify(err.response.data, null, 2));
        }
    }
}

testUpdate();
