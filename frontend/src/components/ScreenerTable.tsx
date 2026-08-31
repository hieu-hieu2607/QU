"use client";
import { useState, useEffect, useMemo } from "react";
import { StockData } from "@/types/stock";
import { fetchScreenerData } from "@/services/api";
import { clsx } from "clsx";
import { ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";

const SECTOR_ICONS: Record<string, string> = {
  "Ngân hàng":            "🏦",
  "Bất động sản":         "🏠",
  "Tiêu dùng":            "🛒",
  "Công nghệ":            "💻",
  "Thép & Công nghiệp":   "🏭",
  "Năng lượng":           "⛽",
  "Chứng khoán":          "📈",
  "Hàng không & Dịch vụ":"✈️",
  "Khác":                 "🌐",
};

type SortKey = keyof StockData;

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 opacity-20 text-[10px]">↕</span>;
  return dir === "asc"
    ? <ArrowUp className="inline w-3 h-3 ml-1 text-blue-400" />
    : <ArrowDown className="inline w-3 h-3 ml-1 text-blue-400" />;
}

function Th({ label, col, sortConfig, onSort }: {
  label: string; col: SortKey;
  sortConfig: { key: SortKey; direction: "asc" | "desc" } | null;
  onSort: (k: SortKey) => void;
}) {
  const active = sortConfig?.key === col;
  return (
    <th
      className="px-3 py-3 cursor-pointer select-none whitespace-nowrap hover:text-white transition-colors"
      onClick={() => onSort(col)}
    >
      {label}
      <SortIcon active={!!active} dir={sortConfig?.direction ?? "asc"} />
    </th>
  );
}

function StockRow({ row, idx }: { row: StockData; idx: number }) {
  const pct = (v: number | null) => {
  if (v == null) return <span className="text-gray-500">—</span>;
  return (
    <span className={v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-gray-500"}>
      {v > 0 ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
};
  return (
    <tr className={clsx("border-b border-white/20 hover:bg-white/10 transition-colors", idx % 2 === 0 ? "bg-black" : "bg-white/5")}>
      <td className="px-3 py-2.5 font-bold text-white">{row.ticker}</td>
      <td className="px-3 py-2.5 text-blue-400 font-medium{row.price?.toFixed(1) ?? "—"}k</td>
      <td className={clsx("px-3 py-2.5 font-medium", row.rsi > 70 ? "text-red-400" : row.rsi < 30 ? "text-green-400" : "text-gray-300")}>
        {row.rsi.toFixed(1)}
      </td>
      <td className="px-3 py-2.5">
        <span className={clsx("inline-flex items-center gap-0.5", row.macd_trend === "UP" ? "text-green-400" : "text-red-400")}>
          {row.macd.toFixed(2)}{row.macd_trend === "UP" ? "↑" : "↓"}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full",
          row.trend === "Thuận" ? "bg-green-900/40 text-green-400" : "bg-red-900/30 text-red-400"
        )}>
          {row.trend}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={clsx("inline-flex items-center gap-0.5", row.adx_trend === "UP" ? "text-green-400" : "text-red-400")}>
          {row.adx.toFixed(1)}{row.adx_trend === "UP" ? "↑" : "↓"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-gray-300">{row.bollinger_b.toFixed(2)}</td>
      <td className="px-3 py-2.5 text-gray-300">{row.atr_pct.toFixed(1)}%</td>
      <td className={clsx("px-3 py-2.5 font-medium", row.vol_ratio > 1.5 ? "text-yellow-400" : "text-gray-300")}>
        {row.vol_ratio.toFixed(2)}x
      </td>
      <td className="px-3 py-2.5">{pct(row.rs_5d)}</td>
      <td className="px-3 py-2.5">{pct(row.pct_change_5d)}</td>
      <td className="px-3 py-2.5 text-purple-400">1:{row.rr_ratio.toFixed(1)}</td>
      <td className="px-3 py-2.5 text-gray-300">{row.pe > 0 ? row.pe.toFixed(1) : "—"}</td>
      <td className="px-3 py-2.5 text-gray-300">{row.roe > 0 ? row.roe.toFixed(1) + "%" : "—"}</td>
    </tr>
  );
}

export function ScreenerTable({ onDataLoad }: { onDataLoad?: (data: StockData[]) => void }) {
  const [data, setData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null);
  const [collapsedSectors, setCollapsedSectors] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchScreenerData().then((res) => {
      setData(res);
      setLoading(false);
      onDataLoad?.(res);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const toggleSector = (sector: string) => {
    setCollapsedSectors(prev => {
      const next = new Set(prev);
      next.has(sector) ? next.delete(sector) : next.add(sector);
      return next;
    });
  };

  const requestSort = (key: SortKey) => {
    setSortConfig(prev =>
      prev?.key === key && prev.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };

  // Group and sort
  const groupedData = useMemo(() => {
    let items = [...data];
    if (sortConfig) {
      items.sort((a, b) => {
        const av = a[sortConfig.key], bv = b[sortConfig.key];
        if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
        if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    // Group by sector preserving sort order within each sector
    const sectorOrder: string[] = [];
    const groups: Record<string, StockData[]> = {};
    for (const row of items) {
      const s = row.sector || "Khác";
      if (!groups[s]) { groups[s] = []; sectorOrder.push(s); }
      groups[s].push(row);
    }
    return { sectorOrder: Array.from(new Set(sectorOrder)), groups };
  }, [data, sortConfig]);

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="inline-flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm">Đang tải dữ liệu 40 cổ phiếu...</p>
        </div>
      </div>
    );
  }

  const thProps = { sortConfig, onSort: requestSort };
  const COL_SPAN = 14;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/80 bg-black shadow-[0_0_8px_rgba(255,255,255,0.4)]">
      <table className="min-w-full text-sm text-left text-gray-300">
        <thead className="text-xs text-gray-400 uppercase bg-black border-b border-white/50 sticky top-0 z-10">
          <tr>
            <Th label="MÃ"       col="ticker"       {...thProps} />
            <Th label="Giá"      col="price"        {...thProps} />
            <Th label="RSI"      col="rsi"          {...thProps} />
            <Th label="MACD"     col="macd"         {...thProps} />
            <Th label="Xu hướng" col="trend"        {...thProps} />
            <Th label="ADX"      col="adx"          {...thProps} />
            <Th label="%B"       col="bollinger_b"  {...thProps} />
            <Th label="ATR%"     col="atr_pct"      {...thProps} />
            <Th label="KL/TB20"  col="vol_ratio"    {...thProps} />
            <Th label="RS 5p"    col="rs_5d"        {...thProps} />
            <Th label="Δ 5p"     col="pct_change_5d"{...thProps} />
            <Th label="R:R"      col="rr_ratio"     {...thProps} />
            <Th label="P/E"      col="pe"           {...thProps} />
            <Th label="ROE"      col="roe"          {...thProps} />
          </tr>
        </thead>
        <tbody>
          {groupedData.sectorOrder.map((sector) => {
            const rows = groupedData.groups[sector];
            const isCollapsed = collapsedSectors.has(sector);
            const icon = SECTOR_ICONS[sector] ?? "🏢";
            const trendCount = rows.filter(r => r.trend === "Thuận").length;
            return [
              // Sector header row
              <tr
                key={`sector-${sector}`}
                className="bg-black border-y border-white/20 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => toggleSector(sector)}
              >
                <td colSpan={COL_SPAN} className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    {isCollapsed
                      ? <ChevronRight className="w-4 h-4 text-gray-500" />
                      : <ChevronDown className="w-4 h-4 text-gray-500" />
                    }
                    <span className="text-base">{icon}</span>
                    <span className="font-semibold text-white text-sm">{sector}</span>
                    <span className="text-xs text-gray-500">{rows.length} mã</span>
                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">
                        {trendCount} Thuận
                      </span>
                      {rows.length - trendCount > 0 && (
                        <span className="text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded-full">
                          {rows.length - trendCount} Chưa thuận
                        </span>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
                      <span>RSI TB: <span className="text-gray-300">{(rows.reduce((s, r) => s + r.rsi, 0) / rows.length).toFixed(1)}</span></span>
                      <span>Δ5p TB: <span className={clsx(
                        (rows.reduce((s, r) => s + r.pct_change_5d, 0) / rows.length) > 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {((rows.reduce((s, r) => s + r.pct_change_5d, 0) / rows.length) > 0 ? "+" : "")}
                        {(rows.reduce((s, r) => s + r.pct_change_5d, 0) / rows.length).toFixed(1)}%
                      </span></span>
                    </div>
                  </div>
                </td>
              </tr>,
              // Stock rows
              ...(!isCollapsed ? rows.map((row, idx) => (
                <StockRow key={row.ticker} row={row} idx={idx} />
              )) : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
