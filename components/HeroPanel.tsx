import Image from "next/image";

/** Proporcao do arquivo original: 126 x 71px. */
const LOGO_RATIO = 126 / 71;

/**
 * Marca Up Servicos, a partir do arquivo oficial em `public/`.
 *
 * O PNG tem fundo transparente e texto branco: foi desenhado para superficies
 * escuras, que e o caso de todas as telas deste projeto.
 */
export function BrandLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const altura = size === "sm" ? 32 : 44;

  return (
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

export function HeroPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-brand-navy lg:flex lg:min-h-screen lg:w-[75%] lg:flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(0,230,118,0.14),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_75%,rgba(30,136,229,0.12),transparent_45%)]" />
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(160,174,192,0.35) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <AbstractSwoosh />

      <div className="relative z-10 flex flex-1 flex-col p-10 xl:p-16">
        <div className="animate-fade-in-up">
          <BrandLogo />
        </div>

        {/* Conteudo centralizado na vertical: sem a ilustracao que ocupava a
            metade inferior, ancorar no topo deixaria o painel desequilibrado. */}
        <div className="flex flex-1 items-center">
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
