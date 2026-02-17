# Quick Start

## 1. Prerequisites

- PostgreSQL running
- Node.js 16+
- Python 3 with packages from `requirements.txt`
- Exported notebook CSVs in `data/`:
  - `fred_data.csv`
  - `bank_data.csv`

## 2. Setup

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

## 3. Useful Checks

```bash
curl http://localhost:3001/api/economic-data
curl http://localhost:3001/api/bank-performance/628
curl 'http://localhost:3001/api/correlation?cert=628'
curl http://localhost:3001/api/strategies
```

## 4. Common Issues

- DB missing: run `createdb bank_lending_db`
- CSV missing: re-run notebook export cell
- Port busy: `lsof -ti:3001 | xargs kill`
- Postgres down: start your local postgres service
