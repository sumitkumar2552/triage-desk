import { createContext, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // A token in storage is only a claim. Verify it against the API before
  // trusting it, otherwise an expired session renders a broken dashboard.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  async function signIn(email, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    tokenStore.set(data.token);
    setUser(data.user);
  }

  async function signUp(name, email, password) {
    const data = await api('/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
    tokenStore.set(data.token);
    setUser(data.user);
  }

  function signOut() {
    tokenStore.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
