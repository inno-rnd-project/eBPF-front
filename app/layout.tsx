import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/nav/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "eBPF GPU Observability",
  description: "eBPF 기반 GPU 통합 Observability — 클러스터 토폴로지, 네트워크 지연·패킷 Drop 관측",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-zinc-950">{children}</main>
      </body>
    </html>
  );
}
