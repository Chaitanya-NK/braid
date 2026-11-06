import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Braid", template: "%s · Braid" },
  description: "The multiplayer workspace with a rewind button.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col font-sans">
        {/* Rendered before the page so it's listening before any page code calls toast(). */}
        <Toaster position="bottom-right" richColors closeButton />
        {children}
      </body>
    </html>
  );
}
