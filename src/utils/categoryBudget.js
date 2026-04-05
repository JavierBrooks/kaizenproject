import { collection, getDocs } from "firebase/firestore";
import { convertAmount, formatMoneyAmount, normalizeCurrency } from "./currency";

export function transactionToDate(createdAt) {
  if (!createdAt) return null;
  if (typeof createdAt.toDate === "function") return createdAt.toDate();
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a month filter value from `<input type="month">` ("YYYY-MM").
 * @returns {{ anchor: Date, label: string } | null}
 */
export function parseMonthFilter(filterMonthValue) {
  if (!filterMonthValue || typeof filterMonthValue !== "string") return null;
  const parts = filterMonthValue.split("-").map(Number);
  const y = parts[0];
  const mo = parts[1];
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    mo < 1 ||
    mo > 12
  ) {
    return null;
  }
  const anchor = new Date(y, mo - 1, 1, 12, 0, 0, 0);
  const label = anchor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return { anchor, label };
}

/** @returns {"income" | "expense"} */
export function getCategoryKind(cat) {
  if (cat && cat.kind === "income") return "income";
  return "expense";
}

/** Sum income amounts for a category within the calendar month of referenceDate. */
export function sumIncomeForCategoryInMonth(
  transactions,
  categoryName,
  referenceDate = new Date(),
  categoryCurrency = "USD"
) {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);

  const target = normalizeCurrency(categoryCurrency);
  let sum = 0;
  for (const t of transactions) {
    if (t.type !== "income") continue;
    if (String(t.category) !== String(categoryName)) continue;
    const d = transactionToDate(t.createdAt);
    if (!d || d < start || d > end) continue;
    const txCur = normalizeCurrency(t.currency);
    const amt = convertAmount(Number(t.amount), txCur, target);
    sum += amt;
  }
  return sum;
}

/** Sum expense amounts for a category within the calendar month of referenceDate. */
export function sumExpenseForCategoryInMonth(
  transactions,
  categoryName,
  referenceDate = new Date(),
  categoryCurrency = "USD"
) {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);

  const target = normalizeCurrency(categoryCurrency);
  let sum = 0;
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (String(t.category) !== String(categoryName)) continue;
    const d = transactionToDate(t.createdAt);
    if (!d || d < start || d > end) continue;
    const txCur = normalizeCurrency(t.currency);
    const amt = convertAmount(Number(t.amount), txCur, target);
    sum += amt;
  }
  return sum;
}

export async function fetchUserCategories(db, userId) {
  const snapshot = await getDocs(
    collection(db, "users", userId, "categories")
  );
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * @returns {{ blocked: boolean, spent: number, budget: number, remaining: number, message?: string }}
 */
export function evaluateExpenseAgainstBudget(
  transactions,
  categoryName,
  monthlyBudget,
  additionalExpenseAmount,
  referenceDate = new Date(),
  categoryCurrency = "USD"
) {
  const budget = Number(monthlyBudget);
  if (!Number.isFinite(budget) || budget < 0) {
    return {
      blocked: false,
      spent: 0,
      budget: 0,
      remaining: Infinity,
    };
  }

  const catCur = normalizeCurrency(categoryCurrency);
  const spent = sumExpenseForCategoryInMonth(
    transactions,
    categoryName,
    referenceDate,
    catCur
  );
  const after = spent + additionalExpenseAmount;
  const remaining = Math.max(0, budget - spent);

  if (after > budget + 1e-9) {
    const fmt = (n) => formatMoneyAmount(n, catCur);
    return {
      blocked: true,
      spent,
      budget,
      remaining,
      message:
        `This expense would put "${categoryName}" over its monthly budget.\n\n` +
        `Spent this month: ${fmt(spent)}\n` +
        `Budget: ${fmt(budget)}\n` +
        `Remaining before this charge: ${fmt(remaining)}\n` +
        `This transaction was not saved.`,
    };
  }

  return { blocked: false, spent, budget, remaining: budget - after };
}
