import { BuildingIcon, CoinsIcon, CompareIcon, GaugeIcon, HistoryIcon, LinkIcon, SearchIcon, SettingsIcon, ShieldIcon, UsersIcon, WalletIcon } from "@/components/ui/icons";
import type { NavItem } from "./nav-items";

const MAP = {
  gauge: GaugeIcon,
  search: SearchIcon,
  history: HistoryIcon,
  compare: CompareIcon,
  link: LinkIcon,
  building: BuildingIcon,
  coins: CoinsIcon,
  wallet: WalletIcon,
  users: UsersIcon,
  settings: SettingsIcon,
  shield: ShieldIcon,
} as const;

export function NavIcon({ name, className }: { name: NavItem["icon"]; className?: string }) {
  const I = MAP[name];
  return <I className={className} />;
}
