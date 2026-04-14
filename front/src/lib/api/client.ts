import axios from 'axios';

const TOKEN_KEY = 'johnsql_token';
const USER_KEY  = 'johnsql_user';

const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    withCredentials: false,
});

// Attach JWT Bearer token so the backend can verify the caller's identity.
client.interceptors.request.use((config) => {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
    } catch {
        /* ignore invalid localStorage state */
    }
    return config;
});

// On 401, clear local session so the UI reflects the logged-out state.
client.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem('johnsql_login_at');
        }
        return Promise.reject(error);
    }
);

export default client;
