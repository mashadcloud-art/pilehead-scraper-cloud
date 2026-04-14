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

const { authenticateToken, JWT_SECRET } = require('./auth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// -- LOGIN ROUTE (Unprotected) --
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    try {
        const usersTable = require('./config/users.json');
        const user = usersTable[username];
        if (!user) return res.status(401).json({ success: false, error: 'User not found' });
        
        if (bcrypt.compareSync(password, user.passwordHash)) {
            const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '72h' });
            return res.json({ success: true, token, username });
        } else {
            return res.status(401).json({ success: false, error: 'Invalid password' });
        }
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Database missing or corrupted.' });
    }
});

// Guard all other /api/ routes
app.use('/api', authenticateToken);

// Helper function to resolve dynamic config path
const getConfigPath = (req) => {
    const username = req.user && req.user.username ? req.user.username : 'mashad';
    return path.join(__dirname, 'config', 'profiles', `settings_${username}.json`);
};

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
  const { urls, mode, selectedWebsite } = req.body;
  
  if (!urls || urls.length === 0) {
    return res.status(400).json({ error: 'No URLs provided' });
  }

  // Respond immediately so the browser isn't waiting indefinitely
  res.json({ success: true, message: 'Scraping engine has started!' });

  const configPath = getConfigPath(req);
  let rawConfig = {};
  if (fs.existsSync(configPath)) {
      try { rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8') || '{}'); } catch(e){}
  }

  // FORCE headless deployment for Cloud Ubuntu Server (Prevents X11 crash)
  rawConfig.headless = true;

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
                config: rawConfig,
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
    const configPath = getConfigPath(req);
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
    const configPath = getConfigPath(req);
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 4));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── UNIVERSAL IPC BRIDGE ──
const cloudIpc = require('./scraper/cloud-ipc');
app.post('/api/ipc', async (req, res) => {
    try {
        const { channel, data } = req.body;
        if (req.user) { req.body.data = data || {}; req.body.data._username = req.user.username; }
        const result = await cloudIpc.handle(channel, data);
        res.json(result || { success: true });
    } catch (e) {
        console.error('IPC Bridge Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'Online', engine: 'Pilehead Central API' });
});

// (Here is where we will add: app.post('/api/scrape/fosroc', ...) later)

// 3. Setup the live 2-way Walkie-Talkie (WebSockets)
io.on('connection', (socket) => {
  socket.on('join-room', (username) => { socket.join(username); console.log(socket.id, 'joined room', username); });
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

