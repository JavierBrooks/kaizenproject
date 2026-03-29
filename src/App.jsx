import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

import { useTheme } from "./hooks/useTheme";
import Auth from "./components/Auth";
import AppLayout from "./layouts/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import AccountsPage from "./pages/AccountsPage";
import AddTransactionPage from "./pages/AddTransactionPage";
import TransactionListPage from "./pages/TransactionListPage";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-screen">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell app-shell--auth">
        <Auth
          setUser={setUser}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppLayout
            user={user}
            theme={theme}
            onToggleTheme={toggleTheme}
            onSignOut={() => signOut(auth)}
          />
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="transactions/new" element={<AddTransactionPage />} />
        <Route path="transactions" element={<TransactionListPage />} />
      </Route>
    </Routes>
  );
}
