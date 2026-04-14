
const axios = require('axios');

const url = 'http://129.159.235.164/wp-json/wc/v3/products';
const key = 'ck_4c65614a4a66316bf1504adeb50cc86a879732ae';
const secret = 'cs_86e4863c2b3bcbbb566849c977f43fc947df1497';

async function test() {
    console.log('Testing Oracle Cloud Connection...');

    // Method 1: Query String
    try {
        const queryUrl = `${url}?consumer_key=${key}&consumer_secret=${secret}&per_page=1`;
        console.log(`\n1. Testing Query String...`);
        const res = await axios.get(queryUrl);
        console.log(`SUCCESS! Status: ${res.status}`);
        console.log('Data:', res.data.length ? 'Found products' : 'No products found');
        return;
    } catch (e) {
        console.log(`FAILED Query String: ${e.response ? e.response.status : e.message}`);
    }

    // Method 2: Basic Auth Header
    try {
        console.log(`\n2. Testing Basic Auth Header...`);
        const auth = Buffer.from(`${key}:${secret}`).toString('base64');
        const res = await axios.get(`${url}?per_page=1`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });
        console.log(`SUCCESS! Status: ${res.status}`);
    } catch (e) {
        console.log(`FAILED Basic Auth: ${e.response ? e.response.status : e.message}`);
    }
}

test();
