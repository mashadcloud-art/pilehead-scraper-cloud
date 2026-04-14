const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config(); // Allows you to load Oracle Cloud secrets

const app = express();
const server = http.createServer(app);

// Setup Socket.io for live text logs straight to the browser/app
const io = new Server(server, {
  cors: {
    origin: "*", // Allows your Web App, Desktop App, and Mobile App to connect!
    methods: ["GET", "POST"]
  }
});

// Important "Middleware" (plumbing)
app.use(cors());
app.use(express.json());

// 1. Host your exact UI files as a website!
// When someone visits your Oracle Cloud IP, they see the 'index.html' file
app.use(express.static(__dirname)); 

// 2. Setup your brand new Cloud API Endpoints
const fs = require('fs');

// We will require your scraper modules here, so the server can run them!
const helpers = require('./scraper/helpers');
const amazon = require('./scraper/amazon');
const noon = require('./scraper/noon');
const fosroc = require('./scraper/fosroc');
const fepy = require('./scraper/fepy');
const karcher = require('./scraper/karcher');
const universal = require('./scraper/universal');
const scrapeModules = { amazon, noon, fosroc, fepy, karcher, universal };

let orchestrator;
try {
  orchestrator = require('./scraper/unified/orchestrator');
  console.log('✅ Scraper module added to server.');
} catch (e) {
  console.warn('⚠️ Scraper orchestrator unavailable:', e.message);
}

const { scrapeProductDetails } = require('./scraper/scrape-product-details');

app.post('/api/scrape-fepy-product-details', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });
    const result = await scrapeProductDetails(url);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/scrape', async (req, res) => {
  const { urls, mode, selectedWebsite, config } = req.body;
  
  if (!urls || urls.length === 0) {
    return res.status(400).json({ error: 'No URLs provided' });
  }

  // Respond immediately so the browser isn't waiting indefinitely
  res.json({ success: true, message: 'Scraping engine has started!' });

  // Make sure orchestration works
  if (!orchestrator || typeof orchestrator.processSingle !== 'function') {
      try {
        orchestrator = require('./scraper/unified/orchestrator');
      } catch (e) {
        global.io.emit('log', '❌ Fatal Error: Scraper orchestrator unavailable on server.');
        return;
      }
  }

  // Run the scrape in the background!
  let browser = null;
  try {
    global.io.emit('log', `🚀 Cloud Engine initialized for ${urls.length} URLs.`);
    
    global.io.emit('log', `Launching hidden Server Browser...`);
    browser = await helpers.launchBrowser();

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        global.io.emit('log', `⚙️ Processing (${i+1}/${urls.length}): ${url}`);
        
        // This is where we call your existing scraping logic directly from the cloud backend
        if (orchestrator && typeof orchestrator.processSingle === 'function') {
            const unified = await orchestrator.processSingle({
                url: url,
                selectedWebsite,
                config,
                browser,
                scrapeModules,
                onProgress: (step, detail) => {
                  const label = typeof step === 'string' ? step : JSON.stringify(step);
                  global.io.emit('log', `[${label}] ${detail && detail.title ? detail.title : ''}`);
                }
            });
            global.io.emit('log', `✅ Finished processing: ${url}`);
            
            // We can emit the final scraped data back to the frontend!
            global.io.emit('scrape-result', { url, result: unified });

        } else {
            global.io.emit('log', `❌ Error: Orchestrator failed to load on the cloud.`);
        }
    }
    
    global.io.emit('log', `🏁 Entire scraping session finished!`);
  } catch (err) {
    console.error('Fatal Scraper Error:', err);
    global.io.emit('log', `❌ Fatal Error: ${err.message}`);
  } finally {
    if (browser) {
      global.io.emit('log', `Closing hidden Server Browser...`);
      await browser.close();
    }
  }
});

// Config API
app.get('/api/config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'settings.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'settings.json');
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 4));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'Online', engine: 'Pilehead Central API' });
});

// (Here is where we will add: app.post('/api/scrape/fosroc', ...) later)

// 3. Setup the live 2-way Walkie-Talkie (WebSockets)
io.on('connection', (socket) => {
  console.log('User connected to live logs:', socket.id);
  
  // Send a welcome log directly to the user's interface
  socket.emit('log', '🟢 Connected to the Central Scraping Engine on Oracle Cloud.');
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Put 'io' in the global scope so your scrapers (like scraper/fosroc.js) can use it to send logs
global.io = io; 

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Central API Server is ALIVE on port ${PORT}`);
  console.log(`👉 Open http://localhost:${PORT} in your web browser!`);
});
