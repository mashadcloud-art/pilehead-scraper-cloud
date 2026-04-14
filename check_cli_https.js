
const https = require('https');
const axios = require('axios');
(async () => {
    try {
        console.log('Testing conn...');
        // Try HTTPS without verifying cert
        await axios.get('https://129.159.235.164/', { 
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 5000 
        });
        console.log('HTTPS_SUCCESS');
    } catch(e) {
        console.log('HTTPS_FAILED: ' + e.message);
    }
})();
