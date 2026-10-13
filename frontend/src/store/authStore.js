import { create } from 'zustand';
import { authApi } from '../api/authApi.js';

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  hasInitializedAuth: false,

  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(credentials);
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
      });
      return { success: true, user: response.data.user };
    } catch (error) {
      set({ isLoading: false });
      return {
        success: false,
        code: error.response?.data?.code,
        message: error.response?.data?.message || 'Email/tên đăng nhập hoặc mật khẩu không chính xác.',
      };
    }
  },

  register: async (userData) => {
    set({ isLoading: true });
    try {
      const response = await authApi.register(userData);
      set({
        isLoading: false,
      });
      return { success: true, message: response.message };
    } catch (error) {
      set({ isLoading: false });
      return {
        success: false,
        message: error.response?.data?.message || 'Registration failed',
      };
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        hasInitializedAuth: true,
      });
    }
  },

  initializeAuth: async () => {
    if (!localStorage.getItem('accessToken')) {
      set({ hasInitializedAuth: true });
      return;
    }
    await useAuthStore.getState().fetchUser();
  },

  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const response = await authApi.getMe();
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
        hasInitializedAuth: true,
      });
    } catch (error) {
      localStorage.removeItem('accessToken');
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        hasInitializedAuth: true,
      });
    }
  },
}));

export default useAuthStore;
