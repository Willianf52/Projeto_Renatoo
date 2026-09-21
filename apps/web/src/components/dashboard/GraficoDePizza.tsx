/**
 * Pizza com rotulos, titulo e subtitulos DENTRO do SVG -- o "Gráficos de
 * Eventos" da referencia (Highcharts la; aqui SVG proprio, como o
 * `GraficoDeColunasEmpilhadas` e pelo mesmo motivo: licenca comercial).
 *
 * Tudo em atributos (`fill`, `fontSize`...) e nada em classe do Tailwind: o
 * menu de exportar serializa este SVG para PNG/SVG, e fora da pagina as
 * classes nao existem. Por isso o fundo tambem e um `<rect>`.
 *
 * Diferente do `PieChart`, que e a primitiva de duas fatias sem texto usada em
 * Visitas de Supervisao -- esta aqui e o grafico inteiro, com cabecalho.
 */

export type FatiaDaPizza = { rotulo: string; valor: number; cor: string };

const COR_FUNDO = "#0b0b26"; // --color-brand-surface
const COR_TEXTO = "#e2e8f0";
const COR_SUAVE = "#a0aec0"; // --color-brand-muted
const FONTE = "system-ui, -apple-system, 'Segoe UI', sans-serif";

const LARGURA = 760;
const TOPO_DO_GRAFICO = 100;
const RAIO = 130;
const COMPRIMENTO_DO_COTOVELO = 16;
const COMPRIMENTO_DA_GUIA = 28;
/** Duas linhas de texto por rotulo (nome + percentual) nao encostam. */
const ESPACO_MINIMO_DO_ROTULO = 30;
/** Piso dos rotulos: sem ele, a fatia que comeca no topo escreve por cima
 * do subtitulo ("Total de Eventos: 59" ficava riscado pela linha-guia). */
const Y_MINIMO_DO_ROTULO = 86;
const MAXIMO_DO_ROTULO = 22;

function cortar(texto: string): string {
  return texto.length > MAXIMO_DO_ROTULO ? `${texto.slice(0, MAXIMO_DO_ROTULO - 1)}…` : texto;
}

function paraCartesiano(cx: number, cy: number, raio: number, anguloGraus: number) {
  const anguloRad = ((anguloGraus - 90) * Math.PI) / 180;
  return { x: cx + raio * Math.cos(anguloRad), y: cy + raio * Math.sin(anguloRad) };
}

/** Fatia como path SVG, do angulo inicial ao final (em graus, 0 = topo). */
function pathDaFatia(cx: number, cy: number, raio: number, anguloInicial: number, anguloFinal: number): string {
  const inicio = paraCartesiano(cx, cy, raio, anguloFinal);
  const fim = paraCartesiano(cx, cy, raio, anguloInicial);
  const arcoGrande = anguloFinal - anguloInicial <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${inicio.x} ${inicio.y} A ${raio} ${raio} 0 ${arcoGrande} 0 ${fim.x} ${fim.y} Z`;
}

type RotuloPosicionado = {
  rotulo: string;
  percentual: string;
  cor: string;
  /** Onde a linha-guia encosta na borda da fatia. */
  ancora: { x: number; y: number };
  cotovelo: { x: number; y: number };
  fimDaGuia: number;
  y: number;
  direita: boolean;
};

/**
 * Empurra rotulos vizinhos para baixo ate caberem sem se sobrepor.
 *
 * Sem isso, fatias de 1,7% lado a lado (como as da referencia) escrevem uma
 * por cima da outra. Pura e fora do componente: o React Compiler recusa
 * variavel de fora mutada durante o render.
 */
function espalhar(rotulos: RotuloPosicionado[]): RotuloPosicionado[] {
  const ordenados = [...rotulos].sort((a, b) => a.y - b.y);
  return ordenados.reduce<RotuloPosicionado[]>((ajustados, atual) => {
    const anterior = ajustados[ajustados.length - 1];
    const minimo = anterior ? anterior.y + ESPACO_MINIMO_DO_ROTULO : Y_MINIMO_DO_ROTULO;
    return [...ajustados, { ...atual, y: Math.max(atual.y, minimo) }];
  }, []);
}

export function GraficoDePizza({
  id,
  titulo,
  subtitulos,
  fatias,
}: {
  /** `id` do `<svg>`, para o menu de exportar encontrar o grafico. */
  id: string;
  titulo: string;
  subtitulos: string[];
  fatias: FatiaDaPizza[];
}) {
  const total = fatias.reduce((soma, fatia) => soma + fatia.valor, 0);
  const altura = TOPO_DO_GRAFICO + RAIO * 2 + 48;
  const cx = LARGURA / 2;
  const cy = TOPO_DO_GRAFICO + RAIO;

  const cabecalho = (
    <>
      <rect width={LARGURA} height={altura} fill={COR_FUNDO} />
      <text x={cx} y={26} textAnchor="middle" fill={COR_TEXTO} fontSize={16} fontWeight={600}>
        {titulo}
      </text>
      {subtitulos.map((linha, i) => (
        <text key={i} x={cx} y={44 + i * 14} textAnchor="middle" fill={COR_SUAVE} fontSize={11}>
          {linha}
        </text>
      ))}
    </>
  );

  const moldura = {
    id,
    xmlns: "http://www.w3.org/2000/svg",
    width: LARGURA,
    height: altura,
    viewBox: `0 0 ${LARGURA} ${altura}`,
    role: "img" as const,
    fontFamily: FONTE,
  };

  if (total <= 0) {
    return (
      <svg {...moldura} aria-label={`${titulo}. Sem dados no período.`}>
        {cabecalho}
        <circle cx={cx} cy={cy} r={RAIO} fill="none" stroke="#1e293b" strokeWidth={1} />
      </svg>
    );
  }

  // Angulo inicial de cada fatia calculado antes do render (soma das
  // anteriores), e nao numa variavel alterada dentro do `map`.
  const anguloInicialDe = (indice: number) =>
    fatias.slice(0, indice).reduce((soma, fatia) => soma + (fatia.valor / total) * 360, 0);

  const desenhadas = fatias.map((fatia, i) => {
    const anguloInicial = anguloInicialDe(i);
    const anguloDaFatia = (fatia.valor / total) * 360;
    const meio = anguloInicial + anguloDaFatia / 2;
    const direita = meio <= 180;
    const ancora = paraCartesiano(cx, cy, RAIO, meio);
    const cotovelo = paraCartesiano(cx, cy, RAIO + COMPRIMENTO_DO_COTOVELO, meio);

    return {
      fatia,
      // Uma fatia de 360 graus degenera (inicio e fim coincidem) e some: vira
      // circulo cheio.
      path: anguloDaFatia >= 360 ? null : pathDaFatia(cx, cy, RAIO, anguloInicial, anguloInicial + anguloDaFatia),
      rotulo: {
        rotulo: cortar(fatia.rotulo),
        percentual: `${((fatia.valor / total) * 100).toFixed(1)}%`,
        cor: fatia.cor,
        ancora,
        cotovelo,
        fimDaGuia: direita ? cotovelo.x + COMPRIMENTO_DA_GUIA : cotovelo.x - COMPRIMENTO_DA_GUIA,
        y: cotovelo.y,
        direita,
      } satisfies RotuloPosicionado,
    };
  });

  // Cada lado se espalha por conta: empurrar um rotulo da direita por causa de
  // um da esquerda deslocaria texto que nao estava colidindo.
  const rotulos = [
    ...espalhar(desenhadas.filter((d) => d.rotulo.direita).map((d) => d.rotulo)),
    ...espalhar(desenhadas.filter((d) => !d.rotulo.direita).map((d) => d.rotulo)),
  ];

  return (
    <svg {...moldura} aria-label={`${titulo}. ${subtitulos.join(". ")}`}>
      {cabecalho}

      {desenhadas.map(({ fatia, path }) => (
        <g key={fatia.rotulo}>
          <title>{`${fatia.rotulo}: ${fatia.valor}`}</title>
          {path === null ? (
            <circle cx={cx} cy={cy} r={RAIO} fill={fatia.cor} />
          ) : (
            // Fio da cor do fundo entre as fatias: separa vizinhas sem
            // inventar uma cor de borda.
            <path d={path} fill={fatia.cor} stroke={COR_FUNDO} strokeWidth={2} />
          )}
        </g>
      ))}

      {rotulos.map((rotulo) => (
        <g key={rotulo.rotulo}>
          <polyline
            points={`${rotulo.ancora.x},${rotulo.ancora.y} ${rotulo.cotovelo.x},${rotulo.y} ${rotulo.fimDaGuia},${rotulo.y}`}
            fill="none"
            stroke={rotulo.cor}
            strokeWidth={1}
          />
          {/* O texto usa a cor de texto, nao a da serie: a identidade quem
              carrega e a fatia ao lado da linha-guia. */}
          <text
            x={rotulo.direita ? rotulo.fimDaGuia + 5 : rotulo.fimDaGuia - 5}
            y={rotulo.y - 3}
            textAnchor={rotulo.direita ? "start" : "end"}
            fill={COR_TEXTO}
            fontSize={11}
            fontWeight={600}
          >
            {rotulo.rotulo}
          </text>
          <text
            x={rotulo.direita ? rotulo.fimDaGuia + 5 : rotulo.fimDaGuia - 5}
            y={rotulo.y + 10}
            textAnchor={rotulo.direita ? "start" : "end"}
            fill={COR_SUAVE}
            fontSize={10}
          >
            {rotulo.percentual}
          </text>
        </g>
      ))}
    </svg>
  );
}
