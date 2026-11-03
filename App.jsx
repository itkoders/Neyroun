import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { getInitData, initTelegram } from './telegram.js';
import { Button, Splash } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import ParentHome from './pages/ParentHome.jsx';
import TeacherHome from './pages/TeacherHome.jsx';
import AdminHome from './pages/AdminHome.jsx';

const ROLE_TITLES = { admin: 'Admin', teacher: 'O‘qituvchi', parent: 'Ota-ona' };

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initTelegram();
    (async () => {
      try {
        if (getToken()) {
          const { user: me } = await api('/auth/me');
          setUser(me);
        } else if (getInitData()) {
          // Telegram akkaunti bog'langan bo'lsa, parolsiz kirish
          const r = await api('/auth/telegram', { method: 'POST', body: { init_data: getInitData() } });
          setToken(r.token);
          setUser(r.user);
        }
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  if (loading) return <Splash />;
  if (!user) return <Login onLogin={(u) => setUser(u)} />;
  if (user.must_change_password) {
    return <ChangePassword user={user} onDone={(u) => setUser(u)} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="logo small">NEURON</div>
          <small className="muted">
            {ROLE_TITLES[user.role]} · {user.full_name}
          </small>
        </div>
        <Button variant="ghost" onClick={logout}>
          Chiqish
        </Button>
      </header>

      {user.role === 'admin' && <AdminHome />}
      {user.role === 'teacher' && <TeacherHome />}
      {user.role === 'parent' && <ParentHome />}
    </div>
  );
}
