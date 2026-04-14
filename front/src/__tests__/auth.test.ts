/**
 * Auth Context Logic Tests
 * Tests session management: token storage, expiry, and logout behavior.
 */
import { describe, test, expect, beforeEach } from 'vitest';

const TOKEN_KEY    = 'johnsql_token';
const USER_KEY     = 'johnsql_user';
const LOGIN_TS_KEY = 'johnsql_login_at';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Mock localStorage ────────────────────────────────────────────────────────
const storage: Record<string, string> = {};
const ls = {
    getItem:    (k: string) => storage[k] ?? null,
    setItem:    (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear:      () => { Object.keys(storage).forEach(k => delete storage[k]); },
};
Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true });

// ─── Mirrors auth-context session check logic ─────────────────────────────────
function isSessionValid(): boolean {
    const stored  = ls.getItem(USER_KEY);
    const loginAt = ls.getItem(LOGIN_TS_KEY);
    const token   = ls.getItem(TOKEN_KEY);
    if (!stored || !loginAt || !token) return false;
    return Date.now() - parseInt(loginAt) <= SESSION_TTL_MS;
}

function saveSession(token: string, user: object) {
    ls.setItem(TOKEN_KEY, token);
    ls.setItem(USER_KEY, JSON.stringify(user));
    ls.setItem(LOGIN_TS_KEY, Date.now().toString());
}

function clearSession() {
    ls.removeItem(TOKEN_KEY);
    ls.removeItem(USER_KEY);
    ls.removeItem(LOGIN_TS_KEY);
}

// ─── Session validity ─────────────────────────────────────────────────────────
describe('Session validity check', () => {
    beforeEach(() => ls.clear());

    test('fresh session is valid', () => {
        saveSession('jwt-token', { sub: 'u@illinois.edu', role: 'student' });
        expect(isSessionValid()).toBe(true);
    });

    test('session is invalid when token is missing', () => {
        ls.setItem(USER_KEY, JSON.stringify({ sub: 'u@illinois.edu' }));
        ls.setItem(LOGIN_TS_KEY, Date.now().toString());
        // No TOKEN_KEY set
        expect(isSessionValid()).toBe(false);
    });

    test('session is invalid when user data is missing', () => {
        ls.setItem(TOKEN_KEY, 'some-token');
        ls.setItem(LOGIN_TS_KEY, Date.now().toString());
        // No USER_KEY set
        expect(isSessionValid()).toBe(false);
    });

    test('session is invalid when login timestamp is missing', () => {
        ls.setItem(TOKEN_KEY, 'some-token');
        ls.setItem(USER_KEY, JSON.stringify({ sub: 'u@illinois.edu' }));
        // No LOGIN_TS_KEY set
        expect(isSessionValid()).toBe(false);
    });

    test('session expired after 30 days', () => {
        const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
        ls.setItem(TOKEN_KEY, 'old-token');
        ls.setItem(USER_KEY, JSON.stringify({ sub: 'u@illinois.edu' }));
        ls.setItem(LOGIN_TS_KEY, thirtyOneDaysAgo.toString());
        expect(isSessionValid()).toBe(false);
    });

    test('session just within 30-day TTL is still valid', () => {
        const twentyNineDaysAgo = Date.now() - (29 * 24 * 60 * 60 * 1000);
        ls.setItem(TOKEN_KEY, 'token');
        ls.setItem(USER_KEY, JSON.stringify({ sub: 'u@illinois.edu' }));
        ls.setItem(LOGIN_TS_KEY, twentyNineDaysAgo.toString());
        expect(isSessionValid()).toBe(true);
    });
});

// ─── Login / Save session ─────────────────────────────────────────────────────
describe('saveSession()', () => {
    beforeEach(() => ls.clear());

    test('stores token under johnsql_token key', () => {
        saveSession('my-jwt', { sub: 'x@illinois.edu' });
        expect(ls.getItem(TOKEN_KEY)).toBe('my-jwt');
    });

    test('stores user JSON under johnsql_user key', () => {
        const user = { sub: 'x@illinois.edu', role: 'student', name: 'Jane' };
        saveSession('tok', user);
        expect(JSON.parse(ls.getItem(USER_KEY)!)).toEqual(user);
    });

    test('stores login timestamp', () => {
        const before = Date.now();
        saveSession('tok', {});
        const stored = parseInt(ls.getItem(LOGIN_TS_KEY)!);
        expect(stored).toBeGreaterThanOrEqual(before);
        expect(stored).toBeLessThanOrEqual(Date.now());
    });
});

// ─── Logout / Clear session ───────────────────────────────────────────────────
describe('clearSession() — logout', () => {
    beforeEach(() => {
        saveSession('logout-test-token', { sub: 'u@illinois.edu', role: 'student' });
    });

    test('removes token from storage', () => {
        clearSession();
        expect(ls.getItem(TOKEN_KEY)).toBeNull();
    });

    test('removes user data from storage', () => {
        clearSession();
        expect(ls.getItem(USER_KEY)).toBeNull();
    });

    test('removes login timestamp from storage', () => {
        clearSession();
        expect(ls.getItem(LOGIN_TS_KEY)).toBeNull();
    });

    test('session is invalid after logout', () => {
        clearSession();
        expect(isSessionValid()).toBe(false);
    });
});

// ─── Token TTL constant ───────────────────────────────────────────────────────
describe('Session TTL constant', () => {
    test('SESSION_TTL_MS equals 30 days in milliseconds', () => {
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        expect(SESSION_TTL_MS).toBe(thirtyDays);
    });
});
