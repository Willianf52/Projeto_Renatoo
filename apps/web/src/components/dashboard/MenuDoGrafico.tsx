"use client";

import { useRef, useState } from "react";
import { paraCsv } from "@/lib/csv";
import { useClickOutside } from "./useClickOutside";
import { MenuIcon } from "./icons";

/**
 * O "☰" do canto do grafico, como o menu de exportar da referencia
 * (Highcharts): baixa o grafico como imagem (PNG ou SVG) ou os numeros em
 * planilha (CSV, que o Excel abre -- ver `lib/csv.ts`).
 *
 * Trabalha sobre o `<svg id>` que ja esta na pagina, entao a imagem baixada e
 * exatamente o que se ve. Por isso o grafico desenha tudo em atributos, e nao
 * em classes (ver `GraficoDeColunasEmpilhadas`).
 */
export function MenuDoGrafico({
  idDoGrafico,
  nomeDoArquivo,
  colunas,
  linhas,
}: {
  idDoGrafico: string;
  /** Sem extensao: "eventos-por-site" vira "eventos-por-site.png" etc. */
  nomeDoArquivo: string;
  colunas: string[];
  linhas: string[][];
}) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, aberto, () => setAberto(false));

  function svgComoTexto(): string | null {
    const svg = document.getElementById(idDoGrafico);
    return svg ? new XMLSerializer().serializeToString(svg) : null;
  }

  function baixar(blob: Blob, extensao: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${nomeDoArquivo}.${extensao}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function baixarSvg() {
    const texto = svgComoTexto();
    if (texto) baixar(new Blob([texto], { type: "image/svg+xml;charset=utf-8" }), "svg");
  }

  function baixarPng() {
    const svg = document.getElementById(idDoGrafico) as SVGSVGElement | null;
    const texto = svgComoTexto();
    if (!svg || !texto) return;

    // 2x para a imagem nao sair borrada em tela de alta densidade nem ao
    // colar num documento.
    const escala = 2;
    const largura = svg.width.baseVal.value;
    const altura = svg.height.baseVal.value;
    const imagem = new Image();
    imagem.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = largura * escala;
      canvas.height = altura * escala;
      const contexto = canvas.getContext("2d");
      if (!contexto) return;
      contexto.scale(escala, escala);
      contexto.drawImage(imagem, 0, 0);
      canvas.toBlob((blob) => blob && baixar(blob, "png"), "image/png");
    };
    imagem.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`;
  }

  function baixarCsv() {
    baixar(new Blob([paraCsv(colunas, linhas)], { type: "text/csv;charset=utf-8" }), "csv");
  }

  const opcoes = [
    { rotulo: "Baixar imagem PNG", acao: baixarPng },
    { rotulo: "Baixar imagem SVG", acao: baixarSvg },
    { rotulo: "Baixar planilha (CSV)", acao: baixarCsv },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Menu do gráfico"
        className="rounded-md p-1.5 text-brand-muted transition-colors hover:bg-white/10 hover:text-white"
      >
        <MenuIcon className="h-5 w-5" />
      </button>
      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-slate-800 bg-brand-navy py-1 shadow-lg animate-fade-in"
        >
          {opcoes.map((opcao) => (
            <button
              key={opcao.rotulo}
              type="button"
              role="menuitem"
              onClick={() => {
                opcao.acao();
                setAberto(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10"
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
