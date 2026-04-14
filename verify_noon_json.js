
const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const url = 'https://www.noon.com/uae-en/men-s-s-cotton-solid-halfsleeve-polo-tshirt-wine/Z6D5579EF10F219C61CB3Z/p/?o=af2f3239dab914be';
    
    // Enable request interception - DISABLED to avoid HTTP2 errors
    // await page.setRequestInterception(true);
    
    // page.on('request', request => {
    //     request.continue();
    // });

    // Set a real user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
    });

    page.on('response', async response => {
        const url = response.url();
        // Only check interesting endpoints
        if (url.includes('/_next/data/') || url.includes('/api/') || url.includes('graphql') || url.includes('algolia')) {
            try {
                // Buffer the response text safely
                const text = await response.text();
                if (text.includes('Wine') || text.includes('Black')) {
                    console.log(`\n[FOUND DATA] In Response: ${url}`);
                    // Print a snippet
                    const idx = text.indexOf('Wine');
                    // Avoid printing huge blobs
                    console.log('Snippet:', text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 100)));
                }
            } catch (e) {
                // ignore
            }
        }
    });

    console.log(`Navigating to ${url}...`);
    // Increase timeout to 60s
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
        console.log("Navigation error (continuing anyway):", e.message);
    }

    // Focus on extracting the ssrCatalog data
    const scriptData = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const s of scripts) {
            const content = s.innerText;
            if (content.includes('product_title') && content.includes('self.__next_f.push')) {
                return content;
            }
        }
        return null;
    });

    if (scriptData) {
        console.log('\n[SUCCESS] Found script with product_title!');
        console.log(`Script length: ${scriptData.length}`);
        
        // Save to file for inspection if needed, but let's try to parse it here
        // Format: self.__next_f.push([1,"...STRING..."])
        // We need to extract "...STRING..." and then unescape it
        
        // 1. Extract the string inside the array
        // It starts after `self.__next_f.push([1,"`
        const startMarker = 'self.__next_f.push([1,"';
        const startIndex = scriptData.indexOf(startMarker);
        
        if (startIndex !== -1) {
            let rawString = scriptData.substring(startIndex + startMarker.length);
            // It ends with `"])` or `"])` at the end of the script
            const lastIndex = rawString.lastIndexOf('"])');
            if (lastIndex !== -1) {
                rawString = rawString.substring(0, lastIndex);
                
                // 2. Unescape the string
                // It's a JSON string literal, so we need to handle escaped quotes
                // The string itself is valid JSON *after* unescaping
                // e.g. \"foo\":\"bar\" -> "foo":"bar"
                
                try {
                    // Primitive unescaping: replace \" with " and \\ with \
                    // But wait, it's a JS string, so we can use JSON.parse(`"${rawString}"`) if it was a valid single string
                    // But it might be huge and contain newlines.
                    
                    let jsonStr = rawString
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');
                        
                    console.log('Extracted JSON length:', jsonStr.length);
                    
                    // Parse it to navigate safely
                    // The string might be incomplete if we just grabbed it from a push, but usually it's a complete object update
                    // However, it's often an array [1, "string"] where string is a partial JSON or a full object
                    // We already have the inner string.
                    
                    // Let's try to find where "Black" or "Blue" is mentioned
                    const colors = ["Black", "Blue", "Navy", "Red", "White"];
                    let foundColor = false;
                    
                    for (const color of colors) {
                        const idx = jsonStr.indexOf(color);
                        if (idx !== -1) {
                            console.log(`\n[FOUND COLOR] "${color}" at index ${idx}`);
                            // Print context (500 chars before and after)
                            const start = Math.max(0, idx - 200);
                            const end = Math.min(jsonStr.length, idx + 200);
                            console.log('Context:', jsonStr.substring(start, end));
                            foundColor = true;
                        }
                    }
                    
                    if (!foundColor) {
                        console.log('\n[WARNING] Could not find other colors (Black, Blue, etc.) in this JSON chunk.');
                        console.log('They might be in a separate API call or a different hydration chunk.');
                    }

                    // Find the key for the colors array
                    // Look for "Color" attribute definition
                    const colorAttr = '"name":"Color"';
                    const colorIdx = jsonStr.indexOf(colorAttr);
                    if (colorIdx !== -1) {
                         console.log(`\n[FOUND ATTRIBUTE] "${colorAttr}" at index ${colorIdx}`);
                         const start = Math.max(0, colorIdx - 200);
                         const end = Math.min(jsonStr.length, colorIdx + 500); // Show what follows (values)
                         console.log('Context:', jsonStr.substring(start, end));
                    }
                    
                    // Also look for "color_options"
                    const coIdx = jsonStr.indexOf('"color_options"');
                    if (coIdx !== -1) {
                        console.log(`\n[FOUND KEY] "color_options" at index ${coIdx}`);
                        console.log('Context:', jsonStr.substring(coIdx, coIdx + 500));
                    }

                    // 3. Find "variants" or "models" or "colors"
                    const keywords = ['"variants"', '"models"', '"siblings"', '"color_options"', '"attribute_values"'];
                    for (const kw of keywords) {
                        const idx = jsonStr.indexOf(kw);
                        if (idx !== -1) {
                            console.log(`\nFound key: ${kw}`);
                            // Print the next 500 chars to see structure
                            console.log('Structure:', jsonStr.substring(idx, idx + 500));
                        }
                    }
                    
                    // 4. Try to find the array of colors
                    // Look for "code":"Wine" or similar
                    const wineIdx = jsonStr.indexOf('Wine');
                    if (wineIdx !== -1) {
                        console.log('\nFound "Wine" context:');
                        console.log(jsonStr.substring(wineIdx - 200, wineIdx + 200));
                    }

                    const varRegex = /{"name":"([^"]+)","sku":"([^"]+)","is_available":\d+,"url":"([^"]+)","offer_code":"([^"]+)","image_key":"([^"]+)"/g;
                    let match;
                    // Log the first raw match context to see other fields
                    const firstMatchIndex = jsonStr.search(varRegex);
                    if (firstMatchIndex !== -1) {
                        console.log("Found JSON context around variation:");
                        // Print 500 chars around the match to see other fields like size
                        console.log(jsonStr.substring(firstMatchIndex, firstMatchIndex + 1000)); 
                    }

                    while((match = varRegex.exec(jsonStr)) !== null) {
                        // Loop body
                    }

                } catch (e) {
                    console.error('Error parsing extracted string:', e.message);
                }
            }
        }
    } else {
        console.log('Could not find the specific product script.');
    }

    await browser.close();
})();
