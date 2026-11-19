import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = localFont({ src: "../assets/fonts/dm-sans.ttf", variable: "--font-dm-sans", display: "swap", weight: "100 1000" });
const fraunces = localFont({ src: "../assets/fonts/fraunces.ttf", variable: "--font-fraunces", display: "swap", weight: "100 900" });

export const metadata: Metadata = {
  title: "Salud Bistro — Demo",
  description: "Salud Bistro demo restaurant · Powered by Vision Forge Studio · Local Development",
  icons: { icon: "/branding/salud-bistro-logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="h-full bg-background text-foreground">
        <AppShell>{children}</AppShell>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
