import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { fetchUserCategories, getCategoryKind } from "../utils/categoryBudget";
import {
  processDueScheduledTransactions,
  fetchScheduledTransactions,
  formatScheduledRunAt,
} from "../utils/scheduledTransactions";
import {
  normalizeCurrency,
  SUPPORTED_CURRENCIES,
  formatMoneyAmount,
} from "../utils/currency";

export default function ScheduledTransactions({ user }) {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [txnCurrency, setTxnCurrency] = useState("USD");
  const [scheduleType, setScheduleType] = useState("once");
  const [frequency, setFrequency] = useState("monthly");
  const [nextRunLocal, setNextRunLocal] = useState("");
  const [scheduleExpanded, setScheduleExpanded] = useState(() => new Set());

  const toggleScheduleRow = (id) => {
    setScheduleExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadAccounts = async () => {
    const snapshot = await getDocs(
      collection(db, "users", user.uid, "accounts")
    );
    setAccounts(
      snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
    );
  };

  const loadCategories = async () => {
    const list = await fetchUserCategories(db, user.uid);
    list.sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
        sensitivity: "base",
      })
    );
    setCategories(list);
  };

  const refreshScheduled = async () => {
    const list = await fetchScheduledTransactions(db, user.uid);
    setScheduled(list);
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await processDueScheduledTransactions(db, user.uid);
        await loadAccounts();
        await loadCategories();
        const list = await fetchScheduledTransactions(db, user.uid);
        if (!cancelled) setScheduled(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const categoriesForType = useMemo(
    () => categories.filter((c) => getCategoryKind(c) === type),
    [categories, type]
  );

  useEffect(() => {
    if (categoriesForType.length === 0) {
      setCategory("");
      return;
    }
    setCategory((prev) => {
      if (prev && categoriesForType.some((c) => c.name === prev)) return prev;
      return categoriesForType[0].name;
    });
  }, [categoriesForType]);

  useEffect(() => {
    const catMeta = categories.find((c) => c.name === category);
    if (catMeta?.currency) {
      setTxnCurrency(normalizeCurrency(catMeta.currency));
    }
  }, [category, categories]);

  useEffect(() => {
    setNextRunLocal((prev) => {
      if (prev) return prev;
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    });
  }, [user]);

  const accountName = (id) =>
    accounts.find((a) => a.id === id)?.name ?? id?.slice(0, 6) ?? "—";

  const addScheduled = async (e) => {
    e.preventDefault();
    if (!desc.trim() || !amount) {
      alert("Enter description and amount.");
      return;
    }
    if (!selectedAccount) {
      alert("Select an account.");
      return;
    }
    if (categoriesForType.length === 0 || !category) {
      alert("Pick a category (create categories on Accounts if needed).");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      alert("Enter a valid amount.");
      return;
    }
    if (!nextRunLocal) {
      alert("Choose when this should first run.");
      return;
    }
    const runDate = new Date(nextRunLocal);
    if (Number.isNaN(runDate.getTime())) {
      alert("Invalid date/time.");
      return;
    }

    const userId = user.uid;
    const txCur = normalizeCurrency(txnCurrency);
    const payload = {
      desc: desc.trim().slice(0, 500),
      amount: parsedAmount,
      type,
      category,
      accountId: selectedAccount,
      currency: txCur,
      scheduleType,
      nextRunAt: Timestamp.fromDate(runDate),
      enabled: true,
      createdAt: serverTimestamp(),
    };
    if (scheduleType === "recurring") payload.frequency = frequency;

    setSaving(true);
    try {
      await addDoc(
        collection(db, "users", userId, "scheduledTransactions"),
        payload
      );
      setDesc("");
      setAmount("");
      await refreshScheduled();
    } catch (err) {
      alert(err.message ?? "Could not save schedule.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (row) => {
    try {
      await updateDoc(
        doc(db, "users", user.uid, "scheduledTransactions", row.id),
        { enabled: !row.enabled }
      );
      await refreshScheduled();
    } catch (err) {
      alert(err.message ?? "Could not update.");
    }
  };

  const removeScheduled = async (row) => {
    if (!window.confirm("Remove this scheduled transaction?")) return;
    try {
      await deleteDoc(
        doc(db, "users", user.uid, "scheduledTransactions", row.id)
      );
      await refreshScheduled();
    } catch (err) {
      alert(err.message ?? "Could not remove.");
    }
  };

  if (loading) {
    return (
      <section className="card" aria-busy="true">
        <h2 className="card__title">Scheduled &amp; recurring</h2>
        <p>Loading…</p>
      </section>
    );
  }

  return (
    <>
      <section className="card" aria-labelledby="sched-heading">
        <h2 id="sched-heading" className="card__title">
          Scheduled &amp; recurring
        </h2>
        <p>
          One-time and repeating transactions post automatically when you open
          the app (home or this page). Times use your device&apos;s local time
          zone.
        </p>

        {accounts.length === 0 ? (
          <p>
            <Link to="/accounts">Add an account</Link> before scheduling
            transactions.
          </p>
        ) : (
          <form className="form-grid form-grid--tight" onSubmit={addScheduled}>
            <label className="full-row">
              <span className="field-label">Description</span>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={500}
                required
              />
            </label>
            <label>
              <span className="field-label">Amount</span>
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label>
              <span className="field-label">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label>
              <span className="field-label">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={categoriesForType.length === 0}
              >
                {categoriesForType.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Account</span>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Currency</span>
              <select
                value={txnCurrency}
                onChange={(e) => setTxnCurrency(e.target.value)}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Schedule</span>
              <select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
              >
                <option value="once">One time</option>
                <option value="recurring">Recurring</option>
              </select>
            </label>
            {scheduleType === "recurring" ? (
              <label>
                <span className="field-label">Repeat</span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            ) : null}
            <label className="full-row">
              <span className="field-label">
                {scheduleType === "once" ? "Run at" : "First run"}
              </span>
              <input
                type="datetime-local"
                value={nextRunLocal}
                onChange={(e) => setNextRunLocal(e.target.value)}
                required
              />
            </label>
            <div className="full-row">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={saving}
              >
                {saving ? "Saving…" : "Add schedule"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="card" aria-labelledby="sched-list-heading">
        <h2 id="sched-list-heading" className="card__title">
          Upcoming
        </h2>
        {scheduled.length === 0 ? (
          <p>No scheduled transactions yet.</p>
        ) : (
          <ul className="dash-accordion dash-accordion--schedule">
            {scheduled.map((row, idx) => {
              const open = scheduleExpanded.has(row.id);
              const panelId = `sched-upcoming-${idx}`;
              const repeatLabel =
                row.scheduleType === "recurring"
                  ? row.frequency ?? "—"
                  : "once";
              return (
                <li key={row.id} className="dash-accordion__item">
                  <button
                    type="button"
                    className="dash-accordion__trigger"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggleScheduleRow(row.id)}
                  >
                    <span className="dash-accordion__trigger-start">
                      <span className="dash-accordion__chevron" aria-hidden>
                        {open ? "▼" : "▶"}
                      </span>
                      <span className="dash-accordion__title">
                        {row.desc != null && String(row.desc).trim() !== ""
                          ? String(row.desc).trim()
                          : "—"}
                      </span>
                    </span>
                    <span className="dash-accordion__summary num">
                      {formatMoneyAmount(
                        Number(row.amount) || 0,
                        normalizeCurrency(row.currency)
                      )}
                    </span>
                  </button>
                  <div className="dash-accordion__schedule-meta">
                    <div className="dash-accordion__schedule-when">
                      {formatScheduledRunAt(row.nextRunAt)}
                    </div>
                    <div className="dash-accordion__schedule-chips">
                      {row.type} · {repeatLabel} ·{" "}
                      {accountName(row.accountId)}
                      {!row.enabled ? (
                        <span className="dash-accordion__schedule-paused">
                          {" "}
                          · paused
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div
                    id={panelId}
                    className="dash-accordion__panel"
                    hidden={!open}
                  >
                    <dl className="dash-accordion__stats">
                      <div>
                        <dt>Category</dt>
                        <dd>
                          {row.category != null && String(row.category).trim()
                            ? String(row.category)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Type</dt>
                        <dd>{row.type}</dd>
                      </div>
                      <div>
                        <dt>Account</dt>
                        <dd>{accountName(row.accountId)}</dd>
                      </div>
                      <div>
                        <dt>Repeat</dt>
                        <dd>{repeatLabel}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{row.enabled ? "Active" : "Paused"}</dd>
                      </div>
                    </dl>
                    <div className="dash-accordion__schedule-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--small"
                        onClick={() => toggleEnabled(row)}
                      >
                        {row.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        onClick={() => removeScheduled(row)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
