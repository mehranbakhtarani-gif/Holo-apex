# MASTER.md — Holo Apex Accounting PWA

Version: 1.1  
Status: Active implementation specification  
Platform: React + TypeScript + Vite + Tailwind CSS + PWA  
Language: Persian (fa-IR), RTL  
Font: Vazirmatn  
Domain: Corporate accounting, commerce, inventory, treasury and reporting

## 1. Visual direction
Modern Fintech Bento Grid with high-density accounting tables. Use blue as the primary financial-trust color, indigo for commercial and FX workflows, and semantic colors for incoming/outgoing money, stock, warnings and reconciliation issues. Avoid decorative gradients, neon effects and excessive glassmorphism. Preserve existing modules, data models, offline queues and synchronization logic. Never replace production data with demo fixtures.

## 2. Color tokens

| Token | HEX | Use |
|---|---|---|
| Primary 600 | #1D4ED8 | Main actions, active navigation, selected controls |
| Primary 50 | #EFF6FF | Selected rows and primary soft surfaces |
| Secondary / Indigo 600 | #4F46E5 | Import, customs, FX and commercial modules |
| Success 600 | #059669 | Positive icons, incoming money and success accents |
| Success text | #047857 | Text on #ECFDF5; contrast 5.21:1 |
| Success surface | #ECFDF5 | Positive status backgrounds |
| Danger 600 | #DC2626 | Error icons and destructive accents |
| Danger text | #B91C1C | Text on #FEF2F2; contrast 5.91:1 |
| Danger surface | #FEF2F2 | Error and outgoing-money backgrounds |
| Warning 600 | #D97706 | Warning icons and emphasis |
| Warning text | #92400E | Text on #FFFBEB; contrast 6.84:1 |
| Warning surface | #FFFBEB | Offline, pending and reconciliation backgrounds |
| Info 600 | #0891B2 | Stock and inventory accents |
| Info text | #155E75 | Text on #ECFEFF; contrast 6.99:1 |
| Info surface | #ECFEFF | Inventory and information backgrounds |
| App background | #F1F5F9 | Global application canvas |
| Card surface | #FFFFFF | Cards, tables and dialogs |
| Border | #E2E8F0 | Dividers and card boundaries |
| Text primary | #0F172A | Headings and financial values |
| Text secondary | #475569 | Helper text, dates and account codes |

### Contrast policy
Target WCAG 2.2 AA: normal text >=4.5:1, large text >=3:1, and essential non-text controls >=3:1 where applicable. Primary 600 on white is 6.70:1; Primary 600 on Primary 50 is 6.16:1; Indigo 600 on white is 6.29:1. Use the darker semantic text tokens above on tinted semantic surfaces. Brighter semantic 600 colors are accent/icon colors and must not be assumed to pass normal-text contrast. AAA (7:1 for normal text) is a bonus target where feasible, not a blanket claim.

## 3. Typography and numeric data
Use Vazirmatn weights 400, 500, 700 and 800. Use IBM Plex Mono only for Latin codes or fixed-width technical identifiers where appropriate. Persian financial values remain Vazirmatn with tabular numerals.

| Role | Size | Weight |
|---|---:|---:|
| Page title | 20px | 700 |
| Card / section heading | 16px | 700 |
| KPI value (mobile) | 24px | 800 |
| KPI value (desktop) | 28px | 800 |
| Table data / inputs | 14px | 500 |
| Badge / helper | 12px | 400 |

All amounts, account codes, weights, invoice numbers, debit/credit columns and balances must use `font-variant-numeric: tabular-nums`. Format money and dates consistently using the company's configured currency and calendar. Do not round stored values for presentation.

## 4. Layout and responsive behavior
Use a 4px base spacing scale with primary rhythm at 8px. Card padding: 16px mobile, 24px desktop. Card/dialog radius: 16px; buttons/inputs: 12px; status badges: 8px.

Desktop (>=768px): right-side collapsible navigation, sticky table headers, dense data tables and Bento dashboard.  
Mobile (<768px): fixed bottom navigation for dashboard, invoice, inventory/import and reports; quick-action FAB; one-hand-friendly controls. Convert invoice and voucher rows to compact two-column cards. Keep all important fields visible without page-level horizontal scrolling. Any unavoidable wide comparison table may scroll only inside its own bounded container.

Breakpoints: 320–359 small mobile; 360–767 mobile; 768–1023 tablet; 1024–1279 laptop; >=1280 desktop.

## 5. Interaction and accessibility
Every interactive target >=44x44px with >=8px separation. Provide visible focus, active, disabled, loading, success and error states. Use 150–300ms transitions and respect prefers-reduced-motion. Use skeleton loaders for data loading rather than blocking full-screen spinners. Labels must remain visible; placeholders are not labels. Never communicate status through color alone.

## 6. Financial workflows and semantic colors
- Incoming funds, sales and positive balances: Success.
- Outgoing funds, expenses and debit/error states: Danger.
- Pro-forma, pending documents, offline warnings and reconciliation: Warning.
- Inventory, stock and product references: Info.
- Import, customs, FX and commercial operations: Indigo.

Destructive actions require confirmation. Prevent duplicate submissions. A success message or sound may occur only after the underlying save operation has actually succeeded. A draft, local save and cloud synchronization are distinct states.

## 7. Offline-first PWA and synchronization
Show a persistent status pill reflecting actual storage/sync state:
- Green: confirmed synchronized.
- Amber: offline/local queue; data persisted locally.
- Blue: peer-to-peer transfer is available or active, only when that capability is truly connected.
- Conflict: explicit conflict state with a review path.

Use IndexedDB/local persistence for offline workflows where implemented. Do not label local-only data as cloud-synchronized. Do not overwrite conflicting accounting data automatically. Preserve idempotency keys, audit history, queue visibility and retry feedback. Service-worker caching must not cache sensitive API responses as public static assets.

## 8. Audio feedback
Web Audio API feedback is optional and must be subtle, short and user-controllable with a mute setting. Play success chime only after a confirmed successful save. Play warning feedback only for actionable validation errors such as unbalanced vouchers or insufficient stock. Audio must never be the sole feedback channel and must respect browser autoplay restrictions.

## 9. Strict anti-patterns
1. No page-level horizontal overflow at any mobile width, including dialogs.
2. No interactive target below 44x44px; keep at least 8px spacing.
3. No blocking full-screen spinner for ordinary list/report loading; use skeletons.
4. No decorative purple/pink/neon gradients or noisy visual effects.
5. No proportional numerals in financial columns; always use tabular numerals.
6. No placeholder-only form labels.
7. No color-only status indicators.
8. No destructive action without confirmation.
9. No duplicate financial submissions from repeated taps.
10. No false "synced" state when only local persistence succeeded.
11. No automatic overwrite of unresolved sync conflicts.
12. No hidden critical columns on mobile; transform rows into cards.
13. No tiny icon-only actions without accessible labels.
14. No unnecessary long animations or motion that ignores reduced-motion preferences.
15. No demo data mixed into production accounting records.

## 10. Module coverage
Preserve the existing modules: dashboard, invoices, vouchers, audit, accounts, parties, inventory, treasury, corporate, reports, brand studio, settings, currencies, import/subcontract, finance operations, warehouse/CRM operations, system health, offline sync and PWA installation. Module implementation and data contracts must remain intact while visual tokens are applied consistently.

## 11. Release acceptance checklist
- [ ] RTL verified on all modules and mixed Persian/Latin identifiers.
- [ ] No page-level horizontal overflow at 320, 360, 390, 768, 1024 and 1440px.
- [ ] All touch targets >=44px and spacing >=8px.
- [ ] Tables transform into two-column mobile cards below 768px.
- [ ] Numeric columns use tabular numerals.
- [ ] Contrast checked for real text/background combinations.
- [ ] Skeleton states exist for asynchronous data.
- [ ] Online/offline/sync/conflict states reflect actual persistence.
- [ ] Financial save operations are idempotent and auditable.
- [ ] PWA install, offline shell and service-worker update are tested.
- [ ] Existing accounting data and workflows remain unchanged.
