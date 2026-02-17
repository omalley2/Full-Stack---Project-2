# FRED API Reference

## Setup

```python
from fredapi import Fred
import os

fred = Fred(api_key=os.getenv('FRED_API_KEY'))
```

## Core Series Used in This Project

- Delinquency
  - `DRCCLACBS` credit card
  - `DRSFRMACBS` mortgage
  - `DRCLACBS` consumer
- Rates
  - `DFF` fed funds
  - `DPRIME` prime
  - `DGS10`, `DGS2` treasuries
  - `T10Y2Y` yield spread
- Macro
  - `UNRATE` unemployment
  - `GDPC1` GDP
  - `CPIAUCSL` CPI
  - `UMCSENT` consumer sentiment

## Common Calls

```python
# one series
fed = fred.get_series('DFF', observation_start='2015-01-01')

# multiple series
series = {
    'unemployment': 'UNRATE',
    'fed_funds': 'DFF',
    'yield_spread': 'T10Y2Y',
}
data = {k: fred.get_series(v, observation_start='2015-01-01') for k, v in series.items()}
```

## Practical Notes

- Resample to monthly before merging mixed frequencies.
- Cache pulls to CSV when iterating quickly.
- Negative `T10Y2Y` is a common recession warning signal.

Docs: `https://fred.stlouisfed.org/docs/api/fred/`