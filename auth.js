const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-pilehead-development-only-yolo';

function authenticateToken(req, res, next) {
    // 1. Skip auth for login
    if (req.path === '/api/login') return next();

    // 2. Extract Bearer token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing Token' });
    }

    // 3. Verify token
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Forbidden: Invalid Token' });
        }
        
        // user object will contain { username: 'mashad', iat: ..., exp: ... }
        req.user = user; 
        next();
    });
}

module.exports = {
    authenticateToken,
    JWT_SECRET
};
