export interface NavItem {
  href: string;
  label: string;
  icon: "gauge" | "search" | "history" | "compare" | "link" | "building" | "coins" | "wallet" | "users" | "settings" | "shield";
  admin?: boolean;
}

export const APP_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "gauge" },
  { href: "/scan", label: "Scan a job", icon: "search" },
  { href: "/scans", label: "Scan history", icon: "history" },
  { href: "/compare", label: "Compare", icon: "compare" },
  { href: "/tools/url", label: "Link checker", icon: "link" },
  { href: "/tools/company", label: "Company check", icon: "building" },
  { href: "/tools/salary", label: "Salary check", icon: "coins" },
  { href: "/tools/payment", label: "Payment check", icon: "wallet" },
  { href: "/community", label: "Community reports", icon: "users" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/admin", label: "Admin", icon: "shield", admin: true },
];

export const PUBLIC_NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/demo", label: "Try a quick check" },
  { href: "/community", label: "Community reports" },
];
