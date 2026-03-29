import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { money, fetchUserTransactions } from "../utils/transactionHelpers";
import {
  fetchUserCategories,
  evaluateExpenseAgainstBudget,
  getCategoryKind,
} from "../utils/categoryBudget";

export default function AddTransaction({ user }) {
  const navigate = useNavigate();
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");

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

  useEffect(() => {
    if (!user) return;
    loadAccounts();
    loadCategories();
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

  const addTransaction = async () => {
    if (!desc || !amount) return alert("Fill all fields");
    if (!selectedAccount) return alert("Select account");

    if (categoriesForType.length === 0) {
      alert(
        type === "income"
          ? "Create at least one income category on the Accounts page before adding income."
          : "Create at least one expense category on the Accounts page before adding expenses."
      );
      return;
    }
    if (!category) return alert("Select a category.");

    const userId = user.uid;
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      alert("Enter a valid amount.");
      return;
    }

    if (type === "expense") {
      const catMeta = categories.find((c) => c.name === category);
      if (!catMeta || getCategoryKind(catMeta) !== "expense") {
        alert("Choose an expense category for this transaction.");
        return;
      }
      const budgetVal = catMeta ? Number(catMeta.budget) : NaN;
      if (Number.isFinite(budgetVal) && budgetVal >= 0) {
        const txns = await fetchUserTransactions(db, userId);
        const { blocked, message } = evaluateExpenseAgainstBudget(
          txns,
          category,
          budgetVal,
          parsedAmount,
          new Date()
        );
        if (blocked) {
          alert(message);
          return;
        }
      }
    }

    await addDoc(collection(db, "users", userId, "transactions"), {
      desc,
      amount: parsedAmount,
      type,
      category,
      accountId: selectedAccount,
      createdAt: serverTimestamp(),
    });

    const accountRef = doc(db, "users", userId, "accounts", selectedAccount);
    const accountSnap = await getDoc(accountRef);

    const currentBalance = accountSnap.data().balance || 0;

    const newBalance =
      type === "income"
        ? currentBalance + parsedAmount
        : currentBalance - parsedAmount;

    await updateDoc(accountRef, { balance: newBalance });

    await loadAccounts();

    setDesc("");
    setAmount("");
    setSelectedAccount("");
    navigate("/transactions");
  };

  return (
    <section className="card" aria-labelledby="add-txn-heading">
      <h2 id="add-txn-heading" className="card__title">
        Add transaction
      </h2>
      <p>Record income or debits against one of your accounts.</p>

      {categories.length === 0 ? (
        <p>
          You need at least one category before adding a transaction.{" "}
          <Link to="/accounts">Go to Accounts</Link> to create expense
          categories (with budgets) and income categories (no budget).
        </p>
      ) : categoriesForType.length === 0 ? (
        <p>
          No {type === "income" ? "income" : "expense"} categories yet.{" "}
          <Link to="/accounts">Go to Accounts</Link> and add one under{" "}
          <strong>Add category</strong>.
        </p>
      ) : (
        <div className="form-grid form-grid--tight">
          <label className="field-label">
            Description
            <input
              placeholder="Coffee, paycheck…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>
          <label className="field-label">
            Amount
            <input
              type="number"
              min={0}
              step="any"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="field-label">
            Account
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              <option value="">Select account</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({money(acc.balance)})
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </label>
          <label className="field-label">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoriesForType.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="full-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={addTransaction}
            >
              Add transaction
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
