def walk_forward_report(feat_all, feature_cols, horizon, n_splits=5):
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    import scipy.stats as stats
    import pandas as pd
    import numpy as np

    target_col = f"target_{horizon}"
    ret_col = f"ret_raw_{horizon}"
    results_ic = []
    
    # Bảng đánh giá chi tiết
    table_rows = []
    
    split_size = len(feat_all) // (n_splits + 1)

    print(f"  [{horizon:2d}p] Walk-forward IC ({n_splits} windows - Embargo Applied):")
    
    # Định dạng bảng
    header = f"{'Window':<8} | {'IC':<7} | {'Q4 ret':<9} | {'Q1 ret':<9} | {'Q4-Q1':<8} | {'Sharpe':<7} | {'Max DD':<8} | {'#Trades':<7} | {'Turnover':<8}"
    print("         " + "-" * len(header))
    print("         " + header)
    print("         " + "-" * len(header))

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
            
            q4_ret = q4[ret_col].mean()
            q1_ret = q1[ret_col].mean()
            
            q4_rets.append(q4_ret)
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
        
        # Cumulative returns
        cum_q4 = np.prod(1 + np.nan_to_num(q4_rets)) - 1
        cum_q1 = np.prod(1 + np.nan_to_num(q1_rets)) - 1
        cum_diff = np.prod(1 + np.nan_to_num(q4_q1)) - 1
        
        # Annualized Sharpe (assuming rebalance every horizon days)
        periods_per_year = 252 / horizon
        excess_q4 = np.nan_to_num(q4_rets) - (0.03 / periods_per_year)
        std_q4 = np.std(excess_q4)
        sharpe = (np.mean(excess_q4) / std_q4 * np.sqrt(periods_per_year)) if std_q4 > 0 else 0
        
        # Max Drawdown of Q4
        cum_curve = np.cumprod(1 + np.nan_to_num(q4_rets))
        rolling_max = np.maximum.accumulate(cum_curve)
        drawdowns = (cum_curve - rolling_max) / rolling_max
        max_dd = np.min(drawdowns) if len(drawdowns) > 0 else 0
        
        # Turnover
        avg_turnover = np.mean(turnovers) if turnovers else 0
        
        # Print row
        row_str = f"Win {i:<4} | {corr:7.4f} | {cum_q4*100:>8.2f}% | {cum_q1*100:>8.2f}% | {cum_diff*100:>7.2f}% | {sharpe:7.2f} | {max_dd*100:>7.2f}% | {trades_count:<7} | {avg_turnover*100:>7.1f}%"
        print("         " + row_str)

    print("         " + "-" * len(header))

    mean_ic = np.mean(results_ic) if results_ic else 0
    std_ic = np.std(results_ic) if results_ic else 0
    ir_ic = mean_ic / std_ic if std_ic > 0 else 0
    
    if ir_ic >= 2.0 and mean_ic > 0.03:
        label = '🏆 Xuất sắc (Alpha thực chất)'
    elif ir_ic >= 1.5 and mean_ic > 0.02:
        label = '✅ Tốt'
    elif mean_ic > 0:
        label = '⚠️ Yếu (IC thấp nhưng dương)'
    else:
        label = '❌ Âm'
        
    print(f"         Avg IC: {mean_ic:.4f} | Std IC: {std_ic:.4f} | IR: {ir_ic:.2f}  {label}")
    return mean_ic
