import { calcularEscalaY } from "./BarChart";

/**
 * Um valor por dia do mes, em barras ou em linha -- o "Tipo de Gráfico" do
 * Mapa de Eventos. SVG proprio pelo mesmo motivo do `BarChart` (a referencia
 * usa Highcharts, de licenca comercial), mas componente separado: o
 * `BarChart` e desenhado para poucas barras largas com rotulo inclinado, e 31
 * dias nele dariam um grafico de 2.300px de largura.
 *
 * Reaproveita a escala do eixo Y do `BarChart`, para os dois graficos do
 * painel terminarem nas mesmas marcas redondas.
 */

export type TipoDeGrafico = "barras" | "linhas";

const LARGURA_DIA = 28;
const ALTURA_GRAFICO = 200;
const MARGEM_ESQUERDA = 40;
const MARGEM_DIREITA = 12;
const MARGEM_TOPO = 20;
const MARGEM_BAIXO = 28;
const COR = "#7dd3fc";

export function GraficoPorDia({
  valores,
  tipo,
  rotulo,
}: {
  /** Indice 0 = dia 1. */
  valores: number[];
  tipo: TipoDeGrafico;
  /** Nome acessivel do grafico. */
  rotulo: string;
}) {
  const { max, passo } = calcularEscalaY(Math.max(0, ...valores));
  const marcas: number[] = [];
  for (let valor = 0; valor <= max; valor += passo) marcas.push(valor);

  const largura = MARGEM_ESQUERDA + valores.length * LARGURA_DIA + MARGEM_DIREITA;
  const altura = MARGEM_TOPO + ALTURA_GRAFICO + MARGEM_BAIXO;
  const baseY = MARGEM_TOPO + ALTURA_GRAFICO;
  const centroX = (indice: number) => MARGEM_ESQUERDA + indice * LARGURA_DIA + LARGURA_DIA / 2;
  const alturaDe = (valor: number) => (valor / max) * ALTURA_GRAFICO;

  const pontos = valores.map((valor, indice) => `${centroX(indice)},${baseY - alturaDe(valor)}`).join(" ");

  return (
    <svg width={largura} height={altura} role="img" aria-label={rotulo} className="animate-fade-in">
      {marcas.map((marca) => {
        const y = baseY - alturaDe(marca);
        return (
          <g key={marca}>
            <line x1={MARGEM_ESQUERDA} y1={y} x2={largura - MARGEM_DIREITA} y2={y} stroke="#1e293b" strokeWidth={1} />
            <text x={MARGEM_ESQUERDA - 8} y={y} textAnchor="end" dominantBaseline="middle" fill="#8892a6" fontSize={10}>
              {marca}
            </text>
          </g>
        );
      })}

      {tipo === "barras"
        ? valores.map((valor, indice) => (
            <rect
              key={indice}
              x={centroX(indice) - LARGURA_DIA * 0.3}
              y={baseY - alturaDe(valor)}
              width={LARGURA_DIA * 0.6}
              height={alturaDe(valor)}
              rx={2}
              fill={COR}
            >
              <title>{`Dia ${indice + 1}: ${valor}`}</title>
            </rect>
          ))
        : (
          <>
            <polyline points={pontos} fill="none" stroke={COR} strokeWidth={2} strokeLinejoin="round" />
            {valores.map((valor, indice) => (
              <circle key={indice} cx={centroX(indice)} cy={baseY - alturaDe(valor)} r={3} fill={COR}>
                <title>{`Dia ${indice + 1}: ${valor}`}</title>
              </circle>
            ))}
          </>
        )}

      {valores.map((_, indice) => (
        <text key={indice} x={centroX(indice)} y={baseY + 16} textAnchor="middle" fill="#8892a6" fontSize={10}>
          {indice + 1}
        </text>
      ))}

      <line x1={MARGEM_ESQUERDA} y1={baseY} x2={largura - MARGEM_DIREITA} y2={baseY} stroke="#334155" strokeWidth={1} />
    </svg>
  );
}
