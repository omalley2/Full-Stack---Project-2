# Project Setup Guide

This file is the short setup reference.

## Run Locally

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

## Implemented Endpoints

- Pages: `/`, `/economic-data`, `/bank-performance`
- Data APIs: `/api/economic-data`, `/api/bank-performance/:cert`, `/api/correlation?cert=628`
- Strategies CRUD: `/api/strategies` + `/:id` (`GET`, `POST`, `PUT`, `DELETE`)

## Current Scope

- MVC routing/controller/model structure is in place
- Seeding normalizes common notebook aliases
- Auth/UI workflows are not implemented yet
