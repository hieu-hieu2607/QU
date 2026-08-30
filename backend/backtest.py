"""
=====================================================================
QUANTUM AI - BACKTEST SCRIPT (A + B)
=====================================================================
Mô phỏng PnL thực tế (Long-Only) có khấu trừ phí giao dịch + trượt giá.
Đo Turnover Rate để kiểm tra mức độ đảo danh mục.

Cách chạy:
  cd backend
  venv\\Scripts\\activate
  python backtest.py

Output:
  - In ra bảng kết quả backtest (Sharpe, CAGR, MaxDD, Turnover)
  - Lưu ra backtest_results.json để API đọc
=====================================================================
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
import yfinance as yf
import joblib
from datetime import datetime

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
warnings.filterwarnings("ignore")

# ─── Cài đặt ───────────────────────────────────────────────────────
MODEL_PATH     = os.path.join(os.path.dirname(__file__), "app", "core", "model.pkl")
RESULTS_PATH   = os.path.join(os.path.dirname(__file__), "app", "core", "backtest_results.json")
WATCHLIST = [
    'VCB','MBB','CTG','STB','BID','TCB','VPB','ACB','HDB','LPB',
    'OCB','TPB','EIB','SSB','MSB','VHM','VIC','NVL','KDH','PDR',
    'DXG','NLG','HDG','DPG','BCM','VNM','MSN','MWG','PNJ','SAB',
    'VHC','ANV','HAH','FPT','CMG','ELC','HPG','HSG','NKG','GEX',
    'TLH','SMC','GAS','PLX','POW','PVT','NT2','PC1','PVD',
    'SSI','VND','HCM','BSI','CTS','DHG','IMP','OPC','DBD',
    'CTD','VCG','FCN','LCG','DPM','DCM','DGC','PHR','GVR',
    'GMD','VJC','STG','VRE','DGW','BVH',
]

FEE_RATE      = 0.0015    # 0.15% phí/giao dịch (mua + bán)
SLIPPAGE_RATE = 0.0010    # 0.10% trượt giá mỗi chiều
HOLD_DAYS     = 5         # nắm giữ 5 phiên
TOP_N         = 10        # chọn Top N mã
HISTORY_DAYS  = 1500


# ─── Import hàm tính feature từ train_model ─────────────────────────
sys.path.insert(0, os.path.dirname(__file__))
from train_model import (
    build_features, fetch_fundamentals, attach_targets,
    calc_rsi, calc_macd_hist, calc_bbw, calc_adx
)


def load_all_price_data():
    """Tải dữ liệu giá của toàn bộ watchlist."""
    print("[1/4] Tải dữ liệu giá lịch sử...")
    prices = {}
    import time
    for ticker in WATCHLIST:
        try:
            df = yf.Ticker(f"{ticker}.VN").history(period=f"{HISTORY_DAYS}d")
            if not df.empty and len(df) > 252:
                df.index = df.index.tz_localize(None)
                prices[ticker] = df["Close"]
                sys.stdout.write(f"  {ticker}(OK) ")
            else:
                sys.stdout.write(f"  {ticker}(skip) ")
            sys.stdout.flush()
            time.sleep(0.2)
        except Exception as e:
            sys.stdout.write(f"  {ticker}(err) ")
    print(f"\n  => Loaded {len(prices)} tickers")
    return prices


def fetch_fundamentals_mock(ticker):
    return {"f_pe": 15.0, "f_roe": 12.0, "f_debt": 0.5}

def build_all_features(vnindex_close):
    """Tính feature cho toàn bộ watchlist."""
    print("[2/4] Tính features...")
    frames = []
    import time
    for ticker in WATCHLIST:
        try:
            fund = fetch_fundamentals_mock(ticker)
            result = build_features(ticker, vnindex_close, fund)
            if result is None:
                continue
            feat, close = result
            feat = attach_targets(feat, close, vnindex_close)
            if not feat.empty:
                feat["_ticker"] = ticker
                feat["_close"]  = close.reindex(feat.index)
                frames.append(feat)
        except Exception as e:
            pass
    feat_all = pd.concat(frames).sort_index()
    print(f"  => {len(feat_all):,} hàng dữ liệu feature")
    return feat_all


def run_backtest(feat_all, model, feature_cols, prices):
    """
    Chạy backtest Long-Only có phí:
    - Mỗi HOLD_DAYS phiên, rebalance danh mục
    - Mua Top N theo AI score, giữ HOLD_DAYS phiên, bán
    - Tính PnL thực sau phí + slippage
    """
    print("[3/4] Chạy PnL Simulation...")

    all_dates = sorted(feat_all.index.unique())

    # Chỉ backtest trên 30% cuối (out-of-sample, nhất quán với train)
    split_idx   = int(len(all_dates) * 0.70)
    test_dates  = all_dates[split_idx:]

    # Tạo lịch rebalance: mỗi HOLD_DAYS phiên
    rebal_dates = test_dates[::HOLD_DAYS]

    portfolio_history = []
    prev_holdings     = set()
    total_cost        = FEE_RATE + SLIPPAGE_RATE  # tổng phí 1 chiều

    for i, rebal_date in enumerate(rebal_dates):
        # Lấy dữ liệu features tại ngày này
        day_data = feat_all.loc[rebal_date] if rebal_date in feat_all.index else None
        if day_data is None or (hasattr(day_data, '__len__') and len(day_data) == 0):
            continue

        # Tính AI score cho tất cả mã
        if isinstance(day_data, pd.Series):
            day_data = day_data.to_frame().T

        # Lọc tickers available
        available_tickers = []
        scores = []
        for _, row in day_data.iterrows():
            ticker = row.get("_ticker")
            if ticker is None:
                continue
            try:
                X = row[feature_cols].values.reshape(1, -1)
                X_df = pd.DataFrame(X, columns=feature_cols)
                score = float(model.predict(X_df)[0])
                available_tickers.append(ticker)
                scores.append(score)
            except Exception:
                continue

        if len(available_tickers) < TOP_N:
            continue

        # Chọn Top N
        scored = sorted(zip(available_tickers, scores), key=lambda x: x[1], reverse=True)
        new_holdings = set([t for t, s in scored[:TOP_N]])

        # Tính Turnover
        if prev_holdings:
            intersection = len(new_holdings & prev_holdings)
            turnover = 1 - intersection / len(new_holdings)
        else:
            turnover = 1.0

        # Tính Return của danh mục trong HOLD_DAYS phiên tiếp theo
        next_date_idx = test_dates.index(rebal_date) if rebal_date in test_dates else None
        if next_date_idx is None or next_date_idx + HOLD_DAYS >= len(test_dates):
            continue

        next_rebal = test_dates[min(next_date_idx + HOLD_DAYS, len(test_dates) - 1)]

        period_returns = []
        for ticker in new_holdings:
            if ticker not in prices:
                continue
            price_series = prices[ticker]
            try:
                p_buy  = float(price_series.asof(rebal_date))
                p_sell = float(price_series.asof(next_rebal))
                if p_buy <= 0:
                    continue
                raw_ret = (p_sell - p_buy) / p_buy
                # Khấu trừ phí mua + phí bán + slippage cả 2 chiều
                net_ret = raw_ret - 2 * total_cost
                period_returns.append(net_ret)
            except Exception:
                continue

        if not period_returns:
            continue

        portfolio_ret = np.mean(period_returns)

        portfolio_history.append({
            "date":         rebal_date.strftime("%Y-%m-%d"),
            "holdings":     list(new_holdings),
            "turnover":     round(turnover, 4),
            "period_ret":   round(portfolio_ret, 6),
            "n_stocks":     len(period_returns),
        })

        prev_holdings = new_holdings

    return portfolio_history


def calc_statistics(history):
    """Tính các chỉ số hiệu năng từ lịch sử backtest."""
    if not history:
        return {}

    rets = np.array([h["period_ret"] for h in history])
    turnover_rates = np.array([h["turnover"] for h in history])

    # Cumulative returns
    cum_ret    = np.prod(1 + rets) - 1
    n_periods  = len(rets)
    periods_per_year = 252 / HOLD_DAYS  # số lần rebalance/năm

    # CAGR
    years = n_periods / periods_per_year
    cagr  = (1 + cum_ret) ** (1 / years) - 1 if years > 0 else 0

    # Sharpe (annualized, risk-free ~3%)
    rf_per_period = 0.03 / periods_per_year
    excess_rets   = rets - rf_per_period
    sharpe = (np.mean(excess_rets) / np.std(excess_rets) * np.sqrt(periods_per_year)
              if np.std(excess_rets) > 0 else 0)

    # Max Drawdown
    cum_curve   = np.cumprod(1 + rets)
    rolling_max = np.maximum.accumulate(cum_curve)
    drawdowns   = (cum_curve - rolling_max) / rolling_max
    max_dd      = float(np.min(drawdowns))

    # Win Rate
    win_rate = float(np.mean(rets > 0))

    # Turnover
    avg_turnover = float(np.mean(turnover_rates))

    # Positive periods
    pos_periods = int(np.sum(rets > 0))

    return {
        "cum_ret_pct":      round(cum_ret * 100, 2),
        "cagr_pct":         round(cagr * 100, 2),
        "sharpe":           round(sharpe, 3),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "win_rate_pct":     round(win_rate * 100, 1),
        "avg_turnover_pct": round(avg_turnover * 100, 1),
        "n_periods":        n_periods,
        "pos_periods":      pos_periods,
        "fee_rate_pct":     round(FEE_RATE * 100, 2),
        "slippage_pct":     round(SLIPPAGE_RATE * 100, 2),
        "hold_days":        HOLD_DAYS,
        "top_n":            TOP_N,
        "run_at":           datetime.now().isoformat(),
    }


def main():
    print("=" * 60)
    print(" QUANTUM AI — Backtest PnL + Turnover Rate")
    print(f" Thời điểm: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    # Load model
    if not os.path.exists(MODEL_PATH):
        print("❌ Model chưa được train. Chạy train_model.py trước!")
        return
    bundle       = joblib.load(MODEL_PATH)
    model        = bundle["models"][5]
    feature_cols = bundle["feature_cols"]
    print(f"  ✅ Model loaded (trained_at: {bundle.get('trained_at','?')})")
    print(f"  Features: {len(feature_cols)} cols")

    # Tải VN-Index
    print("\n  Tải VN-Index...")
    vn_df = yf.Ticker("E1VFVN30.VN").history(period=f"{HISTORY_DAYS}d")
    vn_df.index = vn_df.index.tz_localize(None)
    vnindex_close = vn_df["Close"]

    # Tải toàn bộ dữ liệu giá (cho tính toán return thực tế)
    prices = load_all_price_data()

    # Build features
    feat_all = build_all_features(vnindex_close)

    # Lọc feature_cols (đảm bảo model nhận đúng cột)
    missing = [c for c in feature_cols if c not in feat_all.columns]
    for c in missing:
        feat_all[c] = 0.0

    # Chạy backtest
    history = run_backtest(feat_all, model, feature_cols, prices)

    # Tính stats
    stats = calc_statistics(history)

    print("\n" + "=" * 60)
    print(" 📊 KẾT QUẢ BACKTEST (Out-of-Sample, có phí)")
    print("=" * 60)
    print(f"  Số kỳ giao dịch (5p): {stats.get('n_periods', 0)}")
    print(f"  Kỳ thắng:             {stats.get('pos_periods', 0)}/{stats.get('n_periods', 0)} ({stats.get('win_rate_pct', 0)}%)")
    print(f"  Lợi nhuận tích luỹ:   {stats.get('cum_ret_pct', 0):+.2f}%")
    print(f"  CAGR (lợi nhuận/năm): {stats.get('cagr_pct', 0):+.2f}%")
    print(f"  Sharpe Ratio:         {stats.get('sharpe', 0):.3f}")
    print(f"  Max Drawdown:         {stats.get('max_drawdown_pct', 0):.2f}%")
    print(f"  Avg Turnover/kỳ:      {stats.get('avg_turnover_pct', 0):.1f}%")
    print(f"  (Phí: {stats.get('fee_rate_pct', 0)}% + Slippage: {stats.get('slippage_pct', 0)}%/giao dịch)")
    print("=" * 60)

    if stats.get("sharpe", 0) > 1.5:
        print("  🏆 NET SHARPE > 1.5 — Alpha sống sót sau phí giao dịch!")
    elif stats.get("sharpe", 0) > 1.0:
        print("  ✅ Sharpe > 1.0 — Tín hiệu đủ mạnh sau phí.")
    elif stats.get("cagr_pct", 0) > 0:
        print("  ⚠️ Alpha yếu sau phí — cần tối ưu thêm.")
    else:
        print("  ❌ Alpha bị phí ăn hết — cần cải thiện IC hoặc giảm turnover.")

    # Lưu results
    output = {
        "stats":   stats,
        "history": history[-20:],  # Lưu 20 kỳ gần nhất
    }
    os.makedirs(os.path.dirname(RESULTS_PATH), exist_ok=True)
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n  ✅ Kết quả đã lưu: {RESULTS_PATH}")
    print(f"  👉 Backend sẽ tự động đọc file này cho API /api/backtest\n")


if __name__ == "__main__":
    main()
