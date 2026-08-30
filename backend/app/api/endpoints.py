from fastapi import APIRouter
import datetime
from app.services.vnstock_service import VnstockService
from app.core.indicators import calculate_rsi, calculate_macd, calculate_adx, calculate_bollinger, calculate_atr
from pydantic import BaseModel
from typing import List
import numpy as np

router = APIRouter()

WATCHLIST = [
    # Ngân hàng (10)
    'VCB', 'MBB', 'CTG', 'STB', 'BID', 'TCB', 'VPB', 'ACB', 'HDB', 'LPB',
    # Bất động sản (5)
    'VHM', 'VIC', 'NVL', 'KDH', 'PDR',
    # Tiêu dùng / Bán lẻ (5)
    'VNM', 'MSN', 'MWG', 'PNJ', 'SAB',
    # Công nghệ (3)
    'FPT', 'CMG', 'ELC',
    # Thép / Công nghiệp (4)
    'HPG', 'HSG', 'NKG', 'GEX',
    # Năng lượng / Dầu khí (4)
    'GAS', 'PLX', 'POW', 'PVT',
    # Chứng khoán (4)
    'SSI', 'VND', 'HCM', 'BSI',
    # Đa ngành (5)
    'VRE', 'DGW', 'VJC', 'BVH', 'REE',
]

SECTOR_MAP = {
    'VCB': 'Ngân hàng', 'MBB': 'Ngân hàng', 'CTG': 'Ngân hàng', 'STB': 'Ngân hàng',
    'BID': 'Ngân hàng', 'TCB': 'Ngân hàng', 'VPB': 'Ngân hàng', 'ACB': 'Ngân hàng',
    'HDB': 'Ngân hàng', 'LPB': 'Ngân hàng',
    'VHM': 'Bất động sản', 'VIC': 'Bất động sản', 'NVL': 'Bất động sản',
    'KDH': 'Bất động sản', 'PDR': 'Bất động sản', 'VRE': 'Bất động sản',
    'VNM': 'Tiêu dùng', 'MSN': 'Tiêu dùng', 'MWG': 'Tiêu dùng',
    'PNJ': 'Tiêu dùng', 'SAB': 'Tiêu dùng', 'DGW': 'Tiêu dùng',
    'FPT': 'Công nghệ', 'CMG': 'Công nghệ', 'ELC': 'Công nghệ',
    'HPG': 'Thép & Công nghiệp', 'HSG': 'Thép & Công nghiệp',
    'NKG': 'Thép & Công nghiệp', 'GEX': 'Thép & Công nghiệp',
    'GAS': 'Năng lượng', 'PLX': 'Năng lượng', 'POW': 'Năng lượng', 'PVT': 'Năng lượng',
    'SSI': 'Chứng khoán', 'VND': 'Chứng khoán', 'HCM': 'Chứng khoán', 'BSI': 'Chứng khoán',
    'VJC': 'Hàng không & Dịch vụ', 'BVH': 'Hàng không & Dịch vụ',
    'REE': 'Hàng không & Dịch vụ',
}

class StockData(BaseModel):
    ticker: str
    sector: str
    price: float
    rsi: float
    macd: float
    macd_trend: str
    sma20: float
    divergence: str
    trend: str
    adx: float
    adx_trend: str
    bollinger_b: float
    bbw: float
    atr_pct: float
    vol_ratio: float
    foreign_pct: float
    rs_5d: float
    pct_change_5d: float
    rr_ratio: float
    pe: float
    roe: float
    eps: float
    debt_ratio: float

@router.get("/screener", response_model=List[StockData])
def get_screener():
    results = []
    vnindex = VnstockService.fetch_vnindex(100)
    
    for ticker in WATCHLIST:
        df = VnstockService.fetch_historical_data(ticker, 100)
        if df.empty or len(df) < 20:
            continue
            
        close = df['Close']
        high = df['High']
        low = df['Low']
        volume = df['Volume']
        
        current_price = float(close.iloc[-1])
        
        try:
            rsi = float(calculate_rsi(close).iloc[-1])
            if np.isnan(rsi): rsi = 0.0
        except: rsi = 0.0
            
        try:
            macd, signal, hist = calculate_macd(close / 1000)
            macd_val = float(macd.iloc[-1])
            macd_trend = "UP" if hist.iloc[-1] > hist.iloc[-2] else "DOWN"
        except: 
            macd_val = 0.0
            macd_trend = "-"
            
        sma20_val = 0.0
        try:
            sma20 = close.rolling(20).mean().iloc[-1]
            sma20_val = float(sma20)
            sma50 = close.rolling(50).mean().iloc[-1]
            # Simple SMA20/50 trend check
            if current_price > sma20 and sma20 > sma50:
                trend = "Thuận"
            else:
                trend = "Chưa thuận"
        except: trend = "-"
            
        try:
            pct_b, bbw_val = calculate_bollinger(close)
            bollinger_b = float(pct_b.iloc[-1])
            bbw = float(bbw_val.iloc[-1])
            if np.isnan(bollinger_b): bollinger_b = 0.0
            if np.isnan(bbw): bbw = 0.0
        except: 
            bollinger_b = 0.0
            bbw = 0.0
        
        try:
            atr = float(calculate_atr(high, low, close).iloc[-1])
            atr_pct = (atr / current_price) * 100
        except: atr_pct = 0.0
        
        try:
            adx_val = float(calculate_adx(high, low, close).iloc[-1])
            adx_trend = "UP" if adx_val > calculate_adx(high, low, close).iloc[-2] else "DOWN"
        except:
            adx_val = 0.0
            adx_trend = "-"
        
        try:
            vol_avg20 = volume.rolling(20).mean().iloc[-1]
            vol_ratio = float(volume.iloc[-1] / vol_avg20) if vol_avg20 else 0.0
        except: vol_ratio = 0.0
        
        try:
            pct_change_5d = float(((current_price - close.iloc[-6]) / close.iloc[-6]) * 100) if len(close) > 6 else 0.0
        except: pct_change_5d = 0.0
        
        rs_5d = 0.0
        if not vnindex.empty and len(vnindex) > 6:
            try:
                vn_change = ((vnindex['Close'].iloc[-1] - vnindex['Close'].iloc[-6]) / vnindex['Close'].iloc[-6]) * 100
                rs_5d = float(pct_change_5d - vn_change)
            except: pass
            
        funds = VnstockService.fetch_fundamentals(ticker)
        
        # yfinance doesn't provide foreign flow for VN market, so we use deterministic mock data
        np.random.seed(sum(ord(c) for c in ticker) + datetime.datetime.now().day)
        foreign_pct = float(np.random.uniform(-20.0, 45.0))
        
        results.append(StockData(
            ticker=ticker,
            sector=SECTOR_MAP.get(ticker, 'Khác'),
            price=current_price / 1000,
            rsi=rsi,
            macd=macd_val,
            macd_trend=macd_trend,
            sma20=sma20_val / 1000,
            divergence="—",
            trend=trend,
            adx=adx_val,
            adx_trend=adx_trend,
            bollinger_b=bollinger_b,
            bbw=bbw,
            atr_pct=atr_pct,
            vol_ratio=vol_ratio,
            foreign_pct=foreign_pct,
            rs_5d=rs_5d,
            pct_change_5d=pct_change_5d,
            rr_ratio=2.5,
            pe=float(funds.get("pe", 0)),
            roe=float(funds.get("roe", 0)),
            eps=float(funds.get("eps", 0)),
            debt_ratio=float(funds.get("debt_ratio", 0))
        ))
        
    return results
