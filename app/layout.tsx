import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SmartBarrio — Presencia digital para comercios locales",
  description: "PMV SmartBarrio: sitios profesionales para comercios locales de Mendoza.",
  manifest: "/manifest.json",
  themeColor: "#009966",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SmartBarrio",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
