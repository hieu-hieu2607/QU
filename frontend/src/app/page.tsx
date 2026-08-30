"use client";
import { useState } from "react";
import { ScreenerTable } from "@/components/ScreenerTable";
import { StockData } from "@/types/stock";

export default function Home() {
  const [screenerData, setScreenerData] = useState<StockData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const handleDataLoad = (data: StockData[]) => {
    setScreenerData(data);
    setLastUpdated(new Date());
  };

  return (
    <main className="min-h-screen bg-black">
      <div className="p-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Screener Cổ phiếu VN</h1>
            <p className="text-gray-400">Bộ lọc cổ phiếu định lượng với các chỉ báo kỹ thuật thời gian thực.</p>
          </div>
          {lastUpdated && (
            <div className="text-xs text-gray-400 bg-black px-3 py-1.5 rounded-full border border-white/50">
              Cập nhật lần cuối: <span className="font-semibold text-white">{lastUpdated.toLocaleTimeString('vi-VN')}</span>
            </div>
          )}
        </div>


        <ScreenerTable onDataLoad={handleDataLoad} />
      </div>
    </main>
  );
}
