# Bank Data APIs

## Recommended Default

Use **FDIC BankFind API**.

- Free
- No API key
- Best fit for this project
- Already integrated via `fdic_bank_api.py`

Base URL: `https://banks.data.fdic.gov/api/`  
Docs: `https://banks.data.fdic.gov/docs/`

## Quick Example

```python
from fdic_bank_api import FDICBankAPI

fdic = FDICBankAPI()
data = fdic.get_bank_performance_metrics(628, start_date='2015-01-01')
```

## Common CERT Numbers

- JPMorgan Chase: `628`
- Bank of America: `3510`
- Wells Fargo: `3511`
- Citibank: `7213`
- U.S. Bank: `6548`

## Optional Secondary Sources

- SEC EDGAR: filings and disclosures
- Yahoo Finance (`yfinance`): market data
- Alpha Vantage / FMP: fundamentals (rate-limited free tiers)

FDIC + FRED is enough for core project workflows.