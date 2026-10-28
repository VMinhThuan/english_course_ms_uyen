import { create } from 'zustand';
import { authApi } from '../api/authApi.js';

const clearLocalAccessToken = () => localStorage.removeItem('accessToken');

const isAuthFailure = (error) => error?.response?.status === 401;

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
      clearLocalAccessToken();
      set({
        user: null,
        isAuthenticated: false,
        hasInitializedAuth: true,
      });
    }
  },

  initializeAuth: async () => {
    // The refresh token is an httpOnly cookie and survives a page reload even
    // when the short-lived access token has expired or was cleared. Always
    // restore through it first instead of treating a missing access token as a
    // logout. This is what keeps a student signed in between study sessions.
    await useAuthStore.getState().restoreSession();
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      await authApi.refreshToken();
      const response = await authApi.getMe();
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
        hasInitializedAuth: true,
      });
      return { success: true };
    } catch (error) {
      // A failed network request must not be mistaken for an explicit logout.
      // On first load there is no trusted user to keep, but on a tab resume the
      // current authenticated state remains until the API can be reached again.
      if (isAuthFailure(error)) {
        clearLocalAccessToken();
        set({ user: null, isAuthenticated: false });
      }
      set({ isLoading: false, hasInitializedAuth: true });
      return { success: false, reason: isAuthFailure(error) ? 'unauthenticated' : 'unavailable' };
    }
  },

  resumeSession: async () => {
    if (!useAuthStore.getState().isAuthenticated) return { success: false, reason: 'anonymous' };
    return useAuthStore.getState().restoreSession();
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
      if (isAuthFailure(error)) {
        clearLocalAccessToken();
      }
      set({
        // Do not discard an established session just because a device briefly
        // lost network while a learner switched apps or tabs.
        ...(isAuthFailure(error) ? { user: null, isAuthenticated: false } : {}),
        isLoading: false,
        hasInitializedAuth: true,
      });
    }
  },
}));

export default useAuthStore;
