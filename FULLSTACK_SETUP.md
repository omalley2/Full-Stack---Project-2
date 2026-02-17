# Full-Stack Setup

This is the minimal setup reference for running the project end-to-end.

## Prerequisites

- PostgreSQL running locally
- Node.js 16+
- Python 3 with packages from `requirements.txt`
- Exported notebook CSVs in `data/`:
  - `fred_data.csv`
  - `bank_data.csv`

## Setup

```bash
cp .env.EXAMPLE .env
# set DB_* and SESSION_SECRET

createdb bank_lending_db
psql -d bank_lending_db -f db/schema.sql
python3 db/seed_database.py

npm install
npm start
```

Open `http://localhost:3001`.

## Implemented Routes

- Pages: `/`, `/bank-performance`
- Data APIs:
  - `GET /api/economic-data`
  - `GET /api/economic-data?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
  - `GET /api/bank-performance/:cert`
  - `GET /api/correlation?cert=628`
- Strategies CRUD:
  - `GET /api/strategies`
  - `GET /api/strategies/:id`
  - `POST /api/strategies`
  - `PUT /api/strategies/:id`
  - `DELETE /api/strategies/:id`

## Reset Database

```bash
dropdb --if-exists bank_lending_db
createdb bank_lending_db
psql -d bank_lending_db -f db/schema.sql
python3 db/seed_database.py
```

## Common Issues

- DB missing: run `createdb bank_lending_db`
- CSV missing: re-run notebook export cell
- Port busy: `lsof -ti:3001 | xargs kill`
- Postgres down: start local postgres service
