import Image from "next/image";

/**
 * Marca Up Servicos, a partir do arquivo oficial em `public/`.
 *
 * O PNG tem fundo transparente e texto branco: foi desenhado para superficies
 * escuras, que e o caso de todas as telas deste projeto.
 */
/** Proporcao do arquivo original: 126 x 71px. */
const LOGO_RATIO = 126 / 71;

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

function DashboardMockup() {
  const bars = [35, 70, 50, 85, 60, 40, 95, 65, 75];

  return (
    <div className="relative mx-auto mt-10 w-full max-w-2xl px-6 lg:px-10">
      <div className="absolute -inset-4 rounded-3xl bg-brand-green/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-brand-surface/80 p-3 shadow-2xl shadow-black/50">
        <div className="rounded-xl bg-gradient-to-br from-brand-surface to-brand-navy p-4">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-white/25" />
            <div className="h-2 w-2 rounded-full bg-white/25" />
            <div className="h-2 w-2 rounded-full bg-brand-green" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 h-28 rounded-lg bg-white/5 p-3">
              <div className="flex h-full items-end gap-1.5">
                {bars.map((height, index) => (
                  <div
                    key={index}
                    className={`flex-1 origin-bottom rounded-t-full animate-grow-up ${
                      index % 3 === 0 ? "bg-brand-green" : "bg-white/20"
                    }`}
                    style={{
                      height: `${height}%`,
                      animationDelay: `${300 + index * 70}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div
                className="h-12 rounded-lg bg-brand-green/25 animate-pop-in"
                style={{ animationDelay: "700ms" }}
              />
              <div
                className="h-12 rounded-lg bg-white/10 animate-pop-in"
                style={{ animationDelay: "800ms" }}
              />
            </div>
            <div
              className="col-span-3 h-20 rounded-lg bg-white/5 p-2 animate-fade-in"
              style={{ animationDelay: "900ms" }}
            >
              <div className="space-y-2">
                {["w-full", "w-4/5", "w-3/5"].map((width, index) => (
                  <div
                    key={width}
                    className={`h-2 rounded bg-white/15 animate-fade-in-left ${width}`}
                    style={{ animationDelay: `${950 + index * 80}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-brand-navy lg:flex lg:min-h-screen lg:w-[75%] lg:flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(0,230,118,0.16),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(30,136,229,0.14),transparent_40%)]" />
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(160,174,192,0.35) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col p-8 xl:p-12">
        <div className="animate-fade-in-up">
          <BrandLogo />
        </div>

        <div className="mt-16 max-w-xl space-y-3 xl:mt-24">
          <p
            className="text-sm font-bold uppercase tracking-[0.2em] text-brand-green animate-fade-in-up sm:text-base"
            style={{ animationDelay: "120ms" }}
          >
            Análise de dados e inteligência operacional
          </p>
          <h1
            className="text-2xl font-bold leading-snug text-white animate-fade-in-up sm:text-3xl xl:text-4xl"
            style={{ animationDelay: "200ms" }}
          >
            Gestão de alta performance para a sua operação
          </h1>
        </div>

        <div
          className="flex flex-1 items-end pb-8 animate-fade-in-up"
          style={{ animationDelay: "280ms" }}
        >
          <DashboardMockup />
        </div>
      </div>
    </section>
  );
}
