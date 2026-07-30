export function BrandLogo({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const primaryColor = variant === "light" ? "text-white" : "text-slate-800";

  return (
    <div className="flex items-center gap-2">
      <svg
        aria-hidden="true"
        className="h-8 w-8 shrink-0"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 10 L24 7 M17.5 13.5 L21.5 10"
          stroke="#ff9800"
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity="0.4"
        />
        <path
          d="M6 15 L13.5 23 L26 6"
          stroke="#ff9800"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="26" cy="6" r="2.75" fill="#ff9800" />
      </svg>
      <span className={`text-2xl font-extrabold tracking-tight ${primaryColor}`}>
        Velox
        <span className="font-light italic text-brand-orange">Lab</span>
      </span>
    </div>
  );
}

function DashboardMockup() {
  const bars = [35, 70, 50, 85, 60, 40, 95, 65, 75];

  return (
    <div className="relative mx-auto mt-10 w-full max-w-2xl px-6 lg:px-10">
      <div className="absolute -inset-4 rounded-3xl bg-brand-orange/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-3 shadow-2xl shadow-black/40">
        <div className="rounded-xl bg-gradient-to-br from-slate-800 to-brand-navy p-4">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-400" />
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 h-28 rounded-lg bg-white/5 p-3">
              <div className="flex h-full items-end gap-1.5">
                {bars.map((height, index) => (
                  <div
                    key={index}
                    className={`flex-1 rounded-t-full ${
                      index % 3 === 0 ? "bg-brand-orange" : "bg-white/25"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-12 rounded-lg bg-brand-orange/25" />
              <div className="h-12 rounded-lg bg-white/10" />
            </div>
            <div className="col-span-3 h-20 rounded-lg bg-white/5 p-2">
              <div className="space-y-2">
                <div className="h-2 w-full rounded bg-white/15" />
                <div className="h-2 w-4/5 rounded bg-white/15" />
                <div className="h-2 w-3/5 rounded bg-white/15" />
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,152,0,0.20),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(37,99,235,0.16),transparent_40%)]" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,152,0,0.18) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col p-8 xl:p-12">
        <BrandLogo variant="light" />

        <div className="mt-16 max-w-xl space-y-2 xl:mt-24">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand-orange sm:text-base">
            Análise de dados e inteligência operacional
          </p>
          <h1 className="text-2xl font-bold leading-snug text-white sm:text-3xl xl:text-4xl">
            <span className="text-brand-orange">VeloxLab:</span> Acelere sua Tomada de Decisão
          </h1>
        </div>

        <div className="flex flex-1 items-end pb-8">
          <DashboardMockup />
        </div>
      </div>
    </section>
  );
}
