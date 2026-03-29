import { useOutletContext } from "react-router-dom";
import AddTransaction from "../components/AddTransaction";

export default function AddTransactionPage() {
  const { user } = useOutletContext();
  return <AddTransaction user={user} />;
}
