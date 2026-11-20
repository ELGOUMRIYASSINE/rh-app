import "server-only";
import ExcelJS from "exceljs";

export const BRAND = "FF0B2422";

/** Build a styled workbook from rows. Header row bold on petrol, frozen, auto widths. */
export async function workbookBuffer(sheets: { name: string; columns: { header: string; key: string; width?: number; numFmt?: string }[]; rows: Record<string, unknown>[]; groups?: { label: string; span: number }[] }[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "YGHR";
  wb.created = new Date();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31));
    let headerRow = 1;
    if (sh.groups?.length) {
      let col = 1;
      const r = ws.getRow(1);
      for (const g of sh.groups) {
        if (g.span > 1) ws.mergeCells(1, col, 1, col + g.span - 1);
        const cell = r.getCell(col);
        cell.value = g.label;
        cell.font = { bold: true, color: { argb: "FF0B5E56" }, size: 9 };
        cell.alignment = { horizontal: "center" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F3F0" } };
        col += g.span;
      }
      headerRow = 2;
    }
    const hr = ws.getRow(headerRow);
    sh.columns.forEach((c, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = { vertical: "middle" };
      ws.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 4);
      if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
    });
    hr.height = 22;
    for (const row of sh.rows) ws.addRow(sh.columns.map((c) => row[c.key] ?? null));
    ws.views = [{ state: "frozen", ySplit: headerRow, xSplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function fileResponse(buf: Buffer | Uint8Array, filename: string, type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "content-disposition": `attachment; filename="${encodeURIComponent(filename)}"`, "cache-control": "no-store" } });
}

/** Read the first sheet of an xlsx/csv upload into objects keyed by header text. */
export async function readSheet(file: File): Promise<Record<string, string>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const sep = (text.split("\n")[0] ?? "").includes(";") ? ";" : ",";
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const parse = (l: string) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i]!;
        if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === sep && !q) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((x) => x.trim());
    };
    const [head, ...rest] = lines.map(parse);
    return rest.map((r) => Object.fromEntries((head ?? []).map((h, i) => [h, r[i] ?? ""])));
  }
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i - 1] = String(c.text ?? "").trim()));
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      const v = cell.value;
      o[h] = v instanceof Date ? v.toISOString().slice(0, 10) : String(cell.text ?? "").trim();
    });
    if (Object.values(o).some((x) => x)) rows.push(o);
  });
  return rows;
}
