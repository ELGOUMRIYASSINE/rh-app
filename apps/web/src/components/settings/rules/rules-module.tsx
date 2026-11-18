"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CalendarClock, History, Layers, Repeat2, Scale, ScanSearch, Users2 } from "lucide-react";
import { buttonVariants, TabPanel, Tabs } from "@yghr/ui";
import type { CategoryRow, CoverageRow, RotationRow, RuleRow, ServiceRow, ShiftRow } from "./types";
import { RulesTab } from "./rules-tab";
import { ShiftTypesTab } from "./shift-types-tab";
import { CategoriesTab } from "./categories-tab";
import { RotationsTab } from "./rotations-tab";
import { CoverageTab } from "./coverage-tab";
import { AnomaliesTab } from "./anomalies-tab";
import { HistoryTab } from "./history-tab";

export interface RulesData {
  rules: RuleRow[];
  shiftTypes: ShiftRow[];
  categories: CategoryRow[];
  services: ServiceRow[];
  coverage: CoverageRow[];
  rotations: RotationRow[];
  employees: { id: string; firstName: string; lastName: string }[];
  today: string;
}

export function RulesModule({ base, initialTab, ...data }: RulesData & { base: string; initialTab: string }) {
  const [tab, setTab] = useState(initialTab);
  const router = useRouter();
  const pathname = usePathname();
  const change = (t: string) => {
    setTab(t);
    router.replace(`${pathname}?tab=${t}`, { scroll: false });
  };
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href={`${base}/settings`} className={buttonVariants({ variant: "secondary", size: "sm" })}><ArrowLeft /> Paramètres</Link>
        <nav aria-label="Fil d'Ariane" className="text-sm text-muted">Paramètres RH <span className="mx-1">›</span> <span className="text-text">Règles de travail</span></nav>
      </div>
      <h1 className="mb-1 font-display text-[26px] font-bold">Règles des shifts</h1>
      <p className="mb-5 text-sm text-muted">Ce que le planning doit respecter : durées, repos, nuits, couverture et rotations.</p>
      <Tabs
        value={tab}
        onValueChange={change}
        tabs={[
          { value: "rules", label: "Règles", icon: <Scale />, count: data.rules.length },
          { value: "shifts", label: "Types de shifts", icon: <CalendarClock />, count: data.shiftTypes.length },
          { value: "categories", label: "Catégories de personnel", icon: <Users2 /> },
          { value: "rotations", label: "Rotations", icon: <Repeat2 /> },
          { value: "coverage", label: "Couverture", icon: <Layers /> },
          { value: "anomalies", label: "Anomalies", icon: <ScanSearch /> },
          { value: "history", label: "Historique", icon: <History /> },
        ]}
      >
        <div className="mt-5">
          <TabPanel value="rules"><RulesTab {...data} /></TabPanel>
          <TabPanel value="shifts"><ShiftTypesTab {...data} /></TabPanel>
          <TabPanel value="categories"><CategoriesTab {...data} /></TabPanel>
          <TabPanel value="rotations"><RotationsTab {...data} /></TabPanel>
          <TabPanel value="coverage"><CoverageTab {...data} /></TabPanel>
          <TabPanel value="anomalies"><AnomaliesTab today={data.today} /></TabPanel>
          <TabPanel value="history"><HistoryTab active={tab === "history"} /></TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
