import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import {
  formatTransactionDate,
  transactionSortKey,
  money,
  fetchUserTransactions,
} from "../utils/transactionHelpers";

export default function TransactionList({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);

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

  useEffect(() => {
    if (!user) return;
    loadAccounts();
    loadTransactions();
  }, [user]);

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
          const delta = t.type === "income" ? -amountNum : amountNum;
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

  const accountNameById = Object.fromEntries(
    accounts.map((a) => [a.id, a.name])
  );

  const sortedForDisplay = [...transactions].sort(
    (a, b) =>
      transactionSortKey(b.createdAt) - transactionSortKey(a.createdAt)
  );

  return (
    <section className="card" aria-labelledby="txn-list-heading">
      <h2 id="txn-list-heading" className="card__title">
        Transactions
      </h2>
      {sortedForDisplay.length === 0 ? (
        <p>No transactions yet.</p>
      ) : (
        <>
          <p className="hint-select-row show-mobile-only">
            Tap a transaction to show <strong>Remove</strong>.
          </p>
          <p className="hint-select-row show-desktop-only">
            Select a row to show <strong>Remove</strong>.
          </p>

          <ul className="mobile-entity-list show-mobile-only">
            {sortedForDisplay.map((t) => {
              const isIncome = t.type === "income";
              const amountNum = Number(t.amount);
              const amountStr = `${isIncome ? "+" : "−"}${money(amountNum)}`;
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
                    <div className="txn-mobile__row">
                      <span>{formatTransactionDate(t.createdAt)}</span>
                      <span className="txn-mobile__amount">{amountStr}</span>
                    </div>
                    <div className="txn-mobile__meta">
                      {isIncome ? "Income" : "Expense"} ·{" "}
                      {accountNameById[t.accountId] ?? "—"}
                    </div>
                  </div>
                  {isSelected && (
                    <div
                      className="mobile-entity-list__actions"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                  <th>Date</th>
                  <th>Type</th>
                  <th>Account</th>
                  <th className="num">Amount</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sortedForDisplay.map((t) => {
                  const isIncome = t.type === "income";
                  const amountNum = Number(t.amount);
                  const amountStr = `${isIncome ? "+" : "−"}${money(amountNum)}`;
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
                      <td>{formatTransactionDate(t.createdAt)}</td>
                      <td>{isIncome ? "Income" : "Expense"}</td>
                      <td>{accountNameById[t.accountId] ?? "—"}</td>
                      <td className="num">{amountStr}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isSelected ? (
                          <button
                            type="button"
                            className="btn btn--danger"
                            style={{
                              padding: "0.4rem 0.65rem",
                              fontSize: "0.82rem",
                            }}
                            onClick={() => removeTransaction(t)}
                            disabled={busy || deletingId !== null}
                            aria-label={`Remove transaction on ${formatTransactionDate(t.createdAt)}`}
                          >
                            {busy ? "…" : "Remove"}
                          </button>
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
  );
}
