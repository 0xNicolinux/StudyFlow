import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: "StudyFlow",
  description: "Disciplinas, tarefas, anotações e revisões. Seu espaço de estudos, sem ruído.",
  applicationName: "StudyFlow",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" className="dark h-full antialiased">
      <body className="min-h-full">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
