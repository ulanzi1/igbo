import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OBIGBO Job Portal",
  description: "Job opportunities for the Igbo diaspora community",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
