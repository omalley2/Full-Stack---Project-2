from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from fredapi import Fred

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
OUTPUT_PATH = DATA_DIR / 'fred_data.csv'

START_DATE = '2000-07-01'
END_DATE = '2025-12-31'


def to_monthly(series: pd.Series, method: str = 'last') -> pd.Series:
    series = series.dropna().sort_index()
    series.index = pd.to_datetime(series.index)

    if method == 'mean':
        return series.resample('MS').mean()
    if method == 'ffill':
        return series.resample('MS').ffill()
    return series.resample('MS').last()


def main() -> None:
    load_dotenv(PROJECT_ROOT / '.env')
    api_key = os.getenv('FRED_API_KEY')
    if not api_key or api_key == 'your_fred_api_key_here':
        raise SystemExit('Missing FRED_API_KEY in .env')

    fred = Fred(api_key=api_key)

    series_specs = {
        'delinq_cc': ('DRCCLACBS', 'ffill'),
        'delinq_mortgage': ('DRSFRMACBS', 'ffill'),
        'delinq_consumer': ('DRCLACBS', 'ffill'),
        'fed_funds_rate': ('DFF', 'mean'),
        'prime_rate': ('DPRIME', 'mean'),
        'mortgage_30y': ('MORTGAGE30US', 'mean'),
        'treasury_10y': ('DGS10', 'mean'),
        'treasury_2y': ('DGS2', 'mean'),
        'unemployment_rate': ('UNRATE', 'last'),
        'cpi': ('CPIAUCSL', 'last'),
        'consumer_sentiment': ('UMCSENT', 'last'),
    }

    monthly_series: dict[str, pd.Series] = {}
    for out_col, (fred_id, method) in series_specs.items():
        raw = fred.get_series(fred_id, observation_start=START_DATE, observation_end=END_DATE)
        monthly_series[out_col] = to_monthly(raw, method)

    # GDP growth is quarterly; convert to monthly by forward-filling within each quarter.
    gdp_level = fred.get_series('GDPC1', observation_start=START_DATE, observation_end=END_DATE).dropna()
    gdp_growth_q = gdp_level.pct_change() * 100
    gdp_growth_monthly = to_monthly(gdp_growth_q, method='ffill')
    monthly_series['gdp_growth'] = gdp_growth_monthly

    date_index = pd.date_range(start=START_DATE, end=END_DATE, freq='MS')
    df = pd.DataFrame(index=date_index)

    for col, ser in monthly_series.items():
        df[col] = ser.reindex(date_index)

    # Engineered feature used by dashboard and models.
    df['yield_curve'] = df['treasury_10y'] - df['treasury_2y']

    df = df.reset_index().rename(columns={'index': 'date'})
    df.to_csv(OUTPUT_PATH, index=False)

    print(f'Wrote {OUTPUT_PATH}')
    print(f'rows={len(df)} min_date={df["date"].min()} max_date={df["date"].max()}')
    nonzero_gdp = (df['gdp_growth'].fillna(0).abs() > 0.0001).sum()
    print(f'gdp_nonzero_rows={int(nonzero_gdp)}')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Error refreshing FRED data: {exc}')
        sys.exit(1)
