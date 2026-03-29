export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="btn btn--ghost theme-toggle"
      onClick={onToggle}
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="theme-toggle__icon" aria-hidden>
        {isDark ? "☀" : "☾"}
      </span>
      <span className="theme-toggle__text">
        {isDark ? "Light mode" : "Dark mode"}
      </span>
    </button>
  );
}
