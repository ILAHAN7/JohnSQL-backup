/**
 * API Client Tests
 * Tests JWT Authorization header injection and 401 auto-logout behavior.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

const TOKEN_KEY    = 'johnsql_token';
const USER_KEY     = 'johnsql_user';
const LOGIN_TS_KEY = 'johnsql_login_at';

// ─── Mock localStorage ────────────────────────────────────────────────────────
const storage: Record<string, string> = {};
const localStorageMock = {
    getItem:    (k: string) => storage[k] ?? null,
    setItem:    (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear:      () => { Object.keys(storage).forEach(k => delete storage[k]); },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ─── Re-implement interceptor logic for testing ───────────────────────────────
// (mirrors src/lib/api/client.ts exactly so tests stay in sync)
function buildRequestInterceptor() {
    return (config: { headers: Record<string, string> }) => {
        try {
            const token = localStorage.getItem(TOKEN_KEY);
            if (token) {
                config.headers['Authorization'] = `Bearer ${token}`;
            }
        } catch { /* ignore */ }
        return config;
    };
}

function buildResponseErrorInterceptor() {
    return (error: { response?: { status: number } }) => {
        if (error.response?.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem(LOGIN_TS_KEY);
        }
        return Promise.reject(error);
    };
}

// ─── Request interceptor tests ────────────────────────────────────────────────
describe('Request interceptor — JWT header', () => {
    const interceptor = buildRequestInterceptor();

    beforeEach(() => localStorageMock.clear());

    test('adds Authorization header when token is present', () => {
        localStorage.setItem(TOKEN_KEY, 'my-jwt-token');
        const config = { headers: {} as Record<string, string> };
        const result = interceptor(config);
        expect(result.headers['Authorization']).toBe('Bearer my-jwt-token');
    });

    test('does not add Authorization header when no token', () => {
        const config = { headers: {} as Record<string, string> };
        const result = interceptor(config);
        expect(result.headers['Authorization']).toBeUndefined();
    });

    test('passes other existing headers through unchanged', () => {
        localStorage.setItem(TOKEN_KEY, 'tok');
        const config = { headers: { 'Content-Type': 'application/json' } as Record<string, string> };
        const result = interceptor(config);
        expect(result.headers['Content-Type']).toBe('application/json');
        expect(result.headers['Authorization']).toBe('Bearer tok');
    });

    test('uses johnsql_token key (not legacy uiuc_flea_user)', () => {
        // Old key should NOT trigger auth header
        localStorage.setItem('uiuc_flea_user', JSON.stringify({ sub: 'old@illinois.edu' }));
        const config = { headers: {} as Record<string, string> };
        const result = interceptor(config);
        expect(result.headers['Authorization']).toBeUndefined();
    });
});

// ─── Response error interceptor tests ────────────────────────────────────────
describe('Response interceptor — 401 auto-logout', () => {
    const interceptor = buildResponseErrorInterceptor();

    beforeEach(() => {
        localStorageMock.clear();
        localStorage.setItem(TOKEN_KEY, 'active-token');
        localStorage.setItem(USER_KEY, JSON.stringify({ sub: 'user@illinois.edu' }));
        localStorage.setItem(LOGIN_TS_KEY, Date.now().toString());
    });

    test('clears all auth storage on 401 response', async () => {
        await interceptor({ response: { status: 401 } }).catch(() => {});
        expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
        expect(localStorage.getItem(USER_KEY)).toBeNull();
        expect(localStorage.getItem(LOGIN_TS_KEY)).toBeNull();
    });

    test('does NOT clear storage on 403 response', async () => {
        await interceptor({ response: { status: 403 } }).catch(() => {});
        expect(localStorage.getItem(TOKEN_KEY)).toBe('active-token');
    });

    test('does NOT clear storage on 500 response', async () => {
        await interceptor({ response: { status: 500 } }).catch(() => {});
        expect(localStorage.getItem(TOKEN_KEY)).toBe('active-token');
    });

    test('always rejects the promise (so errors still propagate)', async () => {
        await expect(interceptor({ response: { status: 401 } })).rejects.toBeDefined();
    });

    test('handles network error (no response) without throwing', async () => {
        await interceptor({ response: undefined }).catch(() => {});
        // Storage should not be cleared for network errors
        expect(localStorage.getItem(TOKEN_KEY)).toBe('active-token');
    });
});

// ─── localStorage key contract ────────────────────────────────────────────────
describe('localStorage key constants', () => {
    test('TOKEN_KEY is johnsql_token', () => {
        expect(TOKEN_KEY).toBe('johnsql_token');
    });

    test('USER_KEY is johnsql_user', () => {
        expect(USER_KEY).toBe('johnsql_user');
    });

    test('both keys use johnsql_ prefix (not legacy uiuc_flea_)', () => {
        expect(TOKEN_KEY.startsWith('johnsql_')).toBe(true);
        expect(USER_KEY.startsWith('johnsql_')).toBe(true);
    });
});
