const fs = require('fs');

// ==== 1. Patch server.js ====
let serverCode = fs.readFileSync('server.js', 'utf8');

// Inject requires just before "const fs = require('fs');"
const authInject = `
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
    return path.join(__dirname, 'config', 'profiles', \`settings_\${username}.json\`);
};
`;
if (!serverCode.includes('/api/login')) {
    serverCode = serverCode.replace("const fs = require('fs');", authInject + "\nconst fs = require('fs');");
}

// Replace all harcoded config paths in server.js
serverCode = serverCode.replace(/const configPath = path\.join\(__dirname, 'config', 'settings\.json'\);/g, "const configPath = getConfigPath(req);");

// Inject username into IPC route
if(!serverCode.includes('data._username = req.user.username;')){
    serverCode = serverCode.replace("const { channel, data } = req.body;", "const { channel, data } = req.body;\n        if (req.user) { req.body.data = data || {}; req.body.data._username = req.user.username; }");
}

// Write back
fs.writeFileSync('server.js', serverCode);

// ==== 2. Patch scraper/cloud-ipc.js ====
let ipcCode = fs.readFileSync('scraper/cloud-ipc.js', 'utf8');
ipcCode = ipcCode.replace(/const cfgPath = path\.join\(__dirname, '\.\.', 'config', 'settings\.json'\);/g, 
    "const username = (data && data._username) ? data._username : 'mashad';\n                const cfgPath = path.join(__dirname, '..', 'config', 'profiles', `settings_${username}.json`);"
);
ipcCode = ipcCode.replace(/const cfg = JSON\.parse\(fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'config', 'settings\.json'\), 'utf8'\)\);/g,
    "const username = (data && data._username) ? data._username : 'mashad';\n                const cfgPathObj = path.join(__dirname, '..', 'config', 'profiles', `settings_${username}.json`);\n                const cfg = fs.existsSync(cfgPathObj) ? JSON.parse(fs.readFileSync(cfgPathObj, 'utf8')) : {};"
);
fs.writeFileSync('scraper/cloud-ipc.js', ipcCode);

fs.mkdirSync('config/profiles', { recursive: true });

console.log('Backend auth patched.');
