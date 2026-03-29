import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

export function formatTransactionDate(createdAt) {
  if (!createdAt) return "—";
  const d =
    typeof createdAt.toDate === "function"
      ? createdAt.toDate()
      : new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function transactionSortKey(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === "function") return createdAt.toMillis();
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  const t = new Date(createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function money(n) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(Number(n)));
}

export async function fetchUserTransactions(db, userId) {
  const col = collection(db, "users", userId, "transactions");
  let snapshot;
  try {
    snapshot = await getDocs(query(col, orderBy("createdAt", "desc")));
  } catch {
    snapshot = await getDocs(col);
  }

  const data = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  data.sort(
    (a, b) =>
      transactionSortKey(b.createdAt) - transactionSortKey(a.createdAt)
  );
  return data;
}
