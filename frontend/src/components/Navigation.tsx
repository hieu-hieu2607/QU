"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center space-x-4 border-b border-white/30 p-4 bg-black">
      <Link 
        href="/"
        className={clsx(
          "px-4 py-2 rounded-md text-sm font-medium transition-all duration-300",
          pathname === "/" ? "border border-white text-white shadow-[0_0_8px_rgba(255,255,255,0.6)]" : "text-gray-400 hover:text-white hover:border-white/50 border border-transparent"
        )}
      >
        Trang chủ (Screener)
      </Link>
      <Link 
        href="/swing-picks"
        className={clsx(
          "px-4 py-2 rounded-md text-sm font-medium transition-all duration-300",
          pathname === "/swing-picks" ? "border border-white text-white shadow-[0_0_8px_rgba(255,255,255,0.6)]" : "text-gray-400 hover:text-white hover:border-white/50 border border-transparent"
        )}
      >
        🎯 Khuyến nghị lướt sóng
      </Link>
      <Link 
        href="/journal"
        className={clsx(
          "px-4 py-2 rounded-md text-sm font-medium transition-all duration-300",
          pathname === "/journal" ? "border border-white text-white shadow-[0_0_8px_rgba(255,255,255,0.6)]" : "text-gray-400 hover:text-white hover:border-white/50 border border-transparent"
        )}
      >
        📒 Nhật ký Giao dịch
      </Link>
      <Link 
        href="/portfolio"
        className={clsx(
          "px-4 py-2 rounded-md text-sm font-medium transition-all duration-300",
          pathname === "/portfolio" ? "border border-white text-white shadow-[0_0_8px_rgba(255,255,255,0.6)]" : "text-gray-400 hover:text-white hover:border-white/50 border border-transparent"
        )}
      >
        🧮 Tư vấn phân bổ
      </Link>
    </nav>
  );
}
