import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TenderAI BF",
  description: "Système de surveillance des appels d'offres",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
