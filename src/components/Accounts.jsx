import { useState, useEffect, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
  runTransaction,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { fetchUserTransactions } from "../utils/transactionHelpers";
import {
  fetchUserCategories,
  sumExpenseForCategoryInMonth,
  sumIncomeForCategoryInMonth,
  getCategoryKind,
} from "../utils/categoryBudget";

export default function Accounts({ user }) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState([]);
  const [catName, setCatName] = useState("");
  const [catBudget, setCatBudget] = useState("");
  const [catKind, setCatKind] = useState("expense");
  const [catSaving, setCatSaving] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [deletingAccountId, setDeletingAccountId] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [transferPanelForId, setTransferPanelForId] = useState(null);
  const [transferDestId, setTransferDestId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [accountEditSaving, setAccountEditSaving] = useState(false);
  const [categoryEditSaving, setCategoryEditSaving] = useState(false);
  const [accountEditForm, setAccountEditForm] = useState({
    name: "",
    balance: "",
  });
  const [categoryEditForm, setCategoryEditForm] = useState({
    name: "",
    kind: "expense",
    budget: "",
  });

  const loadAccounts = async () => {
    const snapshot = await getDocs(
      collection(db, "users", user.uid, "accounts")
    );

    const data = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    setAccounts(data);
  };

  const refreshCategoriesAndTx = async () => {
    const [cats, tx] = await Promise.all([
      fetchUserCategories(db, user.uid),
      fetchUserTransactions(db, user.uid),
    ]);
    setCategories(cats);
    setTransactions(tx);
  };

  const addAccount = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Enter an account name.");
      return;
    }
    const bal = parseFloat(balance);
    if (balance === "" || Number.isNaN(bal)) {
      alert("Enter a valid starting balance.");
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "users", user.uid, "accounts"), {
        name: trimmed,
        balance: bal,
      });
      await loadAccounts();
      setName("");
      setBalance("");
    } catch (err) {
      alert(err.message ?? "Could not add account.");
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    const trimmed = catName.trim();
    if (!trimmed) {
      alert("Enter a category name.");
      return;
    }

    let payload;
    if (catKind === "income") {
      payload = { name: trimmed, kind: "income" };
    } else {
      const bud = parseFloat(catBudget);
      if (catBudget === "" || Number.isNaN(bud) || bud < 0) {
        alert("Enter a valid monthly budget (0 or more).");
        return;
      }
      payload = { name: trimmed, kind: "expense", budget: bud };
    }

    const dup = categories.some(
      (c) => String(c.name).trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (dup) {
      alert("A category with that name already exists.");
      return;
    }

    setCatSaving(true);
    try {
      await addDoc(collection(db, "users", user.uid, "categories"), payload);
      await refreshCategoriesAndTx();
      setCatName("");
      setCatBudget("");
    } catch (err) {
      alert(err.message ?? "Could not add category.");
    } finally {
      setCatSaving(false);
    }
  };

  const removeAccount = async (acc) => {
    const freshTx = await fetchUserTransactions(db, user.uid);
    const relatedIds = freshTx
      .filter((t) => t.accountId === acc.id)
      .map((t) => t.id);

    const msg =
      relatedIds.length > 0
        ? `Remove account "${acc.name}"? This will also permanently delete ${relatedIds.length} transaction(s) that use this account.`
        : `Remove account "${acc.name}"? This cannot be undone.`;

    if (!window.confirm(msg)) return;

    const userId = user.uid;
    setDeletingAccountId(acc.id);
    try {
      const ops = [
        ...relatedIds.map((id) => ({ kind: "txn", id })),
        { kind: "acc", id: acc.id },
      ];

      for (let i = 0; i < ops.length; i += 500) {
        const slice = ops.slice(i, i + 500);
        const batch = writeBatch(db);
        for (const op of slice) {
          if (op.kind === "txn") {
            batch.delete(doc(db, "users", userId, "transactions", op.id));
          } else {
            batch.delete(doc(db, "users", userId, "accounts", op.id));
          }
        }
        await batch.commit();
      }

      await loadAccounts();
      await refreshCategoriesAndTx();
      setSelectedAccountId((s) => (s === acc.id ? null : s));
      resetTransferForm();
    } catch (err) {
      alert(err.message ?? "Could not remove account.");
    } finally {
      setDeletingAccountId(null);
    }
  };

  const removeCategory = async (cat) => {
    if (
      !window.confirm(
        `Delete category "${cat.name}"? Existing transactions still show this label.`
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(db, "users", user.uid, "categories", cat.id));
      await refreshCategoriesAndTx();
      setSelectedCategoryId((s) => (s === cat.id ? null : s));
    } catch (err) {
      alert(err.message ?? "Could not delete category.");
    }
  };

  useEffect(() => {
    if (!user) return;
    loadAccounts();
    refreshCategoriesAndTx();
  }, [user]);

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
        sensitivity: "base",
      })
    );
  }, [accounts]);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
        sensitivity: "base",
      })
    );
  }, [categories]);

  const now = new Date();

  const resetTransferForm = () => {
    setTransferPanelForId(null);
    setTransferDestId("");
    setTransferAmount("");
  };

  const toggleAccountRow = (id) => {
    setSelectedAccountId((s) => {
      if (s === id) {
        resetTransferForm();
        return null;
      }
      resetTransferForm();
      return id;
    });
  };

  const openTransferPanel = (fromId) => {
    const others = sortedAccounts.filter((a) => a.id !== fromId);
    setTransferPanelForId(fromId);
    setTransferDestId(others[0]?.id ?? "");
    setTransferAmount("");
  };

  const toggleTransferPanel = (fromId) => {
    if (transferPanelForId === fromId) {
      resetTransferForm();
    } else {
      openTransferPanel(fromId);
    }
  };

  const submitTransfer = async (fromAcc) => {
    const others = sortedAccounts.filter((a) => a.id !== fromAcc.id);
    if (others.length === 0) {
      alert("Add another account before transferring.");
      return;
    }
    if (!transferDestId) {
      alert("Choose an account to transfer to.");
      return;
    }
    if (transferDestId === fromAcc.id) {
      alert("Choose a different account than the source.");
      return;
    }
    const amt = parseFloat(transferAmount);
    if (transferAmount === "" || Number.isNaN(amt) || amt <= 0) {
      alert("Enter a valid amount greater than zero.");
      return;
    }

    const userId = user.uid;
    setTransferSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const fromRef = doc(db, "users", userId, "accounts", fromAcc.id);
        const toRef = doc(db, "users", userId, "accounts", transferDestId);
        const fromSnap = await transaction.get(fromRef);
        const toSnap = await transaction.get(toRef);
        if (!fromSnap.exists || !toSnap.exists) {
          throw new Error("One of the accounts no longer exists.");
        }
        const fromBal = Number(fromSnap.data().balance) || 0;
        const toBal = Number(toSnap.data().balance) || 0;
        if (amt > fromBal + 1e-9) {
          throw new Error("Amount exceeds this account's balance.");
        }
        transaction.update(fromRef, { balance: fromBal - amt });
        transaction.update(toRef, { balance: toBal + amt });
      });
      await loadAccounts();
      resetTransferForm();
    } catch (err) {
      alert(err.message ?? "Transfer failed.");
    } finally {
      setTransferSaving(false);
    }
  };

  const toggleCategoryRow = (id) => {
    setSelectedCategoryId((s) => (s === id ? null : id));
  };

  const rowKeyToggle = (e, onToggle) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  const viewCategoryTransactions = (categoryName) => {
    const params = new URLSearchParams();
    params.set("category", String(categoryName ?? ""));
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    params.set("month", `${y}-${m}`);
    navigate(`/transactions?${params.toString()}`);
  };

  const startEditingAccount = (acc) => {
    setEditingAccountId(acc.id);
    setAccountEditForm({
      name: String(acc.name ?? ""),
      balance: String(Number(acc.balance) || 0),
    });
  };

  const closeAccountEdit = () => {
    if (accountEditSaving) return;
    setEditingAccountId(null);
  };

  const startEditingCategory = (cat) => {
    const isIncome = getCategoryKind(cat) === "income";
    setEditingCategoryId(cat.id);
    setCategoryEditForm({
      name: String(cat.name ?? ""),
      kind: isIncome ? "income" : "expense",
      budget: isIncome ? "" : String(Number(cat.budget) || 0),
    });
  };

  const closeCategoryEdit = () => {
    if (categoryEditSaving) return;
    setEditingCategoryId(null);
  };

  const saveAccountEdit = async () => {
    const account = accounts.find((a) => a.id === editingAccountId);
    if (!account) return;

    const trimmedName = accountEditForm.name.trim();
    if (!trimmedName) {
      alert("Enter an account name.");
      return;
    }
    const newBalance = parseFloat(accountEditForm.balance);
    if (accountEditForm.balance === "" || Number.isNaN(newBalance)) {
      alert("Enter a valid balance.");
      return;
    }

    const oldBalance = Number(account.balance) || 0;
    const delta = newBalance - oldBalance;

    setAccountEditSaving(true);
    try {
      const userId = user.uid;
      const accountRef = doc(db, "users", userId, "accounts", account.id);
      await updateDoc(accountRef, { name: trimmedName, balance: newBalance });

      if (Math.abs(delta) > 1e-9) {
        await addDoc(collection(db, "users", userId, "transactions"), {
          desc: "Balance adjustment",
          amount: Math.abs(delta),
          type: delta >= 0 ? "income" : "expense",
          category: "Balance adjustment",
          accountId: account.id,
          createdAt: serverTimestamp(),
        });
      }

      await loadAccounts();
      await refreshCategoriesAndTx();
      setEditingAccountId(null);
    } catch (err) {
      alert(err.message ?? "Could not update account.");
    } finally {
      setAccountEditSaving(false);
    }
  };

  const saveCategoryEdit = async () => {
    const category = categories.find((c) => c.id === editingCategoryId);
    if (!category) return;

    const trimmedName = categoryEditForm.name.trim();
    if (!trimmedName) {
      alert("Enter a category name.");
      return;
    }

    const duplicate = categories.some(
      (c) =>
        c.id !== category.id &&
        String(c.name ?? "").trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      alert("A category with that name already exists.");
      return;
    }

    const payload =
      categoryEditForm.kind === "income"
        ? { name: trimmedName, kind: "income" }
        : (() => {
            const b = parseFloat(categoryEditForm.budget);
            if (categoryEditForm.budget === "" || Number.isNaN(b) || b < 0) {
              alert("Enter a valid monthly budget (0 or more).");
              return null;
            }
            return { name: trimmedName, kind: "expense", budget: b };
          })();
    if (!payload) return;

    setCategoryEditSaving(true);
    try {
      const userId = user.uid;
      await updateDoc(doc(db, "users", userId, "categories", category.id), payload);

      const oldName = String(category.name ?? "");
      if (oldName && oldName !== trimmedName) {
        const tx = await fetchUserTransactions(db, userId);
        const affected = tx.filter((t) => String(t.category ?? "") === oldName);
        for (let i = 0; i < affected.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = affected.slice(i, i + 500);
          for (const t of chunk) {
            batch.update(doc(db, "users", userId, "transactions", t.id), {
              category: trimmedName,
            });
          }
          await batch.commit();
        }
      }

      await refreshCategoriesAndTx();
      setEditingCategoryId(null);
    } catch (err) {
      alert(err.message ?? "Could not update category.");
    } finally {
      setCategoryEditSaving(false);
    }
  };

  const renderTransferFields = (fromAcc) => {
    const otherAccounts = sortedAccounts.filter((a) => a.id !== fromAcc.id);
    if (otherAccounts.length === 0) {
      return (
        <p className="hint-select-row" style={{ marginTop: 6 }}>
          Add another account to transfer funds.
        </p>
      );
    }
    return (
      <div className="account-transfer-panel__inner">
        <label className="field-label">
          Transfer to
          <select
            value={transferDestId}
            onChange={(e) => setTransferDestId(e.target.value)}
            aria-label="Destination account"
          >
            {otherAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (
                {new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: "USD",
                }).format(Number(a.balance) || 0)}
                )
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Amount
          <input
            type="number"
            min={0}
            step="any"
            placeholder="0.00"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            aria-label="Transfer amount"
          />
        </label>
        <div className="account-transfer-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => submitTransfer(fromAcc)}
            disabled={transferSaving}
          >
            {transferSaving ? "Transferring…" : "Confirm transfer"}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={resetTransferForm}
            disabled={transferSaving}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <section className="card" aria-labelledby="accounts-heading">
        <h2 id="accounts-heading" className="card__title">
          Accounts
        </h2>
        <p>Bank-style buckets that hold balances and receive transactions.</p>

        <h3 className="card__subtitle">Add account</h3>
        <div className="form-grid">
          <label className="field-label">
            Account name
            <input
              placeholder="e.g. Checking"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Account name"
            />
          </label>
          <label className="field-label">
            Starting balance
            <input
              type="number"
              placeholder="0.00"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              aria-label="Starting balance"
            />
          </label>
          <div className="full-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={addAccount}
              disabled={saving}
            >
              {saving ? "Adding…" : "Add account"}
            </button>
          </div>
        </div>

        <h3 className="card__subtitle">Your accounts</h3>
        {sortedAccounts.length === 0 ? (
          <p>No accounts yet. Add one above to get started.</p>
        ) : (
          <>
            <p className="hint-select-row show-mobile-only">
              Tap a row to show <strong>Edit</strong>, <strong>Remove</strong> and{" "}
              <strong>Transfer</strong>.
            </p>
            <p className="hint-select-row show-desktop-only">
              Select a row for <strong>Edit</strong>, <strong>Remove</strong> or{" "}
              <strong>Transfer</strong> (click or keyboard).
            </p>
            <ul className="mobile-entity-list show-mobile-only">
              {sortedAccounts.map((acc) => {
                const bal = Number(acc.balance);
                const balanceStr = Number.isNaN(bal)
                  ? "—"
                  : new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: "USD",
                    }).format(bal);
                const busy = deletingAccountId === acc.id;
                const isSelected = selectedAccountId === acc.id;
                return (
                  <li
                    key={acc.id}
                    role="button"
                    tabIndex={0}
                    className={
                      isSelected ? "mobile-entity-list__item--selected" : ""
                    }
                    onClick={() => toggleAccountRow(acc.id)}
                    onKeyDown={(e) =>
                      rowKeyToggle(e, () => toggleAccountRow(acc.id))
                    }
                  >
                    <div className="mobile-entity-list__main">
                      <div className="accounts-mobile__row">
                        <span className="accounts-mobile__name">
                          {acc.name ?? "—"}
                        </span>
                        <span className="accounts-mobile__bal">
                          {balanceStr}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <div
                        className="mobile-entity-list__actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="account-actions-row">
                          <button
                            type="button"
                            className="btn btn--subtle"
                            onClick={() => startEditingAccount(acc)}
                            disabled={
                              busy ||
                              deletingAccountId !== null ||
                              transferSaving
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger"
                            onClick={() => removeAccount(acc)}
                            disabled={
                              busy ||
                              deletingAccountId !== null ||
                              transferSaving
                            }
                          >
                            {busy ? "Removing…" : "Remove account"}
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={() => toggleTransferPanel(acc.id)}
                            disabled={
                              busy ||
                              deletingAccountId !== null ||
                              transferSaving
                            }
                          >
                            {transferPanelForId === acc.id
                              ? "Hide transfer"
                              : "Transfer"}
                          </button>
                        </div>
                        {transferPanelForId === acc.id && (
                          <div className="account-transfer-panel">
                            {renderTransferFields(acc)}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="table-wrap table-wrap--no-min show-desktop-only">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="num">Balance</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {sortedAccounts.map((acc) => {
                    const bal = Number(acc.balance);
                    const balanceStr = Number.isNaN(bal)
                      ? "—"
                      : new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: "USD",
                        }).format(bal);
                    const busy = deletingAccountId === acc.id;
                    const isSelected = selectedAccountId === acc.id;
                    return (
                      <Fragment key={acc.id}>
                        <tr
                          className={
                            "data-row--interactive" +
                            (isSelected ? " data-row--selected" : "")
                          }
                          tabIndex={0}
                          onClick={() => toggleAccountRow(acc.id)}
                          onKeyDown={(e) =>
                            rowKeyToggle(e, () => toggleAccountRow(acc.id))
                          }
                        >
                          <td>{acc.name ?? "—"}</td>
                          <td className="num">{balanceStr}</td>
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
                                  onClick={() => startEditingAccount(acc)}
                                  disabled={
                                    busy ||
                                    deletingAccountId !== null ||
                                    transferSaving
                                  }
                                  aria-label={`Edit account ${acc.name ?? acc.id}`}
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
                                  onClick={() => removeAccount(acc)}
                                  disabled={
                                    busy ||
                                    deletingAccountId !== null ||
                                    transferSaving
                                  }
                                  aria-label={`Remove account ${acc.name ?? acc.id}`}
                                >
                                  {busy ? "…" : "Remove"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--secondary"
                                  style={{
                                    padding: "0.4rem 0.65rem",
                                    fontSize: "0.82rem",
                                  }}
                                  onClick={() => toggleTransferPanel(acc.id)}
                                  disabled={
                                    busy ||
                                    deletingAccountId !== null ||
                                    transferSaving
                                  }
                                >
                                  {transferPanelForId === acc.id
                                    ? "Hide"
                                    : "Transfer"}
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                        {transferPanelForId === acc.id && (
                          <tr className="account-transfer-form-row">
                            <td colSpan={3}>
                              <div
                                className="account-transfer-panel account-transfer-panel--inline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {renderTransferFields(acc)}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="card__title">
          Categories &amp; budgets
        </h2>
        <p>
          Add <strong>expense</strong> categories with a monthly spending cap,
          or <strong>income</strong> categories for tagging deposits (no budget,
          not limited). Budget checks apply only to expenses in the current
          calendar month.
        </p>

        <h3 className="card__subtitle">Add category</h3>
        <div className="form-grid">
          <label className="field-label">
            Category name
            <input
              placeholder="e.g. Groceries or Salary"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
          </label>
          <label className="field-label">
            Category type
            <select
              value={catKind}
              onChange={(e) => setCatKind(e.target.value)}
            >
              <option value="expense">Expense (uses monthly budget)</option>
              <option value="income">Income (no budget)</option>
            </select>
          </label>
          {catKind === "expense" && (
            <label className="field-label">
              Monthly budget (max expenses)
              <input
                type="number"
                placeholder="0.00"
                min={0}
                step="any"
                value={catBudget}
                onChange={(e) => setCatBudget(e.target.value)}
              />
            </label>
          )}
          <div className="full-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={addCategory}
              disabled={catSaving}
            >
              {catSaving ? "Saving…" : "Add category"}
            </button>
          </div>
        </div>

        <h3 className="card__subtitle">Your categories</h3>
        {sortedCategories.length === 0 ? (
          <p>
            No categories yet. Add at least one so you can tag transactions and
            enforce budgets.
          </p>
        ) : (
          <>
            <p className="hint-select-row show-mobile-only">
              Tap a category to show <strong>Edit</strong> and <strong>Delete</strong>.
            </p>
            <p className="hint-select-row show-desktop-only">
              Select a row to show <strong>Edit</strong> and <strong>Delete</strong>.
            </p>

            <ul className="mobile-entity-list show-mobile-only">
              {sortedCategories.map((cat) => {
                const isIncome = getCategoryKind(cat) === "income";
                const budget = Number(cat.budget);
                const budgetStr =
                  isIncome || !Number.isFinite(budget)
                    ? "—"
                    : new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: "USD",
                      }).format(budget);
                const monthTotal = isIncome
                  ? sumIncomeForCategoryInMonth(
                      transactions,
                      cat.name,
                      now
                    )
                  : sumExpenseForCategoryInMonth(
                      transactions,
                      cat.name,
                      now
                    );
                const monthStr = new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: "USD",
                }).format(monthTotal);
                const left = !isIncome && Number.isFinite(budget)
                  ? budget - monthTotal
                  : NaN;
                const leftStr = Number.isFinite(left)
                  ? new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: "USD",
                    }).format(Math.max(0, left))
                  : "—";
                const over = !isIncome && Number.isFinite(left) && left < 0;
                const leftDisplay = over
                  ? new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: "USD",
                    }).format(left)
                  : leftStr;
                const progressPct =
                  !isIncome && Number.isFinite(budget) && budget > 0
                    ? Math.min(100, Math.max(0, (monthTotal / budget) * 100))
                    : 0;
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <li
                    key={cat.id}
                    role="button"
                    tabIndex={0}
                    className={
                      isSelected ? "mobile-entity-list__item--selected" : ""
                    }
                    onClick={() => toggleCategoryRow(cat.id)}
                    onKeyDown={(e) =>
                      rowKeyToggle(e, () => toggleCategoryRow(cat.id))
                    }
                  >
                    <div className="mobile-entity-list__main">
                      <div className="accounts-mobile__row">
                        <span className="accounts-mobile__name">
                          {cat.name}
                        </span>
                      </div>
                      <dl className="cat-mobile__stats">
                        <dt>Type</dt>
                        <dd>{isIncome ? "Income" : "Expense"}</dd>
                        <dt>Budget</dt>
                        <dd>{budgetStr}</dd>
                        <dt>{isIncome ? "Received (month)" : "Spent (month)"}</dt>
                        <dd>{monthStr}</dd>
                        <dt>Left</dt>
                        <dd className={over ? "budget-over" : ""}>
                          {isIncome ? "—" : leftDisplay}
                        </dd>
                      </dl>
                      {!isIncome && Number.isFinite(budget) ? (
                        <div className="budget-progress">
                          <div className="budget-progress__row">
                            <span>Budget usage</span>
                            <strong>{progressPct.toFixed(0)}%</strong>
                          </div>
                          <div
                            className={
                              "budget-progress__track" +
                              (over ? " budget-progress__track--over" : "")
                            }
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.min(100, progressPct)}
                            aria-label={`Budget usage for ${cat.name}`}
                          >
                            <div
                              className={
                                "budget-progress__fill" +
                                (over ? " budget-progress__fill--over" : "")
                              }
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {isSelected && (
                      <div
                        className="mobile-entity-list__actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="btn btn--secondary"
                          onClick={() => viewCategoryTransactions(cat.name)}
                        >
                          View transactions
                        </button>
                        <button
                          type="button"
                          className="btn btn--subtle"
                          onClick={() => startEditingCategory(cat)}
                        >
                          Edit category
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          onClick={() => removeCategory(cat)}
                        >
                          Delete category
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
                    <th>Category</th>
                    <th>Type</th>
                    <th className="num">Monthly budget</th>
                    <th className="num">This month</th>
                    <th className="num">Left</th>
                    <th>Usage</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {sortedCategories.map((cat) => {
                    const isIncome = getCategoryKind(cat) === "income";
                    const budget = Number(cat.budget);
                    const budgetStr =
                      isIncome || !Number.isFinite(budget)
                        ? "—"
                        : new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: "USD",
                          }).format(budget);
                    const monthTotal = isIncome
                      ? sumIncomeForCategoryInMonth(
                          transactions,
                          cat.name,
                          now
                        )
                      : sumExpenseForCategoryInMonth(
                          transactions,
                          cat.name,
                          now
                        );
                    const monthStr = new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: "USD",
                    }).format(monthTotal);
                    const left = !isIncome && Number.isFinite(budget)
                      ? budget - monthTotal
                      : NaN;
                    const leftStr = Number.isFinite(left)
                      ? new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: "USD",
                        }).format(Math.max(0, left))
                      : "—";
                    const over = !isIncome && Number.isFinite(left) && left < 0;
                    const progressPct =
                      !isIncome && Number.isFinite(budget) && budget > 0
                        ? Math.min(100, Math.max(0, (monthTotal / budget) * 100))
                        : 0;
                    const isSelected = selectedCategoryId === cat.id;
                    return (
                      <tr
                        key={cat.id}
                        className={
                          "data-row--interactive" +
                          (isSelected ? " data-row--selected" : "")
                        }
                        tabIndex={0}
                        onClick={() => toggleCategoryRow(cat.id)}
                        onKeyDown={(e) =>
                          rowKeyToggle(e, () => toggleCategoryRow(cat.id))
                        }
                      >
                        <td>{cat.name}</td>
                        <td>{isIncome ? "Income" : "Expense"}</td>
                        <td className="num">{budgetStr}</td>
                        <td className="num">{monthStr}</td>
                        <td
                          className={"num" + (over ? " budget-over" : "")}
                        >
                          {isIncome
                            ? "—"
                            : over
                              ? new Intl.NumberFormat(undefined, {
                                  style: "currency",
                                  currency: "USD",
                                }).format(left)
                              : leftStr}
                        </td>
                        <td>
                          {!isIncome && Number.isFinite(budget) ? (
                            <div className="budget-progress budget-progress--compact">
                              <div
                                className={
                                  "budget-progress__track" +
                                  (over ? " budget-progress__track--over" : "")
                                }
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.min(100, progressPct)}
                                aria-label={`Budget usage for ${cat.name}`}
                              >
                                <div
                                  className={
                                    "budget-progress__fill" +
                                    (over ? " budget-progress__fill--over" : "")
                                  }
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="budget-progress__compact-label">
                                {progressPct.toFixed(0)}%
                              </span>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {isSelected ? (
                            <div className="account-actions-row account-actions-row--compact">
                              <button
                                type="button"
                                className="btn btn--secondary"
                                style={{
                                  padding: "0.4rem 0.65rem",
                                  fontSize: "0.82rem",
                                }}
                                onClick={() => viewCategoryTransactions(cat.name)}
                              >
                                View
                              </button>
                              <button
                                type="button"
                                className="btn btn--subtle"
                                style={{
                                  padding: "0.4rem 0.65rem",
                                  fontSize: "0.82rem",
                                }}
                                onClick={() => startEditingCategory(cat)}
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
                                onClick={() => removeCategory(cat)}
                              >
                                Delete
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
        )}
      </section>
      {editingAccountId ? (
        <div
          className="txn-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-edit-title"
          onClick={closeAccountEdit}
        >
          <div
            className="txn-edit-modal__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="account-edit-title" className="card__subtitle">
              Edit account
            </h3>
            <div className="txn-edit-modal__form">
              <label className="field-label">
                Account name
                <input
                  type="text"
                  value={accountEditForm.name}
                  onChange={(e) =>
                    setAccountEditForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  disabled={accountEditSaving}
                />
              </label>
              <label className="field-label">
                Balance
                <input
                  type="number"
                  step="0.01"
                  value={accountEditForm.balance}
                  onChange={(e) =>
                    setAccountEditForm((prev) => ({
                      ...prev,
                      balance: e.target.value,
                    }))
                  }
                  disabled={accountEditSaving}
                />
              </label>
            </div>
            <p className="hint-select-row" style={{ marginTop: "0.6rem" }}>
              Changing balance creates a <strong>Balance adjustment</strong>{" "}
              transaction.
            </p>
            <div className="txn-edit-modal__actions">
              <button
                type="button"
                className="btn btn--subtle"
                onClick={closeAccountEdit}
                disabled={accountEditSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={saveAccountEdit}
                disabled={accountEditSaving}
              >
                {accountEditSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingCategoryId ? (
        <div
          className="txn-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-edit-title"
          onClick={closeCategoryEdit}
        >
          <div
            className="txn-edit-modal__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="category-edit-title" className="card__subtitle">
              Edit category
            </h3>
            <div className="txn-edit-modal__form">
              <label className="field-label">
                Category name
                <input
                  type="text"
                  value={categoryEditForm.name}
                  onChange={(e) =>
                    setCategoryEditForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  disabled={categoryEditSaving}
                />
              </label>
              <label className="field-label">
                Category type
                <select
                  value={categoryEditForm.kind}
                  onChange={(e) =>
                    setCategoryEditForm((prev) => ({
                      ...prev,
                      kind: e.target.value,
                    }))
                  }
                  disabled={categoryEditSaving}
                >
                  <option value="expense">Expense (uses monthly budget)</option>
                  <option value="income">Income (no budget)</option>
                </select>
              </label>
              {categoryEditForm.kind === "expense" ? (
                <label className="field-label">
                  Monthly budget (max expenses)
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={categoryEditForm.budget}
                    onChange={(e) =>
                      setCategoryEditForm((prev) => ({
                        ...prev,
                        budget: e.target.value,
                      }))
                    }
                    disabled={categoryEditSaving}
                  />
                </label>
              ) : null}
            </div>
            <div className="txn-edit-modal__actions">
              <button
                type="button"
                className="btn btn--subtle"
                onClick={closeCategoryEdit}
                disabled={categoryEditSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={saveCategoryEdit}
                disabled={categoryEditSaving}
              >
                {categoryEditSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
