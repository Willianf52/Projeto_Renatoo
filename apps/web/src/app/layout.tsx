import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { SCRIPT_DO_TEMA, TEMA_PADRAO } from "@/lib/tema";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

/** Titulos (h1-h3), como o sistema de referencia passou a usar -- ver globals.css. */
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Up Serviços - Portal Operacional",
  description:
    "Especialistas em terceirização de serviços. As melhores soluções em terceirização, capazes de ajustar com perfeição às suas necessidades, sua cultura e sua gestão.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning` so no <html>: o script abaixo troca o
    // `data-tema` antes do React hidratar, quando a pessoa escolheu o escuro, e
    // a diferenca entre servidor e navegador ali e proposital.
    <html lang="pt-BR" data-tema={TEMA_PADRAO} suppressHydrationWarning>
      <head>
        {/* Antes do primeiro paint: sem isto a pagina pisca no tema padrao e
            so depois troca. Texto fixo deste arquivo, sem nada vindo de
            usuario -- a CSP ja permite script inline (lib/security-headers.ts). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_TEMA }} />
      </head>
      <body className={`${inter.variable} ${outfit.variable} antialiased`}>{children}</body>
    </html>
  );
}
