import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: "StudyFlow",
  description: "Seu ambiente de estudos: disciplinas, anotações, materiais e IA opcional — tudo salvo no seu dispositivo.",
  applicationName: "StudyFlow",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#16171b", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark h-full antialiased">
      <body className="min-h-full">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
