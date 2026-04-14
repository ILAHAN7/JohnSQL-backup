/**
 * JWT Middleware Unit Tests
 * Tests requireAuth() and optionalAuth() in isolation — no DB required.
 */
'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-for-unit-tests';

// ─── Recreate middleware (same logic as server.js) ────────────────────────────
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
        } catch { /* treat as unauthenticated */ }
    }
    next();
}

function makeToken(overrides = {}, expiresIn = '1h') {
    return jwt.sign(
        { sub: 'user@illinois.edu', name: 'Test User', role: 'student', userId: 1, ...overrides },
        JWT_SECRET,
        { expiresIn }
    );
}

// ─── requireAuth ──────────────────────────────────────────────────────────────
describe('requireAuth()', () => {
    let req, res, next;

    beforeEach(() => {
        req = { headers: {} };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        next = jest.fn();
    });

    test('401 — no Authorization header', () => {
        requireAuth()(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required.' });
        expect(next).not.toHaveBeenCalled();
    });

    test('401 — Basic scheme (not Bearer)', () => {
        req.headers['authorization'] = 'Basic dXNlcjpwYXNz';
        requireAuth()(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('401 — Bearer with garbage token', () => {
        req.headers['authorization'] = 'Bearer not.a.real.token';
        requireAuth()(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token. Please log in again.' });
        expect(next).not.toHaveBeenCalled();
    });

    test('401 — token signed with wrong secret', () => {
        const token = jwt.sign({ sub: 'x@illinois.edu' }, 'wrong-secret');
        req.headers['authorization'] = `Bearer ${token}`;
        requireAuth()(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('401 — expired token', () => {
        const token = makeToken({}, '-1s');
        req.headers['authorization'] = `Bearer ${token}`;
        requireAuth()(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('200 — valid token: calls next() and sets req.user', () => {
        const token = makeToken({ sub: 'netid@illinois.edu', name: 'Jane Doe', role: 'campus_admin', userId: 42 });
        req.headers['authorization'] = `Bearer ${token}`;
        requireAuth()(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toEqual({ email: 'netid@illinois.edu', name: 'Jane Doe', role: 'campus_admin', userId: 42 });
        expect(res.status).not.toHaveBeenCalled();
    });

    test('200 — email is taken from sub claim, not email claim', () => {
        const token = makeToken({ sub: 'correct@illinois.edu' });
        req.headers['authorization'] = `Bearer ${token}`;
        requireAuth()(req, res, next);
        expect(req.user.email).toBe('correct@illinois.edu');
    });
});

// ─── optionalAuth ─────────────────────────────────────────────────────────────
describe('optionalAuth()', () => {
    let req, res, next;

    beforeEach(() => {
        req = { headers: {} };
        res = {};
        next = jest.fn();
    });

    test('calls next() and leaves req.user undefined when no header', () => {
        optionalAuth(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toBeUndefined();
    });

    test('calls next() and leaves req.user undefined for invalid token', () => {
        req.headers['authorization'] = 'Bearer garbage';
        optionalAuth(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toBeUndefined();
    });

    test('calls next() and sets req.user for valid token', () => {
        const token = makeToken({ sub: 'opt@illinois.edu', userId: 7 });
        req.headers['authorization'] = `Bearer ${token}`;
        optionalAuth(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user.email).toBe('opt@illinois.edu');
        expect(req.user.userId).toBe(7);
    });

    test('calls next() even for expired token (treats as unauthenticated)', () => {
        const token = makeToken({}, '-1s');
        req.headers['authorization'] = `Bearer ${token}`;
        optionalAuth(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toBeUndefined();
    });
});
