import {
  transactionToDate,
  getCategoryKind,
  sumExpenseForCategoryInMonth,
} from "./categoryBudget";
import { convertAmount, normalizeCurrency } from "./currency";

export function getMonthBounds(referenceDate = new Date()) {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  return {
    start: new Date(y, m, 1, 0, 0, 0, 0),
    end: new Date(y, m + 1, 0, 23, 59, 59, 999),
  };
}

export function monthLabel(referenceDate = new Date()) {
  return referenceDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function isDateInRange(d, start, end) {
  return d >= start && d <= end;
}

/**
 * Per-account income, expense, and net for the calendar month (in each account’s currency).
 */
export function cashFlowByAccountForMonth(
  accounts,
  transactions,
  referenceDate = new Date()
) {
  const { start, end } = getMonthBounds(referenceDate);
  const byId = Object.fromEntries(
    accounts.map((a) => [
      a.id,
      {
        ...a,
        income: 0,
        expense: 0,
      },
    ])
  );

  for (const t of transactions) {
    const aid = t.accountId;
    if (!aid || !byId[aid]) continue;
    const d = transactionToDate(t.createdAt);
    if (!d || !isDateInRange(d, start, end)) continue;

    const accCur = normalizeCurrency(byId[aid].currency);
    const txCur = normalizeCurrency(t.currency);
    const amt = convertAmount(Number(t.amount), txCur, accCur);
    if (t.type === "income") byId[aid].income += amt;
    else if (t.type === "expense") byId[aid].expense += amt;
  }

  return accounts.map((a) => {
    const row = byId[a.id];
    return {
      accountId: a.id,
      name: String(row.name ?? ""),
      currency: normalizeCurrency(row.currency),
      income: row.income,
      expense: row.expense,
      net: row.income - row.expense,
    };
  });
}

/** Sum of account balances converted to USD (balance sheet / total assets). */
export function totalAssetsUsd(accounts) {
  let total = 0;
  for (const a of accounts) {
    const bal = Number(a.balance) || 0;
    const cur = normalizeCurrency(a.currency);
    total += convertAmount(bal, cur, "USD");
  }
  return total;
}

/**
 * Top expense categories by total amount in the month (converted to reporting currency).
 */
export function topExpenseCategoriesForMonth(
  transactions,
  reportingCurrency = "USD",
  referenceDate = new Date(),
  limit = 5
) {
  const { start, end } = getMonthBounds(referenceDate);
  const sums = {};

  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const d = transactionToDate(t.createdAt);
    if (!d || !isDateInRange(d, start, end)) continue;
    const name = String(t.category ?? "").trim();
    if (!name) continue;
    const txCur = normalizeCurrency(t.currency);
    const amt = convertAmount(Number(t.amount), txCur, reportingCurrency);
    sums[name] = (sums[name] ?? 0) + amt;
  }

  return Object.entries(sums)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/**
 * Month-level income, expenses, and net in one reporting currency (whole wallet).
 */
export function wholeWalletCashFlowForMonth(
  transactions,
  reportingCurrency = "USD",
  referenceDate = new Date()
) {
  const { start, end } = getMonthBounds(referenceDate);
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    const d = transactionToDate(t.createdAt);
    if (!d || !isDateInRange(d, start, end)) continue;
    const txCur = normalizeCurrency(t.currency);
    const amt = convertAmount(Number(t.amount), txCur, reportingCurrency);
    if (t.type === "income") income += amt;
    else if (t.type === "expense") expense += amt;
  }
  return { income, expense, net: income - expense };
}

/**
 * Expense categories with a monthly budget: spent vs budget in the category’s currency.
 */
export function budgetVsActualForMonth(
  transactions,
  categories,
  referenceDate = new Date()
) {
  const rows = [];
  for (const c of categories) {
    if (getCategoryKind(c) !== "expense") continue;
    const budget = Number(c.budget);
    if (!Number.isFinite(budget) || budget < 0) continue;
    const name = String(c.name ?? "").trim();
    if (!name) continue;
    const cur = normalizeCurrency(c.currency);
    const spent = sumExpenseForCategoryInMonth(
      transactions,
      name,
      referenceDate,
      cur
    );
    const over = spent > budget + 1e-9;
    const pctOfBudget =
      budget > 1e-9 ? (spent / budget) * 100 : spent > 0 ? 100 : 0;
    rows.push({
      category: name,
      budget,
      spent,
      remaining: budget - spent,
      currency: cur,
      pctOfBudget,
      barWidthPct: Math.min(pctOfBudget, 100),
      over,
    });
  }
  rows.sort((a, b) => {
    if (a.over !== b.over) return a.over ? -1 : 1;
    return a.category.localeCompare(b.category, undefined, {
      sensitivity: "base",
    });
  });
  return rows;
}
