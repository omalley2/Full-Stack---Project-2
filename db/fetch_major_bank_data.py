import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fdic_bank_api import FDICBankAPI, MAJOR_BANKS


def main() -> None:
    fdic = FDICBankAPI()
    out_frames = []

    for bank_name, cert in MAJOR_BANKS.items():
        try:
            metrics = fdic.get_bank_performance_metrics(cert, start_date='2000-01-01')
            if metrics.empty:
                print(f"SKIP {cert} {bank_name}: no rows")
                continue

            bank_info = fdic.get_bank_by_cert(cert) or {}
            metrics = metrics.rename(columns={'date': 'report_date'}).copy()
            metrics['cert_number'] = cert
            metrics['bank_name'] = bank_name
            metrics['city'] = bank_info.get('CITY', '')
            state_code = bank_info.get('STALP') or bank_info.get('STATE') or bank_info.get('STNAME', '')
            metrics['state'] = str(state_code).strip()[:2].upper() if state_code else ''
            metrics['active'] = True

            out_frames.append(metrics)
            print(f"OK   {cert} {bank_name}: {len(metrics)} rows")
        except Exception as err:
            print(f"ERR  {cert} {bank_name}: {err}")

    if not out_frames:
        raise SystemExit('No bank data fetched; nothing written')

    all_banks = pd.concat(out_frames, ignore_index=True)
    all_banks['report_date'] = pd.to_datetime(all_banks['report_date'])
    all_banks = all_banks.sort_values(['cert_number', 'report_date'])
    all_banks.to_csv('data/bank_data.csv', index=False)

    print('\nWROTE data/bank_data.csv')
    print('rows', len(all_banks))
    print('unique certs', all_banks['cert_number'].nunique())
    print(all_banks['cert_number'].value_counts().sort_index().to_string())


if __name__ == '__main__':
    main()
