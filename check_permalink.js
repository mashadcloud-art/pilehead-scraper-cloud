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

// Apply interceptor
axios.interceptors.request.use(config => {
    if (config.url && config.url.startsWith('http:') && !config.url.includes('localhost')) {
         config.headers['X-Forwarded-Proto'] = 'https';
         if (!config.headers['User-Agent']) config.headers['User-Agent'] = 'Mozilla/5.0...';
    }
    return config;
});

async function checkPermalink() {
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        const res = await axios.get(`${targetUrl}/wp-json/wc/v3/products/9736`, { 
            headers: { 'Authorization': authHeader } 
        });
        console.log(`Product ID: ${res.data.id}`);
        console.log(`Name: ${res.data.name}`);
        console.log(`Permalink: ${res.data.permalink}`);
        console.log(`Date Modified: ${res.data.date_modified}`);
    } catch (err) {
        console.error("Error:", err.message);
    }
}

checkPermalink();
