import pandas as pd
import yfinance as yf
import datetime
from functools import lru_cache

class VnstockService:
    @staticmethod
    @lru_cache(maxsize=32)
    def fetch_historical_data(ticker: str, days: int = 100) -> pd.DataFrame:
        try:
            df = yf.Ticker(f"{ticker}.VN").history(period=f"{days}d")
            if df.empty:
                raise Exception("Empty dataframe from yfinance")
            df.index = df.index.tz_localize(None)
            return df[['Open', 'High', 'Low', 'Close', 'Volume']]
        except Exception as e:
            print(f"Error fetching data for {ticker}: {e}")
            return pd.DataFrame()

    @staticmethod
    @lru_cache(maxsize=1)
    def fetch_vnindex(days: int = 100) -> pd.DataFrame:
        try:
            # Use E1VFVN30 (VN30 ETF) as a proxy for VNINDEX since yfinance doesn't easily have VNINDEX
            df = yf.Ticker("E1VFVN30.VN").history(period=f"{days}d")
            if df.empty:
                raise Exception("Empty dataframe")
            df.index = df.index.tz_localize(None)
            return df[['Open', 'High', 'Low', 'Close', 'Volume']]
        except Exception as e:
            print(f"Error fetching VNINDEX: {e}")
            return pd.DataFrame()
            
    @staticmethod
    @lru_cache(maxsize=32)
    def fetch_fundamentals(ticker: str) -> dict:
        try:
            info = yf.Ticker(f"{ticker}.VN").info
            # EPS: trailingEps in VND (raw, not divided by 1000 yet)
            eps_raw = info.get("trailingEps", 0.0) or 0.0
            # debtToEquity from yfinance is already a ratio * 100, convert back to 0-1 decimal
            debt_to_equity = info.get("debtToEquity", None)
            # Debt Ratio = D/(D+E), approximate from D/E: D/E = x => D/(D+E) = x/(1+x)
            if debt_to_equity is not None and debt_to_equity > 0:
                de = debt_to_equity / 100  # yfinance returns D/E * 100
                debt_ratio = de / (1 + de)
            else:
                debt_ratio = 0.0
            return {
                "pe": info.get("trailingPE", 0.0) or 0.0,
                "roe": (info.get("returnOnEquity", 0.0) or 0.0) * 100,
                "eps": eps_raw / 1000 if eps_raw else 0.0,   # convert VND → k (e.g. 5200 → 5.2k)
                "debt_ratio": round(debt_ratio, 3)
            }
        except:
            return {"pe": 0, "roe": 0, "eps": 0, "debt_ratio": 0}
