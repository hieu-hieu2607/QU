export interface StockData {
  ticker: string;
  sector: string;
  price: number;
  rsi: number;
  macd: number;
  macd_trend: string;
  sma20: number;
  divergence: string;
  trend: string;
  adx: number;
  adx_trend: string;
  bollinger_b: number;
  bbw: number;
  atr_pct: number;
  vol_ratio: number;
  foreign_pct: number;
  rs_5d: number;
  pct_change_5d: number;
  rr_ratio: number;
  pe: number;
  roe: number;
  eps: number;
  debt_ratio: number;
}
