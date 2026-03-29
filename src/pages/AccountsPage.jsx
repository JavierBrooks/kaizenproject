import { useOutletContext } from "react-router-dom";
import Accounts from "../components/Accounts";

export default function AccountsPage() {
  const { user } = useOutletContext();
  return <Accounts user={user} />;
}
