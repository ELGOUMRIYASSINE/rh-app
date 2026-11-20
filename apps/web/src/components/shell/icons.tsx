import {
  BarChart3, Building2, CalendarCheck2, CalendarDays, CalendarRange, CircleUserRound, Coins, Fingerprint, FolderOpen, Home,
  LayoutDashboard, LifeBuoy, MessagesSquare, PenLine, Receipt, ScrollText, Settings, Tablet, UserCheck, Users, Wallet, UsersRound,
} from "lucide-react";
import type { IconName } from "./nav";

export const NAV_ICONS: Record<IconName, typeof Home> = {
  dashboard: LayoutDashboard, reports: BarChart3, employees: Users, planning: CalendarRange, leaves: CalendarCheck2,
  attendance: UserCheck, devices: Fingerprint, tablets: Tablet, payroll: Wallet, advances: Coins, expenses: Receipt,
  audit: ScrollText, settings: Settings, signature: PenLine, messages: MessagesSquare, structure: Building2, support: LifeBuoy,
  availability: CalendarDays, documents: FolderOpen, profile: CircleUserRound, home: Home, team: UsersRound,
};
