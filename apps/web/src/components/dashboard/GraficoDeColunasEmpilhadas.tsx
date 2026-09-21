import { calcularEscalaY } from "./BarChart";

/**
 * Colunas empilhadas com legenda, titulo e eixos DENTRO do SVG -- o "Eventos
 * por Site" da referencia (Highcharts, licenca comercial; aqui SVG proprio
 * como o `BarChart` e o `GraficoPorDia`).
 *
 * Tudo em atributos (`fill`, `fontSize`...) e nada em classe do Tailwind: o
 * menu de exportar serializa este SVG para PNG/SVG, e fora da pagina as
 * classes nao existem. Pelo mesmo motivo o fundo e um `<rect>` com a cor da
 * superficie do painel, e nao o fundo herdado.
 */

export type SerieEmpilhada = { nome: string; cor: string; valores: number[] };
export type Categoria = { rotulo: string; /** Texto completo no tooltip. */ dica: string };

const COR_FUNDO = "#0b0b26"; // --color-brand-surface
const COR_TEXTO = "#e2e8f0";
const COR_SUAVE = "#a0aec0"; // --color-brand-muted
const COR_GRADE = "#1e293b";
const FONTE = "system-ui, -apple-system, 'Segoe UI', sans-serif";

const LARGURA_COLUNA = 24;
const PASSO = 42;
const MARGEM_ESQUERDA = 56;
const MARGEM_DIREITA = 24;
const TOPO_DO_GRAFICO = 96;
const ALTURA_GRAFICO = 220;
const MARGEM_BAIXO = 120;
const LARGURA_MINIMA = 760;
/** Rotulo do eixo X cortado com "...", como a referencia faz com
 * "SICREDI - ITAQUAQUECE..." -- o nome inteiro fica no tooltip. */
const MAXIMO_DO_ROTULO = 24;

function cortar(texto: string): string {
  return texto.length > MAXIMO_DO_ROTULO ? `${texto.slice(0, MAXIMO_DO_ROTULO - 1)}…` : texto;
}

export function GraficoDeColunasEmpilhadas({
  id,
  titulo,
  subtitulos,
  categorias,
  series,
  tituloEixoY,
}: {
  /** `id` do `<svg>`, para o menu de exportar encontrar o grafico. */
  id: string;
  titulo: string;
  subtitulos: string[];
  categorias: Categoria[];
  series: SerieEmpilhada[];
  tituloEixoY: string;
}) {
  const totais = categorias.map((_, i) => series.reduce((soma, serie) => soma + (serie.valores[i] ?? 0), 0));
  const { max, passo } = calcularEscalaY(Math.max(0, ...totais));
  const marcas: number[] = [];
  for (let valor = 0; valor <= max; valor += passo) marcas.push(valor);

  const largura = Math.max(LARGURA_MINIMA, MARGEM_ESQUERDA + categorias.length * PASSO + MARGEM_DIREITA);
  const altura = TOPO_DO_GRAFICO + ALTURA_GRAFICO + MARGEM_BAIXO;
  const baseY = TOPO_DO_GRAFICO + ALTURA_GRAFICO;
  const alturaDe = (valor: number) => (valor / max) * ALTURA_GRAFICO;
  const centroX = (i: number) => MARGEM_ESQUERDA + i * PASSO + PASSO / 2;

  // Legenda no canto superior direito, como na referencia: os itens seguem da
  // esquerda para a direita e o ultimo termina na margem.
  const larguraDoItem = (nome: string) => 22 + nome.length * 6.2 + 14;
  const larguraDaLegenda = series.reduce((soma, serie) => soma + larguraDoItem(serie.nome), 0);
  const inicioDaLegenda = largura - MARGEM_DIREITA - larguraDaLegenda;
  // Posicao de cada item calculada antes do render (soma das larguras dos
  // anteriores), e nao numa variavel alterada dentro do `map`.
  const xDaLegenda = series.map(
    (_, i) => inicioDaLegenda + series.slice(0, i).reduce((soma, serie) => soma + larguraDoItem(serie.nome), 0),
  );

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

      {series.map((serie, indice) => {
        const x = xDaLegenda[indice];
        return (
          <g key={serie.nome}>
            <circle cx={x + 6} cy={78} r={5} fill={serie.cor} />
            <text x={x + 16} y={78} dominantBaseline="middle" fill={COR_TEXTO} fontSize={11}>
              {serie.nome}
            </text>
          </g>
        );
      })}

      <text
        x={14}
        y={TOPO_DO_GRAFICO + ALTURA_GRAFICO / 2}
        textAnchor="middle"
        fill={COR_SUAVE}
        fontSize={11}
        transform={`rotate(-90 14 ${TOPO_DO_GRAFICO + ALTURA_GRAFICO / 2})`}
      >
        {tituloEixoY}
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

      {categorias.map((categoria, i) => {
        const x = centroX(i) - LARGURA_COLUNA / 2;
        let topo = baseY;

        return (
          <g key={i}>
            <title>{`${categoria.dica}: ${totais[i]}`}</title>
            {series.map((serie) => {
              const valor = serie.valores[i] ?? 0;
              if (valor <= 0) return null;
              const h = alturaDe(valor);
              topo -= h;
              return (
                <g key={serie.nome}>
                  <rect x={x} y={topo} width={LARGURA_COLUNA} height={h} fill={serie.cor} />
                  {/* Valor dentro do pedaco, como na referencia -- so se cabe. */}
                  {h >= 14 && (
                    <text
                      x={centroX(i)}
                      y={topo + h / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize={10}
                      fontWeight={700}
                    >
                      {valor}
                    </text>
                  )}
                </g>
              );
            })}
            <text x={centroX(i)} y={topo - 6} textAnchor="middle" fill={COR_TEXTO} fontSize={10}>
              {totais[i]}
            </text>
            <text
              x={centroX(i)}
              y={baseY + 12}
              textAnchor="end"
              fill="#7dd3fc"
              fontSize={10}
              transform={`rotate(-45 ${centroX(i)} ${baseY + 12})`}
            >
              {cortar(categoria.rotulo)}
            </text>
          </g>
        );
      })}

      <line x1={MARGEM_ESQUERDA} y1={baseY} x2={largura - MARGEM_DIREITA} y2={baseY} stroke="#334155" strokeWidth={1} />
    </svg>
  );
}
