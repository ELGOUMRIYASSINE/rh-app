# YGHR — HR, Time & Attendance, Planning and Payroll (Morocco-first SaaS)

> **Brief for Claude Code.** Build **YGHR** from scratch: a multi-tenant HR SaaS for clinics, hospitals and SMEs, with biometric time clocks, shift planning that checks labour rules, leave management and Moroccan payroll (CNSS / AMO / IR).
> We studied the feature set and the workflows of an existing product. **Do not copy its look.** YGHR has its own visual identity (section 3).
> The UI language is **French**, with i18n built in so Arabic (RTL) and English can be added later. All UI strings below are the French labels to use.

---

## 0. How to use this document

1. Read it end to end before you write code.
2. Follow the **build order** in section 14. Each milestone has acceptance criteria.
3. When this document is silent, choose the simplest sensible behaviour and leave a `// DECISION:` comment.
4. Payroll and labour-law values are **data, not code**. They live in versioned, editable tables (section 11.6). Seed them with the values given here and tell the admin to confirm them with their accountant.

---

## 1. Product overview

YGHR covers the HR cycle of an organisation whose staff work in shifts:

| Module | Purpose |
|---|---|
| **Tableau de bord** | Live overview: headcount, who is on site, lateness, absences, 7-day chart, live clock-ins, payroll status |
| **Salariés** | Employee directory, Excel import, team leads (*chefs d'équipe*) with fine-grained permissions |
| **Rapports** | Per-period activity report: contract data, hours per ISO week, normal / night / overtime hours, absences, pay elements. Excel export |
| **Planning** | Weekly and monthly shift grid, rule-based anomaly detection, draft → publish workflow, printing |
| **Congés** | Leave requests with approval workflow, configurable leave policy and balances, 16 leave types |
| **Présences** | Real-time presence board, plus a weekly screen to correct and validate clock-ins |
| **Pointeuses** | ZKTeco-style biometric devices (LAN TCP or ADMS cloud push), latest punches, fingerprint ID → employee mapping |
| **Paie** | Monthly payroll periods: calculate → validate → lock. Moroccan rules (CNSS, AMO, IR) |
| **Audit Logs** | Who did what, on which entity, from which IP / device |
| **Paramètres** | Organisation info, night-hours window, weekly rest day, shift rules engine, notifications, security, password |
| **Premium modules** (gated by plan) | Acomptes (salary advances), Notes de frais (expenses), Signature électronique, Messagerie, Tablettes de pointage (kiosk + PIN), Gestion de la structure (centres / sites), Disponibilités |

There are three user spaces, all under the organisation slug:
- `/{org}/rh`: HR manager (full admin of the organisation)
- `/{org}/chef`: team lead (permissions scoped to their team)
- `/{org}/salarie`: employee self-service

---

## 2. Tech stack (required)

- **Next.js 15+ (App Router) + TypeScript (strict)**, with Turbopack in dev
- **Tailwind CSS v4** and **shadcn/ui**, using Radix or Base UI primitives
- **PostgreSQL** with **Prisma** (use cuid IDs)
- **Auth**: email + password (argon2), JWT in httpOnly cookies, refresh tokens, optional TOTP 2FA, invitation and reset links by email (valid 7 days)
- **Realtime**: a **Socket.IO** server as a separate Node process (its own port), with rooms per organisation
- **Jobs**: BullMQ + Redis for device polling, payroll calculation, daily e-mails and anomaly scans
- **E-mail**: Nodemailer (SMTP) with React Email templates
- **Files**: S3-compatible storage (MinIO in dev) for attachments, documents and payslip PDFs
- **Excel**: `exceljs` for import templates and exports
- **PDF**: `@react-pdf/renderer` for payslips and printed plannings
- **Charts**: Recharts
- **Validation**: Zod everywhere (API input, forms)
- **Forms**: react-hook-form
- **Data fetching**: TanStack Query
- **Dates**: `date-fns` + `date-fns-tz`. Every computation is done in the organisation's timezone (default `Africa/Casablanca`)
- **PWA**: web manifest and push notifications (Web Push)
- **Devices**: `node-zklib` (or an equivalent) for ZKTeco TCP on port 4370, plus an HTTP endpoint for the ADMS / iClock push protocol
- **Deployment**: Docker Compose (web, socket, worker, postgres, redis, minio)

Monorepo layout (pnpm workspaces):
```
apps/web        Next.js app (UI + API route handlers)
apps/realtime   Socket.IO server
apps/worker     BullMQ workers (device sync, payroll, emails, anomaly scans)
packages/db     Prisma schema + client + seed
packages/core   Pure business logic (rules engine, payroll, time calc), unit-tested
packages/ui     Shared design-system components
```
**Business logic goes in `packages/core` as pure functions with Vitest tests.** That covers the time calculations, the anomaly rules, leave balances and payroll.

---

## 3. YGHR brand identity and design system

The reference product is a generic blue-and-white admin template. YGHR must feel **calmer, warmer and more premium**: the tool a clinic director is glad to open in the morning.

### 3.1 Brand
- **Name:** YGHR. Always uppercase in the logo; "YGHR" in running text.
- **Tagline (FR):** *« Vos équipes, leur temps, leur paie — en un seul endroit. »*
- **Logo:** a wordmark "YG" + "HR", with a small rounded square mark in which a stylised clock hand doubles as a person silhouette. Generate it as an SVG component `<YGHRLogo />` with `mark`, `full` and `mono` variants. Do not reuse the reference product's logo.
- **Tone:** clear, human and direct. Use the formal *vous*. Every empty state teaches the next step (for example *« Ajoutez votre première pointeuse pour recevoir les présences automatiquement. »*).

### 3.2 Colour tokens (CSS variables, light and dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand-900` | `#0B2A2F` | | Deep petrol: sidebar, hero cards |
| `--brand-700` | `#0F4C55` | | |
| `--brand-500` | `#14808C` | `#2BB3C0` | **Primary** (buttons, active nav, links) |
| `--brand-100` | `#E3F4F5` | `#10363B` | Primary tint backgrounds |
| `--accent-500` | `#F2A541` | `#F6B85F` | Warm saffron accent: highlights, the "now" line, badges |
| `--success` | `#1F9D6B` | | On time, approved, active |
| `--warning` | `#E8A317` | | Late, warning-level anomaly |
| `--danger` | `#D64545` | | Absent, blocking anomaly, delete |
| `--info` | `#3B82F6` | | Neutral info |
| `--bg` | `#F7F8F6` | `#0E1415` | App background (warm off-white) |
| `--surface` | `#FFFFFF` | `#151D1F` | Cards |
| `--border` | `#E6E8E3` | `#243033` | |
| `--text` | `#14201F` | `#E7EEEC` | |
| `--muted` | `#66736F` | `#8FA09B` | |

Shift colours come from a fixed categorical palette of 8 colours that pass contrast checks. Each shift type has a colour.

### 3.3 Typography and shape
- Headings: **Plus Jakarta Sans** (600 / 700). Body: **Inter**. Numbers: tabular figures (`font-variant-numeric: tabular-nums`). Times and codes: **JetBrains Mono**.
- Radius: 14px for cards, 10px for inputs and buttons, 999px for pills.
- Elevation: soft and low (`0 1px 2px rgb(0 0 0 / .04), 0 4px 16px rgb(11 42 47 / .06)`).
- Spacing: an 8-point grid. Content max-width is 1440px.
- Icons: **lucide-react** at stroke 1.75.

### 3.4 Layout (the YGHR shell)
- **Sidebar** (dark petrol `--brand-900`, unlike the reference's white sidebar): logo, grouped nav sections (**Pilotage**: Tableau de bord, Rapports · **Équipes**: Salariés, Planning, Congés, Présences · **Matériel**: Pointeuses, Tablettes · **Finance**: Paie, Acomptes, Notes de frais · **Système**: Audit, Paramètres). Collapsible to icons only. The user card and logout sit at the bottom. Locked premium items show a small lock with a tooltip.
- **Top bar**: page title and subtitle, a connection pill (*En ligne* / *Hors ligne*, driven by the socket state), a notification bell with a dropdown, a message icon (when Messagerie is enabled), an organisation switcher (for users in several orgs) and the user menu (*Mon profil*, *Se déconnecter*).
- **Command palette** (⌘K / Ctrl K): jump to any page or employee, and run quick actions such as "Ajouter un salarié" or "Nouvelle demande".
- **Responsive**: below 1024px the sidebar becomes a drawer. The employee space is mobile-first.
- **Motion**: 150–200ms ease-out transitions, skeleton loaders (never blank screens), toasts top-right (sonner).
- **Accessibility**: WCAG AA, full keyboard navigation, focus rings in `--brand-500`.

### 3.5 Signature components
- `HeroGreeting`: dark petrol card with the date, *« Bonjour {prénom} »*, a context sentence, quick-action buttons, a large live clock and a circular presence-rate gauge.
- `KpiCard`: icon chip, big tabular number, label, sub-label, a thin progress bar and a ↗ link to the detail page.
- `EmptyState`: icon in a soft circle, a title, one helpful sentence and a primary CTA.
- `StatusPill`, `SeverityBadge` (Bloquante / Avertissement), `Toggle`, `DataTable` (sticky header, column groups, horizontal scroll, row selection, search and filters), `SideSheet` (right drawer), `StepCard` (numbered steps).

---

## 4. Multi-tenancy, roles and URLs

- Every record carries `organizationId`. Enforce tenancy on the server for **every** query. Use a Prisma extension or middleware that injects the org from the session, and never trust the client.
- An organisation has a unique, immutable `slug` (the *Identifiant (tenant)*), for example `clinique-kawtar`.
- Routes: `/{slug}/rh/...`, `/{slug}/chef/...`, `/{slug}/salarie/...`, plus `/login`, `/invite/[token]`, `/reset/[token]`, `/select-org`.
- After login, redirect by role to `/{slug}/rh`, `/{slug}/chef` or `/{slug}/salarie`. `POST /api/auth/switch-org` changes the active organisation.
- **Roles:** `SUPER_ADMIN` (YGHR staff platform console, optional and later), `RH` (org admin), `CHEF` (team lead), `SALARIE` (employee).
- **Team lead permissions** are granular booleans, set in the *Nouveau chef d'équipe* modal (section 7.2.3). They are checked server-side and limited to the lead's subordinates.

### 4.1 Plans / packs (feature gating)
- `Plan` holds a set of feature keys: `dashboard, employees, reports, planning, leaves, attendance, devices, payroll, audit, settings, advances, expenses, esignature, messaging, tablets, structure, availability`.
- `GET /api/organization/plan` returns the enabled features.
- A locked page renders a `LockedFeature` screen: a lock icon, the page title, *« Cette page n'est pas incluse dans votre pack. Contactez-nous pour l'activer ou passer au pack supérieur. »* and a "Demander l'activation" button that sends an e-mail to YGHR sales. API routes for locked features return 403.
- Seed three plans: **Essentiel** (core modules), **Pro** (+ advances, expenses, tablets, messaging) and **Entreprise** (everything).

---

## 5. Data model (Prisma, abridged; extend as needed)

```prisma
model Organization {
  id String @id @default(cuid())
  slug String @unique
  name String
  contactEmail String?
  accountingEmail String?        // "Email service comptabilité (acomptes)"
  language String @default("fr")
  currency String @default("MAD") // shown as "DH"
  timezone String @default("Africa/Casablanca")
  nightStart String @default("21:00")
  nightEnd   String @default("06:00")
  weeklyRestDay Int?              // 0=Sun..6=Sat, null = non configuré
  useServerTimeForPunches Boolean @default(false)
  require2FAForAdmins Boolean @default(false)
  planId String
  // relations…
}

model User { id, email @unique, passwordHash?, totpSecret?, firstName, lastName, phone?, avatarUrl?, lastLoginAt? }
model Membership { id, userId, organizationId, role Role, employeeId?, permissions Json? /* chef rights */, active Boolean }

model Employee {
  id, organizationId, userId?, matricule?, firstName, lastName, email, phone?,
  position?            // Poste
  serviceId?           // Service (Urgences, Pédiatrie…)
  staffCategoryId?     // Catégorie de personnel (Infirmières…)
  teamLeadId?          // chef d'équipe (Employee)
  contractType ContractType? // CDI | CDD | INTERIM | STAGE
  contractReason?      // "CDD : motif"
  weeklyHours Decimal? // Durée hebdo
  hourlyRate Decimal?  // Taux horaire (brut)
  netHourlyRate Decimal? // "Salaire net / heure (DH)"
  monthlyBase Decimal? // Base mensuelle
  birthDate?, hireDate?, cnssNumber?, cin?, familyDependents Int @default(0),
  status EmployeeStatus // ACTIVE | ARCHIVED
  kioskPin?            // hashed, for tablets
}

model Service        { id, organizationId, name, active }
model StaffCategory  { id, organizationId, name, code, description?, active }

model ShiftType {
  id, organizationId, name, code, color, startTime String, endTime String,
  breakMinutes Int, breakPaid Boolean, isNight Boolean,
  staffCategoryId?  // null = Toutes
  active Boolean
  // duration = amplitude − unpaid break; end <= start ⇒ ends next day
}

model ShiftAssignment {          // a planning cell
  id, organizationId, employeeId, date DateTime @db.Date, shiftTypeId?,
  customStart?, customEnd?, breakMinutes?, note?,
  status PlanningStatus          // DRAFT | PUBLISHED
  source  // MANUAL | ROTATION
  leaveRequestId?                // when the cell is covered by a leave
}

model WorkRule {
  id, organizationId, staffCategoryId? /* null = toutes */, type WorkRuleType,
  value Decimal?, unit String, boolValue Boolean?,
  severity Severity /* BLOCKING | WARNING */, exceptionAllowed Boolean, active Boolean,
  updatedAt, updatedById
}
model CoverageRule { id, organizationId, shiftTypeId, serviceId?, staffCategoryId?, min Int, max Int?, days Int[] /* empty = tous les jours */, severity, active, label? }
model Rotation { id, organizationId, name, mode /* AUTO */, unit /* DAY|WEEK */, sequence Json /* [shiftTypeId|"REST"] */, workDays Int[], active }
model RotationAssignment { id, rotationId, serviceId?, employeeId?, staffCategoryId?, startDate, endDate? }
model PlanningException { id, organizationId, anomalyKey, ruleId?, date, employeeId?, justification, approvedById, createdAt }
model RuleChangeLog { id, organizationId, entity, entityId, action, before Json?, after Json?, userId, createdAt }

model Device { id, organizationId, name, mode /* LAN | ADMS */, ip?, port Int @default(4370), commPassword?, serialNumber?, model?, firmware?, lastSeenAt?, status }
model DeviceUserMap { id, organizationId, deviceId?, deviceUserId String /* fingerprint ID */, employeeId }
model Punch {           // raw clock-in event
  id, organizationId, deviceId?, deviceUserId?, employeeId?, timestamp DateTime,
  receivedAt DateTime, source /* DEVICE | TABLET | MANUAL | CORRECTION */, verifyMode?, rawPayload Json?
  @@unique([deviceId, deviceUserId, timestamp])
}
model AttendanceDay {   // computed per employee per day
  id, organizationId, employeeId, date, firstIn?, lastOut?, workedMinutes, normalMinutes,
  nightMinutes, overtimeMinutes, lateMinutes, status /* PRESENT|LATE|ABSENT|LEAVE|OFF */,
  validatedById?, validatedAt?, corrections Json?
}

model LeavePolicy { id, organizationId, leaveType, enabled, countingMethod /* OUVRABLES|OUVRES */, accruedPerMonth Decimal?, annualAllowance Decimal?, annualCap Decimal?, periodStart String /* MM-DD */, allowAdvanceFirstYear Boolean }
model LeaveRequest { id, organizationId, employeeId, type LeaveType, startDate, endDate, halfDayStart?, halfDayEnd?, days Decimal, comment?, attachmentUrl?, status /* PENDING|APPROVED|REJECTED|CANCELLED */, decidedById?, decidedAt?, decisionNote?, createdById }
model LeaveBalance { id, employeeId, leaveType, periodYear, acquired Decimal, taken Decimal, adjusted Decimal }
model PublicHoliday { id, organizationId?, date, name } // seed Moroccan holidays

model PayrollPeriod { id, organizationId, month, year, currency, fiscalRuleVersionId, status /* DRAFT|CALCULATED|VALIDATED|LOCKED */, calculatedAt?, validatedById?, lockedAt? }
model Payslip { id, periodId, employeeId, lines Json, gross, cnssEmployee, amoEmployee, ipeEmployee, profExpenses, taxableNet, irGross, familyDeduction, ir, net, employerCharges Json, pdfUrl? }
model PayElement { id, organizationId, employeeId, periodId?, kind /* PRIME|TRANSPORT|ADVANCE|EXPENSE|DEDUCTION */, label, amount, taxable Boolean, cnssSubject Boolean }
model FiscalRuleVersion { id, country "MA", validFrom, validTo?, data Json } // see 11.6

model AdvanceRequest  { … }   // Acomptes (premium)
model ExpenseReport   { … }   // Notes de frais (premium)
model SignatureRequest{ … }   // Signature électronique (premium)
model Document        { … }   // employee documents / dossiers
model Message, Conversation { … } // Messagerie (premium)
model Tablet { id, organizationId, name, centreId?, token, rules Json } // kiosk
model Centre { id, organizationId, name, address?, active }            // Structure (premium)
model Notification { id, organizationId, userId, type, title, body, link?, readAt? }
model AuditLog { id, organizationId, userId?, action /* LOGIN|CREATE|UPDATE|DELETE|… */, entity, entityId?, details Json?, ip?, userAgent?, createdAt }
model Plan { id, name, features String[] }
```

Enums: `LeaveType = PAID_LEAVE | RTT | REPOS_COMPENSATEUR | FAMILY_EVENT | UNPAID_LEAVE | SICK_LEAVE | ACCIDENT_TRAVAIL | ACCIDENT_TRAJET | MATERNITY | PATERNITY | PAID_TRAINING | ABSENCE_AUTORISEE | ABSENCE_NON_AUTORISEE | MISE_A_PIED_DISCIPLINAIRE | MISE_A_PIED_CONSERVATOIRE`, with the French labels from section 7.5.

---

## 6. API (REST, Next.js route handlers under `/api`)

All handlers: Zod-validated input, tenant scoping, permission check, and an audit log entry for every write. Errors are JSON `{ error: "message FR" }`; `401 → "Non autorisé"`.

```
POST /api/auth/login | /logout | /refresh | /switch-org | /forgot | /reset | /invite/accept
POST /api/users/change-password
GET  /api/organizations/my          PATCH /api/organization
GET  /api/organization/plan
GET|PUT /api/organization/tablet-rules
GET  /api/dashboard/stats?timeframe=jour|semaine|mois
GET  /api/notifications            PATCH /api/notifications/:id/read
GET  /api/messages/unread  (+ conversations CRUD when enabled)

GET|POST /api/employees            GET|PATCH|DELETE /api/employees/:id   POST /api/employees/:id/archive
POST /api/employees/import  (xlsx|csv)   GET /api/employees/import/template
GET|POST /api/team-leads           PATCH /api/permissions/:membershipId
GET|POST /api/services  /api/staff-categories   (+ PATCH/DELETE)

GET  /api/reports/activity?from&to&role     GET /api/reports/activity/export (xlsx)

GET  /api/planning?from&to&role&q          POST /api/planning/assignments (bulk upsert)
DELETE /api/planning/assignments/:id      POST /api/planning/publish {from,to}
GET  /api/planning/anomalies?from&to      POST /api/planning/exceptions
GET  /api/planning/print?from&to (pdf)
GET|POST|PATCH|DELETE /api/work-rules  /api/shift-types  /api/coverage-rules  /api/rotations
POST /api/rotations/:id/assign            POST /api/rotations/:id/generate-draft {from,to}
GET  /api/rules/history

GET|POST /api/leaves     PATCH /api/leaves/:id (approve|reject|cancel)
GET|PUT  /api/leave-policy               GET /api/leaves/balance?employeeId&type

GET  /api/attendance/live?date            GET /api/attendance/week?from
POST /api/attendance/corrections          POST /api/attendance/validate-day {date}
POST /api/attendance/recompute-rules

GET|POST /api/devices   PATCH|DELETE /api/devices/:id   POST /api/devices/test {ip,port,password}
POST /api/devices/:id/sync   GET /api/punches/latest   GET|POST /api/device-user-maps
GET|POST /iclock/cdata  GET /iclock/getrequest  POST /iclock/devicecmd   ← ADMS push protocol (no auth cookie; authenticate by registered SN)

GET|POST /api/payroll/periods   POST /api/payroll/periods/:id/calculate | /validate | /lock | /unlock
GET  /api/payroll/periods/:id/payslips   GET /api/payroll/payslips/:id/pdf
GET  /api/payroll/periods/:id/export (CNSS/DAMANCOM-ready xlsx + journal de paie)

GET  /api/audit-logs?q&action&page
GET|POST /api/advance-requests  /api/expenses  /api/signature-requests  /api/centres  /api/tablets   (premium)
```

**Realtime events** (Socket.IO room `org:{id}`): `punch:new`, `attendance:update`, `device:status`, `notification:new`, `leave:updated`, `planning:published`, `message:new`. The *En ligne* pill reflects the socket connection.

---

## 7. Screens: RH space (`/{org}/rh`)

### 7.1 Tableau de bord — `/rh`
- **HeroGreeting**: the date (*Lundi 16 novembre 2026*), *Bonjour {prénom} 👋*, a contextual sentence (when there are no employees: *« Commencez par ajouter vos salariés : leurs pointages et leur paie apparaîtront ici. »*), buttons **Ajouter un salarié**, **Présences du jour** and **Paie**, a live local clock (*HEURE LOCALE*) and a ring gauge (*% PRÉSENCE* = on site ÷ planned or active).
- **4 KPI cards**: *Effectif actif* (employees and team leads) · *Sur site maintenant* (N arrivals today) · *Retards* (count; "aucun retard") · *Absents maintenant* (real time: not clocked in, or already clocked out). Each card links to its detail page.
- **Présences — 7 derniers jours**: stacked bars *À l'heure* and *En retard*. Empty state: *« Aucun pointage sur les 7 derniers jours… »*
- **Effectif par département**: donut or horizontal bars by service.
- **Pointages en direct**: live feed (avatar, name, IN/OUT, time, device), with *Tout voir* → Pointeuses.
- **Retards du jour**: list, or a green check *« Aucun retard aujourd'hui. »*
- **Pointeuses**: device status list (online/offline, last seen), with *Gérer*; empty state links to *Ajouter une pointeuse*.
- **Paie** banner: the current period name and status, with a CTA *Créer une période*. Empty state: *« Aucune période de paie calculée. Créez une période pour générer les bulletins selon les règles marocaines (CNSS, AMO, IR). »*
- Data: `GET /api/dashboard/stats`, refreshed live by socket events.

### 7.2 Salariés — `/rh/employes`
Header: *Gestion des salariés* with the subtitle *N employé(s) au total*. Tabs: **Salariés** | **Chefs d'équipe**.

#### 7.2.1 Salariés tab
- Toolbar: search (*Rechercher un salarié…*), refresh, **Importer (Excel)**, **Ajouter un salarié**.
- Table columns: ☐ select-all, **Employé** (avatar, name, matricule), **Poste**, **Chef d'équipe**, **Contact** (email, phone), **Contrat** (type pill + hours), **Statut** (Actif / Archivé), and a row menu (Voir la fiche, Modifier, Archiver, Renvoyer l'invitation).
- Bulk actions on selection: archive, assign a team lead, assign a service or category, export.
- Empty state: *Aucun employé trouvé*.
- Clicking a row opens the **employee profile** (`/rh/employes/[id]`), with tabs for Infos, Contrat & salaire, Planning, Présences, Congés & soldes, Documents and Historique.

#### 7.2.2 « Ajouter un salarié » modal
Subtitle: *« Il recevra par e-mail un lien pour créer son mot de passe et accéder à son espace : planning, demandes de congé, absences et retards. »*
- **IDENTITÉ ET ACCÈS**: Prénom*, Nom*, E-mail* (help text: *« Obligatoire : le salarié y reçoit ses accès à l'application. »*)
- **AFFECTATION**: Service (select: — Aucun —, plus the org's services, plus **＋ Créer un service** inline) and Catégorie de personnel (same pattern, with **＋ Créer une catégorie**)
- **COORDONNÉES ET SALAIRE**: Téléphone (placeholder `06 00 00 00 00`), Salaire net / heure (DH)
- Buttons: *Annuler*, **Ajouter et envoyer les accès** (creates the Employee, User and Membership(SALARIE) and sends a 7-day invite e-mail).

#### 7.2.3 « Importer des salariés » modal
- Step 1, *Téléchargez le modèle*: *« Remplissez une ligne par personne. Les colonnes Prénom, Nom et Email sont obligatoires. Laissez la colonne Mot de passe vide pour une génération automatique. »* Button **Modèle Excel**.
- Step 2, *Importez votre fichier*: accepts .xlsx and .csv. Button **Choisir un fichier**.
- *COLONNES DU MODÈLE* chips: Prénom*, Nom*, Email*, Téléphone, Poste, Département, Type de contrat, Taux horaire, Salaire net par heure, Date de naissance, Date d'embauche, N° Sécurité Sociale, Matricule, Mot de passe (optionnel).
- After upload: a **preview table** with per-row validation (errors in red, duplicates by e-mail flagged), then **Importer N salariés** and a result report.

#### 7.2.4 Chefs d'équipe tab
- Summary line: *N chef(s) · N en équipe · N sans équipe*, refresh, **Nouveau chef d'équipe**.
- Cards or a table of leads with their team size, rights summary and an *Éditer les droits* action.
- Empty state: crown icon, *Aucun chef d'équipe*, *« Nommez un chef d'équipe parmi vos salariés : il recevra un e-mail pour créer son mot de passe. »*

**« Nouveau chef d'équipe » modal**
- Explanation: *« Choisissez la personne qui devient chef d'équipe. Si elle a déjà un compte (responsable ou salarié déjà connecté), elle garde ce compte ; sinon elle reçoit un e-mail pour créer son mot de passe (lien valable 7 jours). »*
- **Salarié ou responsable**: searchable combobox.
- **Droits**: a master checkbox *Tous les droits (comme le responsable, limité à son équipe)*, then these groups:
  - **ÉQUIPE**: Ajouter des subordonnés · Modifier les informations des subordonnés · Supprimer/Archiver des subordonnés
  - **PLANNING ET PRÉSENCES**: Gérer le planning de l'équipe · Approuver/Refuser les congés · Valider les présences
  - **DOCUMENTS**: Consulter les documents de l'équipe · Signer les documents
  - **PAIE**: Voir les taux de rémunération · Modifier les taux de rémunération · Valider la paie · Valider les acomptes · Valider les notes de frais
  - **AUTRES**: Consulter les rapports · Exporter les données de l'équipe · Consulter les logs d'audit · Gérer les paramètres · Accéder à la messagerie
- Then pick team members (multi-select). Buttons: *Annuler*, **Créer et envoyer l'invitation**.
- Store the rights as a typed JSON permission set and expose a `can(user, permission, targetEmployeeId?)` helper.

### 7.3 Rapports — `/rh/rapports`
*Rapports d'activité*, subtitle *Synthèse des heures, absences et rémunération par période*.
- Toolbar: ‹ month › navigator (*Novembre 2026*), a custom date range (from → to) with a day-count pill (*30 jours*), search, a role filter (Tous / Salariés / Chefs d'équipe) and **Exporter** (xlsx).
- A wide table with **grouped column headers** and a sticky first column:
  - **EMPLOYÉS**
  - **DONNÉES CONTRACTUELLES**: Type, Durée Hebdo
  - **DONNÉES SALARIALES**: Taux Hor., Base Mens.
  - **HEURES PLANNING PÉRIODE**: Pause, **one column per ISO week in the range** (S44 … S49), H. Travaillées, ☀ H. Normales, 🌙 H. Nuit, H. Supp
  - **TOTAL ABSENCES PÉRIODE**: Jours abs., Heures abs.
  - **ÉLÉMENTS DE RÉMUNÉRATION**: Primes (DH), Avances (DH), Transport (DH)
- Dotted-underlined headers show a tooltip explaining the computation. The footer row holds totals.
- Empty state: *Aucun employé actif trouvé.*

### 7.4 Planning — `/rh/planning`
- Toolbar row 1: ‹ week › (*16 nov. – 22 nov. 2026*) with an ISO week badge (*S47*), **AUJOURD'HUI**, and a **SEMAINE | MOIS** toggle.
- Toolbar row 2: search, a role filter (Tous rôles / Chef d'équipe / Salarié; add Service and Catégorie filters too), a print button (PDF), **+ AJOUTER** (opens the add-shift sheet; shows the toast *« Aucun employé disponible »* if there are no employees), an **Anomalies [count]** button (red when there are blocking anomalies) and **Publier**.
- Grid: rows are employees (avatar, name, category, weekly hours versus contract); columns are days (*Lun. 16 Nov.*), with today highlighted, weekends shaded and a lock icon on days already validated or paid. The last column is **TOTAL**.
- Cells show shift chips (colour, code, times). Draft chips are hatched or outlined; published chips are solid. Leave covers the cell with a leave-type pill.
- Interactions: click an empty cell → quick picker of shift types (or custom hours) · drag and drop to move · Alt-drag to copy · multi-select cells to apply the same shift · right-click to copy the week, paste or clear · undo/redo.
- Footer row **Heures travaillées (?)**: per day *N pers. · HHhMM*, and the week total in hours and **cost in DH** (hours × hourly rate, including night and overtime premiums).
- **Publier**: publishes the drafts in the visible range. It is blocked while blocking anomalies remain without an exception. Employees get a notification.
- **Anomalies side sheet** (*Anomalies du planning*, *Du 16/11/2026 au 22/11/2026*): counters *N bloquante(s)* and *N avertissement(s)*, Actualiser, anomalies grouped by day. Each card shows a title (e.g. *Shift sans personnel*), a severity badge (*ERREUR* / *AVERTISSEMENT*), the date, a message (e.g. *« Shift « Matin » du 2026-11-16 : personne d'affecté (minimum 2). »*), *Action conseillée : …* and **Autoriser une exception** (asks for a justification and creates a PlanningException). Footer link: *Gérer les règles des shifts*.
- Month view: a compact grid with shift codes only.

### 7.5 Congés — `/rh/conges`
*Gestion des congés*, subtitle *Validez et suivez les demandes d'absence*.
- A collapsible **Politique de congés** panel (*Règles de calcul des soldes — paramétrable (France, Maroc…)*) with **Enregistrer**. It holds three cards, each with an enable checkbox: **Congés payés**, **RTT** and **Repos compensateur**. Each card has: *Méthode de décompte* (ouvrables / ouvrés), *Acquis / mois (j)*, *Dotation annuelle (j)*, *Plafond annuel (j)*, *Début période (MM-JJ)*, and a ☐ *Congés anticipés la 1ʳᵉ année*. Help text explains *ouvrables* (Mon–Sat excluding holidays) versus *ouvrés* (Mon–Fri excluding holidays); public holidays are always excluded.
  - **Morocco defaults for YGHR**: Congés payés enabled, ouvrables, **1.5 j/mois** (18 j/an, Code du travail art. 231), cap 18, period start 01-01. Seed the Moroccan public holidays.
- Status tabs with counts: **En attente**, **Approuvés**, **Refusés**, **Tous**. Search, type filter and sort (*Plus récentes* / *Plus anciennes* / *Date de début*). Button **Nouvelle demande**.
- Table: Salarié, Type, Période, Durée, Statut, Actions (Approuver, Refuser with a reason, Voir la pièce jointe, Annuler).
- Leave types (FR labels): Congés payés · RTT · Repos compensateur · Événement familial · Congés sans solde · Maladie non professionnelle · Accident du travail · Accident de trajet · Maternité · Paternité · Congé formation rémunérée · Absence autorisée rémunérée · Absence non autorisée non rémunérée · Mise à pied disciplinaire · Mise à pied conservatoire.
- **« Nouvelle demande de congé » modal**: Bénéficiaire (*Pour moi* or pick an employee), Type de congé, a live balance box (*Solde disponible : X j ouvrables (acquis A · pris P) — N j demandés*), Date de début / Date de fin (with half-day options), Commentaire / justification, Pièce jointe (optionnel). Buttons: *Annuler*, **Soumettre la demande**. Warn when the request exceeds the balance, overlaps planned shifts or overlaps another request.
- Approval: the leave writes into the planning (it replaces shifts and flags conflicts), updates the balances, notifies the employee and is logged.

### 7.6 Présences — `/rh/presences`
*Présences*, subtitle *Qui est présent en ce moment*.
- Toolbar: ‹ date ›, a date picker, the long date label, search (*Rechercher un nom…*) and **Corriger les pointages** (→ `/rh/presences/gestion`).
- Three stat tiles (clickable filters): **EFFECTIF**, **PRÉSENTS**, **ABSENTS**.
- Segment control: Tous / Employés / Chefs d'équipe. A live indicator (*En direct · mis à jour à HH:MM:SS*) and a refresh button.
- Table: Nom, Fonction, Statut (Présent / Absent / En retard / En congé / Repos), Arrivée, Dernier pointage, Temps de présence (a live timer).
- Footnote: *« Présent = entré et pas encore sorti (le statut passe en absent dès que la sortie est pointée). Actualisation automatique toutes les 10 secondes. »* Use socket push, with a 10-second polling fallback.

#### 7.6.1 Gestion et validation des pointages — `/rh/presences/gestion`
- Week navigator with a *Semaine 47* badge, refresh, and **Valider la journée (RH)**.
- Left column: the 7 days of the week, each with a completion ring (validated / partially validated / not validated).
- Right panel for the selected day: chips *N prévus* and *N absent(s)*. Per planned employee it shows the planned shift beside the actual punches (in/out), the computed worked, late, night and overtime figures, and anomalies (missing out, punch without a shift, and so on). Inline edit adds, moves or deletes punches; a reason is required and the change is saved as `source=CORRECTION` with an audit entry. It also offers *Marquer absent justifié / injustifié*.
- Empty state: *Aucun planning ce jour*.
- Validation locks the day for the employees concerned; payroll uses only validated days, or warns when some are not validated.

### 7.7 Pointeuses — `/rh/pointeuses`
*Pointeuses*, subtitle *Pointeuse biométrique — présences automatiques*. Tabs: **Derniers pointages** | **Pointeuses** | **Empreintes → Employés**, plus **Actualiser**.
- **Derniers pointages**: a live list (time, employee or *ID inconnu #5*, device, type, verify mode). Empty state: *Aucun pointage reçu pour l'instant.*
- **Pointeuses** tab:
  - Card *Source de l'heure des pointages*: by default the device clock stamps the punch; the checkbox **Utiliser l'heure du serveur** switches to server receive time, for devices whose clock drifts.
  - Card **Ajouter une pointeuse du réseau local**: Nom (placeholder *ex. Pointeuse accueil*), Adresse IP* (`192.168.1.201`), Port (default **4370**), Mot de passe comm. (*aucun*). Buttons **Tester la connexion** (the server connects and reads the serial number, model and user count) and **Enregistrer la pointeuse** (disabled until the test succeeds). Note: *« Le test est fait par le serveur de l'application : il doit être sur le même réseau que la pointeuse (ou relié par VPN / redirection du port). »*
  - **Pointeuses enregistrées**: cards showing status (online / offline / last seen), SN, IP, the last sync, and the actions Synchroniser, Régler l'heure, Renommer and Supprimer.
  - A collapsible *Avancé : ajouter par numéro de série (mode ADMS / serveur Cloud)*: Numéro de série (SN), Nom (optionnel), **+ Ajouter**. The device then pushes to `/iclock/cdata`; show the exact server address and port to enter on the device.
- **Empreintes → Employés**: *« Associez chaque ID d'empreinte détecté à un employé. Les pointages déjà reçus sont alors rattachés à ses présences. »* It lists the unmapped device user IDs seen in punches (with their count and last seen) and has a mapping row: *Choisir un employé…* + *ID empreinte (ex. 5)* + **Associer**. Mapping back-fills `employeeId` on past punches and recomputes the attendance days.
- Worker: poll LAN devices every 30–60s (get attendance logs, dedupe on the unique key), heartbeat for status, emit `punch:new`.

### 7.8 Paie — `/rh/paie`
*Paie*, subtitle *Périodes de paie — calcul, validation et verrouillage*.
- Header: *Gestion des bulletins de paie par période mensuelle*, Actualiser, **Nouvelle période**.
- **« Nouvelle période de paie » modal**: *« La devise, les dates et la version de règles fiscales sont déterminées automatiquement par le serveur. »* Mois, Année. **Créer la période**.
- Period list: cards with the month, a status stepper (Brouillon → Calculée → Validée → Verrouillée), totals (gross, net, employer charges, headcount) and actions.
- Period detail (`/rh/paie/[id]`): a table of employees with worked, night and overtime hours, gross, CNSS, AMO, IR and net, plus warnings (unvalidated days, missing rate). Actions: **Calculer** / **Recalculer**, **Valider**, **Verrouiller** (no edits afterwards; unlock is RH-only with a reason and is audited), **Exporter** (pay journal xlsx and a CNSS declaration helper) and **Bulletins PDF** (zip). Clicking a row opens the payslip preview with editable pay elements (primes, transport, deductions) while the period is in DRAFT.
- Empty state: *Aucune période de paie* / *Créer une période*.

### 7.9 Audit Logs — `/rh/logs`
*Journal d'Audit*, subtitle *Historique des actions et traçabilité*.
- Card *HISTORIQUE DES ÉVÉNEMENTS*: search (*Rechercher par utilisateur, entité…*), an action filter (ALL, Connexion, Création, Modification, Suppression, Validation, Export…) and refresh.
- Columns: **Horodatage** (date + time in mono), **Utilisateur** (avatar, name, role), **Action** (coloured pill: Connexion grey, Création green, Modification blue, Suppression red), **Entité & détails** (entity type in caps, e.g. USER, PAYROLLPERIOD, plus the ID in mono; click to expand a before/after JSON diff), **Empreinte (IP/device)** (IP, browser and OS parsed from the user agent).
- Paginated or infinite scroll. Export CSV.

### 7.10 Paramètres — `/rh/settings`
*Paramètres*, subtitle *Configuration de l'application et préférences*. Sections as cards, each with its own save button:
1. **INFORMATIONS DE L'ENTREPRISE**: Nom de l'organisation, Identifiant (tenant) (read-only), Email de contact (général), Email service comptabilité (acomptes), Langue principale (fr / ar / en), Devise (DH / MAD / EUR), Fuseau horaire.
2. **CONFIGURATION DES HEURES DE NUIT**: *Plage horaire de nuit générale* with Début / Fin (default 21:00 → 06:00, the Moroccan legal night window; the reference used this). *Jour de repos hebdomadaire* (*« Jour de repos légal (art. 205). Utilisé par la paie pour majorer les heures travaillées ce jour-là. »*, with an option *Non configuré*).
3. **RÈGLES DE TRAVAIL**: a link card to *Règles des shifts* (section 7.11).
4. **NOTIFICATIONS**: toggles *Notifications Push* (on this device) and *Emails quotidiens* (daily attendance and leave summary).
5. **SÉCURITÉ**: toggles *Authentification forte (2FA)* (require it for admins) and *Session persistante* (keep the session 30 days).
6. **CHANGEMENT DE MOT DE PASSE**: Mot de passe actuel, Nouveau, Confirmer, with a strength meter.

Also add *Mon profil* (`/rh/profil`): name, avatar, phone, 2FA enrolment (QR code) and active sessions.

### 7.11 Règles des shifts — `/rh/settings/regles-shifts`
Breadcrumb *Paramètres RH › Règles de travail* with a ← *Paramètres* button. **Seven tabs:**

**1. Règles.** An info banner: *« Valeurs définies par l'établissement. Les valeurs sont configurables par l'établissement et ne constituent pas une validation juridique ; confirmez-les selon votre pays, secteur et convention. Les taux de majoration des heures supplémentaires restent ceux de la Paie. »* Then a *RÈGLES CONFIGURÉES* card (*« Une règle n'est appliquée que si elle est active. Une règle propre à une catégorie de personnel est prioritaire sur la règle générale de même type. »*), a filter (Toutes les règles / by group) and **+ Ajouter une règle**.
Table columns: Catégorie concernée, Type de règle (+ group), Valeur, Gravité, Exception autorisée, Statut (toggle), Dernière modification, Actions (edit, duplicate, delete).

Rule types (group → type → unit). **Seed these as defaults:**
| Catégorie | Type | Groupe | Valeur | Gravité | Actif |
|---|---|---|---|---|---|
| Toutes | Durée maximale de travail par semaine | Durée de travail | 48 h | Bloquante | ✔ |
| Toutes | Durée maximale d'un shift | Durée de travail | 12 h | Avertissement | ✔ |
| Toutes | Pause obligatoire au-delà de | Durée de travail | 6 h | Avertissement | ✔ |
| Toutes | Durée minimale de la pause | Durée de travail | 30 min | Avertissement | ✔ |
| Toutes | Repos minimum entre deux shifts | Temps de repos | 11 h | Bloquante | ✔ |
| Infirmières | Repos minimum après un shift de nuit | Temps de repos | 24 h | Bloquante | ✔ |
| Toutes | Jours de repos obligatoires par semaine | Temps de repos | 1 jour | Avertissement | ✔ |
| Infirmières | Nombre maximum de nuits consécutives | Règles de nuit | 3 | Bloquante | ✔ |
| Toutes | Interdire nuit puis matin | Règles de nuit | Oui | Bloquante | ✔ |
| Toutes | Détection automatique des heures sup. | Heures supplémentaires | Oui | Avertissement | ✔ |
| Toutes | Seuil d'heures sup. par semaine | Heures supplémentaires | 44 h | Avertissement | ✔ |
| Toutes | Détecter les absences | Pointage réel | Oui | Avertissement | ✖ |
| Toutes | Retard toléré | Pointage réel | 10 min | Avertissement | ✔ |

Also support: *Durée maximale par jour*, *Durée minimale d'un shift*, *Nombre max de jours consécutifs travaillés*, *Max heures sup. par mois* and *Sortie anticipée tolérée*.

**« Ajouter une règle » modal**: *« Les exemples ne sont qu'une aide à la saisie : la valeur est celle décidée par l'établissement. »* It has numbered sections: ① *INFORMATIONS GÉNÉRALES* (Type de règle*) · ② *CATÉGORIE DE PERSONNEL* (Catégorie concernée*, default *Toutes catégories*, with the precedence hint) · ③ *VALEUR* (the input adapts to the rule type: hours, minutes, count or yes/no, with example chips) · ④ *VALIDATION ET EXCEPTIONS* (Gravité: Avertissement / Bloquante with a description; toggles *Exception autorisée* and *Règle active*).

**2. Types de shifts.** *« Horaires libres : une fin inférieure ou égale au début signifie que le shift se termine le lendemain. La durée est calculée automatiquement (amplitude − pause non rémunérée). »* + **Ajouter un shift**. Columns: Shift (colour dot + name), Code, Horaires (mono, plus *se termine le lendemain*), Durée, Pause (*60 min · non rémunérée*), Nuit (badge), Catégorie, Actif, Actions. **Seed:**
| Nom | Code | Horaires | Pause | Nuit | Catégorie |
|---|---|---|---|---|---|
| Garde de 12 heures | G12 | 07:00–19:00 | 60 min non rém. | Non | Toutes |
| Matin | M | 07:00–15:00 | 30 min non rém. | Non | Infirmières |
| Journée | J | 08:00–17:00 | 60 min non rém. | Non | Salariés administratifs |
| Après-midi | AM | 15:00–23:00 | 30 min non rém. | Non | Infirmières |
| Garde de nuit de 12 heures | GN12 | 19:00–07:00 (+1) | 30 min non rém. | Oui | Toutes |
| Nuit | N | 23:00–07:00 (+1) | Aucune | Oui | Toutes |

**3. Catégories de personnel.** *« La catégorie de personnel s'attribue dans la fiche du salarié. Les règles, les types de shifts et la couverture peuvent ensuite viser une catégorie précise. »* The table lists Catégorie, Code, Description, Salariés (count), Active and Actions. Seed: Infirmières (INF), Personnel de sécurité (SEC), Personnel médical (MED), Responsable de service (RSV), Salariés administratifs (ADM).
Below it, a **SERVICES** section: *« Urgences, Pédiatrie, Bloc opératoire, Administration… Utilisés par la couverture du personnel et les rotations ; le service s'attribue dans la fiche du salarié. »* A **Ajouter** button and chips or cards with the employee count. Seed: Administration & RH, Bloc opératoire, Pédiatrie, Urgences.

**4. Rotations.** *« Une rotation propose un brouillon de planning (créneaux non publiés) : rien n'est publié automatiquement, le responsable RH relit puis publie dans le Planning. »* + **Nouvelle rotation**. Each rotation card shows: the name, a mode badge (*Automatique*), the unit (Jour / Semaine), the sequence (*Matin → Après-midi → Nuit → Repos*), the worked days (Lun–Ven), an Active toggle, the buttons **Affecter** and **Générer un brouillon**, a visual timeline (*Semaine 1 : Matin → Semaine 2 : Après-midi → … → le cycle recommence*) and an **AFFECTATIONS** list (*Service : Pédiatrie · du 16/11/2026 (sans fin)*). Seed: *Cycle 3×8 Pédiatrie*.
Generating a draft creates DRAFT ShiftAssignments for the target employees and range. It never overwrites published cells without confirmation.

**5. Couverture.** *« Effectif minimum (et maximum facultatif) par shift. Exemples : « Minimum 3 infirmières le matin », « Minimum 1 responsable de service par shift ». »* + **Ajouter une règle de couverture**. Columns: Shift (+ label), Service, Catégorie, Minimum, Maximum, Jours, Gravité, Active, Actions. Seed: Matin / Urgences / Infirmières / min 2 / max 4 / tous les jours / Bloquante, and Nuit / Urgences / Infirmières / min 1 / max 2 / Bloquante.

**6. Anomalies.** *« Contrôle en lecture seule : le planning n'est jamais modifié automatiquement. Corrigez-le dans le Planning ou autorisez une exception justifiée. »* Du / Au dates and **Analyser** (3 months maximum). Results are grouped by day like the planning side sheet. Below them, *EXCEPTIONS ENREGISTRÉES* (*Exceptions de la semaine en cours*) lists the date, rule, employee, justification, approver and a revoke action.

**7. Historique.** *« Les 200 dernières modifications des règles, shifts, catégories, rotations, couverture et exceptions. »* Actualiser. A timeline with a before/after diff.

### 7.12 Premium modules (build the screens; gate them by plan)
- **Acomptes** `/rh/acomptes`: *Demandes d'Acompte*. Employees request an advance (amount, reason); the lead and/or RH approve; an e-mail goes to the accounting address; approved advances flow into payroll as a deduction.
- **Notes de frais** `/rh/notes-de-frais`: expense claims with receipt photos, category, amount and VAT, an approval flow and reimbursement through payroll or separately.
- **Signature électronique** `/rh/signature`: upload a PDF, place signature fields, send to employees, track the status and store the signed PDF with an audit trail (simple advanced e-signature: OTP by e-mail, IP and timestamp).
- **Messagerie** `/rh/messages`: 1:1 and group conversations by team, real-time, with an unread badge (`/api/messages/unread`).
- **Tablettes de pointage** `/rh/tablettes`: register a kiosk tablet (it gets a device token). The kiosk page `/{org}/kiosk/[token]` lets employees clock in with a **Code borne (PIN)**, optionally taking a selfie. Tablet rules (`/api/organization/tablet-rules`) cover allowed IP ranges, geofence, whether the photo is required and the centre.
- **Gestion de la structure** `/rh/structure`: **Centres** (sites, e.g. *ex. Centre Bollène*) with name, address and an active flag, plus the toasts *Centre créé / modifié / supprimé*. Services and employees are attached to a centre, and every list can be filtered by centre.
- **Disponibilités** `/rh/disponibilites`: employees declare their availability and unavailability per day; the planning shows it as a background on the grid and warns when someone is scheduled while unavailable.

---

## 8. Team lead space (`/{org}/chef`)
Same shell with fewer items. Each item shows only when the related permission is on: Tableau de bord (team), **Équipe**, Planning, Présences, Congés, Rapports, **Dossiers** (team documents), Signature, Acomptes, Notes de frais, Messages, **Profil**. Every query is filtered to the lead's subordinates, and the lead's own requests go to RH.

## 9. Employee space (`/{org}/salarie`), mobile-first
- **Accueil**: next shift card, today's status (clocked in at… / late), leave balance and the latest notifications.
- **Planning**: their published shifts (week and month), downloadable as .ics.
- **Congés**: balances per type, requests with their status, and a new request (same modal as 7.5 with *Pour moi*).
- **Documents**: payslips (PDF) and HR documents.
- **Signature**: documents to sign.
- **Acomptes** and **Notes de frais** (if the plan allows).
- **Profil**: personal info, password, notification preferences.
- Absences and lateness history.

---

## 10. Authentication and onboarding flows
1. **Signup** (or creation by YGHR admin): organisation name → slug → RH user → plan → a setup checklist on the dashboard: *Ajouter des salariés → Configurer les shifts → Connecter une pointeuse → Créer la première période de paie*.
2. **Invite**: create a user with no password, e-mail the token link (7 days) → `/invite/[token]` to set the password → land in their space.
3. **Login**: e-mail and password → 2FA (if enabled) → if the user belongs to several organisations, `/select-org`.
4. Logging in, out and failing to log in all create audit logs (store the IP and user agent).

---

## 11. Business logic (`packages/core`, fully unit-tested)

### 11.1 Time calculation
- Every shift is a time interval anchored on a date; when the end is at or before the start, it ends the next day.
- `duration = amplitude − unpaid break`.
- **Night minutes** = the overlap between the worked interval and the org's night window (e.g. 21:00–06:00, which crosses midnight).
- **Normal minutes** = worked − night (for the split display); overtime is computed separately per week.
- **Overtime**: weekly worked hours above the threshold rule (default 44 h, the Moroccan legal week) or above the contract's weekly hours. Optionally split by day.
- **Weekly rest day**: hours worked on the configured rest day are flagged for the payroll premium.
- Use ISO weeks (Monday start) for the per-week columns.

### 11.2 Attendance from punches
- Pair punches chronologically for each employee into IN/OUT. The device in/out state is a hint only. A shift that crosses midnight belongs to its start day.
- Attach each pair to the nearest planned shift (within a configurable window, e.g. ±4h).
- **Lateness** = first IN − planned start − tolerance (rule *Retard toléré*, 10 min). Lateness counts only above the tolerance.
- **Status**: PRESENT (an open IN), ABSENT (planned, no IN after start + tolerance, or after OUT for the live board), LATE, LEAVE, OFF.
- Recompute an AttendanceDay whenever there is a new punch, a correction, a mapping, a planning change or a rule change (`/api/attendance/recompute-rules`).
- Timestamp source: the device clock, or the server receive time when `useServerTimeForPunches` is on.

### 11.3 Anomaly engine
`analyzePlanning(orgId, from, to) → Anomaly[]`, where `Anomaly = { key, ruleId?, type, severity, date, employeeId?, shiftTypeId?, message, advice, exceptionId? }`.
- Per employee: max weekly hours, max shift length, break required above X hours with a minimum length, min rest between shifts, min rest after a night shift (category-specific), weekly rest days, max consecutive nights, no night → morning, overtime threshold, and an overlapping leave or unavailability.
- Per shift and day: coverage minimum and maximum by service × category × shift (*Shift sans personnel*, *Sous-effectif*, *Sureffectif*).
- **Rule precedence**: a category-specific rule overrides the general rule of the same type. Inactive rules are ignored.
- An anomaly with an approved exception (matching `anomalyKey`) is shown as "exception autorisée" and does not block publishing.
- The messages are in French, as in 7.4.

### 11.4 Leave balances
- Accrual per month worked, an annual cap, the period start (MM-DD) and advance leave in the first year.
- Duration of a request = the days in the range that count under the method (*ouvrables* Mon–Sat, *ouvrés* Mon–Fri), minus public holidays, with half days supported.
- Show *acquis · pris · solde* and block the request (or warn, per settings) when it exceeds the balance.

### 11.5 Payroll (Morocco)
For each employee and period:
1. **Gross (brut)** = base (monthly base, or hourly rate × normal hours) + overtime with premiums + night premium + rest-day premium + primes + taxable allowances. Morocco overtime premiums (Code du travail art. 201): +25% (day, 6h–21h) and +50% (night, 21h–6h); on the weekly rest day +50% and +100%. Store them in the fiscal or labour version, not in code.
2. **CNSS employee** = 4.48% × min(gross, 6,000 DH). **IPE** (perte d'emploi) 0.19% × min(gross, 6,000).
3. **AMO employee** = 2.26% × gross (no ceiling).
4. **Professional expenses** = a rate × gross taxable, capped (store the rates and caps in the rule version; sources disagree between versions of the finance law. Seed 35% if annual gross ≤ 78,000 DH, else 25%, with an annual cap of 35,000 DH, and flag it for verification).
5. **Net taxable** = gross taxable − CNSS − AMO − IPE − (CIMR if any) − professional expenses.
6. **IR** from the annualised scale. Seed (LF 2025, unchanged for 2026 according to most sources): 0–40,000: 0% · 40,001–60,000: 10% (deduct 4,000) · 60,001–80,000: 20% (10,000) · 80,001–100,000: 30% (18,000) · 100,001–180,000: 34% (22,000) · >180,000: 37% (27,400). Monthly IR = annual / 12. Subtract the family-dependents deduction (seed: 500 DH per year per dependent, max 6, editable), never going below 0.
7. **Net to pay** = gross − CNSS − IPE − AMO − IR − advances − other deductions + non-taxable reimbursements (transport, expenses).
8. **Employer charges** (shown on the journal): CNSS 8.98% (ceiling 6,000), allocations familiales 6.40%, AMO 4.11%, AMO solidarité 1.85%, IPE 0.38% (ceiling 6,000), taxe de formation professionnelle 1.6%.
9. **SMIG check**: warn when the hourly or monthly rate is below the SMIG stored in the version.
- Round to 2 decimals and show every line on the payslip.
- **Payslip PDF**: org header, employee block (matricule, CNSS no., CIN, position, hire date, category), period, lines (rubrique, base, taux, gains, retenues), totals, cumulative year-to-date, and net in figures and words (French).

### 11.6 FiscalRuleVersion (JSON, admin-editable, versioned by `validFrom`)
```json
{
  "currency": "MAD",
  "cnss": { "employeeRate": 0.0448, "employerRate": 0.0898, "ceiling": 6000 },
  "ipe": { "employeeRate": 0.0019, "employerRate": 0.0038, "ceiling": 6000 },
  "amo": { "employeeRate": 0.0226, "employerRate": 0.0411, "solidarityEmployerRate": 0.0185 },
  "familyAllowanceEmployerRate": 0.064,
  "trainingTaxEmployerRate": 0.016,
  "profExpenses": [{ "upToAnnualGross": 78000, "rate": 0.35 }, { "rate": 0.25 }], "profExpensesAnnualCap": 35000,
  "irBrackets": [[40000,0,0],[60000,0.10,4000],[80000,0.20,10000],[100000,0.30,18000],[180000,0.34,22000],[null,0.37,27400]],
  "familyDeductionPerDependentAnnual": 500, "familyDependentsMax": 6,
  "overtime": { "day": 0.25, "night": 0.50, "restDayDay": 0.50, "restDayNight": 1.00 },
  "smig": { "hourly": null, "monthly": 3111.39 }
}
```
The period stores the version it used, and a locked period never changes.

---

## 12. Biometric device integration
- **LAN mode** (ZKTeco TCP on port 4370): `POST /api/devices/test` connects from the server, reads the serial number, model and firmware, and returns success or failure with a clear French error (*« Appareil injoignable : vérifiez l'IP, le port et que le serveur est sur le même réseau. »*). The worker polls attendance logs, upserts punches deduplicated on (deviceId, deviceUserId, timestamp) and updates `lastSeenAt`. Device actions: sync users, set the device time, clear logs (with a confirm dialog).
- **ADMS / cloud push** mode: implement the iClock protocol endpoints (`GET /iclock/cdata?SN=` handshake, `POST /iclock/cdata?table=ATTLOG` lines, `GET /iclock/getrequest`). Accept only registered serial numbers.
- Unknown device user IDs appear in *Empreintes → Employés* until they are mapped.
- Every punch emits `punch:new` and triggers an attendance recompute.

---

## 13. Non-functional requirements
- **Security**: tenant isolation tests, rate-limited login, CSRF protection on cookie auth, secrets in env, hashed PINs, signed upload URLs, RBAC on every route, audit log on every write.
- **Performance**: planning grid at 200 employees × 31 days stays smooth (virtualise the rows); dashboard stats under 300ms (aggregate queries plus a short cache).
- **Reliability**: idempotent punch ingestion, retry queues, health checks for the web, socket and worker processes.
- **i18n**: `next-intl`, French complete, with the structure ready for `ar` (RTL) and `en`.
- **Testing**: Vitest for `packages/core` (time, anomalies, leave, payroll with fixtures, including midnight-crossing shifts and CNSS ceiling cases) and Playwright end-to-end tests for login, adding an employee, planning → publish, a leave request → approval and a payroll calculation.
- **Docs**: `README` with setup, `.env.example` and `docker compose up` to run everything; seed script `pnpm db:seed`.

---

## 14. Build order (milestones and acceptance criteria)

1. **Foundation**: monorepo, Docker, Prisma schema, auth (login, invite, reset, 2FA), tenancy middleware, plans and gating, YGHR design system and shell (dark sidebar, top bar, command palette), audit logging. *✅ RH can log in to `/{slug}/rh`; locked pages show LockedFeature; every login is audited.*
2. **Settings and rules**: organisation settings, night window, rest day, and the full *Règles des shifts* module (7 tabs) with the seeds above, plus history. *✅ The seeded rules, shifts, categories, services, rotation and coverage are visible and editable, and changes appear in Historique.*
3. **Employees**: list, profile, add modal, Excel import with preview, team leads with permissions. *✅ Import 50 rows from the template; invites go out; a lead sees only their team.*
4. **Planning**: week and month grid, editing, rotation draft generation, the anomaly engine, the side sheet, exceptions, publish, print. *✅ Seeded coverage produces "Shift sans personnel" on an empty week; publishing is blocked until fixed or excepted.*
5. **Devices and attendance**: LAN test and polling, ADMS endpoints, latest punches, mapping, live presence board, corrections and validation screen, realtime. *✅ A simulated device pushes ATTLOG lines; the board updates within 2s; lateness is computed with the tolerance.*
6. **Leave**: policy, balances, requests and approval, planning integration. *✅ A 5-day request excluding a holiday counts correctly; approval updates the planning and the balance.*
7. **Reports**: the activity report with dynamic ISO-week columns, export. *✅ Totals match the AttendanceDay sums.*
8. **Payroll**: periods, the calculation engine with versioned fiscal rules, payslip PDF, lock, exports. *✅ Fixture payslips match hand-computed values (gross 4,000 / 9,505.20 / 15,000 DH).*
9. **Dashboard**: all widgets live. *✅ The empty-state and populated screens both look right.*
10. **Employee and team lead spaces**.
11. **Premium modules**: tablets and kiosk PIN, advances, expenses, e-signature, messaging, structure and centres, availability.
12. **Polish**: dark mode, a11y audit, PWA and push, performance pass, Playwright suite green.

---

## 15. Seed / demo data
Create a demo organisation **« Clinique Démo YGHR »** (slug `clinique-demo`, timezone Africa/Casablanca, currency DH, night window 21:00–06:00) with:
- The RH user `rh@demo.yghr.ma` (password printed by the seed script).
- The services, categories, shift types, work rules, coverage rules and the 3×8 Pédiatrie rotation listed in 7.11.
- Optionally (`SEED_DEMO=1`): 25 employees across services, two weeks of published planning, simulated punches (some late, one missing OUT), 3 leave requests and one calculated payroll period. This lets every screen be reviewed with realistic data.
- The Moroccan public holidays for the current and next year.
- The Essentiel / Pro / Entreprise plans.

---

*End of brief. Build YGHR milestone by milestone, keep business logic pure and tested, and apply the YGHR visual identity everywhere.*
