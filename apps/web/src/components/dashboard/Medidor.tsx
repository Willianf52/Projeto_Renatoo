/**
 * Medidor de meia-lua (0 a 100), o "solid gauge" dos relatorios do ChecklistLab
 * na referencia. SVG puro, sem JS: renderiza no servidor e sai na impressao.
 *
 * Cor pela faixa: verde a partir de 80, amarelo a partir de 50, vermelho
 * abaixo -- a leitura que a pessoa faz de relance. Sem valor (nada para
 * medir), o arco fica cinza e o numero em branco, em vez de um zero que
 * diria "reprovado".
 */
const RAIO = 40;
const ESPESSURA = 12;
const COMPRIMENTO = Math.PI * RAIO;

function corDaFaixa(valor: number): string {
  if (valor >= 80) return "#38a169";
  if (valor >= 50) return "#d69e2e";
  return "#e53e3e";
}

export function Medidor({ valor, rotulo, legenda }: { valor: number | null; rotulo: string; legenda?: string }) {
  const preenchido = valor === null ? 0 : Math.max(0, Math.min(100, valor)) / 100;
  const descricao = valor === null ? `${rotulo}: sem respostas para medir` : `${rotulo}: ${valor}%`;

  return (
    <figure className="flex w-36 flex-col items-center gap-1" role="img" aria-label={descricao}>
      <svg viewBox="0 0 100 58" className="w-full" aria-hidden="true">
        <path
          d={`M ${50 - RAIO} 50 A ${RAIO} ${RAIO} 0 0 1 ${50 + RAIO} 50`}
          fill="none"
          stroke="#334155"
          strokeWidth={ESPESSURA}
        />
        {valor !== null && (
          <path
            d={`M ${50 - RAIO} 50 A ${RAIO} ${RAIO} 0 0 1 ${50 + RAIO} 50`}
            fill="none"
            stroke={corDaFaixa(valor)}
            strokeWidth={ESPESSURA}
            strokeDasharray={`${COMPRIMENTO * preenchido} ${COMPRIMENTO}`}
          />
        )}
        <text x="50" y="48" textAnchor="middle" fontSize="15" fontWeight="600" fill="#e2e8f0">
          {valor === null ? "" : `${valor}%`}
        </text>
      </svg>
      <figcaption className="text-center text-xs leading-tight text-white">{rotulo}</figcaption>
      {legenda && <span className="text-center text-[11px] text-brand-muted">{legenda}</span>}
    </figure>
  );
}
