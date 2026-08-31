"""
ML prediction endpoint: loads model.pkl and scores current stocks.
Returns a ranked list with AI probability scores.
"""

import os
import numpy as np
import pandas as pd
import joblib
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from functools import lru_cache

router = APIRouter()

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "core", "model.pkl")


def _calc_stoch_rsi(close, rsi_period=14, stoch_period=14):
    """Stochastic RSI (mirror của train_model.py)."""
    delta = close.diff()
    gain  = delta.where(delta > 0, 0).ewm(alpha=1/rsi_period, adjust=False).mean()
    loss  = (-delta.where(delta < 0, 0)).ewm(alpha=1/rsi_period, adjust=False).mean()
    rsi   = (100 - 100 / (1 + gain / loss.replace(0, np.nan))).fillna(50)
    lo    = rsi.rolling(stoch_period).min()
    hi    = rsi.rolling(stoch_period).max()
    return ((rsi - lo) / (hi - lo).replace(0, np.nan)).fillna(0.5)



WATCHLIST = [
    # Ngân hàng (15)
    'VCB', 'MBB', 'CTG', 'STB', 'BID', 'TCB', 'VPB', 'ACB', 'HDB', 'LPB',
    'OCB', 'TPB', 'EIB', 'SSB', 'MSB',
    # Bất động sản (10)
    'VHM', 'VIC', 'NVL', 'KDH', 'PDR', 'DXG', 'NLG', 'HDG', 'DPG', 'BCM',
    # Tiêu dùng / Bán lẻ (9)
    'VNM', 'MSN', 'MWG', 'PNJ', 'SAB', 'VHC', 'ANV', 'HAH',
    # Công nghệ (3)
    'FPT', 'CMG', 'ELC',
    # Thép / Vật liệu (7)
    'HPG', 'HSG', 'NKG', 'GEX', 'TLH', 'SMC',
    # Năng lượng / Dầu khí (7)
    'GAS', 'PLX', 'POW', 'PVT', 'NT2', 'PC1', 'PVD',
    # Chứng khoán (5)
    'SSI', 'VND', 'HCM', 'BSI', 'CTS',
    # Dược phẩm (4)
    'DHG', 'IMP', 'OPC', 'DBD',
    # Xây dựng / Hạ tầng (4)
    'CTD', 'VCG', 'FCN', 'LCG',
    # Phân bón / Hoá chất (3)
    'DPM', 'DCM', 'DGC',
    # Cao su (2)
    'PHR', 'GVR',
    # Vận tải / Logistics (3)
    'GMD', 'VJC', 'STG',
    # Khác (5)
    'VRE', 'DGW', 'BVH', ]

SECTOR_MAP = {
    # Ngân hàng
    'VCB':'Ngân hàng','MBB':'Ngân hàng','CTG':'Ngân hàng','STB':'Ngân hàng',
    'BID':'Ngân hàng','TCB':'Ngân hàng','VPB':'Ngân hàng','ACB':'Ngân hàng',
    'HDB':'Ngân hàng','LPB':'Ngân hàng','OCB':'Ngân hàng','TPB':'Ngân hàng',
    'EIB':'Ngân hàng','SSB':'Ngân hàng','MSB':'Ngân hàng',
    # Bất động sản
    'VHM':'Bất động sản','VIC':'Bất động sản','NVL':'Bất động sản',
    'KDH':'Bất động sản','PDR':'Bất động sản','VRE':'Bất động sản',
    'DXG':'Bất động sản','NLG':'Bất động sản','HDG':'Bất động sản',
    'DPG':'Bất động sản','BCM':'Bất động sản',
    # Tiêu dùng
    'VNM':'Tiêu dùng','MSN':'Tiêu dùng','MWG':'Tiêu dùng','PNJ':'Tiêu dùng',
    'SAB':'Tiêu dùng','DGW':'Tiêu dùng','VHC':'Tiêu dùng','ANV':'Tiêu dùng','HAH':'Tiêu dùng',
    # Công nghệ
    'FPT':'Công nghệ','CMG':'Công nghệ','ELC':'Công nghệ',
    # Thép & Vật liệu
    'HPG':'Thép & Vật liệu','HSG':'Thép & Vật liệu','NKG':'Thép & Vật liệu',
    'GEX':'Thép & Vật liệu','TLH':'Thép & Vật liệu','SMC':'Thép & Vật liệu',
    # Năng lượng
    'GAS':'Năng lượng','PLX':'Năng lượng','POW':'Năng lượng','PVT':'Năng lượng',
    'NT2':'Năng lượng','PC1':'Năng lượng','PVD':'Năng lượng',
    # Chứng khoán
    'SSI':'Chứng khoán','VND':'Chứng khoán','HCM':'Chứng khoán',
    'BSI':'Chứng khoán','CTS':'Chứng khoán',
    # Dược phẩm
    'DHG':'Dược phẩm','IMP':'Dược phẩm','OPC':'Dược phẩm','DBD':'Dược phẩm',
    # Xây dựng
    'CTD':'Xây dựng','VCG':'Xây dựng','FCN':'Xây dựng','LCG':'Xây dựng',
    # Hoá chất / Phân bón
    'DPM':'Hoá chất','DCM':'Hoá chất','DGC':'Hoá chất',
    # Cao su
    'PHR':'Cao su','GVR':'Cao su',
    # Logistics / Vận tải
    'GMD':'Logistics','VJC':'Hàng không','STG':'Logistics',
    # Khác
    'BVH':'Bảo hiểm',
    'VRE':'Bất động sản', 'DGW':'Phân phối',
}


class AIPrediction(BaseModel):
    ticker: str
    sector: str
    price: float
    score_5: float    # AI predicted 5-day forward return (%)
    rank: int
    confidence: str   # "Cao" / "Trung bình" / "Thấp"
    signal: str       # "Mua" / "Trung lập" / "Tránh"
    model_trained_at: Optional[str] = None


def _load_bundle():
    if not os.path.exists(MODEL_PATH):
        return None
    return joblib.load(MODEL_PATH)


def _compute_features_single(ticker: str, vnindex_close: pd.Series) -> Optional[pd.Series]:
    """Tính feature cho 1 mã, trả về Series cuối cùng (latest row)."""
    try:
        df = yf.Ticker(f"{ticker}.VN").history(period="2y")
        if df.empty or len(df) < 252:
            return None
        df.index = df.index.tz_localize(None)
        close  = df["Close"]
        high   = df["High"]
        low    = df["Low"]
        volume = df["Volume"]

        # RSI
        delta = close.diff()
        gain  = delta.where(delta > 0, 0).ewm(alpha=1/14, adjust=False).mean()
        loss  = (-delta.where(delta < 0, 0)).ewm(alpha=1/14, adjust=False).mean()
        rsi   = (100 - 100 / (1 + gain / loss.replace(0, np.nan))).fillna(50)

        # MACD hist
        ema_f    = close.ewm(span=12, adjust=False).mean()
        ema_s    = close.ewm(span=26, adjust=False).mean()
        macd     = ema_f - ema_s
        sig      = macd.ewm(span=9, adjust=False).mean()
        macd_h   = macd - sig

        # Bollinger
        ma20  = close.rolling(20).mean()
        std20 = close.rolling(20).std()
        bbw   = ((ma20 + 2*std20) - (ma20 - 2*std20)) / ma20 * 100
        pct_b = (close - (ma20 - 2*std20)) / (4*std20).replace(0, np.nan)

        # ADX
        plus_dm  = high.diff().clip(lower=0)
        minus_dm = (-low.diff()).clip(lower=0)
        tr = pd.concat([high-low, (high-close.shift()).abs(),
                        (low-close.shift()).abs()], axis=1).max(axis=1)
        atr_s    = tr.ewm(alpha=1/14, adjust=False).mean()
        plus_di  = 100 * plus_dm.ewm(alpha=1/14, adjust=False).mean() / atr_s.replace(0, np.nan)
        minus_di = 100 * minus_dm.ewm(alpha=1/14, adjust=False).mean() / atr_s.replace(0, np.nan)
        dx       = (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan) * 100
        adx      = dx.ewm(alpha=1/14, adjust=False).mean().fillna(0)

        # Volume ratio
        vol_ratio = volume / volume.rolling(20).mean()

        # SMA distance
        sma50   = close.rolling(50).mean()
        sma20_d = (close - ma20) / ma20 * 100
        sma50_d = (close - sma50) / sma50 * 100
        trend_f = ((close > ma20) & (ma20 > sma50)).astype(int)

        # Return momentum
        ret5  = close.pct_change(5) * 100
        ret10 = close.pct_change(10) * 100

        # ATR pct
        atr_pct = atr_s / close * 100

        # RS vs VN-Index
        vn_aligned = vnindex_close.reindex(close.index, method="ffill")
        vn_ret5    = vn_aligned.pct_change(5).fillna(0) * 100
        rs5        = ret5 - vn_ret5

        # ── NHÓM 1: Calendar Effects ──
        feat_df = pd.DataFrame(index=close.index)
        feat_df["month"]       = close.index.month
        feat_df["day_of_week"] = close.index.dayofweek
        feat_df["quarter"]     = close.index.quarter
        feat_df["month_sin"]   = np.sin(2 * np.pi * feat_df["month"] / 12)
        feat_df["month_cos"]   = np.cos(2 * np.pi * feat_df["month"] / 12)
        feat_df["dow_sin"]     = np.sin(2 * np.pi * feat_df["day_of_week"] / 5)
        feat_df["dow_cos"]     = np.cos(2 * np.pi * feat_df["day_of_week"] / 5)

        # ── NHÓM 2: 52-week Price Range ──
        high_52w  = close.rolling(252).max()
        low_52w   = close.rolling(252).min()
        range_52w = (high_52w - low_52w).replace(0, np.nan)
        dist_52w_high = (close - high_52w) / high_52w * 100
        dist_52w_low  = (close - low_52w)  / low_52w  * 100
        price_pos_52w = (close - low_52w)  / range_52w
        days_since_52w_high = (
            pd.Series(range(len(close)), index=close.index) -
            pd.Series(range(len(close)), index=close.index)
              .where(close == high_52w).ffill()
        ).fillna(252)

        # ── NHÓM 3: Market Regime ──
        vn_ret       = vn_aligned.pct_change()
        mkt_vol20    = vn_ret.rolling(20).std() * 100
        mkt_ret5     = vn_aligned.pct_change(5) * 100
        mkt_ret20    = vn_aligned.pct_change(20) * 100
        mkt_above_ma20 = (vn_aligned > vn_aligned.rolling(20).mean()).astype(int)
        mkt_above_ma50 = (vn_aligned > vn_aligned.rolling(50).mean()).astype(int)
        rs20         = ret10 - vn_aligned.pct_change(10).fillna(0) * 100

        # ── NHÓM 4: Kỹ thuật nâng cao ──
        stoch_rsi_s  = _calc_stoch_rsi(close)
        ema9         = close.ewm(span=9,  adjust=False).mean()
        ema21        = close.ewm(span=21, adjust=False).mean()
        ema_cross    = (ema9 - ema21) / close * 100
        ret1         = close.pct_change(1) * 100
        ret3         = close.pct_change(3) * 100
        obv          = (np.sign(close.diff()).fillna(0) * volume).cumsum()
        obv_z        = ((obv - obv.rolling(20).mean()) / obv.rolling(20).std().replace(0, 1)).clip(-3, 3)
        intraday_rng = (high - low) / close * 100
        close_loc    = ((close - low) / (high - low).replace(0, np.nan)).fillna(0.5)

        feat = pd.DataFrame({
            "rsi":       rsi,
            "macd_hist": macd_h,
            "bbw":       bbw,
            "pct_b":     pct_b,
            "adx":       adx,
            "vol_ratio": vol_ratio,
            "sma20_dist":sma20_d,
            "sma50_dist":sma50_d,
            "trend_flag":trend_f,
            "ret5":      ret5,
            "ret10":     ret10,
            "atr_pct":   atr_pct,
            "rs5":       rs5,
            # Đã xóa nhóm Yếu tố lịch (Calendar Effects) để tránh overfitting.
            # 52-week range
            "dist_52w_high":       dist_52w_high,
            "dist_52w_low":        dist_52w_low,
            "price_pos_52w":       price_pos_52w,
            "days_since_52w_high": days_since_52w_high,
            # Market regime
            "mkt_vol20":     mkt_vol20,
            "mkt_ret5":      mkt_ret5,
            "mkt_ret20":     mkt_ret20,
            "mkt_above_ma20":mkt_above_ma20,
            "mkt_above_ma50":mkt_above_ma50,
            "rs20":          rs20,
            # Nhóm 4: Kỹ thuật nâng cao
            "stoch_rsi":       stoch_rsi_s,
            "ema_cross":       ema_cross,
            "ret1":            ret1,
            "ret3":            ret3,
            "obv_zscore":      obv_z,
            "intraday_range":  intraday_rng,
            "close_loc":       close_loc,
        }).dropna()

        if feat.empty:
            return None

        row = feat.iloc[-1].copy()

        # ── Nhóm 5: Cơ bản (static, lấy từ yfinance.info) ──
        try:
            info = yf.Ticker(f"{ticker}.VN").info
            row["f_pe"]   = float(np.clip(float(info.get("trailingPE")     or 15.0),  0, 60))
            row["f_roe"]  = float(np.clip(float(info.get("returnOnEquity") or 0.12) * 100, -10, 50))
            row["f_debt"] = float(np.clip(float(info.get("debtToEquity")   or 50.0) / 100,   0,  3))
        except Exception:
            row["f_pe"], row["f_roe"], row["f_debt"] = 15.0, 12.0, 0.5

        return row
    except Exception as e:
        print(f"Feature error for {ticker}: {e}")
        return None



import time
_PRED_CACHE = None
_PRED_CACHE_TIME = 0

@router.get("/prediction", response_model=List[AIPrediction])
def get_predictions():
    global _PRED_CACHE, _PRED_CACHE_TIME
    if _PRED_CACHE is not None and time.time() - _PRED_CACHE_TIME < 3600:
        return _PRED_CACHE

    bundle = _load_bundle()
    if bundle is None:
        raise HTTPException(
            status_code=503,
            detail="Model chưa được train. Chạy backend/train_model.py rồi commit model.pkl lên GitHub."
        )

    models        = bundle["models"]
    feature_cols  = bundle["feature_cols"]
    trained_at    = bundle.get("trained_at", "N/A")

    # Lấy VN-Index proxy
    try:
        vn_df = yf.Ticker("E1VFVN30.VN").history(period="2y")
        vn_df.index = vn_df.index.tz_localize(None)
        vnindex_close = vn_df["Close"]
    except:
        vnindex_close = pd.Series(dtype=float)

    rows = []
    tickers_with_features = []
    for ticker in WATCHLIST:
        row = _compute_features_single(ticker, vnindex_close)
        if row is not None:
            rows.append(row)
            tickers_with_features.append(ticker)

    if not rows:
        raise HTTPException(
            status_code=500,
            detail="Không thể lấy đặc trưng cho bất kỳ mã nào"
        )

    df_features = pd.DataFrame(rows)
    df_features = df_features.reindex(columns=feature_cols, fill_value=0)

    # ── BATCH PREDICT: Dự đoán toàn bộ 1 lúc ──────────────────────────────
    try:
        raw_preds = models[5].predict(df_features)   # shape: (n_tickers,)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model predict error: {e}")

    # ── PERCENTILE RANK SCORING (cross-sectional) ──────────────────────────
    # Chuyển raw predicted return → percentile trong batch hiện tại.
    # Cổ phiếu tốt nhất trong 73 mã hôm nay = 100đ, kém nhất = 0đ.
    # Triết lý: ta chỉ quan tâm cổ phiếu nào TỐT HƠN các mã khác (ranking),
    # không dùng threshold tuyệt đối (vì return kỳ vọng ~0.5-1%/5p tương đương nhau).
    n = len(raw_preds)
    # scipy rankdata: lowest=1, highest=n → map về [0, 100]
    from scipy.stats import rankdata
    ranks = rankdata(raw_preds)                         # 1..n
    percentile_scores = (ranks - 1) / (n - 1) * 100    # 0..100

    # ── Lấy giá hiện tại song song ─────────────────────────────────────────
    prices = {}
    for ticker in tickers_with_features:
        try:
            prices[ticker] = float(
                yf.Ticker(f"{ticker}.VN").history(period="2d")["Close"].iloc[-1]
            ) / 1000
        except:
            prices[ticker] = 0.0

    # ── Phân loại signal theo Percentile (25/75 quartile) ─────────────────
    # Top 25%  → "Mua mới"    (Cao)
    # Bottom 25% → "Bán/Tránh" (Thấp)
    # Middle 50% → "Nắm giữ"  (Trung bình)
    BUY_THRESHOLD  = 75.0   # top 25%
    SELL_THRESHOLD = 25.0   # bottom 25%

    results = []
    for i, ticker in enumerate(tickers_with_features):
        score_5 = round(float(percentile_scores[i]), 2)

        if score_5 >= BUY_THRESHOLD:
            signal     = "Mua mới"
            confidence = "Cao"
        elif score_5 <= SELL_THRESHOLD:
            signal     = "Bán / Tránh"
            confidence = "Thấp"
        else:
            signal     = "Nắm giữ"
            confidence = "Trung bình"

        results.append({
            "ticker":           ticker,
            "sector":           SECTOR_MAP.get(ticker, "Khác"),
            "price":            round(prices.get(ticker, 0.0), 2),
            "score_5":          score_5,
            "rank":             0,
            "confidence":       confidence,
            "signal":           signal,
            "model_trained_at": trained_at,
        })

    # Sắp xếp theo percentile score giảm dần và gán rank
    results.sort(key=lambda x: x["score_5"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    _PRED_CACHE = results
    _PRED_CACHE_TIME = time.time()
    return results


# ── GIAI ĐOẠN 4: Portfolio Optimization ────────────────────────────────────
class PortfolioItem(BaseModel):
    ticker: str
    sector: str
    price: float
    score_5: float         # AI score dự đoán 5 ngày (%)
    volatility_5d: float   # Biến động thực tế 5 phiên gần nhất (%)
    kelly_pct: float       # % vốn theo Kelly Criterion (đã giảm một nửa)
    markowitz_pct: float  # % vốn theo Markowitz (phân bổ đều theo rủi ro)
    recommended_pct: float # % vốn đề xuất cuối cùng (tổng hợp)
    risk_level: str        # "Thấp" / "Trung bình" / "Cao"
    hold_sessions: str     # Khuyến nghị nắm giữ bao nhiêu phiên


_PORTFOLIO_CACHE = None
_PORTFOLIO_CACHE_TIME = 0

@router.get("/portfolio", response_model=List[PortfolioItem])
def get_portfolio_allocation():
    """Tối ưu phân bổ vốn cho chiến thuật lướt sóng 5 phiên."""
    global _PORTFOLIO_CACHE, _PORTFOLIO_CACHE_TIME
    
    # Return cached portfolio if less than 1 hour old
    if _PORTFOLIO_CACHE is not None and (time.time() - _PORTFOLIO_CACHE_TIME) < 3600:
        return _PORTFOLIO_CACHE

    # 1. Lấy tất cả dự báo AI
    all_preds = get_predictions()
    if not all_preds:
        raise HTTPException(status_code=503, detail="Model chưa sẵn sàng")

    # 2. Rank thuần bằng score_5 (khung 5 phiên duy nhất, IR~2.4)
    top10 = sorted(all_preds, key=lambda x: x["score_5"], reverse=True)[:10]

    valid = []
    for item in top10:
        ticker  = item["ticker"]
        score_5 = item["score_5"]

        # Chỉ xét mã AI dự báo trên trung vị (rank > 50/100)
        if score_5 <= 50:
            continue

        try:
            hist = yf.Ticker(f"{ticker}.VN").history(period="1mo")["Close"]
            if len(hist) < 10:
                continue

            # Biến động 5 phiên gần nhất
            daily_ret = hist.pct_change().dropna()
            vol_5d = float(daily_ret.tail(5).std() * 100 * (5 ** 0.5))

            if vol_5d <= 0:
                continue

            valid.append({
                "ticker":  ticker,
                "sector":  item["sector"],
                "price":   item["price"],
                "score_5": score_5,
                "vol_5d":  vol_5d,
            })
        except Exception as e:
            print(f"Portfolio error {ticker}: {e}")
            continue

    if not valid:
        return []

    # 3. KELLY CRITERION — edge = score_5 - 50 (so với baseline random)
    for v in valid:
        edge = (v["score_5"] - 50) / 100   # edge thực chất so với 50/50
        variance = (v["vol_5d"] / 100) ** 2
        full_kelly = edge / variance if variance > 0 else 0
        v["kelly_raw"] = max(0, full_kelly * 0.4)  # 40% Kelly (thận trọng)

    valid = [v for v in valid if v.get("kelly_raw", 0) > 0]
    if not valid:
        return []

    kelly_sum   = sum(v["kelly_raw"] for v in valid)
    inv_vol_sum = sum(1 / v["vol_5d"] for v in valid)

    # 4. TỔNG HỢP: 75% Kelly + 25% Risk Parity
    WEIGHT_KELLY = 0.75
    WEIGHT_MARK  = 0.25
    
    # 5. MARKET REGIME FILTER: Volatility Scaling (Feature Flag - Currently Disabled)
    ENABLE_MARKET_FILTER = False
    MAX_CAPITAL = 85.0
    
    if ENABLE_MARKET_FILTER:
        try:
            vni = yf.Ticker("E1VFVN30.VN").history(period="3mo")["Close"]
            if len(vni) > 20:
                vni_ret = vni.pct_change().dropna()
                curr_vol = vni_ret.tail(20).std() * (252 ** 0.5)
                if curr_vol > 0:
                    TARGET_VOL = 0.15
                    capital_weight = min(1.0, TARGET_VOL / curr_vol)
                    MAX_CAPITAL = 85.0 * capital_weight
        except Exception as e:
            print(f"Market regime error: {e}")

    portfolio = []
    for v in valid:
        kelly_pct = round((v["kelly_raw"] / kelly_sum) * 100, 2) if kelly_sum > 0 else 0
        mark_pct  = round(((1 / v["vol_5d"]) / inv_vol_sum) * 100, 2)

        raw = (kelly_pct * WEIGHT_KELLY) + (mark_pct * WEIGHT_MARK)
        recommended = round(raw * (MAX_CAPITAL / 100), 2)

        # Phân loại rủi ro theo biên độ 5 phiên
        risk = "Cao" if v["vol_5d"] > 8 else ("Trung bình" if v["vol_5d"] > 4 else "Thấp")

        # Gợi ý thời gian nắm giữ: 5 phiên (vì model đã tập trung vào 5 phiên)
        hold  = "5 phiên"

        portfolio.append(PortfolioItem(
            ticker          = v["ticker"],
            sector          = v["sector"],
            price           = v["price"],
            score_5         = round(v["score_5"], 2),
            volatility_5d   = round(v["vol_5d"], 2),
            kelly_pct       = kelly_pct,
            markowitz_pct   = mark_pct,
            recommended_pct = recommended,
            risk_level      = risk,
            hold_sessions   = hold,
        ))

    # Sắp xếp theo mức phân bổ vốn đề xuất
    portfolio.sort(key=lambda x: x.recommended_pct, reverse=True)
    
    _PORTFOLIO_CACHE = portfolio
    _PORTFOLIO_CACHE_TIME = time.time()
    
    return portfolio

