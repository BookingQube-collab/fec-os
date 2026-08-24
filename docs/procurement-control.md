# PR & Procurement Control

Phase 1 of purchase requisition control. Existing **vendors** and **purchase_orders** (`/pos`) are reused, not duplicated.

## Audit (exists vs missing)

| Area | Status |
| --- | --- |
| Vendors, contacts, contracts | Exists — `vendors` module |
| Simple PO queue | Exists — `purchase_orders` + `/pos` |
| Compliance quotations/payments | Exists — documents/AMC, not PRs |
| Inventory item master | Exists — **not** used as PR catalog (separate `proc_items` stub) |
| Purchase requisitions / DOA | **New in this module** |
| Budget master / commitments | Tables only (Phase 3) |
| Competitive quotations UI | Tables only (Phase 2) |
| PO/GRN from approved PR | Deferred — `po_id` FK stub |

## Migration

`supabase/migrations/20260819120000_pr_procurement_control.sql`

## Routes

- `/procurement` dashboard
- `/procurement/requisitions` list
- `/procurement/requisitions/new`
- `/procurement/requisitions/[id]` approval workspace
- `/procurement/my-requests`
- `/procurement/approvals`
- `/procurement/config` DOA thresholds

## Approval routing

Configurable `pr_doa_matrix` (not hardcoded amounts in UI):

- Low ≤ 5,000 QAR → Dept Head → Finance
- Medium ≤ 20,000 → DH → GM → Finance
- High → DH → GM → CEO → Finance
- Emergency priority: DH → Finance (never skips Finance)
- Price variance / budget exception can insert CEO (config flags)
- Requester cannot approve their own PR

## AI-assisted create

`/procurement/requisitions/new` asks for a short note + site. **AI Assist** drafts:

- Department, cost centre, goods/services, opex/capex, priority, required-by date
- Approver justification
- Line items (name, qty, unit, estimated QAR price, catalog/vendor match)

Requester reviews prices and submits. Fallback heuristics apply if no AI key is configured.

## How to test

1. Run `npm run db:push`
2. **Requester** (e.g. cashier_host / technician): create PR at `/procurement/requisitions/new` — write a few sentences, tap AI Assist, review, submit
3. **Duty manager**: `/procurement/approvals` → approve dept step (not on own PR)
4. **Branch GM**: GM band amounts
5. **CEO / COO**: high band + config
6. **CFO / regional_ops**: finance step
7. Create a PR as CEO and confirm approve is blocked on that record

## Deferred (not faked as complete)

- Item master admin UI, labor rates
- Full quotation comparison UI
- Budget transfers / dashboards (placeholder remaining budget only)
- PO/GRN conversion, vendor scorecards, savings tracker
- AI OCR, WhatsApp, PDF report packs
