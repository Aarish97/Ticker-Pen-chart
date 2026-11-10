const fs = require('fs');
const path = require('path');
const https = require('https');

const outputDir = path.join(__dirname, '../public/emojis/twemoji');
const dataDir = path.join(__dirname, '../src/data');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Download GitHub / Twemoji 2D SVG asset list and catalog
async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return resolve(false);
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(true));
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      resolve(false);
    });
  });
}

async function main() {
  console.log('Fetching emoji dataset...');
  const emojiDataUrl = 'https://raw.githubusercontent.com/github/gemoji/master/db/emoji.json';
  
  let rawList = [];
  try {
    rawList = await fetchJson(emojiDataUrl);
    console.log(`Fetched ${rawList.length} emoji entries from Gemoji database.`);
  } catch (e) {
    console.warn('Failed to fetch from Gemoji, using fallback list...', e.message);
  }

  // Convert emoji characters / descriptions into unified 2D items
  const catalog = [];
  const downloadItems = [];

  for (const item of rawList) {
    if (!item.emoji) continue;
    
    // Calculate unified hex code
    const codePoints = [];
    for (let i = 0; i < item.emoji.length; i++) {
      const code = item.emoji.codePointAt(i);
      if (code !== undefined) {
        codePoints.push(code.toString(16).toLowerCase());
        if (code > 0xffff) i++;
      }
    }
    const cleanUnified = codePoints.filter(cp => cp !== 'fe0f').join('-');
    const name = item.description || (item.aliases && item.aliases[0]) || cleanUnified;
    const category = item.category || 'Smileys & Emotion';

    catalog.push({
      id: (item.aliases && item.aliases[0]) || cleanUnified,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      unified: cleanUnified,
      category: category,
      tags: item.tags || [],
      aliases: item.aliases || []
    });

    downloadItems.push(cleanUnified);
  }

  // Save catalog JSON
  const catalogPath = path.join(dataDir, 'emoji_2d_catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`Saved 2D catalog with ${catalog.length} items to ${catalogPath}`);

  // Download unique SVGs in concurrency batches
  const uniqueUnifieds = [...new Set(downloadItems)];
  console.log(`Downloading ${uniqueUnifieds.length} 2D vector SVGs to ${outputDir}...`);

  const concurrency = 25;
  let completed = 0;
  let successCount = 0;

  async function worker(items) {
    for (const unified of items) {
      const dest = path.join(outputDir, `${unified}.svg`);
      if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
        const cdnUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${unified}.svg`;
        const ok = await downloadFile(cdnUrl, dest);
        if (ok) successCount++;
      } else {
        successCount++;
      }
      completed++;
      if (completed % 250 === 0 || completed === uniqueUnifieds.length) {
        console.log(`Progress: ${completed}/${uniqueUnifieds.length} (Downloaded: ${successCount})`);
      }
    }
  }

  const chunks = [];
  const chunkSize = Math.ceil(uniqueUnifieds.length / concurrency);
  for (let i = 0; i < uniqueUnifieds.length; i += chunkSize) {
    chunks.push(uniqueUnifieds.slice(i, i + chunkSize));
  }

  await Promise.all(chunks.map(chunk => worker(chunk)));
  console.log(`Download finished! Total available 2D SVGs: ${successCount}`);
}

main().catch(console.error);
