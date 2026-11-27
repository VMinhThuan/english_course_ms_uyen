import { BrowserRouter } from 'react-router-dom';
import { useEffect } from 'react';
import AppRoutes from './routes/AppRoutes.jsx';
import useAuthStore from './store/authStore.js';
import FileOperationDialog from './components/ui/FileOperationDialog.jsx';
import { installUnsavedNavigationGuard } from './utils/unsavedNavigationGuard.js';
import { AUTH_EVENT_TYPES, subscribeAuthEvents } from './utils/authEvents.js';
import SessionReplacementModal from './components/auth/SessionReplacementModal.jsx';

installUnsavedNavigationGuard();

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const resumeSession = useAuthStore((state) => state.resumeSession);
  const sessionReplacement = useAuthStore((state) => state.sessionReplacement);
  const clearSessionReplacement = useAuthStore((state) => state.clearSessionReplacement);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    const refreshWhenReturningToApp = () => {
      if (document.visibilityState === 'visible') {
        // An access token may have expired while the browser suspended this
        // tab. Restore it from the httpOnly refresh cookie before the learner
        // resumes a protected activity.
        resumeSession();
      }
    };

    document.addEventListener('visibilitychange', refreshWhenReturningToApp);
    return () => document.removeEventListener('visibilitychange', refreshWhenReturningToApp);
  }, [resumeSession]);

  useEffect(() => subscribeAuthEvents((event) => {
    const store = useAuthStore.getState();
    if (event.type === AUTH_EVENT_TYPES.SESSION_REPLACED) store.handleSessionReplaced(event);
    if (event.type === AUTH_EVENT_TYPES.LOGOUT_COMMITTED) store.handleExternalLogout(event);
    if (event.type === AUTH_EVENT_TYPES.LOGIN_COMMITTED) store.syncExternalLogin(event);
  }), []);

  return (
    <BrowserRouter>
      <FileOperationDialog />
      <AppRoutes />
      <SessionReplacementModal
        open={Boolean(sessionReplacement)}
        onRelogin={() => {
          clearSessionReplacement();
          window.location.replace('/login');
        }}
      />
    </BrowserRouter>
  );
}

export default App;
