import { useOutletContext } from "react-router-dom";
import TransactionList from "../components/TransactionList";

export default function TransactionListPage() {
  const { user } = useOutletContext();
  return <TransactionList user={user} />;
}
