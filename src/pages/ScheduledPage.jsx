import { useOutletContext } from "react-router-dom";
import ScheduledTransactions from "../components/ScheduledTransactions";

export default function ScheduledPage() {
  const { user } = useOutletContext();
  return <ScheduledTransactions user={user} />;
}
