const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const sanitizeHtml = require('sanitize-html');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Rate limiter for OTP — max 5 requests per 15 minutes per IP
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many requests. Please wait before requesting another code.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// General API rate limiter — 100 requests per minute per IP
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat message rate limiter — 30 messages per minute per IP
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Too many messages. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── JWT CONFIG ───────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const JWT_EXPIRES_IN = '30d';

// ─── HTML SANITIZATION ───────────────────────────────────────────────────────
const SANITIZE_OPTIONS = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'u', 's', 'span', 'br', 'p', 'blockquote', 'pre', 'code']),
    allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'width', 'height', 'style'],
        span: ['style', 'class'],
        p: ['style', 'class'],
        '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
};

function sanitize(html) {
    if (!html) return '';
    return sanitizeHtml(html, SANITIZE_OPTIONS);
}

// ─── FILE UPLOAD VALIDATION ──────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function imageFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME_TYPES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed.'), false);
    }
}

// ─── EMAIL TRANSPORTER ───────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

const app = express();
app.use(cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use('/api', apiLimiter);

// Serve uploaded images statically (with security headers)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'");
    next();
}, express.static(uploadsDir));

const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const unique = crypto.randomBytes(16).toString('hex');
        cb(null, unique + path.extname(file.originalname).toLowerCase());
    },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'uiuc_flea_market',
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 10000,
});

// ─── SCHEMA MIGRATION ─────────────────────────────────────────────────────────

// Safe column add — checks INFORMATION_SCHEMA first (works on all MySQL versions)
async function addColumnIfMissing(conn, table, column, definition) {
    const [rows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    if (rows[0].cnt === 0) {
        await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        console.log(`  + Added column ${table}.${column}`);
    }
}

async function addIndexIfMissing(conn, table, indexName, columns) {
    const [rows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, indexName]
    );
    if (rows[0].cnt === 0) {
        await conn.execute(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`);
        console.log(`  + Added index ${table}.${indexName}`);
    }
}

async function runMigrations() {
    const conn = await pool.getConnection();
    try {
        // campuses table
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS campuses (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                name       VARCHAR(255) NOT NULL,
                slug       VARCHAR(100) NOT NULL UNIQUE,
                domain     VARCHAR(100) NOT NULL,
                city       VARCHAR(100),
                state      VARCHAR(100),
                is_active  TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await conn.execute(`
            INSERT IGNORE INTO campuses (name, slug, domain, city, state)
            VALUES ('University of Illinois Urbana-Champaign', 'uiuc', 'illinois.edu', 'Urbana-Champaign', 'IL')
        `);

        // admin_logs table
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                admin_id       INT,
                action         VARCHAR(100) NOT NULL,
                target_user_id INT,
                target_post_id INT,
                note           TEXT,
                created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // market_posts — safe column additions
        await addColumnIfMissing(conn, 'market_posts', 'category',   "VARCHAR(50) DEFAULT 'OTHER'");
        await addColumnIfMissing(conn, 'market_posts', 'campus_id',  "INT DEFAULT 1");
        await addColumnIfMissing(conn, 'market_posts', 'is_flagged', "TINYINT(1) DEFAULT 0");
        await addColumnIfMissing(conn, 'market_posts', 'flag_count', "INT DEFAULT 0");

        // market_items — safe column additions
        await addColumnIfMissing(conn, 'market_items', 'condition',  "VARCHAR(50) DEFAULT 'GOOD'");

        // users — safe column additions
        await addColumnIfMissing(conn, 'users', 'role',      "VARCHAR(50) DEFAULT 'student'");
        await addColumnIfMissing(conn, 'users', 'is_banned', "TINYINT(1) DEFAULT 0");

        // Soft delete for market_posts
        await addColumnIfMissing(conn, 'market_posts', 'deleted_at', 'TIMESTAMP NULL DEFAULT NULL');

        // Post reports — one per user per post
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS post_reports (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                post_id    INT NOT NULL,
                reporter_email VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_report (post_id, reporter_email)
            )
        `);

        // otp_tokens table
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS otp_tokens (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                email      VARCHAR(255) NOT NULL,
                code       VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_email (email)
            )
        `);

        // Performance indexes
        await addIndexIfMissing(conn, 'market_posts', 'idx_posts_deleted_at', '`deleted_at`');
        await addIndexIfMissing(conn, 'market_posts', 'idx_posts_campus_id',  '`campus_id`');
        await addIndexIfMissing(conn, 'market_posts', 'idx_posts_seller_id',  '`seller_id`');
        await addIndexIfMissing(conn, 'market_posts', 'idx_posts_created_at', '`created_at`');
        await addIndexIfMissing(conn, 'market_items', 'idx_items_post_id',    '`post_id`');
        await addIndexIfMissing(conn, 'chat_messages','idx_msgs_room_id',     '`room_id`');
        await addIndexIfMissing(conn, 'chat_messages','idx_msgs_room_read',   '`room_id`, `is_read`');
        await addIndexIfMissing(conn, 'post_reports', 'idx_reports_post_id',  '`post_id`');

        global._campusIdColumnReady = true;
        console.log('Migrations complete');
    } catch (err) {
        console.error('Migration error:', err.message);
    } finally {
        conn.release();
    }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function getOrCreateUser(conn, email, fullName) {
    if (!email) return null;
    const [rows] = await conn.execute(
        'SELECT user_id FROM users WHERE illinois_email = ?', [email]
    );
    if (rows.length > 0) return rows[0].user_id;

    const netid = email.split('@')[0] || email;
    const parts = (fullName || 'User').trim().split(/\s+/);
    const firstName = parts[0] || 'User';
    const lastName  = parts.slice(1).join(' ') || '';

    const [result] = await conn.execute(
        `INSERT INTO users (netid, first_name, last_name, illinois_email, is_verified, role)
         VALUES (?, ?, ?, ?, 1, 'student')`,
        [netid, firstName, lastName, email]
    );
    return result.insertId;
}

function mapItem(i) {
    let imageUrls = [];
    try { imageUrls = i.image_urls ? (Array.isArray(i.image_urls) ? i.image_urls : JSON.parse(i.image_urls)) : []; } catch {}
    return {
        id: i.id,
        name: i.name,
        price: parseFloat(i.price) || 0,
        description: i.description || '',
        productLink: i.product_link || '',
        status: i.status || 'AVAILABLE',
        condition: i.condition || 'GOOD',
        imageUrls,
    };
}

function mapPost(post, allItems) {
    const items = (allItems || []).filter(i => i.post_id === post.id).map(mapItem);
    return {
        id: post.id,
        title: post.title,
        content: post.content || '',
        writer: [post.first_name, post.last_name].filter(Boolean).join(' ') || 'Anonymous',
        writerId: post.seller_id,
        writerEmail: post.illinois_email || '',
        location: post.contact_place || '',
        type: post.trade_type || 'SELL',
        category: post.category || 'OTHER',
        campusId: post.campus_id || 1,
        isFlagged: !!post.is_flagged,
        flagCount: post.flag_count || 0,
        viewCount: post.view_count || 0,
        createdAt: post.created_at,
        items,
    };
}

const SORT_MAP = {
    newest:     'mp.created_at DESC',
    oldest:     'mp.created_at ASC',
    price_asc:  'min_price ASC',
    price_desc: 'min_price DESC',
};
const VALID_CATEGORIES = ['ELECTRONICS','TEXTBOOKS','FURNITURE','CLOTHING','APPLIANCES','OTHER'];

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────

function requireAdmin(roles = ['campus_admin', 'super_admin']) {
    return async (req, res, next) => {
        const email = req.user?.email;
        if (!email) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const [rows] = await pool.execute(
                'SELECT role FROM users WHERE illinois_email = ?', [email]
            );
            if (rows.length === 0 || !roles.includes(rows[0].role)) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            req.adminRole = rows[0].role;
            next();
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

// ─── AUTH MIDDLEWARE (JWT) ────────────────────────────────────────────────────

function requireAuth() {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const token = authHeader.slice(7);
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            req.user = { email: payload.sub, name: payload.name, role: payload.role, userId: payload.userId };
            next();
        } catch {
            return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
        }
    };
}

function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            req.user = { email: payload.sub, name: payload.name, role: payload.role, userId: payload.userId };
        } catch { /* invalid token — treat as unauthenticated */ }
    }
    next();
}

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────────

function handleMulterError(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
        return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
}

app.post('/api/images', upload.single('file'), handleMulterError, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ imageUrl: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` });
});

app.post('/api/images/multiple', upload.array('files', 10), handleMulterError, (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const imageUrls = req.files.map(f => `${req.protocol}://${req.get('host')}/uploads/${f.filename}`);
    res.json({ imageUrls });
});

// ─── CAMPUSES ────────────────────────────────────────────────────────────────

app.get('/api/campuses', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM campuses WHERE is_active = 1 ORDER BY name');
        res.json(rows);
    } catch (err) {
        console.error('[GET /api/campuses]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── OTP AUTH ────────────────────────────────────────────────────────────────

// POST /api/auth/send-otp — generate & email a 6-digit code
app.post('/api/auth/send-otp', otpLimiter, async (req, res) => {
    const { email, name } = req.body;
    if (!email || !email.endsWith('@illinois.edu')) {
        return res.status(400).json({ error: 'A valid @illinois.edu email is required.' });
    }

    const code = String(crypto.randomInt(100000, 999999)); // cryptographically secure 6 digits

    const conn = await pool.getConnection();
    try {
        // Remove any existing OTPs for this email
        await conn.execute('DELETE FROM otp_tokens WHERE email = ?', [email]);
        await conn.execute(
            'INSERT INTO otp_tokens (email, code, expires_at) VALUES (?, ?, NOW() + INTERVAL 10 MINUTE)',
            [email, code]
        );
    } finally {
        conn.release();
    }

    // Send email
    try {
        await mailer.sendMail({
            from: `"johnSQL" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: 'Your johnSQL Login Code',
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
                    <h2 style="margin:0 0 8px;font-size:20px;color:#111827">Your login code</h2>
                    <p style="color:#6b7280;margin:0 0 24px">Hi ${name || 'there'}, use the code below to sign in to johnSQL. It expires in <strong>10 minutes</strong>.</p>
                    <div style="background:#f3f4f6;border-radius:8px;padding:24px;text-align:center;letter-spacing:8px;font-size:36px;font-weight:700;color:#111827">${code}</div>
                    <p style="color:#9ca3af;font-size:12px;margin:24px 0 0">If you didn't request this, you can safely ignore this email.</p>
                </div>
            `,
        });
        res.json({ message: 'Code sent. Check your @illinois.edu inbox.' });
    } catch (err) {
        console.error('[send-otp] Email error:', err.message);
        res.status(500).json({ error: 'Failed to send email. Check server email configuration.' });
    }
});

// POST /api/auth/verify-otp — verify code and return user info
app.post('/api/auth/verify-otp', async (req, res) => {
    const { email, code, name } = req.body;
    if (!email || !code) {
        return res.status(400).json({ error: 'email and code are required.' });
    }

    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.execute(
            'SELECT * FROM otp_tokens WHERE email = ? AND code = ? AND expires_at > NOW()',
            [email, code]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired code. Please try again.' });
        }

        // Consume the OTP
        await conn.execute('DELETE FROM otp_tokens WHERE email = ?', [email]);

        // Get or create user
        const userId = await getOrCreateUser(conn, email, name || '');
        const [[user]] = await conn.execute(
            'SELECT user_id, first_name, last_name, illinois_email, role, is_banned FROM users WHERE user_id = ?',
            [userId]
        );

        if (user.is_banned) {
            return res.status(403).json({ error: 'banned' });
        }

        const userName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        const token = jwt.sign(
            { sub: user.illinois_email, name: userName, role: user.role || 'student', userId: user.user_id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        res.json({
            token,
            id: user.user_id,
            name: userName,
            email: user.illinois_email,
            role: user.role || 'student',
            isBanned: false,
        });
    } finally {
        conn.release();
    }
});

// ─── USERS / ME ───────────────────────────────────────────────────────────────

app.get('/api/users/me', optionalAuth, async (req, res) => {
    const email = req.user?.email;
    if (!email) return res.json({ role: 'student' });
    try {
        const [rows] = await pool.execute(
            'SELECT user_id, first_name, last_name, illinois_email, role, is_banned FROM users WHERE illinois_email = ?',
            [email]
        );
        if (rows.length === 0) return res.json({ role: 'student', isBanned: false });
        const u = rows[0];
        res.json({
            id: u.user_id,
            name: [u.first_name, u.last_name].filter(Boolean).join(' '),
            email: u.illinois_email,
            role: u.role || 'student',
            isBanned: !!u.is_banned,
        });
    } catch (err) {
        console.error('[GET /api/users/me]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── ADMIN — USERS ───────────────────────────────────────────────────────────

// GET /api/admin/users — paginated user list
app.get('/api/admin/users', requireAuth(), requireAdmin(), async (req, res) => {
    try {
        const page   = Math.max(0, parseInt(req.query.page) || 0);
        const size   = Math.min(50, parseInt(req.query.size) || 20);
        const search = req.query.search?.trim();
        const offset = page * size;

        const conditions = [];
        const params = [];
        if (search) {
            conditions.push('(u.illinois_email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.netid LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const [[{ total }]] = await pool.execute(
            `SELECT COUNT(*) as total FROM users u ${where}`, params
        );
        const [users] = await pool.query(
            `SELECT user_id, netid, first_name, last_name, illinois_email, role, is_verified, created_at
             FROM users u ${where}
             ORDER BY u.created_at DESC
             LIMIT ${size} OFFSET ${offset}`,
            params
        );

        res.json({
            content: users.map(u => ({
                id: u.user_id,
                netid: u.netid,
                name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.netid,
                email: u.illinois_email,
                role: u.role || 'student',
                isVerified: !!u.is_verified,
                createdAt: u.created_at,
            })),
            number: page,
            size,
            totalElements: total,
            totalPages: Math.ceil(total / size),
            last: (page + 1) * size >= total,
        });
    } catch (err) {
        console.error('[GET /api/admin/users]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/admin/users/:id — user detail + posts
app.get('/api/admin/users/:id', requireAuth(), requireAdmin(), async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT user_id, netid, first_name, last_name, illinois_email, role, is_verified, is_banned, created_at FROM users WHERE user_id = ?',
            [req.params.id]
        );
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        const u = users[0];

        const [posts] = await pool.execute(
            `SELECT id, title, trade_type, category, created_at
             FROM market_posts WHERE seller_id = ? ORDER BY created_at DESC`,
            [u.user_id]
        );

        const [logs] = await pool.execute(
            `SELECT al.action, al.note, al.created_at,
                    CONCAT(au.first_name, ' ', au.last_name) as actor_name
             FROM admin_logs al
             LEFT JOIN users au ON al.admin_id = au.user_id
             WHERE al.target_user_id = ?
             ORDER BY al.created_at DESC`,
            [u.user_id]
        );

        res.json({
            user: {
                id: u.user_id,
                netid: u.netid,
                name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.netid,
                email: u.illinois_email,
                role: u.role || 'student',
                isVerified: !!u.is_verified,
                isBanned: !!u.is_banned,
                createdAt: u.created_at,
            },
            posts: posts.map(p => ({
                id: p.id,
                title: p.title,
                type: p.trade_type,
                category: p.category,
                createdAt: p.created_at,
            })),
            logs: logs.map(l => ({
                action: l.action,
                note: l.note,
                actorName: l.actor_name?.trim() || 'System',
                createdAt: l.created_at,
            })),
        });
    } catch (err) {
        console.error('[GET /api/admin/users/:id]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /api/admin/users/:id/role — change user role
app.patch('/api/admin/users/:id/role', requireAuth(), requireAdmin(), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { role } = req.body;
        const validRoles = ['student', 'campus_admin', 'super_admin'];
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

        // Only super_admin can promote to super_admin
        if (role === 'super_admin' && req.adminRole !== 'super_admin') {
            return res.status(403).json({ error: 'Only super_admin can assign super_admin role' });
        }

        const adminEmail = req.user?.email;
        const [[admin]] = await conn.execute(
            'SELECT user_id FROM users WHERE illinois_email = ?', [adminEmail]
        );

        await conn.execute('UPDATE users SET role = ? WHERE user_id = ?', [role, req.params.id]);
        await conn.execute(
            'INSERT INTO admin_logs (admin_id, action, target_user_id, note) VALUES (?, ?, ?, ?)',
            [admin?.user_id || null, 'ROLE_CHANGE', req.params.id, `Role changed to ${role}`]
        );

        res.json({ message: 'Role updated', role });
    } catch (err) {
        console.error('[PATCH /api/admin/users/:id/role]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

// DELETE /api/admin/posts/:id — admin force-delete any post
app.delete('/api/admin/posts/:id', requireAuth(), requireAdmin(), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const adminEmail = req.user?.email;
        const [[admin]] = await conn.execute(
            'SELECT user_id FROM users WHERE illinois_email = ?', [adminEmail]
        );

        await conn.execute('DELETE FROM market_posts WHERE id = ?', [req.params.id]);
        await conn.execute(
            'INSERT INTO admin_logs (admin_id, action, target_post_id, note) VALUES (?, ?, ?, ?)',
            [admin?.user_id || null, 'DELETE_POST', req.params.id, 'Admin force-deleted post']
        );

        res.json({ message: 'Post deleted' });
    } catch (err) {
        console.error('[DELETE /api/admin/posts/:id]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

// ─── ADMIN — FLAGGED POSTS ───────────────────────────────────────────────────

app.get('/api/admin/posts/flagged', requireAuth(), requireAdmin(), async (req, res) => {
    try {
        const page   = Math.max(0, parseInt(req.query.page) || 0);
        const size   = Math.min(50, parseInt(req.query.size) || 20);
        const offset = page * size;

        const [[{ total }]] = await pool.execute(
            `SELECT COUNT(*) as total FROM market_posts WHERE is_flagged = 1 AND deleted_at IS NULL`
        );
        const [posts] = await pool.query(
            `SELECT mp.*, u.first_name, u.last_name, u.illinois_email
             FROM market_posts mp
             LEFT JOIN users u ON mp.seller_id = u.user_id
             WHERE mp.is_flagged = 1 AND mp.deleted_at IS NULL
             ORDER BY mp.flag_count DESC, mp.created_at DESC
             LIMIT ${size} OFFSET ${offset}`
        );
        let items = [];
        if (posts.length > 0) {
            const ids = posts.map(p => p.id);
            [items] = await pool.execute(
                `SELECT * FROM market_items WHERE post_id IN (${ids.map(() => '?').join(',')})`, ids
            );
        }
        res.json({
            content: posts.map(p => mapPost(p, items)),
            number: page,
            size,
            totalElements: total,
            totalPages: Math.ceil(total / size),
            last: (page + 1) * size >= total,
        });
    } catch (err) {
        console.error('[GET /api/admin/posts/flagged]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/posts/:id/unflag', requireAuth(), requireAdmin(), async (req, res) => {
    try {
        await pool.execute(
            'UPDATE market_posts SET is_flagged = 0, flag_count = 0 WHERE id = ?', [req.params.id]
        );
        res.json({ message: 'Post unflagged' });
    } catch (err) {
        console.error('[POST /api/admin/posts/:id/unflag]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── ADMIN — BAN / UNBAN USER ────────────────────────────────────────────────

// PATCH /api/admin/users/:id/ban — ban a user
app.patch('/api/admin/users/:id/ban', requireAuth(), requireAdmin(), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { banned } = req.body; // true = ban, false = unban
        const adminEmail = req.user?.email;
        const [[admin]] = await conn.execute(
            'SELECT user_id FROM users WHERE illinois_email = ?', [adminEmail]
        );
        await conn.execute('UPDATE users SET is_banned = ? WHERE user_id = ?', [banned ? 1 : 0, req.params.id]);
        await conn.execute(
            'INSERT INTO admin_logs (admin_id, action, target_user_id, note) VALUES (?, ?, ?, ?)',
            [admin?.user_id || null, banned ? 'BAN_USER' : 'UNBAN_USER', req.params.id,
             banned ? 'User banned' : 'User unbanned']
        );
        res.json({ message: banned ? 'User banned' : 'User unbanned', isBanned: !!banned });
    } catch (err) {
        console.error('[PATCH /api/admin/users/:id/ban]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

// ─── FLEA MARKET CRUD ────────────────────────────────────────────────────────

app.get('/api/flea', async (req, res) => {
    try {
        const page     = Math.max(0, parseInt(req.query.page) || 0);
        const size     = Math.min(50, parseInt(req.query.size) || 12);
        const offset   = page * size;
        const type     = req.query.type;
        const category = req.query.category;
        const search   = req.query.search?.trim();
        const sortKey  = req.query.sort;
        const sort     = (sortKey && Object.prototype.hasOwnProperty.call(SORT_MAP, sortKey))
            ? SORT_MAP[sortKey]
            : SORT_MAP.newest;
        const slug     = req.query.campus; // campus slug filter
        const needMinPrice = req.query.sort === 'price_asc' || req.query.sort === 'price_desc';

        const conditions = ['mp.deleted_at IS NULL'];
        const params = [];

        if (type === 'BUY' || type === 'SELL') {
            conditions.push('mp.trade_type = ?');
            params.push(type);
        }
        if (category && VALID_CATEGORIES.includes(category.toUpperCase())) {
            conditions.push('mp.category = ?');
            params.push(category.toUpperCase());
        }
        if (search) {
            conditions.push('(mp.title LIKE ? OR mp.content LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        // campus filter: only apply if campus_id column exists (safe for fresh DBs)
        if (slug && global._campusIdColumnReady) {
            conditions.push('EXISTS (SELECT 1 FROM campuses c WHERE c.id = mp.campus_id AND c.slug = ?)');
            params.push(slug);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const priceJoin = needMinPrice
            ? `LEFT JOIN (SELECT post_id, MIN(price) as min_price FROM market_items GROUP BY post_id) pi ON pi.post_id = mp.id`
            : '';

        const [[{ total }]] = await pool.execute(
            `SELECT COUNT(*) as total FROM market_posts mp ${where}`, params
        );
        const [posts] = await pool.query(
            `SELECT mp.*, u.first_name, u.last_name, u.illinois_email
             ${needMinPrice ? ', COALESCE(pi.min_price, 0) as min_price' : ''}
             FROM market_posts mp
             LEFT JOIN users u ON mp.seller_id = u.user_id
             ${priceJoin}
             ${where}
             ORDER BY ${sort}
             LIMIT ${size} OFFSET ${offset}`,
            params
        );

        let items = [];
        if (posts.length > 0) {
            const ids = posts.map(p => p.id);
            [items] = await pool.execute(
                `SELECT * FROM market_items WHERE post_id IN (${ids.map(() => '?').join(',')})`, ids
            );
        }

        res.json({
            content: posts.map(p => mapPost(p, items)),
            number: page, size,
            totalElements: total,
            last: (page + 1) * size >= total,
        });
    } catch (err) {
        console.error('[GET /api/flea]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/flea/latest', async (req, res) => {
    try {
        const [posts] = await pool.execute(
            `SELECT mp.*, u.first_name, u.last_name, u.illinois_email
             FROM market_posts mp
             LEFT JOIN users u ON mp.seller_id = u.user_id
             WHERE mp.deleted_at IS NULL
             ORDER BY mp.created_at DESC LIMIT 8`
        );
        let items = [];
        if (posts.length > 0) {
            const ids = posts.map(p => p.id);
            [items] = await pool.execute(
                `SELECT * FROM market_items WHERE post_id IN (${ids.map(() => '?').join(',')})`, ids
            );
        }
        res.json(posts.map(p => mapPost(p, items)));
    } catch (err) {
        console.error('[GET /api/flea/latest]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/flea/:id', async (req, res) => {
    try {
        const [posts] = await pool.execute(
            `SELECT mp.*, u.first_name, u.last_name, u.illinois_email
             FROM market_posts mp
             LEFT JOIN users u ON mp.seller_id = u.user_id
             WHERE mp.id = ? AND mp.deleted_at IS NULL`,
            [req.params.id]
        );
        if (posts.length === 0) return res.status(404).json({ error: 'Not found' });
        const post = posts[0];
        pool.execute('UPDATE market_posts SET view_count = view_count + 1 WHERE id = ?', [post.id]).catch(() => {});
        const [items] = await pool.execute('SELECT * FROM market_items WHERE post_id = ?', [post.id]);
        res.json(mapPost({ ...post, view_count: (post.view_count || 0) + 1 }, items));
    } catch (err) {
        console.error('[GET /api/flea/:id]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/flea/:id/report — flag a post (auth required, one report per user per post)
app.post('/api/flea/:id/report', requireAuth(), async (req, res) => {
    const reporterEmail = req.user?.email;
    if (!reporterEmail) return res.status(401).json({ error: 'Login required to report.' });
    const conn = await pool.getConnection();
    try {
        // Deduplicate: ignore if already reported by this user
        const [existing] = await conn.execute(
            'SELECT id FROM post_reports WHERE post_id = ? AND reporter_email = ?',
            [req.params.id, reporterEmail]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'You have already reported this post.' });
        }
        await conn.execute(
            'INSERT INTO post_reports (post_id, reporter_email) VALUES (?, ?)',
            [req.params.id, reporterEmail]
        );
        await conn.execute(
            'UPDATE market_posts SET flag_count = flag_count + 1, is_flagged = 1 WHERE id = ?',
            [req.params.id]
        );
        res.json({ message: 'Post reported' });
    } catch (err) {
        console.error('[POST /api/flea/:id/report]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

app.post('/api/flea', requireAuth(), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { title, content, contactPlace, type, category, campus, items } = req.body;
        const sellerEmail = req.user?.email;
        const sellerName  = req.user?.name;

        // Input validation
        const titleTrimmed = title?.trim();
        if (!titleTrimmed || titleTrimmed.length > 200)
            return res.status(400).json({ error: 'Title must be 1–200 characters.' });
        if (!contactPlace?.trim())
            return res.status(400).json({ error: 'Meetup location is required.' });
        if (!Array.isArray(items) || items.length === 0)
            return res.status(400).json({ error: 'At least one item is required.' });
        if (items.length > 10)
            return res.status(400).json({ error: 'Maximum 10 items per listing.' });
        for (const item of items) {
            if (!item.name?.trim())
                return res.status(400).json({ error: 'Each item must have a name.' });
            const price = parseFloat(item.price);
            if (isNaN(price) || price < 0 || price > 99999)
                return res.status(400).json({ error: 'Item price must be between $0 and $99,999.' });
        }

        const sellerId = await getOrCreateUser(conn, sellerEmail, sellerName);
        const cat = (category && VALID_CATEGORIES.includes(category.toUpperCase())) ? category.toUpperCase() : 'OTHER';

        // Resolve campus_id from slug (defaults to 1/UIUC if not found)
        let campusId = 1;
        if (campus) {
            const [[campusRow]] = await conn.execute(
                'SELECT id FROM campuses WHERE slug = ?', [campus]
            );
            if (campusRow) campusId = campusRow.id;
        }

        const [result] = await conn.execute(
            'INSERT INTO market_posts (title, content, contact_place, trade_type, category, campus_id, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, sanitize(content || ''), contactPlace || '', type || 'SELL', cat, campusId, sellerId]
        );
        const postId = result.insertId;

        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                await conn.execute(
                    'INSERT INTO market_items (post_id, name, price, description, product_link, `condition`, image_urls) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [postId, item.name || '', parseFloat(item.price) || 0, item.description || '',
                     item.productLink || item.link || '', item.condition || 'GOOD', JSON.stringify(item.imageUrls || [])]
                );
            }
        }
        await conn.commit();
        res.status(201).json({ id: postId });
    } catch (err) {
        await conn.rollback();
        console.error('[POST /api/flea]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

app.put('/api/flea/:id', requireAuth(), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { title, content, contactPlace, type, category, items } = req.body;
        const postId = req.params.id;
        const requesterEmail = req.user?.email;

        // Require authentication
        if (!requesterEmail) {
            conn.release();
            return res.status(401).json({ error: 'Authentication required.' });
        }

        // Ownership check — only the author (or admin) can edit
        {
            const [[post]] = await conn.execute(
                `SELECT u.illinois_email, u.role
                 FROM market_posts mp
                 LEFT JOIN users u ON mp.seller_id = u.user_id
                 WHERE mp.id = ? AND mp.deleted_at IS NULL`, [postId]
            );
            if (!post) return res.status(404).json({ error: 'Post not found' });
            const isOwner = post.illinois_email === requesterEmail;
            const [[requester]] = await conn.execute(
                'SELECT role FROM users WHERE illinois_email = ?', [requesterEmail]
            );
            const requesterIsAdmin = requester && ['campus_admin', 'super_admin'].includes(requester.role);
            if (!isOwner && !requesterIsAdmin) {
                conn.release();
                return res.status(403).json({ error: 'You are not allowed to edit this listing.' });
            }
        }

        // Input validation
        const titleTrimmed = title?.trim();
        if (!titleTrimmed || titleTrimmed.length > 200) {
            conn.release();
            return res.status(400).json({ error: 'Title must be 1–200 characters.' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            conn.release();
            return res.status(400).json({ error: 'At least one item is required.' });
        }
        if (items.length > 10) {
            conn.release();
            return res.status(400).json({ error: 'Maximum 10 items per listing.' });
        }
        for (const item of items) {
            if (!item.name?.trim()) {
                conn.release();
                return res.status(400).json({ error: 'Each item must have a name.' });
            }
            const price = parseFloat(item.price);
            if (isNaN(price) || price < 0 || price > 99999) {
                conn.release();
                return res.status(400).json({ error: 'Item price must be between $0 and $99,999.' });
            }
        }

        const cat = (category && VALID_CATEGORIES.includes(category.toUpperCase())) ? category.toUpperCase() : 'OTHER';

        await conn.execute(
            'UPDATE market_posts SET title = ?, content = ?, contact_place = ?, trade_type = ?, category = ? WHERE id = ?',
            [title, sanitize(content || ''), contactPlace || '', type || 'SELL', cat, postId]
        );
        await conn.execute('DELETE FROM market_items WHERE post_id = ?', [postId]);

        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                await conn.execute(
                    'INSERT INTO market_items (post_id, name, price, description, product_link, status, `condition`, image_urls) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [postId, item.name || '', parseFloat(item.price) || 0, item.description || '',
                     item.productLink || item.link || '', item.status || 'AVAILABLE',
                     item.condition || 'GOOD', JSON.stringify(item.imageUrls || [])]
                );
            }
        }
        await conn.commit();
        res.json({ message: 'Updated successfully' });
    } catch (err) {
        await conn.rollback();
        console.error('[PUT /api/flea/:id]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

app.delete('/api/flea/:id', requireAuth(), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const requesterEmail = req.user?.email;
        const postId = req.params.id;

        // Require authentication
        if (!requesterEmail) {
            conn.release();
            return res.status(401).json({ error: 'Authentication required.' });
        }

        // Ownership check
        const [[post]] = await conn.execute(
            `SELECT u.illinois_email as author_email
             FROM market_posts mp
             LEFT JOIN users u ON mp.seller_id = u.user_id
             WHERE mp.id = ? AND mp.deleted_at IS NULL`, [postId]
        );
        if (!post) return res.status(404).json({ error: 'Not found' });
        const isOwner = post.author_email === requesterEmail;
        if (!isOwner) {
            const [[requester]] = await conn.execute(
                'SELECT role FROM users WHERE illinois_email = ?', [requesterEmail]
            );
            const requesterIsAdmin = requester && ['campus_admin', 'super_admin'].includes(requester.role);
            if (!requesterIsAdmin) {
                conn.release();
                return res.status(403).json({ error: 'You are not allowed to delete this listing.' });
            }
        }

        const [result] = await conn.execute(
            'UPDATE market_posts SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [postId]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error('[DELETE /api/flea/:id]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

// ─── MY PAGE ─────────────────────────────────────────────────────────────────

// GET /api/users/me/posts — paginated list of the logged-in user's listings
app.get('/api/users/me/posts', optionalAuth, async (req, res) => {
    const email = req.user?.email;
    if (!email) return res.json({ content: [], totalElements: 0, totalPages: 0, number: 0, last: true });
    try {
        const page   = Math.max(0, parseInt(req.query.page) || 0);
        const size   = Math.min(20, parseInt(req.query.size) || 10);
        const offset = page * size;

        const [userRows] = await pool.execute(
            'SELECT user_id FROM users WHERE illinois_email = ?', [email]
        );
        if (userRows.length === 0) return res.json({ content: [], totalElements: 0, totalPages: 0, number: 0, last: true });
        const userId = userRows[0].user_id;

        const [[{ total }]] = await pool.execute(
            'SELECT COUNT(*) as total FROM market_posts WHERE seller_id = ? AND deleted_at IS NULL', [userId]
        );
        const [posts] = await pool.query(
            `SELECT mp.id, mp.title, mp.trade_type, mp.category, mp.view_count, mp.created_at,
                    (SELECT mi.image_urls FROM market_items mi WHERE mi.post_id = mp.id LIMIT 1) AS first_image_urls,
                    (SELECT mi.price FROM market_items mi WHERE mi.post_id = mp.id LIMIT 1) AS first_price,
                    (SELECT mi.status FROM market_items mi WHERE mi.post_id = mp.id LIMIT 1) AS first_status
             FROM market_posts mp
             WHERE mp.seller_id = ? AND mp.deleted_at IS NULL
             ORDER BY mp.created_at DESC
             LIMIT ${size} OFFSET ${offset}`,
            [userId]
        );

        const content = posts.map(p => {
            let imageUrl = null;
            try {
                const urls = p.first_image_urls ? JSON.parse(p.first_image_urls) : [];
                imageUrl = urls[0] || null;
            } catch {}
            return {
                id: p.id,
                title: p.title,
                type: p.trade_type,
                category: p.category || 'OTHER',
                viewCount: p.view_count || 0,
                price: parseFloat(p.first_price) || 0,
                status: p.first_status || 'AVAILABLE',
                imageUrl,
                createdAt: p.created_at,
            };
        });

        res.json({
            content,
            totalElements: total,
            totalPages: Math.ceil(total / size),
            number: page,
            last: (page + 1) * size >= total,
        });
    } catch (err) {
        console.error('[GET /api/users/me/posts]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── CHAT (HTTP-based, no WebSocket) ─────────────────────────────────────────

// Ensure chat tables exist
async function ensureChatTables() {
    const conn = await pool.getConnection();
    try {
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS chat_rooms (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                post_id    INT NOT NULL,
                buyer_id   INT NOT NULL,
                seller_id  INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_room (post_id, buyer_id)
            )
        `);
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                room_id    INT NOT NULL,
                sender_id  INT NOT NULL,
                content    TEXT NOT NULL,
                is_read    TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (err) {
        console.error('Chat table error:', err.message);
    } finally {
        conn.release();
    }
}

// GET /api/chat/rooms — list chat rooms for the logged-in user
app.get('/api/chat/rooms', optionalAuth, async (req, res) => {
    const email = req.user?.email;
    if (!email) return res.json([]);
    try {
        const [userRows] = await pool.execute('SELECT user_id FROM users WHERE illinois_email = ?', [email]);
        if (userRows.length === 0) return res.json([]);
        const userId = userRows[0].user_id;

        const [rooms] = await pool.execute(
            `SELECT cr.id, cr.post_id, mp.title as post_title,
                    CASE WHEN cr.buyer_id = ? THEN cr.seller_id ELSE cr.buyer_id END as partner_id,
                    TRIM(CASE WHEN cr.buyer_id = ?
                         THEN CONCAT(COALESCE(us.first_name,''), ' ', COALESCE(us.last_name,''))
                         ELSE CONCAT(COALESCE(ub.first_name,''), ' ', COALESCE(ub.last_name,''))
                    END) as partner_name,
                    (SELECT cm.content FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) as last_message,
                    (SELECT cm.created_at FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) as last_message_at,
                    (SELECT COUNT(*) FROM chat_messages cm WHERE cm.room_id = cr.id AND cm.sender_id != ? AND cm.is_read = 0) as unread_count
             FROM chat_rooms cr
             LEFT JOIN market_posts mp ON cr.post_id = mp.id
             LEFT JOIN users ub ON cr.buyer_id  = ub.user_id
             LEFT JOIN users us ON cr.seller_id = us.user_id
             WHERE cr.buyer_id = ? OR cr.seller_id = ?
             ORDER BY last_message_at DESC
             LIMIT 50`,
            [userId, userId, userId, userId, userId]
        );

        res.json(rooms.map(r => ({
            roomId:        r.id,
            postId:        r.post_id,
            postTitle:     r.post_title || 'Listing',
            partnerName:   r.partner_name?.trim() || 'Unknown',
            lastMessage:   r.last_message,
            lastMessageAt: r.last_message_at,
            unreadCount:   r.unread_count || 0,
        })));
    } catch (err) {
        console.error('[GET /api/chat/rooms]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/chat/rooms — create or get existing room
app.post('/api/chat/rooms', requireAuth(), async (req, res) => {
    const email = req.user?.email;
    const name  = req.user?.name;
    const { postId } = req.body;
    if (!email || !postId) return res.status(400).json({ error: 'email and postId required' });
    const conn = await pool.getConnection();
    try {
        const buyerId = await getOrCreateUser(conn, email, name);
        const [[post]] = await conn.execute('SELECT seller_id FROM market_posts WHERE id = ?', [postId]);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.seller_id === buyerId) return res.status(400).json({ error: 'Cannot chat with yourself' });

        // INSERT IGNORE is atomic — handles concurrent requests without race conditions
        const [insertResult] = await conn.execute(
            'INSERT IGNORE INTO chat_rooms (post_id, buyer_id, seller_id) VALUES (?, ?, ?)',
            [postId, buyerId, post.seller_id]
        );
        if (insertResult.insertId) {
            return res.status(201).json({ roomId: insertResult.insertId });
        }
        // Room already existed (INSERT IGNORE skipped the duplicate)
        const [[existingRoom]] = await conn.execute(
            'SELECT id FROM chat_rooms WHERE post_id = ? AND buyer_id = ?', [postId, buyerId]
        );
        res.json({ roomId: existingRoom.id });
    } catch (err) {
        console.error('[POST /api/chat/rooms]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

// GET /api/chat/room/:id — room info
app.get('/api/chat/room/:id', optionalAuth, async (req, res) => {
    const email = req.user?.email;
    try {
        const [rooms] = await pool.execute(
            `SELECT cr.*, mp.title as post_title,
                    u_buyer.first_name as buyer_fn, u_buyer.last_name as buyer_ln, u_buyer.illinois_email as buyer_email,
                    u_seller.first_name as seller_fn, u_seller.last_name as seller_ln, u_seller.illinois_email as seller_email
             FROM chat_rooms cr
             LEFT JOIN market_posts mp ON cr.post_id = mp.id
             LEFT JOIN users u_buyer ON cr.buyer_id = u_buyer.user_id
             LEFT JOIN users u_seller ON cr.seller_id = u_seller.user_id
             WHERE cr.id = ?`,
            [req.params.id]
        );
        if (rooms.length === 0) return res.status(404).json({ error: 'Room not found' });
        const r = rooms[0];
        const isBuyer = r.buyer_email === email;
        const partnerName = isBuyer
            ? [r.seller_fn, r.seller_ln].filter(Boolean).join(' ')
            : [r.buyer_fn, r.buyer_ln].filter(Boolean).join(' ');
        res.json({
            roomId: r.id,
            postId: r.post_id,
            postTitle: r.post_title,
            partnerName: partnerName || 'User',
            partnerId: isBuyer ? r.seller_id : r.buyer_id,
        });
    } catch (err) {
        console.error('[GET /api/chat/room/:id]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/chat/room/:id/messages
app.get('/api/chat/room/:id/messages', requireAuth(), async (req, res) => {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ error: 'Login required.' });
    try {
        // Membership check
        const [userRows] = await pool.execute('SELECT user_id FROM users WHERE illinois_email = ?', [email]);
        if (userRows.length === 0) return res.status(401).json({ error: 'User not found.' });
        const userId = userRows[0].user_id;
        const [rooms] = await pool.execute(
            'SELECT id FROM chat_rooms WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
            [req.params.id, userId, userId]
        );
        if (rooms.length === 0) return res.status(403).json({ error: 'You are not a member of this chat room.' });

        const [msgs] = await pool.execute(
            `SELECT cm.*, u.first_name, u.last_name, u.illinois_email
             FROM chat_messages cm
             LEFT JOIN users u ON cm.sender_id = u.user_id
             WHERE cm.room_id = ?
             ORDER BY cm.created_at ASC`,
            [req.params.id]
        );
        res.json(msgs.map(m => ({
            id: m.id,
            roomId: m.room_id,
            senderId: m.sender_id,
            senderEmail: m.illinois_email || '',
            senderName: [m.first_name, m.last_name].filter(Boolean).join(' ') || 'User',
            content: m.content,
            isRead: !!m.is_read,
            createdAt: m.created_at,
        })));
    } catch (err) {
        console.error('[GET /api/chat/room/:id/messages]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/chat/room/:id/messages — send message
app.post('/api/chat/room/:id/messages', chatLimiter, requireAuth(), async (req, res) => {
    const email = req.user?.email;
    const name  = req.user?.name;
    const { content } = req.body;
    if (!email) return res.status(401).json({ error: 'Login required.' });
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });
    const conn = await pool.getConnection();
    try {
        const senderId = await getOrCreateUser(conn, email, name);
        // Membership check
        const [rooms] = await conn.execute(
            'SELECT id FROM chat_rooms WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
            [req.params.id, senderId, senderId]
        );
        if (rooms.length === 0) {
            return res.status(403).json({ error: 'You are not a member of this chat room.' });
        }

        const sanitizedContent = sanitizeHtml(content.trim(), { allowedTags: [], allowedAttributes: {} });
        const [result] = await conn.execute(
            'INSERT INTO chat_messages (room_id, sender_id, content) VALUES (?, ?, ?)',
            [req.params.id, senderId, sanitizedContent]
        );
        const msgId = result.insertId;

        // Broadcast via WebSocket to room participants
        broadcastToRoom(parseInt(req.params.id), {
            type: 'new_message',
            roomId: parseInt(req.params.id),
            message: {
                id: msgId,
                roomId: parseInt(req.params.id),
                senderId,
                senderEmail: email,
                senderName: name || 'User',
                content: sanitizedContent,
                isRead: false,
                createdAt: new Date().toISOString(),
            },
        });

        res.status(201).json({ id: msgId });
    } catch (err) {
        console.error('[POST /api/chat/room/:id/messages]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        conn.release();
    }
});

// POST /api/chat/room/:id/read — mark messages as read
app.post('/api/chat/room/:id/read', optionalAuth, async (req, res) => {
    const email = req.user?.email;
    try {
        const [userRows] = await pool.execute('SELECT user_id FROM users WHERE illinois_email = ?', [email]);
        if (userRows.length > 0) {
            await pool.execute(
                'UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?',
                [req.params.id, userRows[0].user_id]
            );
        }
        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: true }); // Non-fatal
    }
});

// ─── NOTIFICATIONS (real implementation) ─────────────────────────────────────

app.get('/api/notifications/unread-count', optionalAuth, async (req, res) => {
    const email = req.user?.email;
    if (!email) return res.json({ count: 0 });
    try {
        const [userRows] = await pool.execute(
            'SELECT user_id FROM users WHERE illinois_email = ?', [email]
        );
        if (userRows.length === 0) return res.json({ count: 0 });
        const userId = userRows[0].user_id;
        const [[{ count }]] = await pool.execute(
            `SELECT COUNT(*) as count
             FROM chat_messages cm
             JOIN chat_rooms cr ON cm.room_id = cr.id
             WHERE (cr.buyer_id = ? OR cr.seller_id = ?)
               AND cm.sender_id != ?
               AND cm.is_read = 0`,
            [userId, userId, userId]
        );
        res.json({ count: count || 0 });
    } catch {
        res.json({ count: 0 });
    }
});
app.get('/api/notifications', (req, res) => res.json([]));
app.post('/api/notifications/mark-as-read', (req, res) => res.json({ ok: true }));
app.delete('/api/notifications/read', (req, res) => res.json({ ok: true }));

// ─── POPUPS ──────────────────────────────────────────────────────────────────

app.get('/api/popups/active', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM popups WHERE active = 1 AND start_date <= NOW() AND end_date >= NOW() ORDER BY created_at DESC`
        );
        res.json(rows.map(r => ({
            id: r.id, title: r.title, imageUrl: r.image_url, linkUrl: r.link_url,
            startDate: r.start_date, endDate: r.end_date, active: !!r.active, creatorNickname: r.creator_nickname || '',
        })));
    } catch { res.json([]); }
});

app.get('/api/popups', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM popups ORDER BY created_at DESC');
        res.json(rows.map(r => ({
            id: r.id, title: r.title, imageUrl: r.image_url, linkUrl: r.link_url,
            startDate: r.start_date, endDate: r.end_date, active: !!r.active, creatorNickname: r.creator_nickname || '',
        })));
    } catch { res.json([]); }
});

app.post('/api/popups', requireAuth(), requireAdmin(), async (req, res) => {
    const { title, imageUrl, linkUrl, startDate, endDate, active } = req.body;
    const email = req.user?.email;
    try {
        const [[user]] = await pool.execute('SELECT first_name, last_name FROM users WHERE illinois_email = ?', [email]);
        const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'Admin';
        const [result] = await pool.execute(
            'INSERT INTO popups (title, image_url, link_url, start_date, end_date, active, creator_nickname) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, imageUrl, linkUrl || null, startDate, endDate, active ? 1 : 0, name]
        );
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error('[POST /api/popups]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/popups/:id', requireAuth(), requireAdmin(), async (req, res) => {
    const { title, imageUrl, linkUrl, startDate, endDate, active } = req.body;
    try {
        await pool.execute(
            'UPDATE popups SET title = ?, image_url = ?, link_url = ?, start_date = ?, end_date = ?, active = ? WHERE id = ?',
            [title, imageUrl, linkUrl || null, startDate, endDate, active ? 1 : 0, req.params.id]
        );
        res.json({ message: 'Updated' });
    } catch (err) {
        console.error('[PUT /api/popups/:id]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/popups/:id', requireAuth(), requireAdmin(), async (req, res) => {
    try {
        await pool.execute('DELETE FROM popups WHERE id = ?', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error('[DELETE /api/popups/:id]', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── WEBSOCKET SUPPORT ───────────────────────────────────────────────────────

// Map: roomId -> Set of WebSocket clients
const wsRooms = new Map();

function broadcastToRoom(roomId, data) {
    const clients = wsRooms.get(roomId);
    if (!clients) return;
    const payload = JSON.stringify(data);
    for (const ws of clients) {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(payload);
        }
    }
}

// ─── START ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

// Run all migrations BEFORE opening the port so no request can hit
// an endpoint while schema columns are still being added.
async function startServer() {
    try {
        const conn = await pool.getConnection();
        await conn.ping();
        conn.release();
        console.log('Connected to MySQL');
        await runMigrations();
        await ensureChatTables();
        await runAdditionalMigrations();
    } catch (err) {
        console.error('MySQL connection/migration failed:', err.message);
        process.exit(1);
    }

    const server = app.listen(PORT, () => {
        console.log(`johnSQL backend → http://localhost:${PORT}`);
    });

    // WebSocket server on the same HTTP server
    const wss = new WebSocketServer({ server, path: '/ws/chat' });

    wss.on('connection', (ws) => {
        ws._subscribedRooms = new Set();
        ws._userId = null;

        ws.on('message', async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());

                // Authenticate once: client sends { type: 'auth', token }
                if (msg.type === 'auth' && msg.token) {
                    try {
                        const payload = jwt.verify(msg.token, JWT_SECRET);
                        ws._userId = payload.userId;
                    } catch { /* invalid token — remain unauthenticated */ }
                    return;
                }

                if (msg.type === 'subscribe' && msg.roomId) {
                    const roomId = parseInt(msg.roomId);
                    if (ws._userId) {
                        try {
                            const [rooms] = await pool.execute(
                                'SELECT id FROM chat_rooms WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
                                [roomId, ws._userId, ws._userId]
                            );
                            if (rooms.length === 0) return;
                        } catch { return; }
                    }
                    if (!wsRooms.has(roomId)) wsRooms.set(roomId, new Set());
                    wsRooms.get(roomId).add(ws);
                    ws._subscribedRooms.add(roomId);
                }
                if (msg.type === 'unsubscribe' && msg.roomId) {
                    const roomId = parseInt(msg.roomId);
                    wsRooms.get(roomId)?.delete(ws);
                    ws._subscribedRooms.delete(roomId);
                }
            } catch { /* ignore bad messages */ }
        });

        ws.on('close', () => {
            for (const roomId of ws._subscribedRooms) {
                wsRooms.get(roomId)?.delete(ws);
                if (wsRooms.get(roomId)?.size === 0) wsRooms.delete(roomId);
            }
        });
    });
}

void startServer();

// ─── ADDITIONAL MIGRATIONS ───────────────────────────────────────────────────

async function runAdditionalMigrations() {
    const conn = await pool.getConnection();
    try {
        // Announcement popups (used by admin + layout banner)
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS popups (
                id               INT AUTO_INCREMENT PRIMARY KEY,
                title            VARCHAR(500) NOT NULL,
                image_url        VARCHAR(1000),
                link_url         VARCHAR(1000),
                start_date       TIMESTAMP,
                end_date         TIMESTAMP,
                active           TINYINT(1) DEFAULT 1,
                creator_nickname VARCHAR(255),
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Additional migrations complete');
    } catch (err) {
        console.error('Additional migration error:', err.message);
    } finally {
        conn.release();
    }
}
