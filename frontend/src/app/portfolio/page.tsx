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

const RISK_CONFIG: Record<string, { color: string, bg: string, icon: string }> = {
  "Thấp":       { color: "text-emerald-400", bg: "bg-black border border-emerald-400/50", icon: "🟢" },
  "Trung bình": { color: "text-amber-400",   bg: "bg-black border border-amber-400/50", icon: "🟡" },
  "Cao":        { color: "text-rose-400",    bg: "bg-black border border-rose-400/50",  icon: "🔴" },
};

function PortfolioBar({ pct, max, color }: { pct: number, max: number, color: string }) {
  const width = max > 0 ? (pct / max) * 100 : 0;
  return (
    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all duration-1000 ease-out ${color}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default function PortfolioOptimizer() {
  const [data, setData] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalCash, setTotalCash] = useState(100000000);

  useEffect(() => {
    fetch("http://localhost:8000/api/portfolio")
      .then((r) => { if (!r.ok) throw new Error("API lỗi " + r.status); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const totalAllocated = data.reduce((sum, item) => sum + item.recommended_pct, 0);
  const cashReserved = 100 - totalAllocated;
  const maxPct = Math.max(...data.map(d => d.recommended_pct), 1);

  const formatMoney = (n: number) =>
    n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : `${(n / 1000).toFixed(0)}K`;

  const getRiskCfg = (level: string) => {
    if (level === "Thấp" || level === "Thap") return RISK_CONFIG["Thấp"];
    if (level === "Trung bình" || level === "Trung binh") return RISK_CONFIG["Trung bình"];
    return RISK_CONFIG["Cao"];
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Đang tính toán phân bổ vốn tối ưu...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center text-rose-400 space-y-2">
        <p className="text-2xl">Không thể tải dữ liệu</p>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Capital Input */}
          <div className="bg-[#1C1C36] border border-white/10 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500 uppercase tracking-widest font-bold">Tổng vốn (VND)</label>
                <input
                  type="number"
                  value={totalCash}
                  onChange={(e) => setTotalCash(Number(e.target.value))}
                  className="mt-2 w-full bg-background border border-white/10 text-white rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  step={10000000}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 sm:min-w-72">
                <div className="text-center bg-background border border-white/10 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-widest">Phân bổ</p>
                  <p className="text-xl font-black text-primary">{totalAllocated.toFixed(1)}%</p>
                </div>
                <div className="text-center bg-background border border-white/10 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-widest">Tiền mặt</p>
                  <p className="text-xl font-black text-white">{cashReserved.toFixed(1)}%</p>
                </div>
                <div className="text-center bg-background border border-white/10 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-widest">Số mã</p>
                  <p className="text-xl font-black text-white">{data.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio List */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Danh Mục Đề Xuất</h2>
            {data.map((item, idx) => {
              const riskCfg = getRiskCfg(item.risk_level);
              const money = Math.round((item.recommended_pct / 100) * totalCash);
              const sharePrice = item.price * 1000;
              const shares = Math.floor(money / sharePrice);

              return (
                <div key={item.ticker} className="bg-[#1C1C36] border border-white/10 rounded-2xl p-5 hover:border-white/30 transition-colors">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="text-gray-600 text-sm font-mono font-bold">#{idx + 1}</span>
                    <span className="text-2xl font-black text-white">{item.ticker}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full border border-white/20 text-gray-300">{item.sector}</span>
                    {riskCfg && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${riskCfg.bg} ${riskCfg.color}`}>
                        {riskCfg.icon} Rủi ro {item.risk_level}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-gray-500">
                      Giá: <span className="text-white font-bold">{item.price.toFixed(1)}K</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Điểm AI (Rank)</p>
                      <p className={`font-black text-lg ${item.score_5 >= 50 ? "text-primary" : "text-amber-400"}`}>
                        {item.score_5}/100
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Biên độ dao động</p>
                      <p className="font-bold text-amber-300">+/-{item.volatility_5d}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Nắm giữ tối đa</p>
                      <p className="font-bold text-white">{item.hold_sessions}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Chiến lược mua</p>
                      <p className="font-bold text-primary text-sm">
                        {item.volatility_5d > 3.5 ? "Chia 2 phần (Canh đỏ)" : "Mua 1 lần (Giá ht)"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 uppercase tracking-wider">Phân bổ đề xuất</span>
                      <div className="text-right">
                        <span className="text-white font-black text-lg">{item.recommended_pct}%</span>
                        <span className="text-gray-400 ml-2 text-xs">~ {formatMoney(money)} VND</span>
                        <span className="text-primary font-bold ml-2 text-xs">
                          {shares > 0 ? `(Mua: ${shares.toLocaleString()} cp)` : ""}
                        </span>
                      </div>
                    </div>
                    <PortfolioBar pct={item.recommended_pct} max={maxPct} color="bg-primary" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Disclaimer */}
          <div className="bg-[#1C1C36] border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              ⚠️ Đây là kết quả tính toán định lượng dựa trên dữ liệu lịch sử và dự báo AI. Không phải lời khuyên đầu tư. Thị trường chứng khoán luôn tiềm ẩn rủi ro.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
