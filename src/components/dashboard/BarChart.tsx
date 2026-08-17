/**
 * Grafico de barras vertical simples, para o Ranking de Inspecoes -- mesmo
 * motivo do PieChart em nao usar uma lib de graficos: a referencia usa
 * Highcharts (licenca comercial), e o grafico aqui e simples o bastante para
 * um SVG proprio.
 */

/** Escala "arredondada" do eixo Y: passo 1/2/5/10x conforme a magnitude do
 * maior valor, pra nao terminar com marcas tipo "0, 1.75, 3.5, 5.25, 7". Com
 * valorMaximo=7 devolve passo=2 e max=8 -- exatamente a escala 0/2/4/6/8 da
 * referencia. */
function calcularEscalaY(valorMaximo: number): { max: number; passo: number } {
  if (valorMaximo <= 0) return { max: 4, passo: 1 };
  const passoBase = Math.ceil(valorMaximo / 4);
  const passo = passoBase <= 1 ? 1 : passoBase <= 2 ? 2 : passoBase <= 5 ? 5 : Math.ceil(passoBase / 10) * 10;
  return { max: Math.ceil(valorMaximo / passo) * passo, passo };
}

const LARGURA_BARRA = 40;
const ESPACO_ENTRE_BARRAS = 32;
const ALTURA_GRAFICO = 220;
const MARGEM_ESQUERDA = 32;
const MARGEM_BAIXO = 90;
const MARGEM_TOPO = 20;

export function BarChart({
  itens,
  cor = "#7dd3fc",
  tituloEixoY,
}: {
  itens: { nome: string; valor: number }[];
  cor?: string;
  tituloEixoY?: string;
}) {
  const valorMaximo = Math.max(0, ...itens.map((item) => item.valor));
  const { max, passo } = calcularEscalaY(valorMaximo);
  const marcas: number[] = [];
  for (let valor = 0; valor <= max; valor += passo) marcas.push(valor);

  // +16 de folga a esquerda para o titulo do eixo Y rotacionado, quando tem.
  const margemEsquerdaTotal = MARGEM_ESQUERDA + (tituloEixoY ? 16 : 0);
  const largura =
    margemEsquerdaTotal + ESPACO_ENTRE_BARRAS + itens.length * (LARGURA_BARRA + ESPACO_ENTRE_BARRAS);
  const altura = MARGEM_TOPO + ALTURA_GRAFICO + MARGEM_BAIXO;
  const baseY = MARGEM_TOPO + ALTURA_GRAFICO;

  return (
    <svg width={largura} height={altura} role="img" aria-label="Ranking de Inspeções por funcionário">
      {tituloEixoY && (
        <text
          x={12}
          y={MARGEM_TOPO + ALTURA_GRAFICO / 2}
          textAnchor="middle"
          fill="#8892a6"
          fontSize={10}
          transform={`rotate(-90 12 ${MARGEM_TOPO + ALTURA_GRAFICO / 2})`}
        >
          {tituloEixoY}
        </text>
      )}
      {marcas.map((marca) => {
        const y = baseY - (marca / max) * ALTURA_GRAFICO;
        return (
          <g key={marca}>
            <line x1={margemEsquerdaTotal} y1={y} x2={largura} y2={y} stroke="#1e293b" strokeWidth={1} />
            <text x={margemEsquerdaTotal - 8} y={y} textAnchor="end" dominantBaseline="middle" fill="#8892a6" fontSize={10}>
              {marca}
            </text>
          </g>
        );
      })}

      {itens.map((item, indice) => {
        const x = margemEsquerdaTotal + ESPACO_ENTRE_BARRAS + indice * (LARGURA_BARRA + ESPACO_ENTRE_BARRAS);
        const alturaBarra = (item.valor / max) * ALTURA_GRAFICO;
        const y = baseY - alturaBarra;
        const centroX = x + LARGURA_BARRA / 2;

        return (
          <g key={`${item.nome}-${indice}`} className="animate-fade-in-up" style={{ animationDelay: `${indice * 50}ms` }}>
            <rect x={x} y={y} width={LARGURA_BARRA} height={alturaBarra} rx={3} fill={cor} />
            <text x={centroX} y={y - 6} textAnchor="middle" fill="#ffffff" fontSize={11} fontWeight={600}>
              {item.valor}
            </text>
            <text
              x={centroX}
              y={baseY + 14}
              textAnchor="end"
              fill="#8892a6"
              fontSize={10}
              transform={`rotate(-40 ${centroX} ${baseY + 14})`}
            >
              {item.nome}
            </text>
          </g>
        );
      })}

      <line x1={margemEsquerdaTotal} y1={baseY} x2={largura} y2={baseY} stroke="#334155" strokeWidth={1} />
    </svg>
  );
}
