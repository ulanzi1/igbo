import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import "@/app/globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://obigbo.com"),
  title: "Igbo Community Platform",
  description: "A platform connecting the Igbo community worldwide",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#2D5A27",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
