import os
from pathlib import Path
from datetime import datetime

import pandas as pd
from dotenv import load_dotenv
import psycopg2


def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')

    cfg = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': int(os.getenv('DB_PORT', '5432')),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', ''),
        'dbname': os.getenv('DB_NAME', 'bank_lending_db'),
    }

    out_dir = Path(__file__).resolve().parents[1] / 'data' / 'exports'
    out_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    queries = [
        (f'bank_performance_{timestamp}.csv', 'SELECT * FROM bank_performance ORDER BY date, cert_number;'),
        (f'economic_data_{timestamp}.csv', 'SELECT * FROM economic_data ORDER BY date;'),
        (
            f'capstone_joined_active_{timestamp}.csv',
            '''
            SELECT
                b.cert_number,
                b.bank_name,
                b.date::date AS bank_date,
                b.total_assets,
                b.total_deposits,
                b.total_loans,
                b.net_income,
                b.roa,
                b.roe,
                b.nim,
                b.efficiency_ratio,
                b.tier1_capital_ratio,
                b.active,
                e.date::date AS econ_date,
                e.unemployment_rate,
                e.fed_funds_rate,
                e.gdp_growth,
                e.yield_curve,
                e.delinq_cc,
                e.delinq_mortgage
            FROM bank_performance b
            LEFT JOIN economic_data e
              ON DATE_TRUNC('month', b.date) = DATE_TRUNC('month', e.date)
            WHERE b.active = TRUE
            ORDER BY b.date, b.cert_number;
            ''',
        ),
    ]

    conn = psycopg2.connect(**cfg)
    try:
        for filename, sql in queries:
            df = pd.read_sql_query(sql, conn)
            path = out_dir / filename
            df.to_csv(path, index=False)
            print(f'exported={path} rows={len(df)} cols={df.shape[1]}')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
