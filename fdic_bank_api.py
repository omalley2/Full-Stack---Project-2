# FDIC BankFind API Helper Functions
# Documentation: https://banks.data.fdic.gov/docs/

import requests
import pandas as pd
from typing import List, Dict, Optional
import time

class FDICBankAPI:
    """
    Helper class for FDIC BankFind API
    API Documentation: https://banks.data.fdic.gov/docs/
    """
    
    BASE_URL = "https://banks.data.fdic.gov/api"
    
    def __init__(self):
        self.session = requests.Session()
    
    def search_banks(self, name: str = None, city: str = None, state: str = None, 
                     limit: int = 100) -> pd.DataFrame:
        """
        Search for banks by name, city, or state
        
        Parameters:
        -----------
        name : str
            Bank name (partial match)
        city : str
            City name
        state : str
            Two-letter state code (e.g., 'NY', 'CA')
        limit : int
            Maximum results to return
            
        Returns:
        --------
        pd.DataFrame with bank information
        """
        endpoint = f"{self.BASE_URL}/institutions"
        
        params = {
            'limit': limit,
            'sort_by': 'OFFICES',
            'sort_order': 'DESC'
        }
        
        filters = []
        if name:
            filters.append(f"NAME:{name}")
        if city:
            filters.append(f"CITY:{city}")
        if state:
            filters.append(f"STNAME:{state}")
        
        if filters:
            params['filters'] = ','.join(filters)
        
        response = self.session.get(endpoint, params=params)
        response.raise_for_status()
        
        data = response.json()
        
        if 'data' in data and len(data['data']) > 0:
            # Extract the nested 'data' field from each record
            records = [record['data'] for record in data['data']]
            df = pd.DataFrame(records)
            
            available_cols = [col for col in ['CERT', 'NAME', 'CITY', 'STNAME', 'ASSET', 'OFFICES', 'DATEUPDT'] if col in df.columns]
            return df[available_cols] if available_cols else df
        else:
            return pd.DataFrame()
    
    def get_bank_by_cert(self, cert_number: int) -> Dict:
        """
        Get detailed information for a specific bank using CERT number
        
        Parameters:
        -----------
        cert_number : int
            FDIC Certificate Number
            
        Returns:
        --------
        dict with bank details
        """
        endpoint = f"{self.BASE_URL}/institutions"
        params = {'filters': f'CERT:{cert_number}'}
        
        response = self.session.get(endpoint, params=params)
        response.raise_for_status()
        
        data = response.json()
        if 'data' in data and len(data['data']) > 0:
            return data['data'][0]['data']  # Extract nested 'data' field
        return {}
    
    def get_financials(self, cert_number: int, start_date: str = '2000-01-01', 
                       end_date: str = '2025-12-31') -> pd.DataFrame:
        """
        Get quarterly financial data for a specific bank
        
        Parameters:
        -----------
        cert_number : int
            FDIC Certificate Number
        start_date : str
            Start date in 'YYYY-MM-DD' format
        end_date : str
            End date in 'YYYY-MM-DD' format
            
        Returns:
        --------
        pd.DataFrame with quarterly financial metrics
        """
        endpoint = f"{self.BASE_URL}/financials"
        
        params = {
            'filters': f'CERT:{cert_number}',
            'limit': 10000,
            'sort_by': 'REPDTE',
            'sort_order': 'DESC'
        }
        
        response = self.session.get(endpoint, params=params)
        response.raise_for_status()
        
        data = response.json()
        
        if 'data' in data and len(data['data']) > 0:
            # Extract the nested 'data' field from each record
            records = [record['data'] for record in data['data']]
            df = pd.DataFrame(records)
            
            if 'REPDTE' in df.columns:
                df['REPDTE'] = pd.to_datetime(df['REPDTE'])
                
                # Filter by date range
                df = df[(df['REPDTE'] >= start_date) & (df['REPDTE'] <= end_date)]
                df = df.sort_values('REPDTE')
            
            return df
        
        return pd.DataFrame()
    
    def get_bank_performance_metrics(self, cert_number: int, 
                                     start_date: str = '2000-01-01') -> pd.DataFrame:
        """
        Get key performance metrics for a bank
        
        Key Metrics:
        - ROA (Return on Assets)
        - ROE (Return on Equity)
        - NIM (Net Interest Margin)
        - Efficiency Ratio
        - NPL Ratio (Non-Performing Loans)
        - Tier 1 Capital Ratio
        
        Parameters:
        -----------
        cert_number : int
            FDIC Certificate Number
        start_date : str
            Start date
            
        Returns:
        --------
        pd.DataFrame with key metrics over time
        """
        df = self.get_financials(cert_number, start_date)
        
        if df.empty:
            return pd.DataFrame()
        
        metric_candidates = {
            'date': ['REPDTE'],
            'total_assets': ['ASSET'],
            'total_deposits': ['DEP'],
            'net_loans': ['LNLSNET'],
            'return_on_assets': ['ROA'],
            'return_on_equity': ['ROE'],
            'net_income': ['NETINC', 'PTAXNETINC'],
            'net_interest_margin': ['NIMY', 'NIM'],
            'efficiency_ratio': ['EEFFR'],
            'nonperforming_loans': ['NCLNLS'],
            'tier1_capital_ratio': ['RBC1AAJ', 'RBC1RWAJ'],
        }

        result = pd.DataFrame(index=df.index)
        for target_col, candidates in metric_candidates.items():
            source_col = next((col for col in candidates if col in df.columns), None)
            if source_col:
                result[target_col] = df[source_col]

        ordered_columns = [
            'date',
            'total_assets',
            'total_deposits',
            'net_loans',
            'net_income',
            'return_on_assets',
            'return_on_equity',
            'net_interest_margin',
            'efficiency_ratio',
            'nonperforming_loans',
            'tier1_capital_ratio',
        ]

        available_columns = [col for col in ordered_columns if col in result.columns]
        return result[available_columns].copy()
    
    def compare_banks(self, cert_numbers: List[int], metric: str = 'ROA', 
                      start_date: str = '2015-01-01') -> pd.DataFrame:
        """
        Compare a specific metric across multiple banks
        
        Parameters:
        -----------
        cert_numbers : list
            List of FDIC certificate numbers
        metric : str
            Metric to compare (e.g., 'ROA', 'ROE', 'NIM')
        start_date : str
            Start date for comparison
            
        Returns:
        --------
        pd.DataFrame with dates as index and banks as columns
        """
        comparison_data = {}
        
        for cert in cert_numbers:
            bank_info = self.get_bank_by_cert(cert)
            bank_name = bank_info.get('NAME', f'Bank_{cert}')
            
            df = self.get_financials(cert, start_date)
            
            if not df.empty and metric in df.columns:
                df = df.set_index('REPDTE')
                comparison_data[bank_name] = df[metric]
            
            time.sleep(0.1)  # Be nice to the API
        
        if comparison_data:
            return pd.DataFrame(comparison_data)
        return pd.DataFrame()


# === MAJOR BANK CERT NUMBERS (for quick reference) ===
MAJOR_BANKS = {
    'JPMorgan Chase': 628,
    'Bank of America': 3510,
    'Wells Fargo': 3511,
    'Citibank': 7213,
    'U.S. Bank': 6548,
    'Goldman Sachs Bank': 33124,
    'TD Bank': 18409,
    'Capital One': 4297,
    'Huntington National Bank': 6560,
}

# === USAGE EXAMPLES ===

if __name__ == "__main__":
    # Initialize API
    fdic = FDICBankAPI()
    
    # Example 1: Search for banks
    print("Searching for banks named 'Chase' in New York...")
    banks = fdic.search_banks(name="Chase", state="NY")
    print(banks)
    
    # Example 2: Get JPMorgan Chase financials
    print("\nFetching JPMorgan Chase performance...")
    jpmc_metrics = fdic.get_bank_performance_metrics(628, start_date='2015-01-01')
    print(jpmc_metrics.head())
    
    # Example 3: Compare major banks
    print("\nComparing ROA for major banks...")
    comparison = fdic.compare_banks(
        cert_numbers=[628, 3510, 3511],  # JPM, BofA, Wells Fargo
        metric='ROA',
        start_date='2015-01-01'
    )
    print(comparison)
