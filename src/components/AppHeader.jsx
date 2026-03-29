import { Link, NavLink } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import { APP_NAV_ITEMS } from "../navConfig";

export default function AppHeader({ user, theme, onToggleTheme, onSignOut }) {
  return (
    <header className="top-nav">
      <div className="top-nav__inner top-nav__inner--app">
        <Link to="/" className="top-nav__brand">
          Kaizen Budget
        </Link>

        <nav
          className="top-nav__page-links"
          aria-label="Main pages"
        >
          {APP_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link--active" : "")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="top-nav__actions">
          <p className="top-nav__email" title={user.email}>
            {user.email}
          </p>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onSignOut}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
