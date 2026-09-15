# Corporate Deals seed (W37 / Sep 2026)

Reconstructed from `FEC_Corporate_Deals_Weekly_Report_W37` PDF because BookingQube CSV/xlsx exports were not attached.

- Weekly rows: partner×venue matrix matching PDF partner redemptions + venue split (tickets/discount allocated within venue; aggregator discount share ~68%).
- Month rows: PDF Summary partner MTD figures, spread across venues using the week mix.
- Internal / promotion (loyalty, cafe, karak): workbook Weekly Log + Month Data figures (W37 total 40, Sep MTD 79) — excluded from partner KPIs.
- Trend rows: PDF monthly trend table (May–Sep 2026) as corp/agg aggregates.
- Promo codes `SEED-*` are synthetic. Ops-confirmed codes (incl. loyalty*) are seeded into `corporate_deal_codes`.

Reload: `node --env-file=.env.local scripts/seed-corporate-deals-w37.mjs`
