const axios = require('axios');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, 'config', 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const oracleProfile = settings.wpProfiles.find(p => p.url.includes('129.159.235.164'));
const targetUrl = oracleProfile.url.replace(/\/$/, "");
const consumerKey = oracleProfile.key;
const consumerSecret = oracleProfile.secret;

axios.interceptors.request.use(config => {
    if (config.url && config.url.startsWith('http:') && !config.url.includes('localhost')) {
         config.headers['X-Forwarded-Proto'] = 'https';
         if (!config.headers['User-Agent']) config.headers['User-Agent'] = 'Mozilla/5.0...';
    }
    return config;
});

async function checkImages() {
    console.log(`Checking images for product 9736 on ${targetUrl}...`);
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        const res = await axios.get(`${targetUrl}/wp-json/wc/v3/products/9736`, { 
            headers: { 'Authorization': authHeader } 
        });
        
        const images = res.data.images;
        console.log(`Found ${images.length} images.`);
        images.forEach((img, i) => {
            console.log(`[Image ${i+1}] ID: ${img.id}`);
            console.log(`  Source URL: ${img.src}`);
        });

    } catch (err) {
        console.error("Error:", err.message);
    }
}

checkImages();
