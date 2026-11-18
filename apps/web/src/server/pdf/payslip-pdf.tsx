import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { getBranding, legalLine } from "../branding";
import { amountInFrenchWords, monthNameFr, type PayslipLine } from "@yghr/core";
import { prisma, fromDbDate } from "@yghr/db";

const intl = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Helvetica has no glyph for U+202F / U+00A0 (Intl thousands separators): use a plain space. */
const nf = { format: (v: number) => intl.format(v).replace(/[\u202f\u00a0]/g, " ") };
const n = (v: number | undefined | null) => (v === undefined || v === null || v === 0 ? "" : nf.format(v));
const pct = (v: number | undefined) => (v === undefined ? "" : v < 1 ? `${nf.format(v * 100)} %` : nf.format(v));
const CONTRACT: Record<string, string> = { CDI: "CDI", CDD: "CDD", INTERIM: "Intérim", STAGE: "Stage" };

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: "#14201F" },
  band: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#0B2A2F", color: "white", padding: 12, borderRadius: 6 },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  box: { border: "0.7pt solid #E6E8E3", borderRadius: 5, padding: 8, flex: 1 },
  label: { color: "#66736F", fontSize: 7 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #E6E8E3", paddingVertical: 3.5 },
  th: { flexDirection: "row", backgroundColor: "#F2F4F1", paddingVertical: 4, fontFamily: "Helvetica-Bold", fontSize: 7.5, borderBottom: "0.7pt solid #0B2A2F" },
  c1: { width: 34, paddingLeft: 4 }, c2: { flex: 1 }, c3: { width: 58, textAlign: "right" }, c4: { width: 50, textAlign: "right" }, c5: { width: 66, textAlign: "right" }, c6: { width: 66, textAlign: "right", paddingRight: 4 },
});

export async function payslipPdfBuffer(payslipId: string, organizationId: string) {
  const ps = await prisma.payslip.findFirst({ where: { id: payslipId, period: { organizationId } }, include: { period: { include: { organization: true, fiscalRuleVersion: { select: { label: true } } } }, employee: { include: { staffCategory: true, service: true } } } });
  if (!ps) return null;
  const ytd = await prisma.payslip.findMany({ where: { employeeId: ps.employeeId, period: { year: ps.period.year, month: { lte: ps.period.month } } }, select: { gross: true, net: true, ir: true, cnssEmployee: true, amoEmployee: true } });
  const cum = (k: "gross" | "net" | "ir" | "cnssEmployee" | "amoEmployee") => ytd.reduce((t, x) => t + x[k].toNumber(), 0);
  const e = ps.employee;
  const b = await getBranding(organizationId);
  const legal = legalLine(b);
  const lines = ps.lines as unknown as PayslipLine[];
  const gains = lines.reduce((t, l) => t + (l.gain ?? 0), 0);
  const deds = lines.reduce((t, l) => t + (l.deduction ?? 0), 0);
  const net = ps.net.toNumber();
  const ec = ps.employerCharges as Record<string, number>;
  const period = `${monthNameFr(ps.period.month)} ${ps.period.year}`.replace(/^./, (c) => c.toUpperCase());
  const doc = (
    <Document title={`Bulletin ${period} — ${e.lastName} ${e.firstName}`} author="YGHR">
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 360 }}>
            {b.logo && <View style={{ backgroundColor: "white", borderRadius: 4, padding: 3 }}><Image src={{ data: b.logo.data, format: b.logo.format }} style={{ width: 40, height: 40, objectFit: "contain" }} /></View>}
            <View>
              <Text style={s.h1}>{b.name}</Text>
              {!!legal && <Text style={{ marginTop: 3, opacity: 0.75, fontSize: 7.5 }}>{legal}</Text>}
              {!!b.email && <Text style={{ marginTop: 1.5, opacity: 0.75, fontSize: 7.5 }}>{b.email}</Text>}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>BULLETIN DE PAIE</Text><Text style={{ marginTop: 3, color: "#F2A541" }}>{period}</Text></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <View style={s.box}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 4 }}>{e.lastName.toUpperCase()} {e.firstName}</Text>
            {[["Matricule", e.matricule], ["N° CNSS", e.cnssNumber], ["CIN", e.cin], ["Situation familiale", `${e.familyDependents} personne(s) à charge`]].map(([k, v]) => <View key={k} style={{ flexDirection: "row", marginTop: 1.5 }}><Text style={[s.label, { width: 80 }]}>{k}</Text><Text>{v || "—"}</Text></View>)}
          </View>
          <View style={s.box}>
            {[["Poste", e.position], ["Catégorie", e.staffCategory?.name], ["Service", e.service?.name], ["Contrat", e.contractType ? CONTRACT[e.contractType] : null], ["Date d'embauche", e.hireDate ? fromDbDate(e.hireDate).split("-").reverse().join("/") : null], ["Horaire", e.weeklyHours ? `${e.weeklyHours.toNumber()} h / semaine` : null]].map(([k, v]) => <View key={k} style={{ flexDirection: "row", marginTop: 1.5 }}><Text style={[s.label, { width: 80 }]}>{k}</Text><Text>{v || "—"}</Text></View>)}
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <View style={s.th}><Text style={s.c1}>N°</Text><Text style={s.c2}>Rubrique</Text><Text style={s.c3}>Base</Text><Text style={s.c4}>Taux</Text><Text style={s.c5}>Gains</Text><Text style={s.c6}>Retenues</Text></View>
          {lines.map((l, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={[s.c1, { color: "#66736F" }]}>{l.code}</Text><Text style={s.c2}>{l.label}</Text><Text style={s.c3}>{n(l.base)}</Text><Text style={s.c4}>{pct(l.rate)}</Text><Text style={s.c5}>{n(l.gain)}</Text><Text style={s.c6}>{n(l.deduction)}</Text>
            </View>
          ))}
          <View style={[s.row, { fontFamily: "Helvetica-Bold", borderBottom: "0.7pt solid #0B2A2F" }]}><Text style={s.c1} /><Text style={s.c2}>Totaux</Text><Text style={s.c3} /><Text style={s.c4} /><Text style={s.c5}>{n(gains)}</Text><Text style={s.c6}>{n(deds)}</Text></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={[s.box, { flex: 1.3 }]}>
            <Text style={[s.label, { marginBottom: 3 }]}>RÉCAPITULATIF</Text>
            {[["Salaire brut imposable", ps.gross.toNumber()], ["Frais professionnels", ps.profExpenses.toNumber()], ["Net imposable", ps.taxableNet.toNumber()], ["IR brut", ps.irGross.toNumber()], ["Déductions charges de famille", ps.familyDeduction.toNumber()]].map(([k, v]) => <View key={k as string} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 1.5 }}><Text>{k as string}</Text><Text>{nf.format(v as number)}</Text></View>)}
          </View>
          <View style={[s.box]}>
            <Text style={[s.label, { marginBottom: 3 }]}>CUMULS ANNUELS {ps.period.year}</Text>
            {[["Brut", cum("gross")], ["CNSS", cum("cnssEmployee")], ["AMO", cum("amoEmployee")], ["IR", cum("ir")], ["Net", cum("net")]].map(([k, v]) => <View key={k as string} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 1.5 }}><Text>{k as string}</Text><Text>{nf.format(v as number)}</Text></View>)}
          </View>
        </View>
        <View style={{ marginTop: 12, backgroundColor: "#E3F4F5", borderRadius: 6, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>NET À PAYER</Text>
            <Text style={{ marginTop: 3, fontSize: 7.5, color: "#0F4C55" }}>Arrêté le présent bulletin à la somme de : {amountInFrenchWords(net)}.</Text>
          </View>
          <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold", color: "#0B2A2F" }}>{nf.format(net)} DH</Text>
        </View>
        <View style={{ marginTop: 10 }}>
          <Text style={s.label}>Charges patronales (pour information) : CNSS {nf.format(ec.cnss ?? 0)} · Allocations familiales {nf.format(ec.familyAllowance ?? 0)} · AMO {nf.format((ec.amo ?? 0) + (ec.amoSolidarity ?? 0))} · IPE {nf.format(ec.ipe ?? 0)} · Taxe formation professionnelle {nf.format(ec.trainingTax ?? 0)} — Total {nf.format(ec.total ?? 0)} DH</Text>
        </View>
        <Text style={{ position: "absolute", bottom: 18, left: 28, right: 28, fontSize: 6.5, color: "#66736F", textAlign: "center" }}>Règles fiscales appliquées : {ps.period.fiscalRuleVersion.label ?? "version en vigueur"}. Conservez ce bulletin sans limitation de durée. Édité par YGHR.</Text>
      </Page>
    </Document>
  );
  return { buffer: await renderToBuffer(doc), filename: `bulletin-${ps.period.year}-${String(ps.period.month).padStart(2, "0")}-${(e.matricule ?? e.lastName).toLowerCase()}.pdf`, employeeId: e.id, periodStatus: ps.period.status };
}
