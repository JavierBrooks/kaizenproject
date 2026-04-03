import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { fetchUserTransactions } from "../utils/transactionHelpers";
import { fetchUserCategories } from "../utils/categoryBudget";
import {
  processDueScheduledTransactions,
  fetchScheduledTransactions,
  formatScheduledRunAt,
} from "../utils/scheduledTransactions";
import {
  cashFlowByAccountForMonth,
  totalAssetsUsd,
  topExpenseCategoriesForMonth,
  monthLabel,
  wholeWalletCashFlowForMonth,
  budgetVsActualForMonth,
} from "../utils/dashboardMetrics";
import { convertAmount, normalizeCurrency, formatMoneyAmount } from "../utils/currency";

export default function Dashboard({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [scheduledPipeline, setScheduledPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportMonth] = useState(() => new Date());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await processDueScheduledTransactions(db, user.uid);
        const [txData, accSnap, catData, schedAll] = await Promise.all([
          fetchUserTransactions(db, user.uid),
          getDocs(collection(db, "users", user.uid, "accounts")),
          fetchUserCategories(db, user.uid),
          fetchScheduledTransactions(db, user.uid),
        ]);
        const accData = accSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const pipeline = schedAll
          .filter((s) => s.enabled)
          .slice(0, 3);
        if (!cancelled) {
          setTransactions(txData);
          setAccounts(accData);
          setCategories(catData);
          setScheduledPipeline(pipeline);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const cashFlowRows = useMemo(
    () => cashFlowByAccountForMonth(accounts, transactions, reportMonth),
    [accounts, transactions, reportMonth]
  );

  const assetsUsd = useMemo(
    () => totalAssetsUsd(accounts),
    [accounts]
  );

  const topExpenses = useMemo(
    () =>
      topExpenseCategoriesForMonth(transactions, "USD", reportMonth, 5),
    [transactions, reportMonth]
  );

  const lifetimeNetUsd = useMemo(() => {
    return transactions.reduce((acc, t) => {
      const txCur = normalizeCurrency(t.currency);
      const usd = convertAmount(Number(t.amount), txCur, "USD");
      return t.type === "income" ? acc + usd : acc - usd;
    }, 0);
  }, [transactions]);

  const walletMonthUsd = useMemo(
    () => wholeWalletCashFlowForMonth(transactions, "USD", reportMonth),
    [transactions, reportMonth]
  );

  const budgetRows = useMemo(
    () => budgetVsActualForMonth(transactions, categories, reportMonth),
    [transactions, categories, reportMonth]
  );

  const monthTitle = monthLabel(reportMonth);

  if (loading) {
    return (
      <section className="card" aria-busy="true">
        <h2 className="card__title">Home</h2>
        <p>Loading summary…</p>
      </section>
    );
  }

  return (
    <div className="dashboard-stack">
      <section className="card" aria-labelledby="dash-intro">
        <h2 id="dash-intro" className="card__title">
          Home
        </h2>
        <p>
          Reports use <strong>{monthTitle}</strong> for monthly sections. Amounts
          in other currencies are converted at the USD/XCD peg.{" "}
          <Link to="/scheduled">Scheduled &amp; recurring</Link> transactions
          apply when you open the app.
        </p>
      </section>

      <section className="card" aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading" className="card__title">
          Scheduled pipeline
        </h2>
        <p className="card__lede">
          Next runs (enabled schedules).{" "}
          <Link to="/scheduled">Manage on Plan →</Link>
        </p>
        {scheduledPipeline.length === 0 ? (
          <p>No upcoming schedules. <Link to="/scheduled">Add one</Link></p>
        ) : (
          <ul className="pipeline-list">
            {scheduledPipeline.map((row) => (
              <li key={row.id} className="pipeline-list__item">
                <span className="pipeline-list__when">
                  {formatScheduledRunAt(row.nextRunAt)}
                </span>
                <span className="pipeline-list__main">
                  <span className="pipeline-list__desc">{row.desc}</span>
                  <span className="pipeline-list__meta">
                    {row.type} ·{" "}
                    {formatMoneyAmount(
                      Number(row.amount) || 0,
                      normalizeCurrency(row.currency)
                    )}
                    {row.scheduleType === "recurring" && row.frequency
                      ? ` · ${row.frequency}`
                      : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="wallet-cf-heading">
        <h2 id="wallet-cf-heading" className="card__title">
          Cash flow (whole wallet)
        </h2>
        <p className="card__lede">
          All accounts combined for {monthTitle}, converted to USD.
        </p>
        <div className="wallet-cf-grid">
          <div className="summary-stat">
            <span className="summary-stat__label">Income</span>
            <span className="summary-stat__value summary-stat__value--positive">
              {formatMoneyAmount(walletMonthUsd.income, "USD")}
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat__label">Expenses</span>
            <span className="summary-stat__value summary-stat__value--negative">
              {formatMoneyAmount(walletMonthUsd.expense, "USD")}
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat__label">Net</span>
            <span
              className={
                "summary-stat__value " +
                (walletMonthUsd.net >= 0
                  ? "summary-stat__value--positive"
                  : "summary-stat__value--negative")
              }
            >
              {formatMoneyAmount(walletMonthUsd.net, "USD")}
            </span>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="cf-heading">
        <h2 id="cf-heading" className="card__title">
          Cash flow by account
        </h2>
        <p className="card__lede">
          Income and expenses posted this month, shown in each account&apos;s
          currency.
        </p>
        {accounts.length === 0 ? (
          <p>
            <Link to="/accounts">Add accounts</Link> to see cash flow here.
          </p>
        ) : cashFlowRows.every(
            (r) => r.income === 0 && r.expense === 0
          ) ? (
          <p>No transactions this month yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col" className="num">
                    Income
                  </th>
                  <th scope="col" className="num">
                    Expenses
                  </th>
                  <th scope="col" className="num">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody>
                {cashFlowRows.map((r) => (
                  <tr key={r.accountId}>
                    <td>{r.name}</td>
                    <td className="num">
                      {formatMoneyAmount(r.income, r.currency)}
                    </td>
                    <td className="num">
                      {formatMoneyAmount(r.expense, r.currency)}
                    </td>
                    <td
                      className={
                        "num " +
                        (r.net >= 0
                          ? "report-table__pos"
                          : "report-table__neg")
                      }
                    >
                      {formatMoneyAmount(r.net, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="bs-heading">
        <h2 id="bs-heading" className="card__title">
          Balance sheet (total assets)
        </h2>
        <p className="card__lede">
          Sum of all account balances, converted to USD for one total.
        </p>
        {accounts.length === 0 ? (
          <p>
            <Link to="/accounts">Add accounts</Link> to track assets.
          </p>
        ) : (
          <>
            <div className="summary-stat">
              <span className="summary-stat__label">Total assets (USD)</span>
              <span className="summary-stat__value">
                {formatMoneyAmount(assetsUsd, "USD")}
              </span>
            </div>
            <h3 className="card__subtitle">By account</h3>
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col" className="num">
                      Balance
                    </th>
                    <th scope="col" className="num">
                      In USD
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const cur = normalizeCurrency(a.currency);
                    const bal = Number(a.balance) || 0;
                    const usd = convertAmount(bal, cur, "USD");
                    return (
                      <tr key={a.id}>
                        <td>{String(a.name ?? "")}</td>
                        <td className="num">
                          {formatMoneyAmount(bal, cur)}
                        </td>
                        <td className="num muted">
                          {formatMoneyAmount(usd, "USD")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="top-exp-heading">
        <h2 id="top-exp-heading" className="card__title">
          Top expenses
        </h2>
        <p className="card__lede">
          Largest expense category totals for {monthTitle} (USD).
        </p>
        {topExpenses.length === 0 ? (
          <p>No expenses recorded this month.</p>
        ) : (
          <ol className="top-expense-list">
            {topExpenses.map((row, i) => (
              <li key={row.category} className="top-expense-list__item">
                <span className="top-expense-list__rank">{i + 1}</span>
                <span className="top-expense-list__name">{row.category}</span>
                <span className="top-expense-list__amt">
                  {formatMoneyAmount(row.total, "USD")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card" aria-labelledby="budget-actual-heading">
        <h2 id="budget-actual-heading" className="card__title">
          Budget vs actual
        </h2>
        <p className="card__lede">
          Expense categories with a monthly budget ({monthTitle}). Amounts stay
          in each category&apos;s currency.
        </p>
        {budgetRows.length === 0 ? (
          <p>
            <Link to="/accounts">Add expense categories with budgets</Link> on
            Accounts to track spending against targets.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="report-table report-table--budget">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">
                    Budget
                  </th>
                  <th scope="col" className="num">
                    Spent
                  </th>
                  <th scope="col" className="num">
                    Left
                  </th>
                  <th scope="col">Progress</th>
                </tr>
              </thead>
              <tbody>
                {budgetRows.map((row) => (
                  <tr key={row.category} className={row.over ? "row-over" : ""}>
                    <td>{row.category}</td>
                    <td className="num">
                      {formatMoneyAmount(row.budget, row.currency)}
                    </td>
                    <td className="num">
                      {formatMoneyAmount(row.spent, row.currency)}
                    </td>
                    <td
                      className={
                        "num " +
                        (row.remaining < -1e-9
                          ? "report-table__neg"
                          : "report-table__pos")
                      }
                    >
                      {formatMoneyAmount(row.remaining, row.currency)}
                    </td>
                    <td>
                      <div
                        className="budget-bar"
                        title={`${row.pctOfBudget.toFixed(0)}% of budget`}
                      >
                        <div
                          className={
                            "budget-bar__fill" +
                            (row.over ? " budget-bar__fill--over" : "")
                          }
                          style={{ width: `${row.barWidthPct}%` }}
                        />
                      </div>
                      {row.over ? (
                        <span className="budget-flag">Over budget</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="card__title">
          All-time net cash flow
        </h2>
        <p>
          Income minus expenses across every recorded transaction (USD, with the
          same conversion rules).
        </p>
        <div className="summary-stat">
          <span className="summary-stat__label">Lifetime net</span>
          <span
            className={
              "summary-stat__value " +
              (lifetimeNetUsd >= 0
                ? "summary-stat__value--positive"
                : "summary-stat__value--negative")
            }
          >
            {formatMoneyAmount(lifetimeNetUsd, "USD")}
          </span>
        </div>
      </section>
    </div>
  );
}
