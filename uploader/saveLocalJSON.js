const fs = require('fs');
const path = require('path');

async function saveLocalJSON(snapshot) {
  const dir = path.join(__dirname, '..', 'scraped_data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `product_${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  return filePath;
}

module.exports = { saveLocalJSON };
