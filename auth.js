const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-pilehead-development-only-yolo';

function authenticateToken(req, res, next) {
    if (req.path === '/api/login' || req.path === '/api/register') return next();

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing Token' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Forbidden: Invalid Token' });
        
        // Dynamic User Query for Expiration
        try {
            const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'users.json'), 'utf8'));
            const dbUser = users[user.username];
            
            if (!dbUser) return res.status(403).json({ success: false, error: 'User does not exist' });
            
            if (!dbUser.isPaid && dbUser.trialEndsAt) { // Check expiration
                if (Date.now() > new Date(dbUser.trialEndsAt).getTime()) {
                    return res.status(403).json({ success: false, error: 'TRIAL_EXPIRED' });
                }
            }
            
            req.user = user; 
            next();
        } catch(e) {
            return res.status(500).json({ success: false, error: 'Database unreachable.' });
        }
    });
}

module.exports = { authenticateToken, JWT_SECRET };
