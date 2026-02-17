# Bank Lending Strategy Optimizer

Express + PostgreSQL app for exploring FRED economic data and FDIC bank performance data.

## What Works

- Pages: `/`, `/bank-performance`
- Data APIs:
  - `GET /api/economic-data`
  - `GET /api/economic-data?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
  - `GET /api/bank-performance/:cert`
  - `GET /api/correlation?cert=628`
- Strategies CRUD API:
  - `GET /api/strategies`
  - `GET /api/strategies/:id`
  - `POST /api/strategies`
  - `PUT /api/strategies/:id`
  - `DELETE /api/strategies/:id`

## Quick Start

```bash
cp .env.EXAMPLE .env
# set DB_* and SESSION_SECRET

createdb bank_lending_db
psql -d bank_lending_db -f db/schema.sql
python3 db/seed_database.py

npm install
npm start
```

Open: `http://localhost:3001`

## Notes

- Seeding normalizes common notebook aliases (for example `unemployment` → `unemployment_rate`, `yield_spread` → `yield_curve`).
- Auth/UI workflows are not implemented yet.

## Structure

`routes/`, `controllers/`, `models/`, `views/`, `db/`, `config/`
