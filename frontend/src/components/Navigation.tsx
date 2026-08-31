"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

export function Navigation() {
  const pathname = usePathname();

  return (
    <div className="w-full bg-background border-b border-primary/20 pt-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        
        <Link 
          href="/portfolio"
          className={clsx(
            "flex-1 text-center pb-4 text-lg md:text-2xl font-bold transition-all border-b-4",
            pathname === "/portfolio" 
              ? "text-primary border-primary" 
              : "text-gray-500 hover:text-white border-transparent hover:border-white/30"
          )}
        >
          Portfolio
        </Link>
        
        <Link 
          href="/journal"
          className={clsx(
            "flex-1 text-center pb-4 text-lg md:text-2xl font-bold transition-all border-b-4",
            pathname === "/journal" 
              ? "text-primary border-primary" 
              : "text-gray-500 hover:text-white border-transparent hover:border-white/30"
          )}
        >
          Journal
        </Link>

        <Link 
          href="/swing-picks"
          className={clsx(
            "flex-1 text-center pb-4 text-lg md:text-2xl font-bold transition-all border-b-4",
            pathname === "/swing-picks" 
              ? "text-primary border-primary" 
              : "text-gray-500 hover:text-white border-transparent hover:border-white/30"
          )}
        >
          Swing Picks
        </Link>
        
      </div>
    </div>
  );
}
