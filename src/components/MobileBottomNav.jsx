import { NavLink } from "react-router-dom";
import { APP_NAV_ITEMS } from "../navConfig";

export default function MobileBottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {APP_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            "bottom-nav__link" + (isActive ? " bottom-nav__link--active" : "")
          }
        >
          <span className="bottom-nav__icon" aria-hidden>
            {item.icon}
          </span>
          <span className="bottom-nav__label">{item.shortLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}
