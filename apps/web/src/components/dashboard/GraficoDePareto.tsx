import { calcularEscalaY } from "./BarChart";

/**
 * Pareto: colunas de quantidade em ordem decrescente e uma linha com o
 * percentual de cada uma -- o "Ranking das Nao Conformidades" da referencia
 * (Highcharts, licenca comercial; aqui SVG proprio, como `GraficoDeColunas
 * Empilhadas` e `GraficoDePizza`).
 *
 * Tudo em atributos e nada em classe do Tailwind: o menu de exportar
 * serializa este SVG para PNG/SVG, e fora da pagina as classes nao existem.
 *
 * Dois eixos: quantidade a esquerda; percentual a direita, com o teto no
 * proximo multiplo de 6 acima do maior percentual (a referencia mostra
 * 0/6/12/18/24/30 para um maximo de 26,24).
 */

export type ItemDoPareto = { rotulo: string; quantidade: number; percentual: number };

const COR_FUNDO = "#0b0b26"; // --color-brand-surface
const COR_TEXTO = "#e2e8f0";
const COR_SUAVE = "#a0aec0"; // --color-brand-muted
const COR_GRADE = "#1e293b";
const COR_COLUNA = "#7cb5ec";
const COR_LINHA = "#e2e8f0";
const FONTE = "system-ui, -apple-system, 'Segoe UI', sans-serif";

const LARGURA_COLUNA = 26;
const PASSO = 46;
const MARGEM_ESQUERDA = 60;
const MARGEM_DIREITA = 64;
const TOPO_DO_GRAFICO = 84;
const ALTURA_GRAFICO = 240;
const MARGEM_BAIXO = 130;
const LARGURA_MINIMA = 760;
const MAXIMO_DO_ROTULO = 26;

function cortar(texto: string): string {
  return texto.length > MAXIMO_DO_ROTULO ? `${texto.slice(0, MAXIMO_DO_ROTULO - 1)}…` : texto;
}

/** Teto do eixo do percentual: proximo multiplo de 6 acima do maior valor. */
export function tetoDoPercentual(maior: number): number {
  return Math.max(6, Math.ceil(maior / 6) * 6);
}

export function GraficoDePareto({
  id,
  titulo,
  subtitulos,
  itens,
}: {
  /** `id` do `<svg>`, para o menu de exportar encontrar o grafico. */
  id: string;
  titulo: string;
  subtitulos: string[];
  itens: ItemDoPareto[];
}) {
  const { max, passo } = calcularEscalaY(Math.max(0, ...itens.map((item) => item.quantidade)));
  const tetoPercentual = tetoDoPercentual(Math.max(0, ...itens.map((item) => item.percentual)));
  const marcas: number[] = [];
  for (let valor = 0; valor <= max; valor += passo) marcas.push(valor);
  const marcasPercentuais = Array.from({ length: 6 }, (_, i) => (tetoPercentual / 5) * i);

  const largura = Math.max(LARGURA_MINIMA, MARGEM_ESQUERDA + itens.length * PASSO + MARGEM_DIREITA);
  const altura = TOPO_DO_GRAFICO + ALTURA_GRAFICO + MARGEM_BAIXO;
  const baseY = TOPO_DO_GRAFICO + ALTURA_GRAFICO;
  const alturaDe = (valor: number) => (valor / max) * ALTURA_GRAFICO;
  const yDoPercentual = (valor: number) => baseY - (valor / tetoPercentual) * ALTURA_GRAFICO;
  const centroX = (i: number) => MARGEM_ESQUERDA + i * PASSO + PASSO / 2;
  const pontos = itens.map((item, i) => `${centroX(i)},${yDoPercentual(item.percentual)}`).join(" ");

  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      role="img"
      aria-label={`${titulo}. ${subtitulos.join(". ")}`}
      fontFamily={FONTE}
    >
      <rect width={largura} height={altura} fill={COR_FUNDO} />

      <text x={largura / 2} y={26} textAnchor="middle" fill={COR_TEXTO} fontSize={16} fontWeight={600}>
        {titulo}
      </text>
      {subtitulos.map((linha, i) => (
        <text key={i} x={largura / 2} y={44 + i * 14} textAnchor="middle" fill={COR_SUAVE} fontSize={11}>
          {linha}
        </text>
      ))}

      <text
        x={14}
        y={TOPO_DO_GRAFICO + ALTURA_GRAFICO / 2}
        textAnchor="middle"
        fill={COR_SUAVE}
        fontSize={11}
        transform={`rotate(-90 14 ${TOPO_DO_GRAFICO + ALTURA_GRAFICO / 2})`}
      >
        Quantidade
      </text>
      <text
        x={largura - 12}
        y={TOPO_DO_GRAFICO + ALTURA_GRAFICO / 2}
        textAnchor="middle"
        fill={COR_COLUNA}
        fontSize={11}
        transform={`rotate(90 ${largura - 12} ${TOPO_DO_GRAFICO + ALTURA_GRAFICO / 2})`}
      >
        Percentual
      </text>

      {marcas.map((marca) => {
        const y = baseY - alturaDe(marca);
        return (
          <g key={marca}>
            <line x1={MARGEM_ESQUERDA} y1={y} x2={largura - MARGEM_DIREITA} y2={y} stroke={COR_GRADE} strokeWidth={1} />
            <text x={MARGEM_ESQUERDA - 8} y={y} textAnchor="end" dominantBaseline="middle" fill={COR_SUAVE} fontSize={10}>
              {marca}
            </text>
          </g>
        );
      })}
      {marcasPercentuais.map((marca) => (
        <text
          key={marca}
          x={largura - MARGEM_DIREITA + 8}
          y={yDoPercentual(marca)}
          dominantBaseline="middle"
          fill={COR_COLUNA}
          fontSize={10}
        >
          {`${Math.round(marca)}%`}
        </text>
      ))}

      {itens.map((item, i) => (
        <g key={`${item.rotulo}-${i}`}>
          <title>{`${item.rotulo}: ${item.quantidade} (${item.percentual.toFixed(2).replace(".", ",")}%)`}</title>
          <rect
            x={centroX(i) - LARGURA_COLUNA / 2}
            y={baseY - alturaDe(item.quantidade)}
            width={LARGURA_COLUNA}
            height={alturaDe(item.quantidade)}
            fill={COR_COLUNA}
          />
          <text x={centroX(i)} y={baseY - alturaDe(item.quantidade) - 6} textAnchor="middle" fill={COR_TEXTO} fontSize={10}>
            {item.quantidade}
          </text>
          <text
            x={centroX(i)}
            y={baseY + 12}
            textAnchor="end"
            fill="#7dd3fc"
            fontSize={10}
            transform={`rotate(-45 ${centroX(i)} ${baseY + 12})`}
          >
            {cortar(item.rotulo)}
          </text>
        </g>
      ))}

      {itens.length > 1 && <polyline points={pontos} fill="none" stroke={COR_LINHA} strokeWidth={2} strokeLinejoin="round" />}
      {itens.map((item, i) => (
        <circle key={`p-${i}`} cx={centroX(i)} cy={yDoPercentual(item.percentual)} r={3.5} fill={COR_LINHA} />
      ))}

      <line x1={MARGEM_ESQUERDA} y1={baseY} x2={largura - MARGEM_DIREITA} y2={baseY} stroke="#334155" strokeWidth={1} />
    </svg>
  );
}
