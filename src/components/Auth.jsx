import { useState } from "react";
import { auth } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import ThemeToggle from "./ThemeToggle";

export default function Auth({ setUser, theme, onToggleTheme }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = async () => {
    try {
      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      setUser(userCred.user);
    } catch (err) {
      alert(err.message);
    }
  };

  const login = async () => {
    try {
      const userCred = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      setUser(userCred.user);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__header">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div className="card">
        <h1 className="card__title">Kaizen Budget</h1>
        <p>Sign in or register to track accounts and transactions.</p>

        <div className="form-grid" style={{ marginTop: "1.25rem" }}>
          <label className="field-label">
            Email
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field-label">
            Password
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn--primary" onClick={login}>
            Log in
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={register}
          >
            Register
          </button>
        </div>
      </div>
    </div>
  );
}
