type Fatia = {
  valor: number;
  cor: string;
};

function paraCartesiano(cx: number, cy: number, raio: number, anguloGraus: number) {
  const anguloRad = ((anguloGraus - 90) * Math.PI) / 180;
  return { x: cx + raio * Math.cos(anguloRad), y: cy + raio * Math.sin(anguloRad) };
}

/** Fatia de pizza como path SVG, do angulo inicial ao final (em graus, 0 = topo). */
function pathDaFatia(cx: number, cy: number, raio: number, anguloInicial: number, anguloFinal: number): string {
  const inicio = paraCartesiano(cx, cy, raio, anguloFinal);
  const fim = paraCartesiano(cx, cy, raio, anguloInicial);
  const arcoGrande = anguloFinal - anguloInicial <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${inicio.x} ${inicio.y} A ${raio} ${raio} 0 ${arcoGrande} 0 ${fim.x} ${fim.y} Z`;
}

/**
 * Pizza de 2 fatias (Realizadas x Nao Realizadas), sem biblioteca de grafico:
 * Highcharts (usado na referencia) exige licenca paga para uso comercial, e
 * um SVG de duas fatias nao justifica trazer outra dependencia so por isso.
 *
 * `valor === 0` em toda fatia menos uma vira um circulo cheio em vez de arco:
 * um path de 360 graus degenera (inicio e fim coincidem) e some.
 */
export function PieChart({ fatias, tamanho = 220 }: { fatias: [Fatia, Fatia]; tamanho?: number }) {
  const total = fatias.reduce((soma, fatia) => soma + fatia.valor, 0);
  const raio = tamanho / 2;
  const cx = raio;
  const cy = raio;

  if (total <= 0) {
    return (
      <svg
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        width={tamanho}
        height={tamanho}
        role="img"
        aria-label="Sem dados"
        className="animate-fade-in-scale"
      >
        <circle cx={cx} cy={cy} r={raio} className="fill-brand-muted/20" />
      </svg>
    );
  }

  const cheia = fatias.find((fatia) => fatia.valor === total);
  if (cheia) {
    return (
      <svg
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        width={tamanho}
        height={tamanho}
        role="img"
        className="animate-fade-in-scale"
      >
        <circle cx={cx} cy={cy} r={raio} fill={cheia.cor} />
      </svg>
    );
  }

  // reduce, nao um `let` mutado no map: o React Compiler recusa reatribuir
  // variavel de fora durante o render.
  const { caminhos } = fatias.reduce<{ anguloAtual: number; caminhos: { path: string; cor: string }[] }>(
    (estado, fatia) => {
      const anguloFatia = (fatia.valor / total) * 360;
      const path = pathDaFatia(cx, cy, raio, estado.anguloAtual, estado.anguloAtual + anguloFatia);
      return {
        anguloAtual: estado.anguloAtual + anguloFatia,
        caminhos: [...estado.caminhos, { path, cor: fatia.cor }],
      };
    },
    { anguloAtual: 0, caminhos: [] },
  );

  return (
    <svg
      viewBox={`0 0 ${tamanho} ${tamanho}`}
      width={tamanho}
      height={tamanho}
      role="img"
      className="animate-fade-in-scale"
    >
      {caminhos.map((fatia, indice) => (
        <path key={indice} d={fatia.path} fill={fatia.cor} />
      ))}
    </svg>
  );
}
