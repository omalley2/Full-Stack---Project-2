import sys
from pathlib import Path

import pandas as pd


REQUIRED_COLUMNS = [
    'report_date',
    'cert_number',
    'bank_name',
    'total_assets',
    'total_deposits',
    'net_loans',
    'return_on_assets',
    'return_on_equity',
    'net_interest_margin',
    'efficiency_ratio',
    'net_income',
    'tier1_capital_ratio',
]

ESSENTIAL_NON_NULL_COLUMNS = [
    'report_date',
    'cert_number',
    'bank_name',
    'net_interest_margin',
    'net_income',
    'tier1_capital_ratio',
]

NIM_REASONABLE_MIN = -5.0
NIM_REASONABLE_MAX = 20.0


def fail(message: str) -> None:
    print(f"✗ {message}")
    sys.exit(1)


def main() -> None:
    csv_path = Path('data/bank_data.csv')
    if not csv_path.exists():
        fail('Missing data/bank_data.csv. Run python3 db/fetch_major_bank_data.py first.')

    df = pd.read_csv(csv_path)

    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        fail(f"Missing required columns: {', '.join(missing)}")

    for col in ESSENTIAL_NON_NULL_COLUMNS:
        null_count = int(df[col].isna().sum())
        if null_count > 0:
            fail(f"Column '{col}' has {null_count} null rows")

    if (df['cert_number'] <= 0).any():
        fail("Found invalid cert_number values (<= 0)")

    nim_series = pd.to_numeric(df['net_interest_margin'], errors='coerce')
    if nim_series.isna().any():
        fail("Column 'net_interest_margin' contains non-numeric values")

    out_of_range = df[(nim_series < NIM_REASONABLE_MIN) | (nim_series > NIM_REASONABLE_MAX)]
    if len(out_of_range) > 0:
        sample = out_of_range[['report_date', 'cert_number', 'net_interest_margin']].head(5).to_dict(orient='records')
        fail(
            "NIM values outside expected percentage range "
            f"[{NIM_REASONABLE_MIN}, {NIM_REASONABLE_MAX}] detected. Sample: {sample}"
        )

    print('✓ Bank data quality checks passed')
    print(f"  rows: {len(df)}")
    print(f"  banks: {df['cert_number'].nunique()}")
    print(
        "  NIM range: "
        f"{nim_series.min():.4f} to {nim_series.max():.4f} "
        f"(median {nim_series.median():.4f})"
    )


if __name__ == '__main__':
    main()
