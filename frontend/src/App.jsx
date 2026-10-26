import { BrowserRouter } from 'react-router-dom';
import { useEffect } from 'react';
import AppRoutes from './routes/AppRoutes.jsx';
import useAuthStore from './store/authStore.js';
import FileOperationDialog from './components/ui/FileOperationDialog.jsx';
import { installUnsavedNavigationGuard } from './utils/unsavedNavigationGuard.js';

installUnsavedNavigationGuard();

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <FileOperationDialog />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
