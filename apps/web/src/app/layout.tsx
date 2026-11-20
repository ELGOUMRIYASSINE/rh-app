import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "YGHR", template: "%s · YGHR" },
  description: "Vos équipes, leur temps et leur paie, au même endroit.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
  applicationName: "YGHR",
};
export const viewport: Viewport = { themeColor: "#F7F8F7", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("yghr-theme")?.value;
  const themeClass = theme === "dark" ? "dark" : theme === "light" ? "light" : "";
  return (
    <html lang="fr" className={`${geist.variable} ${mono.variable} ${themeClass}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
