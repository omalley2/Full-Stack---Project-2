# Database Schema

## Source of Truth

Use `db/schema.sql` as the authoritative schema.

## Current Tables

- `users`
- `economic_data`
- `bank_performance`
- `lending_strategies`
- `portfolio_allocations`
- `saved_scenarios`
- `scenario_allocations`
- `performance_records`
- `alert_settings`

## Key Relationship Pattern

- `users` own strategies, scenarios, and alerts
- strategies have allocations and performance records
- scenarios link to allocations via `scenario_allocations`

## Indexes

Indexes exist for date/cert filters and common foreign keys (see `db/schema.sql`).

## Notes

- If this file differs from `db/schema.sql`, trust `db/schema.sql`.
- Seeding and CSV normalization behavior are in `db/seed_database.py`.