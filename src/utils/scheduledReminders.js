/** Browser Notification API; runs while this tab/PWA can execute JS. */
import { formatMoneyAmount, normalizeCurrency } from "./currency";

const STORAGE_KEY = "kaizen-sched-reminder-dedupe-v1";
const MAX_KEYS = 120;
const DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatWhen(d) {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sameLocalCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadDedupe() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveDedupe(entries) {
  if (typeof localStorage === "undefined") return;
  const now = Date.now();
  let filtered = Object.fromEntries(
    Object.entries(entries).filter(
      ([, ts]) => typeof ts === "number" && now - ts < DEDUPE_TTL_MS
    )
  );
  const keys = Object.keys(filtered);
  if (keys.length > MAX_KEYS) {
    keys.sort((a, b) => filtered[b] - filtered[a]);
    filtered = Object.fromEntries(
      keys.slice(0, MAX_KEYS).map((k) => [k, filtered[k]])
    );
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

function reminderBody(schedule, next) {
  const desc =
    schedule.desc != null && String(schedule.desc).trim() !== ""
      ? String(schedule.desc).trim()
      : "Scheduled transaction";
  const amt = formatMoneyAmount(
    Number(schedule.amount) || 0,
    normalizeCurrency(schedule.currency)
  );
  return `${desc} · ${amt} · ${formatWhen(next)}`;
}

export function notificationsSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    typeof Notification.requestPermission === "function"
  );
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function getNotificationPermissionState() {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Show at most one notification per dedupe key. Requires Notification.permission === "granted".
 * Fires when: due/overdue window, within 60 minutes, or same local calendar day (future run).
 */
export function checkScheduledAndMaybeNotify(schedules) {
  if (typeof window === "undefined") return;
  if (!notificationsSupported() || Notification.permission !== "granted") return;

  const now = new Date();
  const dedupe = loadDedupe();

  for (const s of schedules) {
    if (!s.enabled) continue;
    const next = toDate(s.nextRunAt);
    if (!next) continue;

    const msToGo = next.getTime() - now.getTime();
    const body = reminderBody(s, next);

    if (msToGo <= 0 && msToGo > -3 * 60 * 60 * 1000) {
      const key = `due-${s.id}-${next.getTime()}`;
      if (dedupe[key]) continue;
      new Notification("Scheduled payment due", {
        body,
        tag: `kaizen-sched-${s.id}`,
      });
      dedupe[key] = Date.now();
      continue;
    }

    if (msToGo > 0 && msToGo <= 60 * 60 * 1000) {
      const key = `soon-${s.id}-${next.getTime()}`;
      if (dedupe[key]) continue;
      new Notification("Scheduled payment soon", {
        body,
        tag: `kaizen-sched-${s.id}-soon`,
      });
      dedupe[key] = Date.now();
      continue;
    }

    if (msToGo > 0 && sameLocalCalendarDay(next, now)) {
      const key = `day-${s.id}-${dateKey(next)}`;
      if (dedupe[key]) continue;
      new Notification("Scheduled payment today", {
        body,
        tag: `kaizen-sched-${s.id}-day`,
      });
      dedupe[key] = Date.now();
    }
  }

  saveDedupe(dedupe);
}
