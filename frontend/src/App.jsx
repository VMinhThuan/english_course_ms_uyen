import { BrowserRouter } from 'react-router-dom';
import { useEffect } from 'react';
import AppRoutes from './routes/AppRoutes.jsx';
import useAuthStore from './store/authStore.js';

function App() {
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const token = localStorage.getItem('accessToken');

  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token, fetchUser]);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;

