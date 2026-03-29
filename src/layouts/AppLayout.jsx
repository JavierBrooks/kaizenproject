import { Outlet } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import MobileBottomNav from "../components/MobileBottomNav";

export default function AppLayout({ user, theme, onToggleTheme, onSignOut }) {
  return (
    <div className="app-shell">
      <AppHeader
        user={user}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onSignOut={onSignOut}
      />
      <main className="main-content main-content--with-bottom-nav layout-stack">
        <Outlet context={{ user }} />
      </main>
      <MobileBottomNav />
    </div>
  );
}
