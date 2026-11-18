import { expect, test } from "@playwright/test";
import { login, PASSWORD } from "./helpers";

/** A Monday far in the future, different on every run, so the suite can be re-run without reseeding. */
function runMonday(): string {
  const weeks = Math.floor(Date.now() / 60000) % 400; // changes every minute
  const d = new Date(Date.UTC(2028, 0, 3 + weeks * 7)); // 2028-01-03 is a Monday
  return d.toISOString().slice(0, 10);
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

test("connexion : mauvais mot de passe puis accès RH, journalisé", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill("rh@demo.yghr.ma");
  await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/clinique-demo\/rh$/);
  await expect(page.getByRole("heading", { name: /Bonjour Nadia/ })).toBeVisible();
  const logs = await page.request.get("/api/audit-logs?action=LOGIN");
  expect((await logs.json()).total).toBeGreaterThan(0);
});

test("ajouter un salarié : il apparaît dans la liste avec le statut Invité", async ({ page }) => {
  await login(page);
  await page.goto("/clinique-demo/rh/employes");
  await page.getByRole("button", { name: "Ajouter un salarié" }).first().click();
  const stamp = Date.now().toString().slice(-6);
  await page.getByRole("textbox", { name: "Prénom", exact: true }).fill("Test");
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill(`E2E${stamp}`);
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(`test.e2e${stamp}@demo.yghr.ma`);
  await page.getByRole("button", { name: "Ajouter et envoyer les accès" }).click();
  await expect(page.getByText(`Test E2E${stamp} a été ajouté(e).`)).toBeVisible();
  await page.getByLabel("Rechercher un salarié").fill(`E2E${stamp}`);
  const row = page.getByRole("row", { name: new RegExp(`E2E${stamp}`) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Invité")).toBeVisible();
});

test("planning : semaine vide bloquée par la couverture, publiée après exceptions", async ({ page }) => {
  await login(page);
  // a far week with no shifts: seeded coverage rules make it blocking
  const from = runMonday(), to = addDays(from, 6);
  const an = await (await page.request.get(`/api/planning/anomalies?from=${from}&to=${to}`)).json();
  expect(an.anomalies.some((a: { title: string }) => a.title === "Shift sans personnel")).toBe(true);
  const emp = (await (await page.request.get("/api/employees?q=Berrada")).json()).items[0];
  const st = (await (await page.request.get("/api/shift-types")).json()).items.find((s: { code: string }) => s.code === "J");
  expect((await page.request.post("/api/planning/assignments", { data: { cells: [{ employeeId: emp.id, date: from, shiftTypeId: st.id }] } })).ok()).toBe(true);
  const blocked = await page.request.post("/api/planning/publish", { data: { from, to } });
  expect(blocked.status()).toBe(409);
  const fresh = await (await page.request.get(`/api/planning/anomalies?from=${from}&to=${to}`)).json();
  for (const a of fresh.anomalies.filter((x: { severity: string; exceptionId?: string }) => x.severity === "BLOCKING" && !x.exceptionId)) {
    expect((await page.request.post("/api/planning/exceptions", { data: { anomalyKey: a.key, date: a.date, justification: "Test automatisé" } })).ok()).toBe(true);
  }
  const ok = await page.request.post("/api/planning/publish", { data: { from, to } });
  expect(ok.ok()).toBe(true);
  expect((await ok.json()).published).toBe(1);
});

test("congé : le salarié demande, le RH approuve depuis l'interface", async ({ browser }) => {
  const emp = await browser.newPage();
  await login(emp, "salarie@demo.yghr.ma");
  const start = addDays(runMonday(), 14);
  const comment = `Demande E2E ${start}`;
  const r = await emp.request.post("/api/leaves", { data: { type: "UNPAID_LEAVE", startDate: start, endDate: addDays(start, 1), comment } });
  expect(r.ok()).toBe(true);
  const rh = await browser.newPage();
  await login(rh);
  await rh.goto("/clinique-demo/rh/conges");
  const row = rh.getByRole("row").filter({ hasText: comment });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Approuver" }).click();
  await expect(rh.getByText(/Congé approuvé/)).toBeVisible();
  const mine = await (await emp.request.get("/api/leaves?status=APPROVED")).json();
  expect(mine.items.some((l: { comment: string }) => l.comment === comment)).toBe(true);
});

test("paie : calcul d'une période et bulletin PDF", async ({ page }) => {
  await login(page);
  await page.goto("/clinique-demo/rh/paie");
  await page.getByRole("link", { name: "Ouvrir" }).first().click();
  await expect(page.getByRole("heading", { name: /Paie —/ })).toBeVisible();
  const calc = page.getByRole("button", { name: /Calculer|Recalculer/ });
  if (await calc.isVisible()) {
    await calc.click();
    await expect(page.getByText(/bulletin\(s\) calculé\(s\)/)).toBeVisible();
  }
  await expect(page.getByRole("row").nth(1)).toBeVisible();
  const id = page.url().split("/").pop();
  const slips = await (await page.request.get(`/api/payroll/periods/${id}/payslips`)).json();
  expect(slips.payslips.length).toBeGreaterThan(0);
  const pdf = await page.request.get(`/api/payroll/payslips/${slips.payslips[0].id}/pdf`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});

test("isolation : un chef d'équipe ne voit que son équipe", async ({ page }) => {
  await login(page, "chef@demo.yghr.ma");
  const team = await (await page.request.get("/api/employees")).json();
  expect(team.items.length).toBeLessThan(10);
  const other = await page.request.get("/api/payroll/periods");
  expect(other.status()).toBe(403);
});
