import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { StatusBar } from "@/components/layout/StatusBar";
import { DosGlobalKeyboardListener } from "@/lib/keyboard/DosGlobalKeyboardListener";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Siva Pharmacy ERP",
  description: "Dense, keyboard-first pharmacy ERP system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistMono.variable} antialiased h-screen overflow-hidden flex bg-brand-surface text-brand-text`}
      >
        <DosGlobalKeyboardListener />
        <Sidebar />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-2">
            {children}
          </main>
          <StatusBar />
        </div>
      </body>
    </html>
  );
}
