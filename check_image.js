const https = require('https');

const imageUrl = "https://ik.imagekit.io/aeqytyk46/pilehead/1773731292081_0001520_nitotile_xs.png";

https.get(imageUrl, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log('Headers:', res.headers);
    res.on('data', () => {}); // Consume data
}).on('error', (e) => {
    console.error(e);
});
