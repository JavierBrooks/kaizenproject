import { useEffect, useRef } from "react";
import { db } from "../firebase";
import { fetchScheduledTransactions } from "../utils/scheduledTransactions";
import {
  checkScheduledAndMaybeNotify,
  getNotificationPermissionState,
} from "../utils/scheduledReminders";

const POLL_MS = 60 * 1000;

/**
 * Polls scheduled transactions and shows browser notifications when permission is granted.
 * Only runs while the user is signed in. Checks on an interval and when the tab gains focus.
 */
export function useScheduledReminders(user) {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    let intervalId;

    const run = async () => {
      if (!mounted.current) return;
      if (getNotificationPermissionState() !== "granted") return;
      try {
        const list = await fetchScheduledTransactions(db, user.uid);
        if (!mounted.current) return;
        checkScheduledAndMaybeNotify(list);
      } catch {
        /* ignore */
      }
    };

    run();
    intervalId = setInterval(run, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    const onGranted = () => run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    window.addEventListener("kaizen-notif-granted", onGranted);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
      window.removeEventListener("kaizen-notif-granted", onGranted);
    };
  }, [user?.uid]);
}
