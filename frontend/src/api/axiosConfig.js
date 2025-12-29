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

        // If 401 and not already retried
        if (error.response?.status === 401 && !originalRequest._retry) {
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
                // Refresh failed, logout user
                localStorage.removeItem('accessToken');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default axiosInstance;