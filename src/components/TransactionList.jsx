import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import {
  formatTransactionDate,
  transactionSortKey,
  fetchUserTransactions,
} from "../utils/transactionHelpers";
import {
  fetchUserCategories,
  getCategoryKind,
  transactionToDate,
  parseMonthFilter,
  sumExpenseForCategoryInMonth,
  sumIncomeForCategoryInMonth,
} from "../utils/categoryBudget";
import {
  convertAmount,
  formatMoneyAmount,
  normalizeCurrency,
  conversionHints,
  SUPPORTED_CURRENCIES,
} from "../utils/currency";

export default function TransactionList({ user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [editingTransactionId, setEditingTransactionId] = useState(null);
  const [filterMonth, setFilterMonth] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [editForm, setEditForm] = useState({
    desc: "",
    date: "",
    type: "expense",
    accountId: "",
    category: "",
    amount: "",
    currency: "USD",
  });

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

  const loadTransactions = async () => {
    const data = await fetchUserTransactions(db, user.uid);
    setTransactions(data);
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

  useEffect(() => {
    if (!user) return;
    loadAccounts();
    loadTransactions();
    loadCategories();
  }, [user]);

  useEffect(() => {
    const qpCategory = searchParams.get("category") ?? "";
    const qpMonth = searchParams.get("month") ?? "";
    setFilterCategory(qpCategory);
    setFilterMonth(qpMonth);
  }, [searchParams]);

  const setCategoryFilter = (value) => {
    setFilterCategory(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set("category", value);
    else next.delete("category");
    setSearchParams(next, { replace: true });
  };

  const setMonthFilter = (value) => {
    setFilterMonth(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set("month", value);
    else next.delete("month");
    setSearchParams(next, { replace: true });
  };

  const toggleTransactionRow = (id) => {
    setSelectedTransactionId((s) => (s === id ? null : id));
  };

  const rowKeyToggle = (e, onToggle) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  const removeTransaction = async (t) => {
    if (
      !window.confirm(
        "Remove this transaction? It will be deleted and the account balance will be adjusted."
      )
    ) {
      return;
    }

    const userId = user.uid;
    const amountNum = Number(t.amount);
    if (Number.isNaN(amountNum)) {
      alert("Invalid transaction amount.");
      return;
    }

    setDeletingId(t.id);
    try {
      const txnRef = doc(db, "users", userId, "transactions", t.id);

      if (t.accountId) {
        const accountRef = doc(db, "users", userId, "accounts", t.accountId);
        const accountSnap = await getDoc(accountRef);
        if (accountSnap.exists) {
          const currentBalance = accountSnap.data().balance || 0;
          const accCur = normalizeCurrency(accountSnap.data().currency);
          const txCur = normalizeCurrency(t.currency);
          const amountInAcc = convertAmount(amountNum, txCur, accCur);
          const delta = t.type === "income" ? -amountInAcc : amountInAcc;
          const batch = writeBatch(db);
          batch.update(accountRef, { balance: currentBalance + delta });
          batch.delete(txnRef);
          await batch.commit();
        } else {
          await deleteDoc(txnRef);
        }
      } else {
        await deleteDoc(txnRef);
      }

      await loadTransactions();
      await loadAccounts();
      setSelectedTransactionId((s) => (s === t.id ? null : s));
    } catch (err) {
      alert(err.message ?? "Could not remove transaction.");
    } finally {
      setDeletingId(null);
    }
  };

  const toDateInputValue = (createdAt) => {
    const source = transactionToDate(createdAt) ?? new Date();
    const d = new Date(source.getTime() - source.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  };

  const startEditing = (t) => {
    setEditingTransactionId(t.id);
    setEditForm({
      desc: t.desc != null && String(t.desc).trim() !== "" ? String(t.desc) : "",
      date: toDateInputValue(t.createdAt),
      type: t.type === "income" ? "income" : "expense",
      accountId: t.accountId ?? "",
      category: t.category ? String(t.category) : "",
      amount: String(Number(t.amount) || 0),
      currency: normalizeCurrency(t.currency),
    });
  };

  const closeEditModal = () => {
    if (savingEdit) return;
    setEditingTransactionId(null);
  };

  const editingTransaction = useMemo(
    () => transactions.find((t) => t.id === editingTransactionId) ?? null,
    [transactions, editingTransactionId]
  );

  const categoriesForEditType = useMemo(
    () => categories.filter((c) => getCategoryKind(c) === editForm.type),
    [categories, editForm.type]
  );

  useEffect(() => {
    if (!editingTransactionId) return;
    if (categoriesForEditType.length === 0) {
      setEditForm((prev) => ({ ...prev, category: "" }));
      return;
    }
    setEditForm((prev) => {
      if (prev.category && categoriesForEditType.some((c) => c.name === prev.category)) {
        return prev;
      }
      return { ...prev, category: categoriesForEditType[0].name };
    });
  }, [categoriesForEditType, editingTransactionId]);

  const saveEdit = async () => {
    if (!editingTransaction || !user) return;

    if (!editForm.desc?.trim()) {
      alert("Enter a description.");
      return;
    }
    if (!editForm.date) {
      alert("Select a date.");
      return;
    }
    if (!editForm.accountId) {
      alert("Select an account.");
      return;
    }
    if (categoriesForEditType.length === 0) {
      alert(
        editForm.type === "income"
          ? "Create at least one income category before switching to income."
          : "Create at least one expense category before switching to expense."
      );
      return;
    }
    if (!editForm.category) {
      alert("Select a category.");
      return;
    }

    const parsedAmount = Number(editForm.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      alert("Enter a valid amount.");
      return;
    }

    const parsedDate = new Date(`${editForm.date}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      alert("Enter a valid date.");
      return;
    }

    const oldAmount = Number(editingTransaction.amount);
    if (!Number.isFinite(oldAmount) || oldAmount < 0) {
      alert("Current transaction amount is invalid.");
      return;
    }

    const oldAccountId = editingTransaction.accountId;
    const newAccountId = editForm.accountId;
    const oldType = editingTransaction.type === "income" ? "income" : "expense";
    const newType = editForm.type === "income" ? "income" : "expense";
    const oldTxnCur = normalizeCurrency(editingTransaction.currency);
    const newTxnCur = normalizeCurrency(editForm.currency);

    const accountFor = (id) => accounts.find((a) => a.id === id);
    const oldAcc = oldAccountId ? accountFor(oldAccountId) : null;
    const newAcc = newAccountId ? accountFor(newAccountId) : null;
    const oldAccCur = oldAcc
      ? normalizeCurrency(oldAcc.currency)
      : oldTxnCur;
    const newAccCur = newAcc
      ? normalizeCurrency(newAcc.currency)
      : newTxnCur;
    const oldAmountAcc = convertAmount(oldAmount, oldTxnCur, oldAccCur);
    const newAmountAcc = convertAmount(parsedAmount, newTxnCur, newAccCur);

    setSavingEdit(true);
    try {
      const userId = user.uid;
      const txnRef = doc(db, "users", userId, "transactions", editingTransaction.id);
      const batch = writeBatch(db);
      const accountDeltas = {};

      if (oldAccountId) {
        accountDeltas[oldAccountId] =
          (accountDeltas[oldAccountId] ?? 0) +
          (oldType === "income" ? -oldAmountAcc : oldAmountAcc);
      }
      if (newAccountId) {
        accountDeltas[newAccountId] =
          (accountDeltas[newAccountId] ?? 0) +
          (newType === "income" ? newAmountAcc : -newAmountAcc);
      }

      const touchedAccountIds = Object.keys(accountDeltas).filter(
        (id) => Math.abs(accountDeltas[id]) > 1e-9
      );
      for (const accountId of touchedAccountIds) {
        const accountRef = doc(db, "users", userId, "accounts", accountId);
        const snap = await getDoc(accountRef);
        if (!snap.exists()) {
          alert("One of the selected accounts no longer exists.");
          setSavingEdit(false);
          return;
        }
        const currentBalance = Number(snap.data().balance) || 0;
        batch.update(accountRef, {
          balance: currentBalance + accountDeltas[accountId],
        });
      }

      batch.update(txnRef, {
        desc: editForm.desc.trim(),
        type: newType,
        accountId: newAccountId,
        category: editForm.category,
        amount: parsedAmount,
        currency: newTxnCur,
        createdAt: Timestamp.fromDate(parsedDate),
      });

      await batch.commit();
      await loadTransactions();
      await loadAccounts();
      setEditingTransactionId(null);
    } catch (err) {
      alert(err.message ?? "Could not update transaction.");
    } finally {
      setSavingEdit(false);
    }
  };

  const accountNameById = Object.fromEntries(
    accounts.map((a) => [a.id, a.name])
  );

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const categoryByName = useMemo(() => {
    const o = {};
    for (const c of categories) {
      o[c.name] = c;
    }
    return o;
  }, [categories]);

  const categoryFilterOptions = useMemo(() => {
    const fromCats = categories.map((c) => String(c.name ?? "")).filter(Boolean);
    const fromTxns = transactions
      .map((t) => (t.category != null ? String(t.category) : ""))
      .filter(Boolean);
    const merged = [...new Set([...fromCats, ...fromTxns])];
    merged.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    return merged;
  }, [categories, transactions]);

  /** When both month and category filters are set, show budget / income context for that period. */
  const categoryMonthInsight = useMemo(() => {
    if (!filterMonth || !filterCategory) return null;
    const ctx = parseMonthFilter(filterMonth);
    if (!ctx) return null;
    const { anchor, label } = ctx;
    const cat = categories.find(
      (c) => String(c.name ?? "").trim() === filterCategory
    );

    if (!cat) {
      const spentUsd = sumExpenseForCategoryInMonth(
        transactions,
        filterCategory,
        anchor,
        "USD"
      );
      const incomeUsd = sumIncomeForCategoryInMonth(
        transactions,
        filterCategory,
        anchor,
        "USD"
      );
      return {
        kind: "orphan",
        label,
        category: filterCategory,
        spentExpenseUsd: spentUsd,
        totalIncomeUsd: incomeUsd,
      };
    }

    if (getCategoryKind(cat) === "income") {
      const cur = normalizeCurrency(cat.currency);
      const totalIncome = sumIncomeForCategoryInMonth(
        transactions,
        filterCategory,
        anchor,
        cur
      );
      return {
        kind: "income",
        label,
        category: filterCategory,
        currency: cur,
        totalIncome,
      };
    }

    const budget = Number(cat.budget);
    const cur = normalizeCurrency(cat.currency);
    const spent = sumExpenseForCategoryInMonth(
      transactions,
      filterCategory,
      anchor,
      cur
    );

    if (!Number.isFinite(budget) || budget < 0) {
      return {
        kind: "expense-no-budget",
        label,
        category: filterCategory,
        currency: cur,
        spent,
      };
    }

    const remaining = budget - spent;
    const pctUsed =
      budget > 1e-9 ? (spent / budget) * 100 : spent > 0 ? 100 : 0;
    const over = spent > budget + 1e-9;

    return {
      kind: "expense-budget",
      label,
      category: filterCategory,
      budget,
      spent,
      remaining,
      currency: cur,
      pctUsed,
      barWidthPct: Math.min(pctUsed, 100),
      over,
    };
  }, [filterMonth, filterCategory, categories, transactions]);

  const filteredTransactions = useMemo(() => {
    let y;
    let m;
    if (filterMonth) {
      const parts = filterMonth.split("-").map(Number);
      y = parts[0];
      m = parts[1];
    }
    return transactions.filter((t) => {
      if (filterMonth) {
        const d = transactionToDate(t.createdAt);
        if (
          !d ||
          !Number.isFinite(y) ||
          !Number.isFinite(m) ||
          d.getFullYear() !== y ||
          d.getMonth() !== m - 1
        ) {
          return false;
        }
      }
      if (filterCategory && String(t.category ?? "") !== filterCategory) {
        return false;
      }
      return true;
    });
  }, [transactions, filterMonth, filterCategory]);

  const sortedForDisplay = useMemo(
    () =>
      [...filteredTransactions].sort(
        (a, b) =>
          transactionSortKey(b.createdAt) - transactionSortKey(a.createdAt)
      ),
    [filteredTransactions]
  );

  const txnLabel = (t) => {
    const hasDesc = t.desc != null && String(t.desc).trim() !== "";
    return hasDesc ? String(t.desc).trim() : "—";
  };

  return (
    <section className="card" aria-labelledby="txn-list-heading">
      <h2 id="txn-list-heading" className="card__title">
        Transactions
      </h2>
      {transactions.length === 0 ? (
        <p>No transactions yet.</p>
      ) : (
        <>
          <div className="txn-list__filters">
            <label className="field-label txn-list__filter">
              <span className="txn-list__filter-label">Month</span>
              <div className="txn-list__filter-controls">
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  aria-label="Filter transactions by month"
                />
                {filterMonth ? (
                  <button
                    type="button"
                    className="btn btn--subtle"
                    onClick={() => setMonthFilter("")}
                  >
                    All months
                  </button>
                ) : null}
              </div>
            </label>
            <label className="field-label txn-list__filter">
              <span className="txn-list__filter-label">Category</span>
              <select
                value={filterCategory}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter transactions by category"
              >
                <option value="">All categories</option>
                {categoryFilterOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {categoryMonthInsight ? (
            <div
              className="txn-month-insight"
              aria-labelledby="txn-month-insight-title"
            >
              <h3 id="txn-month-insight-title" className="txn-month-insight__title">
                {categoryMonthInsight.label} · {categoryMonthInsight.category}
              </h3>
              {categoryMonthInsight.kind === "expense-budget" ? (
                <>
                  <p className="txn-month-insight__lede">
                    Budget utilization for this expense category (calendar month).
                  </p>
                  <dl className="txn-month-insight__stats">
                    <div>
                      <dt>Budget</dt>
                      <dd>
                        {formatMoneyAmount(
                          categoryMonthInsight.budget,
                          categoryMonthInsight.currency
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Spent</dt>
                      <dd>
                        {formatMoneyAmount(
                          categoryMonthInsight.spent,
                          categoryMonthInsight.currency
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Left</dt>
                      <dd
                        className={
                          categoryMonthInsight.remaining < -1e-9
                            ? "txn-month-insight__neg"
                            : "txn-month-insight__pos"
                        }
                      >
                        {formatMoneyAmount(
                          categoryMonthInsight.remaining,
                          categoryMonthInsight.currency
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Used</dt>
                      <dd>
                        {categoryMonthInsight.pctUsed.toFixed(0)}% of budget
                      </dd>
                    </div>
                  </dl>
                  <div
                    className="budget-bar budget-bar--txn-insight"
                    title={`${categoryMonthInsight.pctUsed.toFixed(0)}% of budget`}
                  >
                    <div
                      className={
                        "budget-bar__fill" +
                        (categoryMonthInsight.over
                          ? " budget-bar__fill--over"
                          : "")
                      }
                      style={{
                        width: `${categoryMonthInsight.barWidthPct}%`,
                      }}
                    />
                  </div>
                  {categoryMonthInsight.over ? (
                    <p className="budget-flag" role="status">
                      Over budget for this month
                    </p>
                  ) : null}
                </>
              ) : null}
              {categoryMonthInsight.kind === "expense-no-budget" ? (
                <>
                  <p className="txn-month-insight__lede">
                    This expense category has no monthly budget on Accounts.
                    Spent this month:
                  </p>
                  <p className="txn-month-insight__highlight">
                    {formatMoneyAmount(
                      categoryMonthInsight.spent,
                      categoryMonthInsight.currency
                    )}
                  </p>
                </>
              ) : null}
              {categoryMonthInsight.kind === "income" ? (
                <>
                  <p className="txn-month-insight__lede">
                    Total income recorded for this category in this month.
                  </p>
                  <p className="txn-month-insight__highlight">
                    {formatMoneyAmount(
                      categoryMonthInsight.totalIncome,
                      categoryMonthInsight.currency
                    )}
                  </p>
                </>
              ) : null}
              {categoryMonthInsight.kind === "orphan" ? (
                <>
                  <p className="txn-month-insight__lede">
                    This name is not in your Accounts categories (legacy or
                    renamed). Totals shown in USD.
                  </p>
                  <dl className="txn-month-insight__stats">
                    <div>
                      <dt>Expenses (month)</dt>
                      <dd>
                        {formatMoneyAmount(
                          categoryMonthInsight.spentExpenseUsd,
                          "USD"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Income (month)</dt>
                      <dd>
                        {formatMoneyAmount(
                          categoryMonthInsight.totalIncomeUsd,
                          "USD"
                        )}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : null}
            </div>
          ) : null}

          {!filterMonth || !filterCategory ? (
            <p className="txn-month-insight__hint">
              Select a <strong>month</strong> and a <strong>category</strong> to
              see budget utilization and what was left for that period.
            </p>
          ) : null}

          {sortedForDisplay.length === 0 ? (
            <p className="txn-list__empty-filters">
              No transactions match these filters. Try a different month or
              category, or clear the filters.
            </p>
          ) : null}

          {sortedForDisplay.length > 0 ? (
            <>
          <p className="hint-select-row show-mobile-only">
            Tap a transaction to show <strong>Edit</strong> and{" "}
            <strong>Remove</strong>.
          </p>
          <p className="hint-select-row show-desktop-only">
            Select a row to show <strong>Edit</strong> and{" "}
            <strong>Remove</strong>.
          </p>

          <ul className="mobile-entity-list show-mobile-only">
            {sortedForDisplay.map((t) => {
              const isIncome = t.type === "income";
              const amountNum = Number(t.amount);
              const txCur = normalizeCurrency(t.currency);
              const amountMain = `${isIncome ? "+" : "−"}${formatMoneyAmount(amountNum, txCur)}`;
              const convHints = conversionHints(
                t,
                accountById[t.accountId],
                categoryByName[t.category]
              );
              const busy = deletingId === t.id;
              const isSelected = selectedTransactionId === t.id;
              return (
                <li
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  className={
                    isSelected ? "mobile-entity-list__item--selected" : ""
                  }
                  onClick={() => toggleTransactionRow(t.id)}
                  onKeyDown={(e) =>
                    rowKeyToggle(e, () => toggleTransactionRow(t.id))
                  }
                >
                  <div className="mobile-entity-list__main">
                    <div className="txn-mobile__title">{txnLabel(t)}</div>
                    <div className="txn-mobile__row">
                      <span>{formatTransactionDate(t.createdAt)}</span>
                      <span className="txn-mobile__amount">
                        <span className="txn-mobile__amount-main">
                          {amountMain}
                        </span>
                        {convHints.map((h) => (
                          <span className="txn-conv-hint" key={h}>
                            {h}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div className="txn-mobile__meta">
                      {isIncome ? "Income" : "Expense"} ·{" "}
                      {t.category ? String(t.category) : "—"} ·{" "}
                      {accountNameById[t.accountId] ?? "—"}
                    </div>
                  </div>
                  {isSelected && (
                    <div
                      className="mobile-entity-list__actions account-actions-row"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="btn btn--subtle"
                        onClick={() => startEditing(t)}
                        disabled={busy || deletingId !== null}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => removeTransaction(t)}
                        disabled={busy || deletingId !== null}
                      >
                        {busy ? "Removing…" : "Remove transaction"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="table-wrap show-desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sortedForDisplay.map((t) => {
                  const isIncome = t.type === "income";
                  const amountNum = Number(t.amount);
                  const txCur = normalizeCurrency(t.currency);
                  const amountMain = `${isIncome ? "+" : "−"}${formatMoneyAmount(amountNum, txCur)}`;
                  const convHints = conversionHints(
                    t,
                    accountById[t.accountId],
                    categoryByName[t.category]
                  );
                  const busy = deletingId === t.id;
                  const isSelected = selectedTransactionId === t.id;
                  return (
                    <tr
                      key={t.id}
                      className={
                        "data-row--interactive" +
                        (isSelected ? " data-row--selected" : "")
                      }
                      tabIndex={0}
                      onClick={() => toggleTransactionRow(t.id)}
                      onKeyDown={(e) =>
                        rowKeyToggle(e, () => toggleTransactionRow(t.id))
                      }
                    >
                      <td className="txn-table__desc" title={txnLabel(t)}>
                        {txnLabel(t)}
                      </td>
                      <td>{formatTransactionDate(t.createdAt)}</td>
                      <td>{isIncome ? "Income" : "Expense"}</td>
                      <td>{accountNameById[t.accountId] ?? "—"}</td>
                      <td>{t.category ? String(t.category) : "—"}</td>
                      <td className="num txn-table__amount-cell">
                        <div>{amountMain}</div>
                        {convHints.map((h) => (
                          <div className="txn-conv-hint" key={h}>
                            {h}
                          </div>
                        ))}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isSelected ? (
                          <div className="account-actions-row account-actions-row--compact">
                            <button
                              type="button"
                              className="btn btn--subtle"
                              style={{
                                padding: "0.4rem 0.65rem",
                                fontSize: "0.82rem",
                              }}
                              onClick={() => startEditing(t)}
                              disabled={busy || deletingId !== null}
                              aria-label={`Edit “${txnLabel(t)}” · ${formatTransactionDate(t.createdAt)}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger"
                              style={{
                                padding: "0.4rem 0.65rem",
                                fontSize: "0.82rem",
                              }}
                              onClick={() => removeTransaction(t)}
                              disabled={busy || deletingId !== null}
                              aria-label={`Remove “${txnLabel(t)}” · ${formatTransactionDate(t.createdAt)}`}
                            >
                              {busy ? "…" : "Remove"}
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            </>
          ) : null}
        </>
      )}
      {editingTransaction ? (
        <div
          className="txn-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="txn-edit-title"
          onClick={closeEditModal}
        >
          <div
            className="txn-edit-modal__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="txn-edit-title" className="card__subtitle">
              Edit transaction
            </h3>
            <div className="txn-edit-modal__form">
              <label className="field-label">
                Description
                <input
                  type="text"
                  value={editForm.desc}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, desc: e.target.value }))
                  }
                  disabled={savingEdit}
                  autoComplete="off"
                />
              </label>

              <label className="field-label">
                Date
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, date: e.target.value }))
                  }
                  disabled={savingEdit}
                />
              </label>

              <label className="field-label">
                Type
                <select
                  value={editForm.type}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, type: e.target.value }))
                  }
                  disabled={savingEdit}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>

              <label className="field-label">
                Account
                <select
                  value={editForm.accountId}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      accountId: e.target.value,
                    }))
                  }
                  disabled={savingEdit}
                >
                  <option value="" disabled>
                    Select account
                  </option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                Category
                <select
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      category: e.target.value,
                    }))
                  }
                  disabled={savingEdit || categoriesForEditType.length === 0}
                >
                  {categoriesForEditType.length === 0 ? (
                    <option value="">No categories</option>
                  ) : null}
                  {categoriesForEditType.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  disabled={savingEdit}
                />
              </label>

              <label className="field-label">
                Currency
                <select
                  value={editForm.currency}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      currency: e.target.value,
                    }))
                  }
                  disabled={savingEdit}
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="txn-edit-modal__actions">
              <button
                type="button"
                className="btn btn--subtle"
                onClick={closeEditModal}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={saveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
