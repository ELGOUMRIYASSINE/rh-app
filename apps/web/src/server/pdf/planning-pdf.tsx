import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Branding } from "../branding";
import { eachDay, formatLongDateFr, isoWeek, shiftDurationMinutes, weekday } from "@yghr/core";
import type { PlanningData } from "../planning";

const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const s = StyleSheet.create({
  page: { padding: 22, fontSize: 7.5, fontFamily: "Helvetica", color: "#14201F" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10, borderBottom: "2pt solid #0B2A2F", paddingBottom: 6 },
  brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#0B2A2F" },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #E6E8E3", minHeight: 18, alignItems: "stretch" },
  name: { width: 120, padding: 3, justifyContent: "center" },
  cell: { flex: 1, padding: 2, borderLeft: "0.5pt solid #E6E8E3", justifyContent: "center", alignItems: "center" },
  th: { backgroundColor: "#F2F4F1", fontFamily: "Helvetica-Bold", fontSize: 7 },
  chip: { borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1.5, color: "white", fontFamily: "Helvetica-Bold", fontSize: 6.5 },
  total: { width: 40, padding: 2, borderLeft: "0.5pt solid #E6E8E3", justifyContent: "center", alignItems: "flex-end" },
  foot: { position: "absolute", bottom: 12, left: 22, right: 22, flexDirection: "row", justifyContent: "space-between", color: "#66736F", fontSize: 6.5 },
});

export async function planningPdf(b: Branding, data: PlanningData) {
  const days = eachDay(data.from, data.to);
  const st = new Map(data.shiftTypes.map((x) => [x.id, x]));
  const doc = (
    <Document title={`Planning ${data.from} — ${data.to}`} author="YGHR">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.head} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {b.logo && <Image src={{ data: b.logo.data, format: b.logo.format }} style={{ width: 30, height: 30, objectFit: "contain" }} />}
            <View>
            <Text style={s.brand}>{b.name}</Text>
            <Text style={{ color: "#66736F", marginTop: 2 }}>Planning du {formatLongDateFr(data.from)} au {formatLongDateFr(data.to)} · S{isoWeek(data.from).week}</Text>
            </View>
          </View>
          <Text style={{ color: "#66736F" }}>Imprimé le {new Date().toLocaleDateString("fr-FR")}</Text>
        </View>
        <View style={[s.row, s.th]} fixed>
          <View style={s.name}><Text>Salarié</Text></View>
          {days.map((d) => <View key={d} style={[s.cell, weekday(d) % 6 === 0 ? { backgroundColor: "#ECEEEA" } : {}]}><Text>{DAYS[weekday(d)]} {Number(d.slice(8))}</Text></View>)}
          <View style={s.total}><Text>Total</Text></View>
        </View>
        {data.employees.map((e) => {
          let minutes = 0;
          return (
            <View key={e.id} style={s.row} wrap={false}>
              <View style={s.name}><Text style={{ fontFamily: "Helvetica-Bold" }}>{e.lastName} {e.firstName}</Text><Text style={{ color: "#66736F", fontSize: 6 }}>{e.category ?? ""}</Text></View>
              {days.map((d) => {
                const leave = data.leaves.find((l) => l.employeeId === e.id && l.startDate <= d && l.endDate >= d);
                const a = data.assignments.find((x) => x.employeeId === e.id && x.date === d && !x.leaveRequestId);
                const t = a?.shiftTypeId ? st.get(a.shiftTypeId) : undefined;
                if (a && (t || a.customStart)) minutes += shiftDurationMinutes({ startTime: a.customStart ?? t!.startTime, endTime: a.customEnd ?? t!.endTime, breakMinutes: a.breakMinutes ?? t?.breakMinutes ?? 0, breakPaid: t?.breakPaid ?? false });
                return (
                  <View key={d} style={[s.cell, weekday(d) % 6 === 0 ? { backgroundColor: "#F7F8F6" } : {}]}>
                    {leave ? <Text style={{ color: "#3B82F6", fontSize: 6 }}>{leave.label}</Text> : a ? (
                      <View style={{ alignItems: "center" }}>
                        <Text style={[s.chip, { backgroundColor: t?.color ?? "#66736F" }]}>{t?.code ?? "PERSO"}</Text>
                        <Text style={{ fontSize: 5.5, color: "#66736F", marginTop: 1 }}>{a.customStart ?? t?.startTime}-{a.customEnd ?? t?.endTime}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <View style={s.total}><Text>{Math.floor(minutes / 60)}h{String(minutes % 60).padStart(2, "0")}</Text></View>
            </View>
          );
        })}
        <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {data.shiftTypes.filter((x) => x.active).map((x) => (
            <View key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Text style={[s.chip, { backgroundColor: x.color }]}>{x.code}</Text><Text>{x.name} {x.startTime}–{x.endTime}</Text>
            </View>
          ))}
        </View>
        <View style={s.foot} fixed>
          <Text>Seuls les shifts publiés font foi pour les salariés.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
