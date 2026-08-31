"use client";
import { useState, useEffect } from "react";
import { SwingPick } from "@/components/SwingPick";
import { StockData } from "@/types/stock";
import { fetchScreenerData } from "@/services/api";
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, ShieldCheck, Zap, Target, ShieldAlert, Award, ChevronRight, BookOpen } from "lucide-react";
import { clsx } from "clsx";
import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

interface AIPrediction {
  ticker: string; sector: string; price: number;
  score_5: number;
  rank: number; confidence: string; signal: string;
  model_trained_at: string | null;
}

// ─── Tái sử dụng logic điểm kỹ thuật từ SwingPick ───────────────────────────
function calcTechScore(stock: StockData) {
  let techScore = 0; const techReasons: string[] = [];
  if (stock.rsi >= 50 && stock.rsi <= 65) { techScore += 14; techReasons.push(`RSI ${stock.rsi.toFixed(1)}`); }
  else if (stock.rsi >= 40 && stock.rsi < 50) { techScore += 6; techReasons.push(`RSI ${stock.rsi.toFixed(1)} phục hồi`); }
  if (stock.macd_trend === "UP") { techScore += 12; techReasons.push("MACD ↑"); }
  if (stock.trend === "Thuận") { techScore += 14; techReasons.push("Xu hướng Thuận"); }
  if (stock.adx >= 20 && stock.adx <= 45) { techScore += 6; techReasons.push(`ADX ${stock.adx.toFixed(0)}`); }
  if (stock.rs_5d >= 2.0) { techScore += 8; techReasons.push(`RS +${stock.rs_5d.toFixed(1)}%`); }
  else if (stock.rs_5d > 0) { techScore += 4; techReasons.push(`RS +${stock.rs_5d.toFixed(1)}%`); }
  if (stock.vol_ratio >= 1.2 && stock.pct_change_5d > 0) { techScore += 6; techReasons.push(`KL ${stock.vol_ratio.toFixed(1)}x`); }
  if (stock.bbw > 0 && stock.bbw < 8.0) { techReasons.push(`Squeeze BBW ${stock.bbw.toFixed(1)}%`); }
  else if (stock.bollinger_b >= 0.4 && stock.bollinger_b <= 0.75) { techReasons.push(`%B ${stock.bollinger_b.toFixed(2)}`); }

  // Cơ bản
  let fundScore = 0; const fundReasons: string[] = [];
  if (stock.pe > 0 && stock.pe <= 18) { fundScore += 10; fundReasons.push(`P/E ${stock.pe.toFixed(1)}x hợp lý`); }
  if (stock.roe >= 15) { fundScore += 10; fundReasons.push(`ROE ${stock.roe.toFixed(1)}% tốt`); }
  if (stock.eps >= 2) { fundScore += 10; fundReasons.push(`EPS ${stock.eps.toFixed(1)}k cao`); }
  if (stock.debt_ratio > 0 && stock.debt_ratio < 0.5) { fundScore += 10; fundReasons.push(`Nợ ${(stock.debt_ratio*100).toFixed(0)}% an toàn`); }

  let entryStrategy = "Chờ pullback";
  let entryDetail = `Chờ giá về vùng SMA20 (${stock.sma20 > 0 ? stock.sma20.toFixed(1) : '--'}k)`;
  if (stock.trend === "Thuận" && stock.macd_trend === "UP" && stock.vol_ratio >= 1.2) {
    entryStrategy = "Mua ngay";
    entryDetail = "Động lực tốt để vào lệnh";
  } else if (stock.bollinger_b < 0.3) {
    entryStrategy = "Mua ngay";
    entryDetail = "Giá gần đáy Bollinger hỗ trợ";
  }

  let horizon = "3–5 phiên";
  if (stock.atr_pct > 4.0) horizon = "2–3 phiên";
  else if (stock.atr_pct < 2.5) horizon = "5–8 phiên";

  const totalScore = techScore + fundScore;
  return { techScore, fundScore, totalScore, techReasons, fundReasons, entryStrategy, entryDetail, horizon };
}

interface CombinedPick {
  stock: StockData;
  ai: AIPrediction;
  techScore: number;
  fundScore: number;
  aiScore: number;       // 0–50 normalized from score_10
  combinedScore: number; // 0–100
  techReasons: string[];
  fundReasons: string[];
  entryStrategy: string;
  entryDetail: string;
  horizon: string;
  target: number;
  stopLoss: number;
  rr: string;
}

function buildCombinedPicks(screener: StockData[], predictions: AIPrediction[]): CombinedPick[] {
  const aiMap = new Map(predictions.map(p => [p.ticker, p]));

  return screener
    .map(stock => {
      const ai = aiMap.get(stock.ticker);
      if (!ai) return null;

      const { techScore, fundScore, totalScore, techReasons, fundReasons, entryStrategy, entryDetail, horizon } = calcTechScore(stock);

      // AI score_5 là rank percentile 0-100, ta quy đổi ra 0-50 cho điểm kết hợp
      const aiScore = Math.round(ai.score_5 / 2);

      // Combined: Kỹ thuật + Cơ bản (0-100) / 2 + AI (0-50) = 0-100
      const combinedScore = Math.round((techScore + fundScore) * 0.5) + aiScore;

      const atrAbs = (stock.atr_pct / 100) * stock.price;
      const target = +(stock.price + atrAbs * 2).toFixed(1);
      const stopLoss = +(stock.price - atrAbs).toFixed(1);
      const rr = ((target - stock.price) / Math.max(stock.price - stopLoss, 0.01)).toFixed(1);

      return { stock, ai, techScore, fundScore, aiScore, combinedScore, techReasons, fundReasons, entryStrategy, entryDetail, horizon, target, stopLoss, rr };
    })
    .filter((x): x is CombinedPick => x !== null)
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={clsx("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SignalTag({ label, color }: { label: string; color: string }) {
  return (
    <span className={clsx("text-[10px] font-medium px-1.5 py-0.5 rounded-md border", color)}>
      {label}
    </span>
  );
}

function TopPickCard({ pick, rank }: { pick: CombinedPick; rank: number }) {
  const { stock, ai, techScore, fundScore, aiScore, combinedScore, techReasons, fundReasons, entryStrategy, entryDetail, horizon, target, stopLoss, rr } = pick;
  const isBuyNow = entryStrategy === "Mua ngay";
  const bothAgree = techScore >= 30 && ai.signal === "Mua mới";

  return (
    <div className={clsx(
      "rounded-xl border p-4 flex flex-col gap-3 transition-all",
      rank === 1
        ? "border-primary bg-[#1C1C36] shadow-[0_0_12px_rgba(245,255,171,0.15)]"
        : "border-white/10 bg-[#1C1C36] hover:border-white/30"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            {rank === 1 && <span className="text-xs text-amber-400 font-bold">🏆 Top Pick</span>}
            {rank === 2 && <span className="text-xs text-gray-400 font-bold">🥈 #{rank}</span>}
            {rank >= 3 && <span className="text-xs text-gray-500 font-bold">#{rank}</span>}
            {bothAgree && (
              <span className="text-[10px] bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" /> Đồng thuận kép
              </span>
            )}
          </div>
          <p className="text-2xl font-black text-white tracking-tight">{stock.ticker}</p>
          <p className="text-xs text-gray-500">{stock.sector} · {stock.price.toFixed(1)}k</p>
        </div>
        {/* Combined score ring */}
        <div className={clsx(
          "flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 shrink-0",
          combinedScore >= 70 ? "border-white bg-black" :
          combinedScore >= 50 ? "border-white/60 bg-black" :
          "border-white/20 bg-black"
        )}>
          <span className={clsx("text-lg font-black",
            combinedScore >= 70 ? "text-amber-300" :
            combinedScore >= 50 ? "text-emerald-300" : "text-gray-400"
          )}>{combinedScore}</span>
          <span className="text-[8px] text-gray-500 -mt-0.5">/ 100</span>
        </div>
      </div>

      {/* Score bars */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
          <div className="flex-1">
            <MiniBar value={techScore} max={60} color="bg-gradient-to-r from-emerald-700 to-emerald-400" />
          </div>
          <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">KT {techScore}/60</span>
        </div>
        <div className="flex items-center gap-2">
          <BookOpen className="w-3 h-3 text-blue-400 shrink-0" />
          <div className="flex-1">
            <MiniBar value={fundScore} max={40} color="bg-gradient-to-r from-blue-700 to-blue-400" />
          </div>
          <span className="text-[10px] text-blue-400 font-mono w-10 text-right">CB {fundScore}/40</span>
        </div>
        <div className="flex items-center gap-2">
          <Brain className="w-3 h-3 text-purple-400 shrink-0" />
          <div className="flex-1">
            <MiniBar value={aiScore} max={50} color="bg-gradient-to-r from-purple-700 to-purple-400" />
          </div>
          <span className={clsx("text-[10px] font-mono w-10 text-right", ai.score_5 >= 50 ? "text-purple-400" : "text-red-400")}>
            {ai.score_5.toFixed(0)}/100
          </span>
        </div>
      </div>

      {/* Tín hiệu tags */}
      <div className="flex flex-wrap gap-1">
        {techReasons.slice(0, 3).map((r, i) => (
          <SignalTag key={`tech-${i}`} label={r} color="border-emerald-800/50 text-emerald-400 bg-emerald-950/20" />
        ))}
        {fundReasons.slice(0, 2).map((r, i) => (
          <SignalTag key={`fund-${i}`} label={r} color="border-blue-800/50 text-blue-400 bg-blue-950/20" />
        ))}
        {ai.signal === "Mua" && (
          <SignalTag label="AI: Mua ↑" color="border-purple-800/50 text-purple-400 bg-purple-950/20" />
        )}
      </div>

      {/* Target / SL */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="border border-white/20 rounded-lg bg-black py-1.5">
          <p className="text-[9px] text-gray-600 uppercase">Vào</p>
          <p className="text-xs font-bold text-blue-300">{stock.price.toFixed(1)}k</p>
        </div>
        <div className="border border-white/20 bg-black rounded-lg py-1.5">
          <p className="text-[9px] text-gray-600 uppercase">Mục tiêu</p>
          <p className="text-xs font-bold text-emerald-300">{target}k</p>
        </div>
        <div className="border border-white/20 bg-black rounded-lg py-1.5">
          <p className="text-[9px] text-gray-600 uppercase">Cắt lỗ</p>
          <p className="text-xs font-bold text-red-400">{stopLoss}k</p>
        </div>
      </div>

      {/* Chiến lược */}
      <div className={clsx("rounded-lg p-2.5 mt-1 border", 
        isBuyNow ? "bg-black border border-white/50" : "bg-black border border-white/30"
      )}>
        <p className="text-[10px] text-gray-500 uppercase mb-0.5">Chiến lược</p>
        <div className="flex items-center justify-between">
          <p className={clsx("text-xs font-bold", isBuyNow ? "text-emerald-300" : "text-amber-300")}>
            {isBuyNow ? "🟢 Mua ngay" : "🟡 Chờ pullback"}
          </p>
          <span className="text-[10px] font-medium text-gray-400 px-1.5 py-0.5 rounded border border-white/30 bg-black">
            Khuyên giữ: {horizon}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">{entryDetail}</p>
      </div>

      <div className="bg-black py-1.5 border-b border-x border-gray-800 rounded-b-xl border-t-0">
        <p className="text-[10px] text-gray-600 text-center mt-1">
          R:R = 1:{rr} • AI Rank 5p: <span className={ai.score_5 >= 50 ? "text-purple-400" : "text-red-400"}>{ai.score_5.toFixed(0)}/100</span>
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SwingPicksPage() {
  const [screenerData, setScreenerData] = useState<StockData[]>([]);
  const [predictions, setPredictions]   = useState<AIPrediction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  const [activeTab, setActiveTab]       = useState<"combined" | "ai">("combined");

  const loadData = async () => {
    setLoading(true);
    try {
      const [screener, preds] = await Promise.all([
        fetchScreenerData(),
        axios.get<AIPrediction[]>(`${API_BASE_URL}/prediction`).then(r => r.data).catch(() => []),
      ]);
      setScreenerData(screener);
      setPredictions(preds);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const combinedPicks = buildCombinedPicks(screenerData, predictions);
  const top5 = combinedPicks.slice(0, 5);
  const modelTrained = predictions[0]?.model_trained_at;
  const hasAI = predictions.length > 0;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Top bar: update time + refresh */}
        <div className="flex items-center justify-end gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-500 bg-[#1C1C36] px-3 py-1.5 rounded-full border border-white/10">
              Cập nhật: <span className="text-gray-300 font-semibold">{lastUpdated.toLocaleTimeString("vi-VN")}</span>
            </span>
          )}
          <button onClick={loadData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1C1C36] hover:bg-white/10 text-gray-300 text-xs rounded-lg border border-white/10 transition-colors">
            <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} /> Làm mới
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button onClick={() => setActiveTab("combined")}
            className={clsx("px-5 py-2 rounded-full text-sm font-bold transition-all",
              activeTab === "combined" ? "bg-primary text-background" : "border border-white/20 text-gray-400 hover:text-white hover:border-white/50")}>
            🏆 Top Picks (Kỹ thuật + AI)
          </button>
          <button onClick={() => setActiveTab("ai")}
            className={clsx("px-5 py-2 rounded-full text-sm font-bold transition-all",
              activeTab === "ai" ? "bg-primary text-background" : "border border-white/20 text-gray-400 hover:text-white hover:border-white/50")}>
            🤖 Bảng Xếp hạng AI
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500">
            <Brain className="w-10 h-10 animate-pulse text-purple-500 mb-4" />
            <p className="text-sm">Đang chạy phân tích kỹ thuật + mô hình AI...</p>
          </div>
        ) : activeTab === "combined" ? (
          <>
            {/* ── TOP 5 COMBINED ── */}
            {hasAI ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <p className="text-sm font-semibold text-white">Top 5 mã được cả Kỹ thuật & AI cùng đề xuất</p>
                  <span className="text-xs text-gray-500">— Điểm kết hợp cao nhất trên 100</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-8">
                  {top5.map((pick, i) => (
                    <TopPickCard key={pick.stock.ticker} pick={pick} rank={i + 1} />
                  ))}
                </div>
              </>
            ) : (
              <div className="mb-6 p-4 rounded-xl border border-amber-800/30 bg-amber-950/10 text-amber-400 text-sm">
                <Brain className="w-4 h-4 inline mr-2" />
                Model AI chưa được train. Chạy <code className="bg-black/30 px-1 rounded">python train_model.py</code> trong thư mục backend để kích hoạt bảng kết hợp.
              </div>
            )}

            {/* ── FULL SWING ANALYSIS ── */}
            {screenerData.length > 0 && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <p className="text-sm font-semibold text-white">Phân tích chi tiết (Kỹ thuật + Cơ bản)</p>
                </div>
                <SwingPick data={screenerData} />
              </div>
            )}
          </>
        ) : (
          /* ── AI RANKING TABLE ── */
          <>
            {!hasAI ? (
              <div className="text-center py-20 rounded-2xl border border-white/10 bg-[#1C1C36]">
                <Brain className="w-12 h-12 text-primary/40 mx-auto mb-4" />
                <p className="text-white font-semibold mb-2">Model AI chưa được train</p>
                <p className="text-gray-400 text-sm mb-4">Chạy script bên dưới trong thư mục backend:</p>
                <div className="bg-background border border-white/10 rounded-lg px-4 py-3 inline-block text-left text-xs font-mono text-gray-300">
                  <p className="mb-1 text-gray-500">// Copy và chạy TỪNG DÒNG MỘT</p>
                  <p>cd backend</p>
                  <p>.\venv\Scripts\activate</p>
                  <p>python train_model.py</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase tracking-widest bg-[#1C1C36] border-b border-white/10">
                    <tr>
                      <th className="px-5 py-4 w-8">#</th>
                      <th className="px-5 py-4">Mã CK</th>
                      <th className="px-5 py-4">Ngành</th>
                      <th className="px-5 py-4 text-right">Giá</th>
                      <th className="px-5 py-4">AI 5 phiên</th>
                      <th className="px-5 py-4">Tín hiệu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.map((p, idx) => {
                      const barColor = (v: number) => v > 1.5 ? "bg-emerald-500" : v > 0.3 ? "bg-amber-500" : "bg-red-500";
                      const ScoreBar = ({ value }: { value: number }) => {
                        const pct = Math.min(Math.max(((value + 4) / 8) * 100, 0), 100);
                        return (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className={clsx("h-full rounded-full", barColor(value))} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={clsx("text-xs font-mono font-semibold",
                              value > 1.5 ? "text-emerald-400" : value > 0.3 ? "text-amber-400" : "text-red-400"
                            )}>{value > 0 ? "+" : ""}{value.toFixed(2)}%</span>
                          </div>
                        );
                      };
                      const sigCfg = { "Mua mới": "text-emerald-300 bg-emerald-900/40 border-emerald-700/50", "Nắm giữ": "text-amber-300 bg-amber-900/40 border-amber-700/50", "Bán / Tránh": "text-red-300 bg-red-900/40 border-red-700/50" }[p.signal] ?? "text-gray-400";
                      return (
                        <tr key={p.ticker} className="border-b border-white/5 hover:bg-white/5 transition-colors bg-background">
                          <td className="px-5 py-3 text-gray-600 text-xs font-mono">{p.rank}</td>
                          <td className="px-5 py-3"><span className="font-black text-white text-base">{p.ticker}</span></td>
                          <td className="px-5 py-3 text-gray-500 text-xs">{p.sector}</td>
                          <td className="px-5 py-3 text-right text-gray-300 font-mono">{p.price > 0 ? `${p.price.toFixed(1)}k` : "—"}</td>
                          <td className="px-5 py-3"><ScoreBar value={p.score_5} /></td>
                          <td className="px-5 py-3">
                            <span className={clsx("text-xs font-bold px-2.5 py-1 rounded-full border", sigCfg)}>{p.signal}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
