import Image from "next/image";

/** Proporcao do arquivo original: 126 x 71px. */
const LOGO_RATIO = 126 / 71;

/**
 * Marca Up Servicos, a partir do arquivo oficial em `public/`.
 *
 * O PNG tem fundo transparente e texto branco: foi desenhado para superficies
 * escuras, que e o caso de todas as telas deste projeto.
 *
 * `framed` assenta a marca sobre uma placa azul. No painel do login a logo tem
 * a folga do hero inteiro em volta; na navbar ela divide uma faixa de 64px com
 * seletor, usuario e botao de sair, e sem a placa se perde no meio deles.
 */
export function BrandLogo({
  size = "md",
  framed = false,
}: {
  size?: "sm" | "md";
  framed?: boolean;
}) {
  const altura = size === "sm" ? 32 : 44;

  const marca = (
    <Image
      src="/logo-up-servicos.png"
      alt="Up Serviços"
      width={Math.round(altura * LOGO_RATIO)}
      height={altura}
      // A logo aparece acima da dobra no login; carregar com prioridade evita
      // o salto de layout no primeiro paint.
      priority
      className="w-auto shrink-0"
      style={{ height: altura }}
    />
  );

  if (!framed) return marca;

  return (
    <span className="inline-flex items-center justify-center rounded-lg bg-brand-blue px-3 py-1.5 shadow-sm ring-1 ring-white/15">
      {marca}
    </span>
  );
}

/**
 * Elemento grafico de fundo: arcos concentricos que ecoam o swoosh da marca,
 * em escala ampliada e baixa opacidade, sangrando pela borda direita.
 *
 * Substitui o mockup de dashboard que existia antes. Aquele simulava dados que
 * nao existem, o que confunde -- parece um preview do sistema quando e apenas
 * enfeite. Um elemento abstrato sinaliza a marca sem prometer nada.
 */
function AbstractSwoosh() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute -right-40 top-1/2 h-[130%] w-auto -translate-y-1/2 opacity-[0.13]"
      viewBox="0 0 600 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g strokeLinecap="round" fill="none">
        <path d="M-40 470C140 560 400 520 640 330" stroke="#2b6cb0" strokeWidth="14" />
        <path d="M-40 512C140 602 400 562 640 372" stroke="#00e676" strokeWidth="11" />
        <path d="M-40 548C140 638 400 598 640 408" stroke="#e53935" strokeWidth="8" />

        {/* Repeticao no terco superior, girada, para dar ritmo sem simetria. */}
        <g transform="rotate(180 300 300)" opacity="0.6">
          <path d="M-40 470C140 560 400 520 640 330" stroke="#2b6cb0" strokeWidth="14" />
          <path d="M-40 512C140 602 400 562 640 372" stroke="#00e676" strokeWidth="11" />
        </g>
      </g>
    </svg>
  );
}

/**
 * A rota de uma ronda: pontos de inspecao ligados na ordem da visita, os ja
 * lidos cheios em verde, o atual pulsando e os que faltam vazados. E o
 * equivalente, no mundo da Up, do globo com conexoes do login do sistema de
 * referencia (09/11/2026): mesma ideia de "rede viva", com o que este sistema
 * faz de verdade -- inspetores passando de ponto em ponto.
 */
function RotaDeRonda() {
  const pontos: [number, number][] = [
    [70, 420], [190, 330], [330, 380], [450, 250], [600, 300], [720, 170], [860, 220],
  ];
  const feitos = 4;
  const linha = (de: number, ate: number) => pontos.slice(de, ate).map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute bottom-[6%] left-[4%] hidden h-auto w-[62%] max-w-5xl opacity-70 lg:block"
      viewBox="0 0 930 480"
      fill="none"
    >
      {/* Trecho ja percorrido e trecho que falta. */}
      <polyline points={linha(0, feitos + 1)} stroke="#00e676" strokeWidth="2" strokeOpacity="0.55" />
      <polyline points={linha(feitos, pontos.length)} stroke="#a0aec0" strokeWidth="2" strokeOpacity="0.3" strokeDasharray="6 8" />
      {pontos.map(([x, y], i) =>
        i < feitos ? (
          <g key={i}>
            <circle cx={x} cy={y} r="13" fill="#00e676" fillOpacity="0.12" />
            <circle cx={x} cy={y} r="5" fill="#00e676" />
          </g>
        ) : i === feitos ? (
          <g key={i}>
            <circle cx={x} cy={y} r="20" fill="#00e676" fillOpacity="0.15"
              // Animacao propria, e nao `animate-pulse`: os testes de tela usam
              // essa classe para saber se algo ainda esta carregando.
              className="animate-[pulse_2.4s_ease-in-out_infinite]"
            />
            <circle cx={x} cy={y} r="7" fill="#00e676" />
            <circle cx={x} cy={y} r="11" stroke="#00e676" strokeWidth="1.5" strokeOpacity="0.7" />
          </g>
        ) : (
          <circle key={i} cx={x} cy={y} r="5" stroke="#a0aec0" strokeWidth="1.5" strokeOpacity="0.5" />
        ),
      )}
    </svg>
  );
}

/**
 * O fundo da entrada, de borda a borda (09/11/2026): antes a tela era dividida
 * em dois paineis de cores diferentes; agora e uma cena so, como no login do
 * sistema de referencia, e o cartao de login flutua sobre ela.
 */
export function FundoDaEntrada() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-brand-navy">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_25%,rgba(0,230,118,0.14),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(30,136,229,0.14),transparent_50%)]" />
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(160,174,192,0.35) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <AbstractSwoosh />
      <RotaDeRonda />
    </div>
  );
}

export function HeroPanel() {
  return (
    <section className="relative hidden lg:flex lg:min-h-screen lg:flex-1 lg:flex-col">
      <div className="relative z-10 flex flex-1 flex-col p-10 xl:p-16">
        {/* Texto no terco de cima: a rota da ronda ocupa a parte de baixo. */}
        <div className="flex flex-1 items-start pt-[10vh]">
          <div className="max-w-2xl space-y-5">
            <p
              className="text-xs font-bold uppercase tracking-[0.25em] text-brand-green animate-fade-in-up sm:text-sm"
              style={{ animationDelay: "120ms" }}
            >
              Análise de dados e inteligência operacional
            </p>

            <h1
              className="text-3xl font-bold leading-[1.15] tracking-tight text-white animate-fade-in-up xl:text-5xl"
              style={{ animationDelay: "200ms" }}
            >
              Especialistas em Terceirização de Serviços.
            </h1>

            <div
              className="h-1 w-20 rounded-full bg-brand-green animate-fade-in-up"
              style={{ animationDelay: "300ms" }}
            />

            <p
              className="max-w-md text-base leading-relaxed text-brand-muted animate-fade-in-up"
              style={{ animationDelay: "380ms" }}
            >
              As melhores soluções em terceirização, capazes de ajustar com
              perfeição às suas necessidades, sua cultura e sua gestão!
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
