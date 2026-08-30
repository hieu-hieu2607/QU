"""
=====================================================================
QUANTUM AI - MODEL TRAINING SCRIPT
=====================================================================
Chạy script này trên máy tính cá nhân để train model và lưu ra file.
Sau khi train xong, commit file model.pkl lên GitHub.

Cách chạy:
  cd backend
  venv\\Scripts\\activate
  python train_model.py

File đầu ra: backend/app/core/model.pkl
=====================================================================
"""

import os
import sys
import warnings
import numpy as np
import pandas as pd
import yfinance as yf
import joblib
from datetime import datetime

# Fix Unicode on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

warnings.filterwarnings("ignore")

# ─── Cài đặt ───────────────────────────────────────────────────────
WATCHLIST = [
    # ── Ngân hàng (15 mã) ──
    'VCB', 'MBB', 'CTG', 'STB', 'BID', 'TCB', 'VPB', 'ACB', 'HDB', 'LPB',
    'OCB', 'TPB', 'EIB', 'SSB', 'MSB',

    # ── Bất động sản (10 mã) ──
    'VHM', 'VIC', 'NVL', 'KDH', 'PDR',
    'DXG', 'NLG', 'HDG', 'DPG', 'BCM',

    # ── Tiêu dùng / Bán lẻ (9 mã) ──
    'VNM', 'MSN', 'MWG', 'PNJ', 'SAB',
   'VHC', 'ANV', 'HAH',

    # ── Công nghệ (4 mã) ──
    'FPT', 'CMG', 'ELC', # ── Thép / Vật liệu (7 mã) ──
    'HPG', 'HSG', 'NKG', 'GEX',
    'TLH', 'SMC', # ── Năng lượng / Dầu khí (8 mã) ──
    'GAS', 'PLX', 'POW', 'PVT',
    'NT2', 'PC1', 'PVD', 'BSR',

    # ── Chứng khoán (6 mã) ──
    'SSI', 'VND', 'HCM', 'BSI',
    'CTS', # ── Dược phẩm (4 mã) ──
    'DHG', 'IMP', 'OPC', 'DBD',

    # ── Xây dựng / Hạ tầng (5 mã) ──
    'CTD','VCG', 'FCN', 'LCG',

    # ── Phân bón / Hoá chất (3 mã) ──
    'DPM', 'DCM', 'DGC',

    # ── Cao su (2 mã) ──
    'PHR', 'GVR',

    # ── Vận tải / Logistics (4 mã) ──
    'GMD','VJC', 'STG',

    # ── Khác: BH, điện, REIT (5 mã) ──
    'VRE', 'DGW', 'BVH', ]


FORECAST_HORIZONS = [5]   # số phiên dự báo
HISTORY_DAYS      = 1500          # ~6 năm dữ liệu
TRAIN_RATIO       = 0.70          # 70% cũ = train, 30% mới = test
MODEL_OUT_PATH    = os.path.join(os.path.dirname(__file__), "app", "core", "model.pkl")


# ─── Tính toán chỉ báo ─────────────────────────────────────────────
def calc_rsi(close, period=14):
    delta = close.diff()
    gain = delta.where(delta > 0, 0).ewm(alpha=1/period, adjust=False).mean()
    loss = (-delta.where(delta < 0, 0)).ewm(alpha=1/period, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)

def calc_macd_hist(close, fast=12, slow=26, signal=9):
    ema_f = close.ewm(span=fast, adjust=False).mean()
    ema_s = close.ewm(span=slow, adjust=False).mean()
    macd  = ema_f - ema_s
    sig   = macd.ewm(span=signal, adjust=False).mean()
    return macd - sig  # histogram

def calc_bbw(close, window=20, num_std=2):
    ma  = close.rolling(window).mean()
    std = close.rolling(window).std()
    return ((ma + num_std * std) - (ma - num_std * std)) / ma * 100

def calc_pct_b(close, window=20, num_std=2):
    ma  = close.rolling(window).mean()
    std = close.rolling(window).std()
    upper = ma + num_std * std
    lower = ma - num_std * std
    return (close - lower) / (upper - lower).replace(0, np.nan)

def calc_adx(high, low, close, period=14):
    plus_dm  = high.diff().clip(lower=0)
    minus_dm = (-low.diff()).clip(lower=0)
    tr = pd.concat([high - low,
                    (high - close.shift()).abs(),
                    (low  - close.shift()).abs()], axis=1).max(axis=1)
    atr      = tr.ewm(alpha=1/period, adjust=False).mean()
    plus_di  = 100 * plus_dm.ewm(alpha=1/period, adjust=False).mean()  / atr.replace(0, np.nan)
    minus_di = 100 * minus_dm.ewm(alpha=1/period, adjust=False).mean() / atr.replace(0, np.nan)
    dx = (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan) * 100
    return dx.ewm(alpha=1/period, adjust=False).mean().fillna(0)


# ─── Lấy dữ liệu & tạo feature ────────────────────────────────────
def calc_stoch_rsi(close, rsi_period=14, stoch_period=14):
    """Stochastic RSI: RSI đang ở đâu trong vùng RSI của nó (0=đáy, 1=đỉnh)."""
    rsi     = calc_rsi(close, rsi_period)
    min_rsi = rsi.rolling(stoch_period).min()
    max_rsi = rsi.rolling(stoch_period).max()
    return ((rsi - min_rsi) / (max_rsi - min_rsi).replace(0, np.nan)).fillna(0.5)


def fetch_fundamentals(ticker: str) -> dict:
    """Lấy chỉ số cơ bản (static) của mỗi mã từ yfinance. Dùng làm feature cho AI."""
    try:
        info = yf.Ticker(f"{ticker}.VN").info
        pe   = float(info.get("trailingPE")     or 15.0)
        roe  = float(info.get("returnOnEquity") or 0.12) * 100   # decimal → %
        debt = float(info.get("debtToEquity")   or 50.0) / 100   # D/E% → tỷ lệ
        return {
            "f_pe":   float(np.clip(pe,    0, 60)),
            "f_roe":  float(np.clip(roe, -10, 50)),
            "f_debt": float(np.clip(debt,   0,  3)),
        }
    except Exception:
        return {"f_pe": 15.0, "f_roe": 12.0, "f_debt": 0.5}


def build_features(ticker: str, vnindex: pd.Series, fundamentals: dict) -> pd.DataFrame:

    df = yf.Ticker(f"{ticker}.VN").history(period=f"{HISTORY_DAYS}d")
    if df.empty or len(df) < 100:
        return None
    df.index = df.index.tz_localize(None)
    close  = df["Close"]
    high   = df["High"]
    low    = df["Low"]
    volume = df["Volume"]

    feat = pd.DataFrame(index=df.index)

    # ── ATR (dùng chung) ──
    atr = (pd.concat([high-low, (high-close.shift()).abs(),
                      (low-close.shift()).abs()], axis=1)
             .max(axis=1)
             .ewm(alpha=1/14, adjust=False).mean())
    atr_safe = atr.replace(0, np.nan)

    vn_aligned = vnindex.reindex(feat.index, method="ffill")

    # ── NHÓM 1: Kỹ thuật gốc ──
    feat["rsi"]          = calc_rsi(close)
    feat["macd_hist"]    = calc_macd_hist(close)
    feat["bbw"]          = calc_bbw(close)
    feat["pct_b"]        = calc_pct_b(close)
    feat["adx"]          = calc_adx(high, low, close)
    feat["vol_ratio"]    = (volume / volume.rolling(20).mean()).clip(0, 5)
    feat["sma20_dist"]   = (close - close.rolling(20).mean()) / close.rolling(20).mean() * 100
    feat["sma50_dist"]   = (close - close.rolling(50).mean()) / close.rolling(50).mean() * 100
    feat["trend_flag"]   = ((close > close.rolling(20).mean()) &
                            (close.rolling(20).mean() > close.rolling(50).mean())).astype(int)
    feat["ret5"]         = close.pct_change(5) * 100
    feat["ret10"]        = close.pct_change(10) * 100
    feat["atr_pct"]      = (atr / close * 100)
    feat["rs5"]          = feat["ret5"] - vn_aligned.pct_change(5).fillna(0) * 100

    # ── NHÓM 2: Vị trí giá 52 tuần ──
    high_52w  = close.rolling(252).max()
    low_52w   = close.rolling(252).min()
    range_52w = (high_52w - low_52w).replace(0, np.nan)
    feat["dist_52w_high"] = (close - high_52w) / high_52w * 100
    feat["dist_52w_low"]  = (close - low_52w)  / low_52w  * 100
    feat["price_pos_52w"] = (close - low_52w) / range_52w
    feat["days_since_52w_high"] = (
        pd.Series(range(len(close)), index=close.index) -
        pd.Series(range(len(close)), index=close.index)
          .where(close == high_52w).ffill()
    ).fillna(252)

    # ── NHÓM 3: Regime thị trường (VN-Index) ──
    vn_ret = vn_aligned.pct_change()
    feat["mkt_vol20"]      = vn_ret.rolling(20).std() * 100
    feat["mkt_ret5"]       = vn_aligned.pct_change(5) * 100
    feat["mkt_ret20"]      = vn_aligned.pct_change(20) * 100
    feat["mkt_above_ma20"] = (vn_aligned > vn_aligned.rolling(20).mean()).astype(int)
    feat["mkt_above_ma50"] = (vn_aligned > vn_aligned.rolling(50).mean()).astype(int)
    feat["rs20"]           = feat["ret10"] - vn_aligned.pct_change(10).fillna(0) * 100

    # ── NHÓM 4: Volatility Regime của BẢN THÂN mã (MỚI) ──
    stock_ret = close.pct_change()
    vol20     = stock_ret.rolling(20).std() * 100
    vol60     = stock_ret.rolling(60).std() * 100
    feat["vol20"]         = vol20
    feat["vol_regime"]    = (vol20 / vol60.replace(0, np.nan)).clip(0, 3)
    atr_roll_min = atr.rolling(120).min()
    atr_roll_max = atr.rolling(120).max()
    feat["atr_pct_rank"]  = ((atr - atr_roll_min) / (atr_roll_max - atr_roll_min).replace(0, np.nan)).fillna(0.5)

    # ── NHÓM 5: Kỹ thuật nâng cao ──
    feat["stoch_rsi"]      = calc_stoch_rsi(close)
    ema9  = close.ewm(span=9,  adjust=False).mean()
    ema21 = close.ewm(span=21, adjust=False).mean()
    feat["ema_cross"]      = (ema9 - ema21) / close * 100
    feat["ret1"]           = close.pct_change(1) * 100
    feat["ret3"]           = close.pct_change(3) * 100
    obv = (np.sign(close.diff()).fillna(0) * volume).cumsum()
    feat["obv_zscore"]     = ((obv - obv.rolling(20).mean()) / obv.rolling(20).std().replace(0, 1)).clip(-3, 3)
    feat["intraday_range"] = (high - low) / close * 100
    feat["close_loc"]      = ((close - low) / (high - low).replace(0, np.nan)).fillna(0.5)

    # ── NHÓM 6: Cơ bản ──
    feat["f_pe"]           = fundamentals.get("f_pe",   15.0)
    feat["f_roe"]          = fundamentals.get("f_roe",  12.0)
    feat["f_debt"]         = fundamentals.get("f_debt",  0.5)

    return feat.dropna(), close



def attach_targets(feat: pd.DataFrame, close: pd.Series, vnindex: pd.Series) -> pd.DataFrame:
    """Gắn nhãn: forward return tuyệt đối cho 5, 10, 20 phiên."""
    aligned_close = close.reindex(feat.index)
    
    for h in FORECAST_HORIZONS:
        fwd_stock = aligned_close.shift(-h) / aligned_close - 1
        feat[f"target_{h}"] = fwd_stock
    return feat.dropna()


# ─── Train model (Ensemble) ──────────────────────────────
def _build_ensemble_model(X_train, y_train):
    """Sử dụng Optuna để tune XGBoost, sau đó kết hợp với LightGBM và RandomForest."""
    import optuna
    from xgboost import XGBRegressor
    from lightgbm import LGBMRegressor
    from sklearn.ensemble import RandomForestRegressor, VotingRegressor
    from sklearn.model_selection import TimeSeriesSplit
    from sklearn.preprocessing import StandardScaler
    import scipy.stats as stats

    # 1. Chạy Optuna tìm tham số tốt nhất cho XGBoost
    def objective(trial):
        param = {
            'n_estimators': trial.suggest_int('n_estimators', 50, 150),
            'max_depth': trial.suggest_int('max_depth', 2, 4),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.1, log=True),
            'subsample': trial.suggest_float('subsample', 0.5, 0.9),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 0.9),
            'min_child_weight': trial.suggest_int('min_child_weight', 20, 80),
            'reg_alpha': trial.suggest_float('reg_alpha', 0.1, 10.0, log=True),
            'reg_lambda': trial.suggest_float('reg_lambda', 0.1, 10.0, log=True),
            'random_state': 42,
            'n_jobs': -1,
            'verbosity': 0,
        }
        model = XGBRegressor(**param)
        
        tscv = TimeSeriesSplit(n_splits=2)
        ic_scores = []
        for train_index, val_index in tscv.split(X_train):
            X_tr, X_val = X_train.iloc[train_index], X_train.iloc[val_index]
            y_tr, y_val = y_train.iloc[train_index], y_train.iloc[val_index]
            sc = StandardScaler()
            model.fit(sc.fit_transform(X_tr), y_tr)
            preds = model.predict(sc.transform(X_val))
            corr, _ = stats.spearmanr(y_val, preds)
            ic_scores.append(corr if not np.isnan(corr) else -1)
            
        return np.mean(ic_scores)

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction='maximize')
    study.optimize(objective, n_trials=10)  # Chạy 10 vòng cho XGBoost
    
    best_xgb_params = study.best_params
    best_xgb_params.update({'random_state': 42, 'n_jobs': -1, 'verbosity': 0})
    xgb_model = XGBRegressor(**best_xgb_params)

    # 2. LightGBM (Thuật toán cây khác biệt, nhanh hơn)
    lgbm_model = LGBMRegressor(
        n_estimators=100, max_depth=3, learning_rate=0.05,
        subsample=0.7, colsample_bytree=0.7, min_child_samples=50,
        reg_alpha=2.0, reg_lambda=5.0, random_state=42, n_jobs=-1, verbose=-1
    )

    # 3. Random Forest (Ổn định, chống overfit tự nhiên)
    rf_model = RandomForestRegressor(
        n_estimators=100, max_depth=4, min_samples_leaf=40,
        max_features='sqrt', random_state=42, n_jobs=-1
    )

    # 4. Trộn 3 mô hình (Voting)
    ensemble = VotingRegressor(estimators=[
        ('xgb', xgb_model),
        ('lgbm', lgbm_model),
        ('rf', rf_model)
    ], weights=[0.4, 0.4, 0.2])  # XGB và LGBM chiếm 80%, RF 20%

    return ensemble

def train_for_horizon(X_train, y_train, X_test, y_test, ret_test, horizon):
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    from sklearn.metrics import r2_score
    import scipy.stats as stats

    print(f"  [{horizon:2d}p] Đang build Ensemble Model (XGB + LGBM + RF)...")
    ensemble_model = _build_ensemble_model(X_train, y_train)
    
    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("model",  ensemble_model)
    ])
    pipe.fit(X_train, y_train)

    # === Validation báo cáo ===
    pred_test  = pipe.predict(X_test)
    r2         = r2_score(y_test, pred_test)
    corr, pval = stats.spearmanr(y_test, pred_test)

    # Quartile IC: Q4 (cao nhất) so với Q1 (thấp nhất)
    df_val   = pd.DataFrame({"y_true": y_test, "y_pred": pred_test})
    quartile = pd.qcut(df_val["y_pred"], q=4, labels=False)
    q4_mean  = df_val.loc[quartile == 3, "y_true"].mean() * 100
    q1_mean  = df_val.loc[quartile == 0, "y_true"].mean() * 100

    print(f"  [{horizon:2d}p] R²={r2:.4f}  Spearman_ρ={corr:.4f} (p={pval:.3f})  Q4={q4_mean:+.2f}%  Q1={q1_mean:+.2f}%")
    return pipe


# ─── Walk-forward validation ──────────────────────────────────────────────────
def walk_forward_report(feat_all, feature_cols, horizon, vn_close=None, n_splits=5):
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    import scipy.stats as stats
    import pandas as pd
    import numpy as np

    target_col = f"target_{horizon}"
    ret_col = f"ret_raw_{horizon}"
    results_ic = []
    
    split_size = len(feat_all) // (n_splits + 1)

    print(f"  [{horizon:2d}p] Walk-forward IC ({n_splits} windows - Embargo Applied):")
    
    # Định dạng bảng
    header = f"{'Window':<8} | {'IC':<7} | {'Q4 ret':<9} | {'Q1 ret':<9} | {'Q4-Q1':<8} | {'Q4 Shrpe':<8} | {'L/S Shrp':<8} | {'Q4 MaxDD':<9} | {'#Trades':<7} | {'Turnover':<8}"
    print("         " + "-" * len(header))
    print("         " + header)
    print("         " + "-" * len(header))
    
    if vn_close is not None:
        # Volatility-Scaling Market Regime Filter
        # Target Annualized Volatility: 15% (0.15)
        # Compute 20-day rolling annualized volatility of VN-Index
        vni_ret = vn_close.pct_change()
        vni_vol = vni_ret.rolling(20).std() * np.sqrt(252)
        vni_vol = vni_vol.replace(0, 0.001)  # Prevent division by zero
        TARGET_VOL = 0.15

    # Arrays to accumulate all window returns for concatenated equity curve
    all_q4_rets = []
    all_q1_rets = []
    all_q4_q1 = []

    for i in range(1, n_splits + 1):
        train_end = split_size * i
        test_end  = train_end + split_size
        if test_end > len(feat_all):
            test_end = len(feat_all)
            
        train_raw = feat_all.iloc[:train_end]
        test_raw  = feat_all.iloc[train_end:test_end]

        if len(train_raw) < 100 or len(test_raw) < 10:
            continue
            
        # --- PURGING & EMBARGO ---
        train_end_date = train_raw.index[-1]
        embargo_date = train_end_date + pd.Timedelta(days=horizon * 2) 
        test = test_raw[test_raw.index > embargo_date]
        train = train_raw
        
        if len(test) < 10:
            continue

        from xgboost import XGBRegressor
        from lightgbm import LGBMRegressor
        from sklearn.ensemble import RandomForestRegressor, VotingRegressor

        xgb  = XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, reg_lambda=5.0, n_jobs=-1, verbosity=0)
        lgbm = LGBMRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, reg_lambda=5.0, n_jobs=-1, verbose=-1)
        rf = RandomForestRegressor(n_estimators=50, max_depth=3, min_samples_leaf=40, n_jobs=-1)
        ens = VotingRegressor([('xgb', xgb), ('lgbm', lgbm), ('rf', rf)])

        pipe  = Pipeline([("sc", StandardScaler()), ("model", ens)])
        pipe.fit(train[feature_cols], train[target_col])
        pred  = pipe.predict(test[feature_cols])
        
        corr, _ = stats.spearmanr(test[target_col], pred)
        results_ic.append(corr)
        
        # --- SIMULATION FOR EXPERT TABLE ---
        test = test.copy()
        test["pred"] = pred
        
        # Group by date to simulate rebalancing every 'horizon' days
        dates = sorted(test.index.unique())
        rebal_dates = dates[::horizon]
        
        q4_rets, q1_rets = [], []
        turnovers = []
        prev_q4 = set()
        trades_count = 0
        
        for d in rebal_dates:
            day_data = test.loc[[d]] if isinstance(test.loc[d], pd.Series) else test.loc[d]
            if len(day_data) < 4: continue
            
            # Rank predictions
            day_data = day_data.sort_values("pred", ascending=False)
            n_q = max(1, len(day_data) // 4)
            q4 = day_data.iloc[:n_q]
            q1 = day_data.iloc[-n_q:]
            
            # MARKET REGIME FILTER: Volatility Scaling
            cash_weight = 0.0
            if vn_close is not None and d in vni_vol.index:
                curr_vol = vni_vol.loc[d]
                if not np.isnan(curr_vol):
                    # Tỷ trọng vốn = Target Vol / Current Vol (Max 1.0)
                    capital_weight = min(1.0, TARGET_VOL / curr_vol)
                    cash_weight = 1.0 - capital_weight
            
            raw_q4_ret = q4[ret_col].mean()
            # Áp dụng tỷ trọng tiền mặt (Lãi suất tiền mặt = 0% để đơn giản)
            adj_q4_ret = raw_q4_ret * (1.0 - cash_weight)
            
            q1_ret = q1[ret_col].mean()
            
            q4_rets.append(adj_q4_ret)
            q1_rets.append(q1_ret)
            
            # Turnover & Trades
            curr_q4 = set(q4.get("_ticker", []))
            if len(curr_q4) > 0:
                if prev_q4:
                    intersection = len(curr_q4 & prev_q4)
                    turnover = 1.0 - (intersection / len(curr_q4))
                else:
                    turnover = 1.0
                turnovers.append(turnover)
                trades_count += len(curr_q4 - prev_q4)
                prev_q4 = curr_q4

        # Calculate metrics for the window
        q4_rets = np.array(q4_rets)
        q1_rets = np.array(q1_rets)
        q4_q1 = q4_rets - q1_rets
        
        all_q4_rets.extend(q4_rets)
        all_q1_rets.extend(q1_rets)
        all_q4_q1.extend(q4_q1)
        
        # Cumulative returns
        cum_q4 = np.prod(1 + np.nan_to_num(q4_rets)) - 1
        cum_q1 = np.prod(1 + np.nan_to_num(q1_rets)) - 1
        cum_diff = np.prod(1 + np.nan_to_num(q4_q1)) - 1
        
        # Annualized Sharpe
        periods_per_year = 252 / horizon
        
        # Q4 Sharpe (Long-only)
        excess_q4 = np.nan_to_num(q4_rets) - (0.03 / periods_per_year)
        std_q4 = np.std(excess_q4)
        sharpe_q4 = (np.mean(excess_q4) / std_q4 * np.sqrt(periods_per_year)) if std_q4 > 0 else 0
        
        # Q4-Q1 Sharpe (Long-Short)
        excess_ls = np.nan_to_num(q4_q1) - (0.03 / periods_per_year)
        std_ls = np.std(excess_ls)
        sharpe_ls = (np.mean(excess_ls) / std_ls * np.sqrt(periods_per_year)) if std_ls > 0 else 0
        
        # Max Drawdown of Q4
        cum_curve = np.cumprod(1 + np.nan_to_num(q4_rets))
        rolling_max = np.maximum.accumulate(cum_curve)
        drawdowns = (cum_curve - rolling_max) / rolling_max
        max_dd = np.min(drawdowns) if len(drawdowns) > 0 else 0
        
        # Turnover
        avg_turnover = np.mean(turnovers) if turnovers else 0
        
        # Print row
        row_str = f"Win {i:<4} | {corr:7.4f} | {cum_q4*100:>8.2f}% | {cum_q1*100:>8.2f}% | {cum_diff*100:>7.2f}% | {sharpe_q4:8.2f} | {sharpe_ls:8.2f} | {max_dd*100:>8.2f}% | {trades_count:<7} | {avg_turnover*100:>7.1f}%"
        print("         " + row_str)

    print("         " + "-" * len(header))
    
    # Calculate Concatenated Metrics
    all_q4_rets = np.array(all_q4_rets)
    all_q1_rets = np.array(all_q1_rets)
    all_q4_q1 = np.array(all_q4_q1)
    
    periods_per_year = 252 / horizon
    excess_q4_all = np.nan_to_num(all_q4_rets) - (0.03 / periods_per_year)
    std_q4_all = np.std(excess_q4_all)
    overall_sharpe_q4 = (np.mean(excess_q4_all) / std_q4_all * np.sqrt(periods_per_year)) if std_q4_all > 0 else 0
    
    excess_ls_all = np.nan_to_num(all_q4_q1) - (0.03 / periods_per_year)
    std_ls_all = np.std(excess_ls_all)
    overall_sharpe_ls = (np.mean(excess_ls_all) / std_ls_all * np.sqrt(periods_per_year)) if std_ls_all > 0 else 0
    
    cum_curve_all = np.cumprod(1 + np.nan_to_num(all_q4_rets))
    rolling_max_all = np.maximum.accumulate(cum_curve_all)
    drawdowns_all = (cum_curve_all - rolling_max_all) / rolling_max_all
    overall_max_dd = np.min(drawdowns_all) if len(drawdowns_all) > 0 else 0
    
    cum_q4_all = np.prod(1 + np.nan_to_num(all_q4_rets)) - 1
    cum_q1_all = np.prod(1 + np.nan_to_num(all_q1_rets)) - 1
    cum_diff_all = np.prod(1 + np.nan_to_num(all_q4_q1)) - 1
    
    overall_str = f"OVERALL  | {'-':<7} | {cum_q4_all*100:>8.2f}% | {cum_q1_all*100:>8.2f}% | {cum_diff_all*100:>7.2f}% | {overall_sharpe_q4:8.2f} | {overall_sharpe_ls:8.2f} | {overall_max_dd*100:>8.2f}% | {'-':<7} | {'-':<8}"
    print("         " + overall_str)
    print("         " + "-" * len(header))

    mean_ic = np.mean(results_ic) if results_ic else 0
    std_ic = np.std(results_ic) if results_ic else 0
    ir_ic = mean_ic / std_ic if std_ic > 0 else 0
    
    print(f"         Avg IC: {mean_ic:.4f} | Std IC: {std_ic:.4f} | IR: {ir_ic:.2f}")
    return mean_ic


# ─── Main ───────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print(" QUANTUM AI — Training Pipeline")
    print(f" Thời điểm: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    # 1. Tải VN-Index proxy
    print("\n[1/4] Tải VN-Index proxy (E1VFVN30)...")
    vn_df = yf.Ticker("E1VFVN30.VN").history(period=f"{HISTORY_DAYS}d")
    if vn_df.empty:
        print("  ⚠️  Không lấy được VN-Index, RS sẽ = 0")
        vnindex_ret = pd.Series(dtype=float)
    else:
        vn_df.index = vn_df.index.tz_localize(None)
        vnindex_ret = vn_df["Close"]

    # 2. Tải dữ liệu từng mã và tạo feature
    print(f"\n[2/4] Tải dữ liệu {len(WATCHLIST)} mã và tính chỉ báo...")
    import time
    all_frames = []
    feature_cols = None
    for ticker in WATCHLIST:
        sys.stdout.write(f"  {ticker}... ")
        sys.stdout.flush()
        try:
            fund = fetch_fundamentals(ticker)
            result = build_features(ticker, vnindex_ret, fund)
            if result is None:
                print("skip (không đủ dữ liệu)")
                continue
            feat, close = result
            feat = attach_targets(feat, close, vnindex_ret)
            feat["_ticker"] = ticker  # Thêm ticker để tính turnover
            if feat.empty:
                print("skip (lỗi attach target)")
                continue
            if feature_cols is None:
                feature_cols = [c for c in feat.columns if not c.startswith("target_") and c not in ["_ticker", "ret_raw_5"]]
            all_frames.append(feat)
            print(f"OK ({len(feat)} rows)")
            time.sleep(0.5)  # Tránh Rate Limit của Yahoo Finance
        except Exception as e:
            print(f"Lỗi: {e}")
            time.sleep(2.0)

    if not all_frames:
        print("❌ Không lấy được dữ liệu!")
        return

    feat_all = pd.concat(all_frames).sort_index()

    # --- LỌC TƯƠNG QUAN ĐA CỘNG TUYẾN (Multicollinearity) ---
    print("\n  [+] Lọc tương quan đa cộng tuyến (threshold=0.85)...")
    corr_matrix = feat_all[feature_cols].corr().abs()
    upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
    to_drop = [column for column in upper.columns if any(upper[column] > 0.85)]
    feature_cols = [c for c in feature_cols if c not in to_drop]
    print(f"      Đã loại bỏ {len(to_drop)} features: {to_drop}")
    print(f"      Còn lại {len(feature_cols)} features.")

    # --- CROSS-SECTIONAL RANK TARGET ---
    print("\n  [+] Áp dụng Cross-sectional Rank Target...")
    # Lưu return thực trước khi rank (dùng để tính Q4/Q1 thực tế)
    for h in FORECAST_HORIZONS:
        feat_all[f"ret_raw_{h}"] = feat_all[f"target_{h}"]  # raw return
        feat_all[f"target_{h}"] = feat_all.groupby(level=0)[f"target_{h}"].rank(pct=True)

    print(f"\n  📌 Tổng số hàng dữ liệu: {len(feat_all):,}")

    # 3. Train/Test split theo thời gian
    print(f"\n[3/4] Train/Test split (70%/30%) và đánh giá:")
    split_idx = int(len(feat_all) * TRAIN_RATIO)
    train = feat_all.iloc[:split_idx]
    test  = feat_all.iloc[split_idx:]

    models = {}
    for h in FORECAST_HORIZONS:
        target_col = f"target_{h}"
        ret_col    = f"ret_raw_{h}"
        models[h] = train_for_horizon(
            train[feature_cols], train[target_col],
            test[feature_cols],  test[target_col],
            test[ret_col],  # raw return cho Q4/Q1 thực tế
            h
        )

    # 4. Walk-forward validation
    print(f"\n[4/4] Walk-Forward Validation (5 cửa sổ - KHÔNG FILTER):")
    wf_scores = {}
    for h in FORECAST_HORIZONS:
        wf_scores[h] = walk_forward_report(feat_all, feature_cols, h, vn_close=None)

    print(f"\n[4.5/4] Walk-Forward Validation (5 cửa sổ - CÓ MARKET REGIME FILTER):")
    for h in FORECAST_HORIZONS:
        walk_forward_report(feat_all, feature_cols, h, vn_close=vnindex_ret)

    # 5. Lưu model
    bundle = {
        "models":        models,
        "feature_cols":  feature_cols,
        "wf_scores":     wf_scores,
        "trained_at":    datetime.now().isoformat(),
        "horizons":      FORECAST_HORIZONS,
    }
    os.makedirs(os.path.dirname(MODEL_OUT_PATH), exist_ok=True)
    joblib.dump(bundle, MODEL_OUT_PATH)
    print(f"\n{'='*60}")
    print(f" ✅ Model đã được lưu vào: {MODEL_OUT_PATH}")
    print(f" 👉 Commit file này lên GitHub để deploy tự động!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
