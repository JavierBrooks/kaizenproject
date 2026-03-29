import { useOutletContext } from "react-router-dom";
import Dashboard from "../components/Dashboard";

export default function DashboardPage() {
  const { user } = useOutletContext();
  return <Dashboard user={user} />;
}
