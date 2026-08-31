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
function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1C1C36] p-4">
      <div className="flex items-center gap-2 mb-3">{icon}<p className="text-xs text-gray-500 uppercase tracking-widest font-bold">{label}</p></div>
      <p className="text-2xl font-black text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
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
        className="w-full bg-[#1C1C36] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-primary focus:outline-none"
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
      <div className="bg-[#17172B] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Thêm lệnh mới</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-2 mb-1">
            {(["closed", "open"] as const).map(s => (
              <button key={s} type="button" onClick={() => set("status", s)}
                className={clsx("flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  form.status === s
                    ? "bg-primary text-background font-bold"
                    : "bg-[#1C1C36] text-gray-400 hover:text-white border border-white/10"
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
              className="w-full bg-[#1C1C36] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-primary focus:outline-none resize-none"
            />
          </div>

          {preview && (
            <div className={clsx("rounded-lg px-4 py-2.5 text-sm font-semibold text-center border",
              preview.pnl >= 0 ? "bg-emerald-900/30 text-emerald-400 border-emerald-700/30" : "bg-red-900/30 text-red-400 border-red-700/30"
            )}>
              {preview.pnl >= 0 ? "📈 Lãi" : "📉 Lỗ"}{" "}
              {Math.abs(preview.pnl).toFixed(1)}k ({preview.pct.toFixed(2)}%)
            </div>
          )}

          <button type="submit" className="mt-1 w-full py-2.5 bg-primary text-background font-bold rounded-lg transition-colors text-sm hover:bg-white">
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
      <div className="bg-[#17172B] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
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
            <div className={clsx("rounded-lg px-4 py-2 text-sm font-semibold text-center border",
              preview.pnl >= 0 ? "bg-emerald-900/30 text-emerald-400 border-emerald-700/30" : "bg-red-900/30 text-red-400 border-red-700/30"
            )}>
              {preview.pnl >= 0 ? "📈 Lãi" : "📉 Lỗ"} {Math.abs(preview.pnl).toFixed(1)}k ({preview.pct.toFixed(2)}%)
            </div>
          )}
          <button onClick={handleSave} className="w-full py-2.5 bg-primary text-background font-bold rounded-lg text-sm transition-colors hover:bg-white">
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="p-6 md:p-8 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <p className="text-gray-400 text-sm">Ghi lại và theo dõi kết quả các lần lướt sóng của bạn.</p>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-background text-sm font-bold rounded-xl transition-colors hover:bg-white">
            <Plus className="w-4 h-4" /> Thêm lệnh
          </button>
        </div>

        {/* Stats Cards */}
        {closed.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={totalPnL >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
              label="Tổng Lãi / Lỗ"
              value={`${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(1)}k`}
              sub={`${closed.length} lệnh đã đóng`}
            />
            <StatCard
              icon={<Target className="w-4 h-4 text-primary" />}
              label="Tỷ lệ Thắng"
              value={`${winRate.toFixed(0)}%`}
              sub={`${wins.length} thắng / ${losses.length} thua`}
            />
            <StatCard
              icon={<Trophy className="w-4 h-4 text-primary" />}
              label="Lệnh tốt nhất"
              value={best ? `+${calcPnL(best).pnl.toFixed(1)}k` : "—"}
              sub={best ? `${best.ticker} (${calcPnL(best).pct.toFixed(1)}%)` : "Chưa có"}
            />
            <StatCard
              icon={<BarChart3 className="w-4 h-4 text-gray-400" />}
              label="Lệnh tệ nhất"
              value={worst ? `${calcPnL(worst).pnl.toFixed(1)}k` : "—"}
              sub={worst ? `${worst.ticker} (${calcPnL(worst).pct.toFixed(1)}%)` : "Chưa có"}
            />
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(["all", "closed", "open"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx("px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                filter === f
                  ? "bg-primary text-background"
                  : "border border-white/20 text-gray-400 hover:text-white hover:border-white/50"
              )}
            >
              {f === "all" ? `Tất cả (${trades.length})` : f === "closed" ? `Đã đóng (${closed.length})` : `Đang giữ (${open.length})`}
            </button>
          ))}
        </div>

        {/* Table */}
        {filteredTrades.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-white/10 bg-[#1C1C36]">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-400 text-sm">Chưa có lệnh nào. Ấn <strong className="text-primary">+ Thêm lệnh</strong> để bắt đầu!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase tracking-widest bg-[#1C1C36] border-b border-white/10">
                <tr>
                  <th className="px-5 py-4">Mã CK</th>
                  <th className="px-5 py-4">Ngày mua</th>
                  <th className="px-5 py-4">Ngày bán</th>
                  <th className="px-5 py-4 text-right">Giá mua</th>
                  <th className="px-5 py-4 text-right">Giá bán</th>
                  <th className="px-5 py-4 text-right">Số lượng</th>
                  <th className="px-5 py-4 text-right">Lãi / Lỗ (K)</th>
                  <th className="px-5 py-4 text-right">%</th>
                  <th className="px-5 py-4">Ghi chú</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((t) => {
                  const { pnl, pct } = t.status === "closed" ? calcPnL(t) : { pnl: 0, pct: 0 };
                  const isWin = pnl > 0;
                  return (
                    <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors bg-background">
                      <td className="px-5 py-4">
                        <span className="font-black text-white text-base">{t.ticker}</span>
                        {t.status === "open" && predictions[t.ticker] === "Bán / Tránh" && <span className="ml-2 text-[10px] bg-red-900/60 text-red-400 px-1.5 py-0.5 rounded-md font-bold border border-red-700/50">AI: BÁN</span>}
                        {t.status === "open" && predictions[t.ticker] === "Nắm giữ" && <span className="ml-2 text-[10px] bg-amber-900/60 text-amber-400 px-1.5 py-0.5 rounded-md font-bold border border-amber-700/50">AI: GIỮ</span>}
                        {t.status === "open" && predictions[t.ticker] === "Mua mới" && <span className="ml-2 text-[10px] bg-emerald-900/60 text-emerald-400 px-1.5 py-0.5 rounded-md font-bold border border-emerald-700/50">AI: MUA THÊM</span>}
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs">{t.buyDate}</td>
                      <td className="px-5 py-4 text-gray-400 text-xs">
                        {t.status === "closed" ? t.sellDate : (
                          <button onClick={() => setClosingTrade(t)} className="text-xs text-primary hover:text-white underline underline-offset-2">
                            Đóng lệnh
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-300">{t.buyPrice}k</td>
                      <td className="px-5 py-4 text-right text-gray-300">{t.status === "closed" ? `${t.sellPrice}k` : "—"}</td>
                      <td className="px-5 py-4 text-right text-gray-300">{t.quantity.toLocaleString()}</td>
                      <td className={clsx("px-5 py-4 text-right font-bold", t.status !== "closed" ? "text-gray-600" : isWin ? "text-emerald-400" : "text-red-400")}>
                        {t.status !== "closed" ? "—" : `${isWin ? "+" : ""}${pnl.toFixed(1)}`}
                      </td>
                      <td className={clsx("px-5 py-4 text-right font-medium", t.status !== "closed" ? "text-gray-600" : isWin ? "text-emerald-400" : "text-red-400")}>
                        {t.status !== "closed" ? "—" : `${isWin ? "+" : ""}${pct.toFixed(2)}%`}
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs max-w-[200px] truncate">{t.note || "—"}</td>
                      <td className="px-5 py-4">
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
