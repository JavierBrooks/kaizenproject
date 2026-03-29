/** Routes and labels for primary app navigation */
export const APP_NAV_ITEMS = [
  { to: "/", end: true, label: "Home", shortLabel: "Home", icon: "⌂" },
  {
    to: "/accounts",
    label: "Accounts",
    shortLabel: "Accounts",
    icon: "◎",
  },
  {
    to: "/transactions/new",
    label: "Add transaction",
    shortLabel: "Add",
    icon: "+",
  },
  {
    to: "/transactions",
    label: "Transactions",
    shortLabel: "List",
    icon: "≡",
  },
];
