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
  title: "OBIGBO Job Portal",
  description: "Job opportunities for the Igbo diaspora community",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
