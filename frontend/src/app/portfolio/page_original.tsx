"use client";

import { useEffect, useState } from "react";

interface PortfolioItem {
  ticker: string;
  sector: string;
  price: number;
  score_5: number;
  volatility_5d: number;
  kelly_pct: number;
  markowitz_pct: number;
  recommended_pct: number;
  risk_level: string;
  hold_sessions: string;
}

const RISK_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  "Thấp":       { color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30", icon: "🟢" },
  "Thap":       { color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30", icon: "🟢" },
  "Trung bình": { color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/30",    icon: "🟡" },
  "Trung binh": { color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/30",    icon: "🟡" },
  "Cao":        { color: "text-rose-400",     bg: "bg-rose-400/10 border-rose-400/30",      icon: "🔴" },
};

function PortfolioBar({ pct, max, color }: { pct: number; max: number; color: string }) {
  const width = max > 0 ? Math.round((pct / max) * 100) : 0;
  return (
    <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCash, setTotalCash] = useState(100000000);

  useEffect(() => {
    fetch("http://localhost:8000/api/portfolio")
      .then((r) => { if (!r.ok) throw new Error("API loi " + r.status); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const totalAllocated = data.reduce((s, d) => s + d.recommended_pct, 0);
  const cashReserved   = Math.max(0, 100 - totalAllocated);
  const maxPct         = data.length > 0 ? Math.max(...data.map((d) => d.recommended_pct)) : 1;

  const formatMoney = (n: number) =>
    n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : `${(n / 1000).toFixed(0)}K`;

  const getRiskCfg = (level: string) => {
    if (level === "Thấp") return RISK_CONFIG["Thấp"];
    if (level === "Trung bình") return RISK_CONFIG["Trung bình"];
    return RISK_CONFIG["Cao"];
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400">Đang tính toán phân bổ vốn tối ưu...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center text-rose-400 space-y-2">
        <p className="text-2xl">Không thể tải dữ liệu</p>
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-blue-400 font-semibold">Giai đoạn 4 — Quant Portfolio</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white">Tối Ưu Phân Bổ Vốn</h1>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Kết hợp <span className="text-blue-300 font-medium">Kelly Criterion</span> và{" "}
            <span className="text-purple-300 font-medium">Markowitz Risk Parity</span> để tính
            tỷ trọng vốn tối ưu dựa trên dự báo AI và biến động thực tế.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Tổng vốn (VND)</label>
              <input
                type="number"
                value={totalCash}
                onChange={(e) => setTotalCash(Number(e.target.value))}
                className="mt-1 w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                step={10000000}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 sm:min-w-72">
              <div className="text-center bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-xs text-slate-400">Phân bổ</p>
                <p className="text-lg font-bold text-blue-400">{totalAllocated.toFixed(1)}%</p>
              </div>
              <div className="text-center bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <p className="text-xs text-slate-400">Tiền mặt</p>
                <p className="text-lg font-bold text-emerald-400">{cashReserved.toFixed(1)}%</p>
              </div>
              <div className="text-center bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                <p className="text-xs text-slate-400">Số mã</p>
                <p className="text-lg font-bold text-purple-400">{data.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-white">Danh Mục Đề Xuất</h2>
          {data.map((item, idx) => {
            const riskCfg = getRiskCfg(item.risk_level);
            const money = Math.round((item.recommended_pct / 100) * totalCash);
            return (
              <div key={item.ticker} className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 hover:bg-white/8 transition-all">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-slate-500 text-sm font-mono">#{idx + 1}</span>
                  <span className="text-xl font-bold text-white">{item.ticker}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">{item.sector}</span>
                  {riskCfg && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${riskCfg.bg} ${riskCfg.color}`}>
                      {riskCfg.icon} Rủi ro {item.risk_level}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">
                    Giá: <span className="text-white font-medium">{item.price.toFixed(1)}K</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Kỳ vọng lợi nhuận (AI)</p>
                    <p className={`font-bold ${item.score_5 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {item.score_5 >= 0 ? "+" : ""}{item.score_5}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Biên độ dao động</p>
                    <p className="font-bold text-amber-300">+/-{item.volatility_5d}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Nắm giữ tối đa</p>
                    <p className="font-bold text-blue-400">{item.hold_sessions}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Phân bổ đề xuất</span>
                    <div className="text-right">
                      <span className="text-white font-bold text-base">{item.recommended_pct}%</span>
                      <span className="text-slate-400 ml-2">~ {formatMoney(money)} VND</span>
                    </div>
                  </div>
                  <PortfolioBar pct={item.recommended_pct} max={maxPct} color="bg-gradient-to-r from-blue-500 to-purple-500" />
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-amber-300 leading-relaxed">
            Lưu ý: Đây là kết quả tính toán định lượng dựa trên dữ liệu lịch sử và dự báo AI. Không phải lời khuyên đầu tư. Thị trường chứng khoán luôn tiềm ẩn rủi ro.
          </p>
        </div>

          <div className="text-center pb-4">
            <a href="/swing-picks" className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-4">
              Quay lại Swing Picks
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
