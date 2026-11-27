import axios from 'axios';
import { API_BASE_URL } from './apiBaseUrl.js';
import {
    AUTH_EVENT_TYPES,
    getCurrentAccessTokenSessionId,
    getSessionIdFromAccessToken,
    publishAuthEvent,
} from '../utils/authEvents.js';

const API_URL = API_BASE_URL;
let refreshPromise = null;

const axiosInstance = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
});

const isAuthRequest = (url = '') => ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].some((path) => url.includes(path));
const isSafeToRetry = (config) => ['get', 'head', 'options'].includes(String(config?.method || 'get').toLowerCase())
    || Boolean(config?.headers?.['Idempotency-Key']);

const requestRefresh = async (rejectedToken) => {
    const performRefresh = async () => {
        const latestToken = localStorage.getItem('accessToken');
        if (latestToken && rejectedToken && latestToken !== rejectedToken) return latestToken;
        const response = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        const { accessToken } = response.data.data;
        localStorage.setItem('accessToken', accessToken);
        publishAuthEvent({ type: AUTH_EVENT_TYPES.LOGIN_COMMITTED, sessionId: getSessionIdFromAccessToken(accessToken) });
        return accessToken;
    };
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        return navigator.locks.request('english-course-auth-refresh', { mode: 'exclusive' }, performRefresh);
    }
    return performRefresh();
};

const refreshAccessToken = (rejectedToken) => {
    if (!refreshPromise) refreshPromise = requestRefresh(rejectedToken).finally(() => { refreshPromise = null; });
    return refreshPromise;
};

axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
            config._accessTokenAtRequest = token;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config || {};
        const requestUrl = originalRequest.url || '';
        let responseData = error.response?.data;
        if (typeof Blob !== 'undefined' && responseData instanceof Blob) {
            try {
                responseData = JSON.parse(await responseData.text());
                error.response.data = responseData;
            } catch { responseData = null; }
        }
        const errorCode = responseData?.code;
        const rejectedToken = originalRequest._accessTokenAtRequest
            || String(originalRequest.headers?.Authorization || '').replace(/^Bearer\s+/i, '')
            || null;
        const rejectedSessionId = getSessionIdFromAccessToken(rejectedToken);
        const clearSuspendedAndRedirect = () => {
            localStorage.removeItem('accessToken');
            if (window.location.pathname !== '/account-status'
                || new URLSearchParams(window.location.search).get('status') !== 'suspended') {
                window.location.replace('/account-status?status=suspended');
            }
        };
        const clearForReplacement = () => {
            if (!rejectedSessionId || getCurrentAccessTokenSessionId() !== rejectedSessionId) return;
            publishAuthEvent({ type: AUTH_EVENT_TYPES.SESSION_REPLACED, sessionId: rejectedSessionId });
            localStorage.removeItem('accessToken');
        };

        if (errorCode === 'ACCOUNT_SUSPENDED') {
            clearSuspendedAndRedirect();
            return Promise.reject(error);
        }
        if (errorCode === 'SESSION_REPLACED' || errorCode === 'REFRESH_REUSE') {
            clearForReplacement();
            return Promise.reject(error);
        }
        if (error.response?.status === 401 && !isAuthRequest(requestUrl) && !originalRequest._retry && isSafeToRetry(originalRequest)) {
            originalRequest._retry = true;
            try {
                const accessToken = await refreshAccessToken(rejectedToken);
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                originalRequest._accessTokenAtRequest = accessToken;
                return axiosInstance(originalRequest);
            } catch (refreshError) {
                const refreshCode = refreshError.response?.data?.code;
                if (refreshCode === 'SESSION_REPLACED' || refreshCode === 'REFRESH_REUSE') clearForReplacement();
                else if (refreshCode === 'ACCOUNT_SUSPENDED') clearSuspendedAndRedirect();
                else {
                    localStorage.removeItem('accessToken');
                    window.location.replace('/login');
                }
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    },
);

export default axiosInstance;
