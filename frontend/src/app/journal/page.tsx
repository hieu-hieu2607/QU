"use client";
import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, Trophy, Target, BarChart3, X } from "lucide-react";
import { clsx } from "clsx";

interface Trade {
  id: string;
  ticker: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  buyDate: string;
  sellDate: string;
  note: string;
  status: "closed" | "open";
}

const STORAGE_KEY = "vn_swing_journal";

function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function saveTrades(trades: Trade[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

function calcPnL(t: Trade) {
  const pnl = (t.sellPrice - t.buyPrice) * t.quantity;
  const pct = ((t.sellPrice - t.buyPrice) / t.buyPrice) * 100;
  return { pnl, pct };
}

// ─── StatCard ───
function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className={clsx("rounded-xl border p-4 bg-black", color)}>
      <div className="flex items-center gap-2 mb-2">{icon}<p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p></div>
      <p className="text-xl font-black text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Field: defined OUTSIDE modals to prevent re-mount on every keystroke ───
function Field({ label, value, onChange, type = "text", placeholder = "", error }: {
  label: string; value: string;
  onChange: (v: string) => void;
  type?: string; placeholder?: string; error?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
      />
      {error && <p className="text-red-400 text-xs mt-0.5">{error}</p>}
    </div>
  );
}

// ─── AddTradeModal ───
function AddTradeModal({ onAdd, onClose }: { onAdd: (t: Trade) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    ticker: "", buyPrice: "", sellPrice: "", quantity: "",
    buyDate: new Date().toISOString().split("T")[0],
    sellDate: new Date().toISOString().split("T")[0],
    note: "", status: "closed" as "closed" | "open",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.ticker.trim()) e.ticker = "Nhập mã cổ phiếu";
    if (!form.buyPrice || +form.buyPrice <= 0) e.buyPrice = "Giá hợp lệ";
    if (form.status === "closed" && (!form.sellPrice || +form.sellPrice <= 0)) e.sellPrice = "Giá hợp lệ";
    if (!form.quantity || +form.quantity <= 0) e.quantity = "Số lượng hợp lệ";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onAdd({
      id: Date.now().toString(),
      ticker: form.ticker.toUpperCase().trim(),
      buyPrice: +form.buyPrice,
      sellPrice: form.status === "closed" ? +form.sellPrice : 0,
      quantity: +form.quantity,
      buyDate: form.buyDate,
      sellDate: form.sellDate,
      note: form.note,
      status: form.status,
    });
    onClose();
  };

  const preview = form.status === "closed" && form.buyPrice && form.sellPrice && form.quantity
    ? { pnl: (+form.sellPrice - +form.buyPrice) * +form.quantity, pct: (+form.sellPrice - +form.buyPrice) / +form.buyPrice * 100 }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Thêm lệnh mới</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Status toggle */}
          <div className="flex gap-2 mb-1">
            {(["closed", "open"] as const).map(s => (
              <button key={s} type="button" onClick={() => set("status", s)}
                className={clsx("flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  form.status === s
                    ? s === "closed" ? "bg-purple-600 text-white" : "bg-amber-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                )}
              >
                {s === "closed" ? "✅ Đã đóng lệnh" : "🟡 Đang giữ"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Mã CK *" value={form.ticker} onChange={v => set("ticker", v)} placeholder="VD: HDB" error={errors.ticker} />
            <Field label="Số lượng (CP) *" value={form.quantity} onChange={v => set("quantity", v)} type="number" placeholder="VD: 1000" error={errors.quantity} />
            <Field label="Giá mua (k) *" value={form.buyPrice} onChange={v => set("buyPrice", v)} type="number" placeholder="VD: 26.5" error={errors.buyPrice} />
            {form.status === "closed"
              ? <Field label="Giá bán (k) *" value={form.sellPrice} onChange={v => set("sellPrice", v)} type="number" placeholder="VD: 28.0" error={errors.sellPrice} />
              : <div className="flex items-end"><p className="text-xs text-amber-400 pb-2">Giá bán cập nhật sau khi đóng lệnh</p></div>
            }
            <Field label="Ngày mua" value={form.buyDate} onChange={v => set("buyDate", v)} type="date" />
            {form.status === "closed" && <Field label="Ngày bán" value={form.sellDate} onChange={v => set("sellDate", v)} type="date" />}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ghi chú</label>
            <textarea value={form.note} onChange={e => set("note", e.target.value)} rows={2}
              placeholder="VD: Mua theo tín hiệu MACD crossover, RSI 55..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none resize-none"
            />
          </div>

          {/* Live P&L preview */}
          {preview && (
            <div className={clsx("rounded-lg px-4 py-2.5 text-sm font-semibold text-center",
              preview.pnl >= 0 ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"
            )}>
              {preview.pnl >= 0 ? "📈 Lãi" : "📉 Lỗ"}{" "}
              {Math.abs(preview.pnl).toFixed(1)}k ({preview.pct.toFixed(2)}%)
            </div>
          )}

          <button type="submit" className="mt-1 w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors text-sm">
            Lưu lệnh
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── CloseTradeModal ───
function CloseTradeModal({ trade, onClose, onSave }: { trade: Trade; onClose: () => void; onSave: (t: Trade) => void }) {
  const [sellPrice, setSellPrice] = useState("");
  const [sellDate, setSellDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSave = () => {
    if (!sellPrice || +sellPrice <= 0) return;
    onSave({ ...trade, sellPrice: +sellPrice, sellDate, status: "closed" });
    onClose();
  };

  const preview = sellPrice && +sellPrice > 0
    ? { pnl: (+sellPrice - trade.buyPrice) * trade.quantity, pct: (+sellPrice - trade.buyPrice) / trade.buyPrice * 100 }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Đóng lệnh {trade.ticker}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Giá mua: <span className="text-white">{trade.buyPrice}k</span> · SL: <span className="text-white">{trade.quantity.toLocaleString()} CP</span>
        </p>
        <div className="flex flex-col gap-3">
          <Field label="Giá bán (k)" value={sellPrice} onChange={setSellPrice} type="number" placeholder="VD: 28.5" />
          <Field label="Ngày bán" value={sellDate} onChange={setSellDate} type="date" />
          {preview && (
            <div className={clsx("rounded-lg px-4 py-2 text-sm font-semibold text-center",
              preview.pnl >= 0 ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"
            )}>
              {preview.pnl >= 0 ? "📈 Lãi" : "📉 Lỗ"} {Math.abs(preview.pnl).toFixed(1)}k ({preview.pct.toFixed(2)}%)
            </div>
          )}
          <button onClick={handleSave} className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg text-sm transition-colors">
            Xác nhận đóng lệnh
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [predictions, setPredictions] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);
  const [filter, setFilter] = useState<"all" | "closed" | "open">("all");

  useEffect(() => { 
    setTrades(loadTrades()); 
    fetch("http://localhost:8000/api/prediction")
      .then(r => r.json())
      .then((data: any[]) => {
        const map: Record<string, string> = {};
        data.forEach(d => { map[d.ticker] = d.signal; });
        setPredictions(map);
      })
      .catch(console.error);
  }, []);

  const update = (next: Trade[]) => { setTrades(next); saveTrades(next); };
  const addTrade = (t: Trade) => update([t, ...trades]);
  const deleteTrade = (id: string) => { if (confirm("Xóa lệnh này?")) update(trades.filter(t => t.id !== id)); };
  const closeTrade = (t: Trade) => update(trades.map(x => x.id === t.id ? t : x));

  const closed = useMemo(() => trades.filter(t => t.status === "closed"), [trades]);
  const open = useMemo(() => trades.filter(t => t.status === "open"), [trades]);
  const totalPnL = useMemo(() => closed.reduce((s, t) => s + calcPnL(t).pnl, 0), [closed]);
  const wins = useMemo(() => closed.filter(t => calcPnL(t).pnl > 0), [closed]);
  const losses = useMemo(() => closed.filter(t => calcPnL(t).pnl <= 0), [closed]);
  const best = useMemo(() => [...wins].sort((a, b) => calcPnL(b).pnl - calcPnL(a).pnl)[0], [wins]);
  const worst = useMemo(() => [...losses].sort((a, b) => calcPnL(a).pnl - calcPnL(b).pnl)[0], [losses]);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

  const filteredTrades = filter === "all" ? trades : filter === "closed" ? closed : open;

  return (
    <main className="min-h-screen bg-black">
      <div className="p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">📒 Nhật ký Giao dịch</h1>
            <p className="text-gray-400 text-sm">Ghi lại và theo dõi kết quả các lần lướt sóng của bạn.</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-black border border-white text-white text-sm font-semibold rounded-xl transition-colors shadow-[0_0_8px_rgba(255,255,255,0.5)] hover:bg-white hover:text-black">
            <Plus className="w-4 h-4" /> Thêm lệnh
          </button>
        </div>

        {/* Stats */}
        {closed.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={totalPnL >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
              label="Tổng Lãi / Lỗ" value={`${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(1)}k`}
              sub={`${closed.length} lệnh đã đóng`} color={totalPnL >= 0 ? "border-white/50" : "border-white/50"}
            />
            <StatCard
              icon={<Target className="w-4 h-4 text-blue-400" />}
              label="Tỷ lệ Thắng" value={`${winRate.toFixed(0)}%`}
              sub={`${wins.length} thắng / ${losses.length} thua`} color="border-white/50"
            />
            <StatCard
              icon={<Trophy className="w-4 h-4 text-yellow-400" />}
              label="Lệnh tốt nhất" value={best ? `+${calcPnL(best).pnl.toFixed(1)}k` : "—"}
              sub={best ? `${best.ticker} (${calcPnL(best).pct.toFixed(1)}%)` : "Chưa có"} color="border-white/50"
            />
            <StatCard
              icon={<BarChart3 className="w-4 h-4 text-gray-400" />}
              label="Lệnh tệ nhất" value={worst ? `${calcPnL(worst).pnl.toFixed(1)}k` : "—"}
              sub={worst ? `${worst.ticker} (${calcPnL(worst).pct.toFixed(1)}%)` : "Chưa có"} color="border-white/50"
            />
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(["all", "closed", "open"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300",
                filter === f ? "border border-white text-white shadow-[0_0_8px_rgba(255,255,255,0.6)] bg-black" : "border border-white/20 text-gray-400 hover:text-white bg-black hover:border-white/50"
              )}
            >
              {f === "all" ? `Tất cả (${trades.length})` : f === "closed" ? `Đã đóng (${closed.length})` : `Đang giữ (${open.length})`}
            </button>
          ))}
        </div>

        {/* Table */}
        {filteredTrades.length === 0 ? (
          <div className="text-center py-20 rounded-xl border border-white/50 bg-black">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-400 text-sm">Chưa có lệnh nào. Ấn <strong className="text-white">+ Thêm lệnh</strong> để bắt đầu!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/80 bg-black shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            <table className="min-w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-black border-b border-white/50">
                <tr>
                  <th className="px-4 py-3">Mã CK</th>
                  <th className="px-4 py-3">Ngày mua</th>
                  <th className="px-4 py-3">Ngày bán</th>
                  <th className="px-4 py-3 text-right">Giá mua</th>
                  <th className="px-4 py-3 text-right">Giá bán</th>
                  <th className="px-4 py-3 text-right">Số lượng</th>
                  <th className="px-4 py-3 text-right">Lãi / Lỗ (k)</th>
                  <th className="px-4 py-3 text-right">%</th>
                  <th className="px-4 py-3">Ghi chú</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((t, idx) => {
                  const { pnl, pct } = t.status === "closed" ? calcPnL(t) : { pnl: 0, pct: 0 };
                  const isWin = pnl > 0;
                  return (
                    <tr key={t.id} className={clsx("border-b border-white/20 hover:bg-white/10 transition-colors bg-black")}>
                      <td className="px-4 py-3">
                        <span className="font-bold text-white">{t.ticker}</span>
                        {t.status === "open" && predictions[t.ticker] === "Bán / Tránh" && <span className="ml-2 text-[10px] bg-red-900/60 text-red-400 px-1.5 py-0.5 rounded-md font-bold border border-red-700/50">AI: BÁN</span>}
                        {t.status === "open" && predictions[t.ticker] === "Nắm giữ" && <span className="ml-2 text-[10px] bg-amber-900/60 text-amber-400 px-1.5 py-0.5 rounded-md font-bold border border-amber-700/50">AI: GIỮ</span>}
                        {t.status === "open" && predictions[t.ticker] === "Mua mới" && <span className="ml-2 text-[10px] bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded-md font-bold border border-green-700/50">AI: MUA THÊM</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{t.buyDate}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {t.status === "closed" ? t.sellDate : (
                          <button onClick={() => setClosingTrade(t)} className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
                            Đóng lệnh
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{t.buyPrice}k</td>
                      <td className="px-4 py-3 text-right text-gray-300">{t.status === "closed" ? `${t.sellPrice}k` : "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{t.quantity.toLocaleString()}</td>
                      <td className={clsx("px-4 py-3 text-right font-bold", t.status !== "closed" ? "text-gray-500" : isWin ? "text-green-400" : "text-red-400")}>
                        {t.status !== "closed" ? "—" : `${isWin ? "+" : ""}${pnl.toFixed(1)}`}
                      </td>
                      <td className={clsx("px-4 py-3 text-right font-medium", t.status !== "closed" ? "text-gray-500" : isWin ? "text-green-400" : "text-red-400")}>
                        {t.status !== "closed" ? "—" : `${isWin ? "+" : ""}${pct.toFixed(2)}%`}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{t.note || "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteTrade(t.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddTradeModal onAdd={addTrade} onClose={() => setShowAdd(false)} />}
      {closingTrade && <CloseTradeModal trade={closingTrade} onClose={() => setClosingTrade(null)} onSave={closeTrade} />}
    </main>
  );
}
