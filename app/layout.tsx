import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "SmartBarrio — Presencia digital para comercios locales",
  description: "PMV SmartBarrio: sitios profesionales para comercios locales de Mendoza.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SmartBarrio",
  },
};

export const viewport: Viewport = { themeColor: "#009966" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
