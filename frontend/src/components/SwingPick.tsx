"use client";
import { useMemo } from "react";
import { StockData } from "@/types/stock";
import { TrendingUp, Clock, Target, ShieldAlert, BarChart2, Zap, BookOpen, Award, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

interface Props { data: StockData[]; }

interface ScoredStock {
  stock: StockData;
  techScore: number; fundScore: number; totalScore: number;
  techReasons: string[]; fundReasons: string[];
  signalCount: number; totalSignals: number;
  entryStrategy: string; entryDetail: string;
  horizon: string; target: number; stopLoss: number;
  peSentiment: string; roeSentiment: string; epsSentiment: string; debtSentiment: string;
}

function scoreStock(stock: StockData): ScoredStock {
  let techScore = 0; const techReasons: string[] = [];
  let signalCount = 0; const totalSignals = 8; // Tăng lên 8 tín hiệu (thêm Squeeze)

  if (stock.rsi >= 50 && stock.rsi <= 65) {
    techScore += 14; signalCount++; techReasons.push(`RSI ${stock.rsi.toFixed(1)} — momentum tốt, chưa quá mua`);
  } else if (stock.rsi >= 40 && stock.rsi < 50) {
    techScore += 6; techReasons.push(`RSI ${stock.rsi.toFixed(1)} — đang hồi phục`);
  }
  if (stock.macd_trend === "UP") {
    techScore += 12; signalCount++; techReasons.push("MACD ↑ — xung lượng tăng đang xác nhận");
  }
  if (stock.trend === "Thuận") {
    techScore += 14; signalCount++; techReasons.push("Xu hướng Thuận — giá > SMA20 > SMA50");
  }
  if (stock.adx >= 20 && stock.adx <= 45) {
    techScore += 6; signalCount++; techReasons.push(`ADX ${stock.adx.toFixed(1)} — xu hướng đủ mạnh`);
  }
  
  // ─── NEW: Relative Strength (RS) ───
  if (stock.rs_5d >= 2.0) {
    techScore += 8; signalCount++; techReasons.push(`RS ${stock.rs_5d.toFixed(1)}% — khỏe hơn thị trường chung rất rõ`);
  } else if (stock.rs_5d > 0) {
    techScore += 4; techReasons.push(`RS ${stock.rs_5d.toFixed(1)}% — đang nhỉnh hơn thị trường chung`);
  }

  // ─── MODIFIED: Volume Confirmation ───
  if (stock.vol_ratio >= 1.2 && stock.pct_change_5d > 0) {
    techScore += 6; signalCount++; techReasons.push(`KL/TB20 ${stock.vol_ratio.toFixed(2)}x (Giá tăng) — xác nhận dòng tiền vào`);
  } else if (stock.vol_ratio >= 1.2) {
    techReasons.push(`⚠️ KL ${stock.vol_ratio.toFixed(2)}x nhưng giá không tăng — cẩn thận áp lực bán`);
  }

  // ─── NEW: Bollinger Squeeze & %B ───
  let bollingerMatched = false;
  if (stock.bbw > 0 && stock.bbw < 8.0) {
    // Squeeze: Độ rộng band (BBW) hẹp (dưới 8%), báo hiệu sắp có biến động mạnh
    techScore += 0; signalCount++; bollingerMatched = true;
    techReasons.push(`Squeeze: BBW ${stock.bbw.toFixed(1)}% — cạn cung, chuẩn bị có biến động mạnh`);
  } else if (stock.bollinger_b >= 0.4 && stock.bollinger_b <= 0.75) {
    techScore += 0; signalCount++; bollingerMatched = true;
    techReasons.push(`%B ${stock.bollinger_b.toFixed(2)} — giá trong vùng Bollinger lý tưởng`);
  }

  // ─── Strategy (Entry timing) ───
  let entryStrategy = "Chờ pullback";
  let entryDetail = `Chờ giá về vùng SMA20 (khoảng ${stock.sma20 > 0 ? stock.sma20.toFixed(1) : '--'}k) để tối ưu Risk:Reward`;
  if (stock.trend === "Thuận" && stock.macd_trend === "UP" && stock.vol_ratio >= 1.2) {
    entryStrategy = "Mua ngay";
    entryDetail = "Nhiều tín hiệu xác nhận đồng thuận — động lực tốt để vào lệnh";
  } else if (stock.bollinger_b < 0.3) {
    entryStrategy = "Mua ngay";
    entryDetail = "Giá gần đáy Bollinger — vùng hỗ trợ kỹ thuật mạnh";
  }

  // ─── Fundamental (40pts) ───
  let fundScore = 0; const fundReasons: string[] = [];
  let peSentiment = "—", roeSentiment = "—", epsSentiment = "—", debtSentiment = "—";

  if (stock.pe > 0) {
    if (stock.pe < 10) { fundScore += 10; peSentiment = "Rẻ"; fundReasons.push(`P/E ${stock.pe.toFixed(1)}x — định giá rẻ`); }
    else if (stock.pe <= 18) { fundScore += 7; peSentiment = "Hợp lý"; fundReasons.push(`P/E ${stock.pe.toFixed(1)}x — hợp lý`); }
    else if (stock.pe <= 25) { fundScore += 3; peSentiment = "Hơi cao"; fundReasons.push(`P/E ${stock.pe.toFixed(1)}x — hơi cao`); }
    else { peSentiment = "Đắt"; fundReasons.push(`P/E ${stock.pe.toFixed(1)}x — đắt, thận trọng`); }
  }
  if (stock.roe > 0) {
    if (stock.roe >= 20) { fundScore += 10; roeSentiment = "Xuất sắc"; fundReasons.push(`ROE ${stock.roe.toFixed(1)}% — sinh lời xuất sắc`); }
    else if (stock.roe >= 15) { fundScore += 7; roeSentiment = "Tốt"; fundReasons.push(`ROE ${stock.roe.toFixed(1)}% — sinh lời tốt`); }
    else if (stock.roe >= 10) { fundScore += 4; roeSentiment = "TB"; fundReasons.push(`ROE ${stock.roe.toFixed(1)}% — trung bình`); }
    else { roeSentiment = "Thấp"; }
  }
  if (stock.eps > 0) {
    if (stock.eps >= 5) { fundScore += 10; epsSentiment = "Cao"; fundReasons.push(`EPS ${stock.eps.toFixed(1)}k — lợi nhuận/CP rất cao`); }
    else if (stock.eps >= 2) { fundScore += 7; epsSentiment = "Tốt"; fundReasons.push(`EPS ${stock.eps.toFixed(1)}k — tốt`); }
    else if (stock.eps >= 1) { fundScore += 4; epsSentiment = "TB"; }
    else { epsSentiment = "Thấp"; }
  }
  if (stock.debt_ratio > 0) {
    const dp = stock.debt_ratio * 100;
    if (dp < 30) { fundScore += 10; debtSentiment = "An toàn"; fundReasons.push(`Nợ ${dp.toFixed(0)}% — tài chính lành mạnh`); }
    else if (dp < 50) { fundScore += 6; debtSentiment = "TB"; fundReasons.push(`Nợ ${dp.toFixed(0)}% — chấp nhận được`); }
    else if (dp < 70) { fundScore += 2; debtSentiment = "Cao"; }
    else { debtSentiment = "Rủi ro"; }
  }

  const totalScore = techScore + fundScore;
  let horizon = "3–5 phiên";
  if (stock.atr_pct > 4.0) horizon = "2–3 phiên";
  else if (stock.atr_pct < 2.5) horizon = "5–8 phiên";
  const atrAbs = (stock.atr_pct / 100) * stock.price;
  const target = +(stock.price + atrAbs * 2).toFixed(1);
  const stopLoss = +(stock.price - atrAbs).toFixed(1);

  return { stock, techScore, fundScore, totalScore, techReasons, fundReasons, signalCount, totalSignals, entryStrategy, entryDetail, horizon, target, stopLoss, peSentiment, roeSentiment, epsSentiment, debtSentiment };
}

const SC: Record<string, string> = {
  "Rẻ": "text-emerald-400", "Hợp lý": "text-blue-400", "Hơi cao": "text-amber-400", "Đắt": "text-red-400",
  "Xuất sắc": "text-emerald-400", "Tốt": "text-blue-400", "TB": "text-amber-400", "Thấp": "text-red-400",
  "Cao": "text-emerald-400", "An toàn": "text-emerald-400", "Rủi ro": "text-red-400",
};

function FundCard({ label, sublabel, value, sentiment }: { label: string; sublabel: string; value: string; sentiment: string }) {
  return (
    <div className="bg-gray-800/40 rounded-lg px-3 py-2 flex justify-between items-center gap-2">
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-[9px] text-gray-600">{sublabel}</p>
        <p className="text-sm font-bold text-white mt-0.5">{value}</p>
      </div>
      {sentiment !== "—" && (
        <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-700/50 whitespace-nowrap flex-shrink-0", SC[sentiment] ?? "text-gray-400")}>
          {sentiment}
        </span>
      )}
    </div>
  );
}

export function SwingPick({ data }: Props) {
  const allScored = useMemo(() => data.map(scoreStock).sort((a, b) => b.totalScore - a.totalScore), [data]);
  const pick = allScored[0];
  const runnerUps = allScored.slice(1, 4);

  if (!pick) return null;

  const { stock, techScore, fundScore, totalScore, techReasons, fundReasons, signalCount, totalSignals, entryStrategy, entryDetail, horizon, target, stopLoss, peSentiment, roeSentiment, epsSentiment, debtSentiment } = pick;
  const rr = ((target - stock.price) / Math.max(stock.price - stopLoss, 0.01)).toFixed(1);
  const techPct = Math.round((techScore / 60) * 100);
  const fundPct = Math.round((fundScore / 40) * 100);
  const isBuyNow = entryStrategy === "Mua ngay";

  return (
    <div className="mb-8 rounded-2xl border border-emerald-800/60 bg-gradient-to-br from-gray-950 via-gray-900 to-emerald-950/20 shadow-2xl shadow-emerald-900/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-800/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Gợi ý Lướt Sóng Ngắn Hạn</h2>
            <p className="text-xs text-gray-500">Kỹ thuật (60đ) · Cơ bản (40đ) · Tín hiệu đồng thuận · Chiến lược vào lệnh</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-700/40 px-3 py-1.5 rounded-full">
          <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs text-emerald-300 font-medium">Điểm: {totalScore}/100</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Col 1: Ticker + Strategy + Signals */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Mã được chọn</p>
            <p className="text-5xl font-black text-emerald-400 tracking-tight">{stock.ticker}</p>
            <p className="text-xs text-gray-500">{stock.sector}</p>
            <p className="text-sm text-gray-400 mt-1">Giá: <span className="text-white font-semibold">{stock.price.toFixed(1)}k</span></p>
          </div>

          {/* Signal count */}
          <div className="bg-gray-800/50 rounded-xl p-3">
            <p className="text-[10px] text-gray-500 uppercase mb-1.5">Tín hiệu đồng thuận</p>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: totalSignals }).map((_, i) => (
                <div key={i} className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                  i < signalCount ? "bg-emerald-500/30 text-emerald-400 ring-1 ring-emerald-500" : "bg-gray-700/50 text-gray-600"
                )}>
                  {i < signalCount ? "✓" : "·"}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              <span className="font-bold text-emerald-300">{signalCount}/{totalSignals}</span> tín hiệu kỹ thuật xác nhận
            </p>
          </div>

          {/* Entry strategy */}
          <div className={clsx("rounded-xl p-3 border", isBuyNow
            ? "bg-emerald-900/20 border-emerald-700/40"
            : "bg-amber-900/10 border-amber-700/30"
          )}>
            <p className="text-[10px] text-gray-500 uppercase mb-1">Chiến lược vào lệnh</p>
            <p className={clsx("text-sm font-bold", isBuyNow ? "text-emerald-300" : "text-amber-300")}>
              {isBuyNow ? "🟢 Mua ngay" : "🟡 Chờ pullback"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{entryDetail}</p>
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-gray-500">Nắm giữ:</span>
            <span className="text-xs font-bold text-amber-300">{horizon}</span>
          </div>
        </div>

        {/* Col 2: Entry / Target / SL */}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Giá tham khảo</p>
          <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-400" /><span className="text-sm text-gray-400">Vào lệnh</span></div>
            <span className="text-sm font-bold text-blue-300">{stock.price.toFixed(1)}k</span>
          </div>
          <div className="flex items-center justify-between bg-emerald-900/30 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2"><Target className="w-4 h-4 text-emerald-400" /><span className="text-sm text-gray-400">Mục tiêu</span></div>
            <span className="text-sm font-bold text-emerald-300">{target}k</span>
          </div>
          <div className="flex items-center justify-between bg-red-900/20 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-400" /><span className="text-sm text-gray-400">Cắt lỗ</span></div>
            <span className="text-sm font-bold text-red-400">{stopLoss}k</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500 px-1 pt-0.5">
            <span>Risk:Reward</span>
            <span className="text-purple-400 font-semibold">1:{rr}</span>
          </div>

          {/* Runner-ups */}
          <div className="mt-2">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Award className="w-3 h-3" /> Ứng viên tiếp theo
            </p>
            {runnerUps.map((r, i) => (
              <div key={r.stock.ticker} className="flex items-center gap-2 py-1.5 border-t border-gray-800/50">
                <span className="text-xs text-gray-600 w-4">{i + 2}.</span>
                <span className="text-xs font-bold text-gray-300 w-10">{r.stock.ticker}</span>
                <div className="flex-1 h-1 rounded-full bg-gray-800">
                  <div className="h-full rounded-full bg-gray-600" style={{ width: `${Math.round((r.totalScore / 100) * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{r.totalScore}đ</span>
                <ChevronRight className="w-3 h-3 text-gray-700" />
              </div>
            ))}
          </div>
        </div>

        {/* Col 3: Kỹ thuật */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Kỹ thuật</p>
            <span className={clsx("text-xs font-bold", techScore >= 45 ? "text-emerald-400" : techScore >= 25 ? "text-amber-400" : "text-red-400")}>
              {techScore}/60
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-800 mb-2">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all" style={{ width: `${techPct}%` }} />
          </div>
          <ul className="flex flex-col gap-1.5">
            {techReasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="mt-0.5 text-emerald-500 flex-shrink-0">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Col 4: Cơ bản */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-xs text-gray-500 uppercase tracking-wider">Cơ bản</p>
            </div>
            <span className={clsx("text-xs font-bold", fundScore >= 28 ? "text-emerald-400" : fundScore >= 15 ? "text-amber-400" : "text-red-400")}>
              {fundScore}/40
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-800 mb-1">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all" style={{ width: `${fundPct}%` }} />
          </div>
          <FundCard label="P/E — Định giá" sublabel="Thị giá / Lợi nhuận" value={stock.pe > 0 ? stock.pe.toFixed(1) + 'x' : '—'} sentiment={peSentiment} />
          <FundCard label="ROE — Sinh lời" sublabel="LN / Vốn chủ sở hữu" value={stock.roe > 0 ? stock.roe.toFixed(1) + '%' : '—'} sentiment={roeSentiment} />
          <FundCard label="EPS — Lãi / Cổ phiếu" sublabel="Lợi nhuận mỗi cổ phiếu" value={stock.eps > 0 ? stock.eps.toFixed(1) + 'k' : '—'} sentiment={epsSentiment} />
          <FundCard label="Debt Ratio — Tỷ lệ nợ" sublabel="Nợ / (Nợ + Vốn CSH)" value={stock.debt_ratio > 0 ? (stock.debt_ratio * 100).toFixed(0) + '%' : '—'} sentiment={debtSentiment} />
          {fundReasons.length > 0 && (
            <ul className="flex flex-col gap-1 mt-1">
              {fundReasons.slice(0, 3).map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                  <span className="mt-0.5 text-blue-500 flex-shrink-0">✓</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-800/50 bg-gray-950/50">
        <p className="text-xs text-gray-600">
          ⚠️ <strong className="text-gray-500">Lưu ý:</strong> Gợi ý định lượng tự động, không phải khuyến nghị đầu tư. Luôn kết hợp phân tích cá nhân và quản lý vốn.
        </p>
      </div>
    </div>
  );
}
