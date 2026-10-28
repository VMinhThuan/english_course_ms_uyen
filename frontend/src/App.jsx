import { BrowserRouter } from 'react-router-dom';
import { useEffect } from 'react';
import AppRoutes from './routes/AppRoutes.jsx';
import useAuthStore from './store/authStore.js';
import FileOperationDialog from './components/ui/FileOperationDialog.jsx';
import { installUnsavedNavigationGuard } from './utils/unsavedNavigationGuard.js';

installUnsavedNavigationGuard();

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const resumeSession = useAuthStore((state) => state.resumeSession);

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

  return (
    <BrowserRouter>
      <FileOperationDialog />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
