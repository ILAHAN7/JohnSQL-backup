/**
 * Input Validation & Security Tests
 * Tests email validation, SORT_MAP injection prevention, and JWT structure.
 */
'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-for-unit-tests';

// ─── SORT_MAP (SQL injection prevention) ──────────────────────────────────────
const SORT_MAP = {
    newest:     'mp.created_at DESC',
    oldest:     'mp.created_at ASC',
    price_asc:  'min_price ASC',
    price_desc: 'min_price DESC',
};

describe('SORT_MAP — SQL injection prevention', () => {
    test('valid keys map to safe SQL ORDER BY fragments', () => {
        expect(SORT_MAP['newest']).toBe('mp.created_at DESC');
        expect(SORT_MAP['oldest']).toBe('mp.created_at ASC');
        expect(SORT_MAP['price_asc']).toBe('min_price ASC');
        expect(SORT_MAP['price_desc']).toBe('min_price DESC');
    });

    test('injected key returns undefined (falls back to default newest)', () => {
        const injected = `newest; DROP TABLE users; --`;
        expect(SORT_MAP[injected]).toBeUndefined();
    });

    test('__proto__ key does NOT return a valid sort string (server must guard this)', () => {
        // SORT_MAP['__proto__'] returns the object prototype {}, not a string.
        // The server uses hasOwnProperty to ensure only safe string values are used.
        const rawVal = SORT_MAP['__proto__'];
        expect(typeof rawVal === 'string').toBe(false);
    });

    test('all values are safe SQL fragments (no ; \' " or --)', () => {
        const dangerous = /[;'"\\]|--/;
        Object.values(SORT_MAP).forEach(val => {
            expect(dangerous.test(val)).toBe(false);
        });
    });

    test('fallback logic: invalid sort key uses newest', () => {
        const userInput = 'hacked_sort_key';
        const resolved = SORT_MAP[userInput] || SORT_MAP.newest;
        expect(resolved).toBe('mp.created_at DESC');
    });
});

// ─── Email validation ─────────────────────────────────────────────────────────
describe('Illinois email validation', () => {
    const isValidEmail = (email) =>
        typeof email === 'string' && email.endsWith('@illinois.edu');

    test('accepts netid@illinois.edu', () => {
        expect(isValidEmail('netid@illinois.edu')).toBe(true);
    });

    test('accepts complex netids', () => {
        expect(isValidEmail('john.doe@illinois.edu')).toBe(true);
        expect(isValidEmail('user123@illinois.edu')).toBe(true);
    });

    test('rejects gmail', () => {
        expect(isValidEmail('user@gmail.com')).toBe(false);
    });

    test('rejects non-illinois university email', () => {
        expect(isValidEmail('user@mit.edu')).toBe(false);
    });

    test('rejects suffix trick (notillinois.edu)', () => {
        expect(isValidEmail('user@notillinois.edu')).toBe(false);
    });

    test('rejects subdomain trick (user@evil.illinois.edu)', () => {
        // endsWith('@illinois.edu') blocks this too
        expect(isValidEmail('user@evil.illinois.edu')).toBe(false);
    });

    test('rejects empty string', () => {
        expect(isValidEmail('')).toBe(false);
    });

    test('rejects null/undefined', () => {
        expect(isValidEmail(null)).toBe(false);
        expect(isValidEmail(undefined)).toBe(false);
    });
});

// ─── VALID_CATEGORIES (injection prevention) ──────────────────────────────────
const VALID_CATEGORIES = ['ELECTRONICS', 'TEXTBOOKS', 'FURNITURE', 'CLOTHING', 'APPLIANCES', 'OTHER'];

describe('Category validation', () => {
    const resolveCategory = (input) =>
        (input && VALID_CATEGORIES.includes(input.toUpperCase())) ? input.toUpperCase() : 'OTHER';

    test('valid categories are accepted', () => {
        expect(resolveCategory('ELECTRONICS')).toBe('ELECTRONICS');
        expect(resolveCategory('textbooks')).toBe('TEXTBOOKS');
        expect(resolveCategory('Furniture')).toBe('FURNITURE');
    });

    test('unknown categories fall back to OTHER', () => {
        expect(resolveCategory('GUNS')).toBe('OTHER');
        expect(resolveCategory('')).toBe('OTHER');
        expect(resolveCategory(null)).toBe('OTHER');
    });

    test('SQL injection attempt in category falls back to OTHER', () => {
        expect(resolveCategory("'; DROP TABLE market_posts; --")).toBe('OTHER');
    });
});

// ─── JWT token structure ──────────────────────────────────────────────────────
describe('JWT token structure', () => {
    test('issued token contains all required fields', () => {
        const token = jwt.sign(
            { sub: 'test@illinois.edu', name: 'Test User', role: 'student', userId: 42 },
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        const decoded = jwt.decode(token);
        expect(decoded.sub).toBe('test@illinois.edu');
        expect(decoded.name).toBe('Test User');
        expect(decoded.role).toBe('student');
        expect(decoded.userId).toBe(42);
        expect(decoded.exp).toBeDefined();
        expect(decoded.iat).toBeDefined();
    });

    test('token signed with different secret is rejected', () => {
        const token = jwt.sign({ sub: 'test@illinois.edu' }, 'attacker-secret');
        expect(() => jwt.verify(token, JWT_SECRET)).toThrow(/invalid signature/i);
    });

    test('tampered payload is rejected', () => {
        const token = jwt.sign({ sub: 'student@illinois.edu', role: 'student' }, JWT_SECRET);
        // Simulate tampering: decode + re-encode with different payload
        const [header, , signature] = token.split('.');
        const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'student@illinois.edu', role: 'super_admin' })).toString('base64url');
        const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
        expect(() => jwt.verify(tamperedToken, JWT_SECRET)).toThrow();
    });

    test('30-day token expiry is set correctly', () => {
        const before = Math.floor(Date.now() / 1000);
        const token = jwt.sign({ sub: 'x@illinois.edu' }, JWT_SECRET, { expiresIn: '30d' });
        const decoded = jwt.decode(token);
        const expectedExp = before + 30 * 24 * 60 * 60;
        // Allow ±5 seconds for test execution time
        expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 5);
        expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });
});

// ─── Item price validation ────────────────────────────────────────────────────
describe('Item price validation', () => {
    const isValidPrice = (price) => {
        const p = parseFloat(price);
        return !isNaN(p) && p >= 0 && p <= 99999;
    };

    test('valid prices are accepted', () => {
        expect(isValidPrice(0)).toBe(true);
        expect(isValidPrice(9.99)).toBe(true);
        expect(isValidPrice(99999)).toBe(true);
    });

    test('negative prices are rejected', () => {
        expect(isValidPrice(-1)).toBe(false);
    });

    test('prices above $99,999 are rejected', () => {
        expect(isValidPrice(100000)).toBe(false);
    });

    test('non-numeric values are rejected', () => {
        expect(isValidPrice('free')).toBe(false);
        expect(isValidPrice(NaN)).toBe(false);
    });
});
