import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_PORTAL_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3001",
  ),
  title: "OBIGBO Job Portal",
  description: "Job opportunities for the Igbo diaspora community",
  openGraph: {
    siteName: "OBIGBO Job Portal",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
