import {
  collection,
  getDocs,
  doc,
  writeBatch,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { convertAmount, normalizeCurrency } from "./currency";

/** Max postings per schedule in one run (catch-up for missed opens). */
export const MAX_CATCH_UP_PER_SCHEDULE = 24;

export function computeNextRunAfter(fromDate, frequency) {
  const d = new Date(fromDate.getTime());
  if (frequency === "daily") {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (frequency === "weekly") {
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (frequency === "monthly") {
    const day = d.getDate();
    d.setMonth(d.getMonth() + 1);
    if (d.getDate() !== day) d.setDate(0);
    return d;
  }
  return d;
}

function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  const t = new Date(ts);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** Localized date + time for scheduled `nextRunAt` display. */
export function formatScheduledRunAt(ts) {
  if (!ts) return "—";
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function fetchScheduledTransactions(db, userId) {
  const col = collection(db, "users", userId, "scheduledTransactions");
  const snap = await getDocs(col);
  const list = snap.docs.map((s) => ({ id: s.id, ...s.data() }));
  list.sort((a, b) => {
    const ta = a.nextRunAt?.toMillis?.() ?? 0;
    const tb = b.nextRunAt?.toMillis?.() ?? 0;
    return ta - tb;
  });
  return list;
}

/**
 * Creates real transactions and updates balances for due schedules.
 * Run after sign-in (e.g. from Dashboard or Scheduled page).
 */
export async function processDueScheduledTransactions(db, userId) {
  const list = await fetchScheduledTransactions(db, userId);
  const now = Date.now();
  let applied = 0;

  for (const sch of list) {
    if (!sch.enabled) continue;

    let cursor = toDate(sch.nextRunAt);
    if (!cursor || cursor.getTime() > now) continue;

    let iterations = 0;

    while (cursor.getTime() <= now && iterations < MAX_CATCH_UP_PER_SCHEDULE) {
      iterations += 1;

      if (sch.scheduleType === "recurring" && !sch.frequency) break;

      const accountRef = doc(db, "users", userId, "accounts", sch.accountId);
      const accSnap = await getDoc(accountRef);
      if (!accSnap.exists()) break;

      const accCur = normalizeCurrency(accSnap.data().currency);
      const txCur = normalizeCurrency(sch.currency);
      const amount = Number(sch.amount) || 0;
      const amountInAcc = convertAmount(amount, txCur, accCur);
      const currentBalance = Number(accSnap.data().balance) || 0;
      const newBalance =
        sch.type === "income"
          ? currentBalance + amountInAcc
          : currentBalance - amountInAcc;

      const txnCol = collection(db, "users", userId, "transactions");
      const txnRef = doc(txnCol);
      const batch = writeBatch(db);

      batch.set(txnRef, {
        desc: String(sch.desc ?? "").slice(0, 500),
        amount,
        currency: txCur,
        type: sch.type,
        category: String(sch.category ?? ""),
        accountId: sch.accountId,
        createdAt: Timestamp.fromDate(cursor),
      });
      batch.update(accountRef, { balance: newBalance });

      if (sch.scheduleType === "once") {
        const schRef = doc(db, "users", userId, "scheduledTransactions", sch.id);
        batch.delete(schRef);
        await batch.commit();
        applied += 1;
        break;
      }

      const nextD = computeNextRunAfter(cursor, sch.frequency);
      const schRef = doc(db, "users", userId, "scheduledTransactions", sch.id);
      batch.update(schRef, {
        nextRunAt: Timestamp.fromDate(nextD),
        lastRunAt: Timestamp.fromDate(cursor),
      });
      await batch.commit();
      applied += 1;
      cursor = nextD;
    }
  }

  return applied;
}
