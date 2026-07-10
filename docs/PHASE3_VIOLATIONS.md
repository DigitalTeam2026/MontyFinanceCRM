# PHASE 3 — RAW-VALUE RENDERING VIOLATIONS

Consolidated from a 4-way parallel audit (grids/subgrids, forms/detail, dashboards/timeline/filters, exports/notifications/automation/audit). Severity: **P1** = user sees a raw code/UUID today · **P2** = formatting/correctness gap · **P3** = minor / edge / dead code.

## A. Subgrids & related lists — includes the ORIGINAL BUG

| # | Sev | File | Function | Field/context | Problem |
|---|---|---|---|---|---|
| A1 | **P1** | src/app/services/subgridService.ts:511-523 | `resolveSubgridLookups` | `state_code` / `status_reason` | Only resolves `lookup` + columns carrying `optionSetId`/`inlineChoices`. A `statecode`/`statusreason` field (no option set, resolved via definition tables) is never resolved → **Contacts subgrid "Status" shows `1`.** ← original bug |
| A2 | P1 | src/app/components/form/FormSubgrid.tsx:356-375 | `load` (static-config path) | `state_code` badge, opportunity `stage` | `resolveSubgridLookups` runs only when `rawViewCols.length>0`; the static `SUBGRID_CONFIGS` path renders rows unresolved |
| A3 | P1 | src/app/components/form/FormSubgrid.tsx:140-147 | `CellValue` (badge) | choice/option_set/multi_choice | Keys color off the raw value and prints `str.replace(/_/g,' ')`, assuming an already-resolved label |
| A4 | P2 | src/app/components/form/FormSubgrid.tsx:132-138 | `CellValue` (boolean) | any boolean | Hard-coded Yes/No from truthiness; `'0'`/`'false'` strings are truthy → renders **Yes** for a stored false |
| A5 | P2 | src/app/components/form/FormSubgrid.tsx:55-70 | `resolveColType` | lookup/owner | `lookup`/`owner` not mapped → fall through to `text`; raw GUID if the id column is selected |

## B. Forms — read-only / detail views

Root cause: `FormField.tsx` has **no read-only display path** — every type reuses its editable input in a `disabled` state. Label-resolving types (choice/lookup/boolean) survive; value-formatting types leak.

| # | Sev | File | Field/context | Problem |
|---|---|---|---|---|
| B1 | P2 | src/app/components/form/FormField.tsx:824-834 | datetime read-only | `value={strVal.slice(0,16)}` → raw UTC ISO, no locale/timezone |
| B2 | P2 | src/app/components/form/FormField.tsx:867-889 | currency/decimal read-only | Disabled `<input type=number>` → no thousands separators |
| B3 | P2 | src/app/components/form/FormField.tsx:836-848 | number/integer read-only | No `toLocaleString` grouping |
| B4 | P2 | src/app/components/form/FormField.tsx:812-822 | date read-only | Native `<input type=date>` renders **blank** if value is a full ISO timestamp |
| B5 | P2 | src/app/components/ProcessStageBar.tsx:219-241 | read-only currency/decimal/datetime | Same disabled-input leaks (no symbol/separators; raw UTC) |

## C. Grids / list views

| # | Sev | File | Field/context | Problem |
|---|---|---|---|---|
| C1 | P2 | src/app/components/list/renderListCell.tsx:76-92 | badge (choice/status) | Badge color **guessed from label text** (`active`→green…), not the field's defined `color` (status_reason_definition & some choices carry hex colors) |
| C2 | P3 | src/app/components/list/renderListCell.tsx:150-152 | lookup | Resolved name rendered as plain text, **not a clickable link** to the record |
| C3 | P3 | src/app/components/list/renderListCell.tsx:154-163 | boolean | Hard-coded Yes/No; ignores per-field defined true/false labels |
| C4 | P3 | src/app/pages/EntityListPage.tsx:541-546,607-617 | inline-edit choice/lookup | Inline edit seeds the resolved **label** into a plain text input; saving would write the label back as the code (edit-affordance leak, not display) |

## D. Dashboards / charts

Mostly clean via `admin/dashboards/visuals/labelResolver.ts`. Remaining leaks:

| # | Sev | File | Field/context | Problem |
|---|---|---|---|---|
| D1 | P1 | src/admin/dashboards/visuals/ValueSlicerVisual.tsx:91-104 | choice slicer | No `labelEntity` for choice type → falls back to `{id:v,label:v}` → renders raw choice codes |
| D2 | P2 | src/admin/dashboards/visuals/formatValue.ts:13-16 | currency measures | `currency:'USD'` hard-coded for all KPI/chart/breakdown currency values |
| D3 | P2 | src/admin/dashboards/visuals/VisualRenderer.tsx:260-281 | matrix table | Headers render raw result keys; measure cells get no numeric/currency/date formatting |
| D4 | P3 | src/admin/dashboards/visuals/formatValue.ts:30-43 | pure-date labels | Only ISO **timestamps** (with `T`) reformatted; a plain `2024-05-01` date passes through verbatim |

## E. Server / Power Automation (backend has NO metadata resolver)

| # | Sev | File | Field/context | Problem |
|---|---|---|---|---|
| E1 | P1 | server/automationWorker.js:373-398 | `generate_document` CSV/XLSX | Writes `r[physical]` raw — choice codes, lookup UUIDs, state/status ints, booleans, dates, currency all raw; header row is logical name not display label |
| E2 | P1 | server/automationWorker.js:289-295 | `list_rows` | Raw row objects flow into `{{steps.*.rows}}` email bodies |
| E3 | P1 | server/tokenResolver.js:36-50,82-84 | `{{record.field}}` / `.rows` in emails | Interpolates `ctx.after[field]` (raw `change_snapshot.after`) into sent email subject/body — never label-resolved |

## F. Audit / history views

| # | Sev | File | Field/context | Problem |
|---|---|---|---|---|
| F1 | P1 | src/app/components/form/FieldHistoryPanel.tsx:48-63,144,226-247,483-522 | old→new value (view + CSV) | No resolution for choice/option-set or state/status codes; UUID resolution limited to a hard-coded `lookupTables` list → other lookups stay raw UUIDs |
| F2 | P1 | src/admin/merges/MergeAuditLogPage.tsx:189-191 | merged field old/new | Renders `old_value`/`new_value` fully raw (all types) |

## G. Central-resolver latent bug (found first-hand in Phase 2)

| # | Sev | File | Problem |
|---|---|---|---|
| G1 | P1(latent) | src/app/services/displayResolver.ts:278-285 | `resolveDisplayValue` choice branch resolves only via `option_set_value` (an **empty** table) and never reads inline `config_json.choices`. Any inline-choice field routed through it (FilterPanel fallback, QualifyLeadModal, subgrid fallback) leaks the raw code. Also: no color, no email/phone/URL links. |

## Dead code to delete (contains violations but unused)

- `src/app/components/form/RecordSubgrid.tsx` — orphan subgrid, unresolved badge/text cells
- `src/app/components/form/FieldControl.tsx` — orphan, renders raw lookup UUID

## Surfaces verified CLEAN (no action)

Main list grid display (`gridResolver` + `renderListCell`), list exports (`EntityListPage`/`BulkActionsBar` operate on resolved rows), `listService.applyStatusLabels`, dashboard main path (`labelResolver` + `TableVisual`/`echartsOptions`), timeline (text enums via style maps), FormField choice/lookup/boolean/multi_choice, borrowed read-only fields, LookupDialog/LookupField, StatusDropdown, recordService assignment notifications, rule-matching (correctly matches on codes). No kanban/board surface exists.
