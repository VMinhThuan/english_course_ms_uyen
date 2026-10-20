import axios from 'axios';

// Use proxy in development, or direct URL in production
// Force use proxy in dev to avoid CORS issues
const API_URL =
    import.meta.env.VITE_API_URL || '/api/v1';

const axiosInstance = axios.create({
    baseURL: API_URL,
    withCredentials: true, // Important for httpOnly cookies
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - Add access token to headers
axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - Handle token refresh
axiosInstance.interceptors.response.use(
    (response) => response,
    async(error) => {
        const originalRequest = error.config;
        const requestUrl = originalRequest?.url || '';
        let responseData = error.response?.data;
        if (typeof Blob !== 'undefined' && responseData instanceof Blob) {
            try {
                responseData = JSON.parse(await responseData.text());
                error.response.data = responseData;
            } catch {
                responseData = null;
            }
        }
        const errorCode = responseData?.code;
        const isAuthRequest = ['/auth/login', '/auth/register', '/auth/refresh'].some(
            (path) => requestUrl.includes(path)
        );

        const redirectSuspendedAccount = () => {
            localStorage.removeItem('accessToken');
            if (window.location.pathname !== '/account-status'
                || new URLSearchParams(window.location.search).get('status') !== 'suspended') {
                window.location.replace('/account-status?status=suspended');
            }
        };

        if (errorCode === 'ACCOUNT_SUSPENDED') {
            redirectSuspendedAccount();
            return Promise.reject(error);
        }

        // A failed login/register must be shown to the user, not retried with an
        // older refresh cookie. Only expired protected requests use the refresh flow.
        if (error.response?.status === 401 && !isAuthRequest && !originalRequest?._retry) {
            originalRequest._retry = true;

            try {
                // Try to refresh token
                const response = await axios.post(
                    `${API_URL}/auth/refresh`, {}, { withCredentials: true }
                );

                const { accessToken } = response.data.data;
                localStorage.setItem('accessToken', accessToken);

                // Retry original request with new token
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return axiosInstance(originalRequest);
            } catch (refreshError) {
                localStorage.removeItem('accessToken');
                if (refreshError.response?.data?.code === 'ACCOUNT_SUSPENDED') {
                    redirectSuspendedAccount();
                } else {
                    window.location.replace('/login');
                }
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default axiosInstance;
