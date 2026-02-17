"""
Seed the PostgreSQL database with FRED economic data and FDIC bank performance data
from the Jupyter notebook analysis.

Run this script after:
1. Creating the database: createdb bank_lending_db
2. Running the schema: psql -d bank_lending_db -f db/schema.sql
3. Executing all data collection cells in the notebook

Usage:
    python3 db/seed_database.py
"""

import os
import sys
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime
import re
import pandas as pd
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection parameters
DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'bank_lending_db'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432')
}

CANONICAL_BANK_NAMES_BY_CERT = {
    628: 'JPMorgan Chase',
    3510: 'Bank of America',
    3511: 'Wells Fargo',
    7213: 'Citibank',
    6548: 'U.S. Bank',
    33124: 'Goldman Sachs Bank',
    18409: 'TD Bank',
    4297: 'Capital One',
    6560: 'Huntington National Bank',
}

def connect_to_database():
    """Establish connection to PostgreSQL database"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print(f"✓ Connected to database: {DB_CONFIG['dbname']}")
        return conn
    except Exception as e:
        print(f"✗ Error connecting to database: {e}")
        sys.exit(1)

def clean_bank_name(name):
    """Normalize bank names and remove trailing punctuation artifacts like ' - ,'"""
    if not name:
        return None

    cleaned = str(name).strip()
    cleaned = re.sub(r'\s*-\s*,\s*$', '', cleaned)
    cleaned = re.sub(r'\s*,\s*$', '', cleaned)
    cleaned = re.sub(r',\s*National Association\s*$', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+National Association\s*$', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+Bank USA\s*$', ' Bank', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+', ' ', cleaned)

    canonical_name_map = {
        'the huntington national bank': 'Huntington National Bank',
        'huntington': 'Huntington National Bank',
        'huntington national bank': 'Huntington National Bank',
    }

    normalized_key = cleaned.strip().lower()
    return canonical_name_map.get(normalized_key, cleaned.strip())

def canonical_bank_name(cert, source_name):
    """Return canonical bank name by CERT when available, otherwise normalized source name."""
    cert_int = int(cert) if cert is not None else None
    if cert_int in CANONICAL_BANK_NAMES_BY_CERT:
        return CANONICAL_BANK_NAMES_BY_CERT[cert_int]
    return clean_bank_name(source_name)

def normalize_economic_columns(df):
    """Map exported notebook column names to DB schema column names."""
    normalized = df.copy()

    alias_map = {
        'unemployment': 'unemployment_rate',
        'yield_spread': 'yield_curve',
        'fed_funds_rate_lag1': 'fed_funds_lag1',
        'fed_funds_rate_lag3': 'fed_funds_lag3',
        'fed_funds_rate_lag6': 'fed_funds_lag6',
        'fed_funds_rate_delta': 'fed_funds_change',
        'unemployment_delta': 'unemployment_change',
    }

    for source_col, target_col in alias_map.items():
        if source_col in normalized.columns and target_col not in normalized.columns:
            normalized[target_col] = normalized[source_col]

    # If GDP growth is missing but GDP level exists, derive % growth.
    if 'gdp_growth' not in normalized.columns and 'gdp' in normalized.columns:
        normalized['gdp_growth'] = normalized['gdp'].pct_change() * 100

    return normalized

def seed_economic_data(conn, df):
    """
    Insert FRED economic data into economic_data table
    
    Args:
        conn: Database connection
        df: DataFrame with FRED data (from notebook variable 'df')
    """
    print("\n📊 Seeding economic data...")
    
    cur = conn.cursor()
    
    # Prepare the data - convert to monthly if needed and reset index
    df = df.copy()
    if df.index.name != 'date':
        df = df.reset_index()
    
    # Map DataFrame columns to database columns
    column_mapping = {
        'delinq_cc': 'delinq_cc',
        'delinq_mortgage': 'delinq_mortgage',
        'delinq_consumer': 'delinq_consumer',
        'fed_funds_rate': 'fed_funds_rate',
        'prime_rate': 'prime_rate',
        'mortgage_30y': 'mortgage_30y',
        'treasury_10y': 'treasury_10y',
        'treasury_2y': 'treasury_2y',
        'unemployment_rate': 'unemployment_rate',
        'gdp_growth': 'gdp_growth',
        'cpi': 'cpi',
        'housing_starts': 'housing_starts',
        'personal_income': 'personal_income',
        'consumer_sentiment': 'consumer_sentiment',
        'net_interest_margin': 'net_interest_margin',
        'yield_curve': 'yield_curve',
        'unemployment_lag1': 'unemployment_lag1',
        'unemployment_lag3': 'unemployment_lag3',
        'unemployment_lag6': 'unemployment_lag6',
        'fed_funds_lag1': 'fed_funds_lag1',
        'fed_funds_lag3': 'fed_funds_lag3',
        'fed_funds_lag6': 'fed_funds_lag6',
        'gdp_growth_lag1': 'gdp_growth_lag1',
        'gdp_growth_lag3': 'gdp_growth_lag3',
        'gdp_growth_lag6': 'gdp_growth_lag6',
        'fed_funds_change': 'fed_funds_change',
        'unemployment_change': 'unemployment_change',
    }
    
    # Build insert query dynamically based on available columns
    available_columns = [col for col in column_mapping.keys() if col in df.columns]
    db_columns = [column_mapping[col] for col in available_columns]
    
    columns_str = ', '.join(['date'] + db_columns)
    placeholders = ', '.join(['%s'] * (len(db_columns) + 1))
    
    insert_query = f"""
        INSERT INTO economic_data ({columns_str})
        VALUES ({placeholders})
        ON CONFLICT (date) DO UPDATE SET
        {', '.join([f"{col} = EXCLUDED.{col}" for col in db_columns])}
    """
    
    # Prepare data for insertion
    records = []
    for idx, row in df.iterrows():
        date = row['date'] if 'date' in row else idx
        if isinstance(date, pd.Timestamp):
            date = date.date()
        
        values = [date]
        for col in available_columns:
            val = row[col]
            # Handle NaN values
            values.append(None if pd.isna(val) else float(val))
        
        records.append(tuple(values))
    
    # Insert data in batches
    execute_batch(cur, insert_query, records, page_size=100)
    conn.commit()
    
    print(f"✓ Inserted {len(records)} economic data records")
    cur.close()

def seed_bank_performance(conn, bank_data_dict):
    """
    Insert FDIC bank performance data into bank_performance table
    
    Args:
        conn: Database connection
        bank_data_dict: Dictionary mapping bank names to their DataFrames
                       e.g., {'jpmc_metrics': jpmc_df, 'bac_metrics': bac_df}
    """
    print("\n🏦 Seeding bank performance data...")
    
    cur = conn.cursor()
    
    # Default names for common banks (used when source data has no name column)
    bank_names = {
        628: 'JPMorgan Chase',
        3510: 'Bank of America',
        3511: 'Wells Fargo',
        7213: 'Citibank',
        6548: 'U.S. Bank',
        817: 'PNC Bank',
        10573: 'Truist Bank',
        33124: 'Goldman Sachs Bank',
        18409: 'TD Bank',
        4297: 'Capital One',
        6560: 'Huntington National Bank',
    }
    
    insert_query = """
        INSERT INTO bank_performance (
            cert_number, bank_name, date,
            total_assets, total_deposits, total_loans, net_income, equity_capital,
            roa, roe, nim, efficiency_ratio, tier1_capital_ratio,
            city, state, active
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (cert_number, date) DO UPDATE SET
            total_assets = EXCLUDED.total_assets,
            total_deposits = EXCLUDED.total_deposits,
            total_loans = EXCLUDED.total_loans,
            net_income = EXCLUDED.net_income,
            equity_capital = EXCLUDED.equity_capital,
            roa = EXCLUDED.roa,
            roe = EXCLUDED.roe,
            nim = EXCLUDED.nim,
            efficiency_ratio = EXCLUDED.efficiency_ratio,
            tier1_capital_ratio = EXCLUDED.tier1_capital_ratio
    """
    
    total_records = 0
    
    for bank_key, df in bank_data_dict.items():
        if df is None or len(df) == 0:
            continue
        
        # Determine CERT and bank name
        cert = int(df['cert_number'].iloc[0]) if 'cert_number' in df.columns else None
        if cert is None:
            print(f"  ⚠ Unknown bank key: {bank_key}, skipping...")
            continue
        
        # Get bank name/location from source data when available
        source_name = None
        for col in ['bank_name', 'name', 'NAME']:
            if col in df.columns and df[col].notna().any():
                source_name = df[col].dropna().iloc[0]
                break

        bank_name = canonical_bank_name(cert, source_name) or bank_names.get(cert, f'Bank {cert}')

        city = None
        for col in ['city', 'CITY']:
            if col in df.columns and df[col].notna().any():
                city = str(df[col].dropna().iloc[0]).strip()
                break

        state = None
        for col in ['state', 'STATE', 'STNAME']:
            if col in df.columns and df[col].notna().any():
                state = str(df[col].dropna().iloc[0]).strip()
                break

        if 'active' in df.columns and df['active'].notna().any():
            active = bool(df['active'].dropna().iloc[0])
        else:
            active = True
        
        records = []
        for idx, row in df.iterrows():
            # Parse date
            date = row['report_date'] if 'report_date' in row else idx
            if isinstance(date, str):
                date = pd.to_datetime(date).date()
            elif isinstance(date, pd.Timestamp):
                date = date.date()
            
            # Extract financial metrics (handle different column names)
            record = (
                cert,
                bank_name,
                date,
                float(row.get('total_assets', 0)) if pd.notna(row.get('total_assets')) else None,
                float(row.get('total_deposits', 0)) if pd.notna(row.get('total_deposits')) else None,
                float(row.get('net_loans', row.get('total_loans', 0))) if pd.notna(row.get('net_loans', row.get('total_loans', 0))) else None,
                float(row.get('net_income', 0)) if pd.notna(row.get('net_income')) else None,
                float(row.get('equity_capital', 0)) if pd.notna(row.get('equity_capital')) else None,
                float(row.get('return_on_assets', row.get('roa', 0))) if pd.notna(row.get('return_on_assets', row.get('roa', 0))) else None,
                float(row.get('return_on_equity', row.get('roe', 0))) if pd.notna(row.get('return_on_equity', row.get('roe', 0))) else None,
                float(row.get('net_interest_margin', row.get('nim', 0))) if pd.notna(row.get('net_interest_margin', row.get('nim', 0))) else None,
                float(row.get('efficiency_ratio', 0)) if pd.notna(row.get('efficiency_ratio')) else None,
                float(row.get('tier1_capital_ratio', 0)) if pd.notna(row.get('tier1_capital_ratio')) else None,
                city,
                state,
                bool(active)
            )
            records.append(record)
        
        execute_batch(cur, insert_query, records, page_size=50)
        total_records += len(records)
        print(f"  ✓ Inserted {len(records)} records for {bank_name}")
    
    conn.commit()
    print(f"✓ Total bank performance records inserted: {total_records}")
    cur.close()

def create_sample_user(conn):
    """Create a sample user for testing"""
    print("\n👤 Creating sample user...")
    
    cur = conn.cursor()
    
    # Simple password hash (in production, use bcrypt)
    insert_query = """
        INSERT INTO users (username, email, password_hash)
        VALUES (%s, %s, %s)
        ON CONFLICT (username) DO NOTHING
        RETURNING id
    """
    
    cur.execute(insert_query, ('demo_user', 'demo@example.com', 'demo_password_hash'))
    result = cur.fetchone()
    
    if result:
        print(f"✓ Created sample user with ID: {result[0]}")
    else:
        print("  ℹ Sample user already exists")
    
    conn.commit()
    cur.close()

def main():
    """Main seeding function"""
    print("=" * 60)
    print("Bank Lending Strategy Optimizer - Database Seeding")
    print("=" * 60)
    
    # Check if we're running from notebook directory
    if not os.path.exists('Capstone_Intro_DS_Capstone_Starter.ipynb'):
        print("\n⚠ Please run this script from the project root directory")
        print("  (where your .ipynb file is located)")
        sys.exit(1)
    
    # Connect to database
    conn = connect_to_database()
    
    print("\n📦 Loading data from notebook variables...")
    print("  ℹ Make sure you've executed all data collection cells in the notebook")
    
    # Load the data from CSV files (we'll export from notebook first)
    try:
        # Check if data files exist
        if os.path.exists('data/fred_data.csv'):
            df_economic = pd.read_csv('data/fred_data.csv')

            if 'index' in df_economic.columns and 'date' not in df_economic.columns:
                df_economic.rename(columns={'index': 'date'}, inplace=True)

            if 'date' in df_economic.columns:
                df_economic['date'] = pd.to_datetime(df_economic['date'])

            df_economic = normalize_economic_columns(df_economic)
            seed_economic_data(conn, df_economic)
        else:
            print("  ⚠ data/fred_data.csv not found. Skipping economic data seeding.")
            print("    Run the export cell in your notebook first.")
        
        if os.path.exists('data/bank_data.csv'):
            df_banks = pd.read_csv('data/bank_data.csv', parse_dates=['report_date'])
            
            # Split by CERT number (include every bank present in the source file)
            bank_data = {}
            for cert in df_banks['cert_number'].dropna().unique():
                cert_int = int(cert)
                bank_df = df_banks[df_banks['cert_number'] == cert].copy()
                bank_data[str(cert_int)] = bank_df
            
            seed_bank_performance(conn, bank_data)
        else:
            print("  ⚠ data/bank_data.csv not found. Skipping bank data seeding.")
            print("    Run the export cell in your notebook first.")
        
        # Create sample user
        create_sample_user(conn)
        
    except Exception as e:
        print(f"\n✗ Error during seeding: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()
    
    print("\n" + "=" * 60)
    print("✓ Database seeding completed successfully!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Start the server: npm start")
    print("2. Visit http://localhost:3001")
    print("=" * 60)

if __name__ == "__main__":
    main()
