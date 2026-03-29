import { useState, useEffect } from "react";
import { db } from "../firebase";
import { fetchUserTransactions } from "../utils/transactionHelpers";

export default function Dashboard({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchUserTransactions(db, user.uid);
        if (!cancelled) setTransactions(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const total = transactions.reduce((acc, t) => {
    return t.type === "income"
      ? acc + Number(t.amount)
      : acc - Number(t.amount);
  }, 0);

  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(total);

  const isPositive = total >= 0;

  if (loading) {
    return (
      <section className="card" aria-busy="true">
        <h2 className="card__title">Net cash flow</h2>
        <p>Loading summary…</p>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="card__title">
        Net cash flow
      </h2>
      <p>Income minus expenses across all recorded transactions.</p>
      <div className="summary-stat">
        <span className="summary-stat__label">Balance trend</span>
        <span
          className={
            "summary-stat__value " +
            (isPositive
              ? "summary-stat__value--positive"
              : "summary-stat__value--negative")
          }
        >
          {formatted}
        </span>
      </div>
    </section>
  );
}
