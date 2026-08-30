import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quant App",
  description: "Vietnam Stock Quantitative Analysis",
};

import { Navigation } from "@/components/Navigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black">
        <Navigation />
        {children}
      </body>
    </html>
  );
}
