export function PerformanceLabLogo({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const performanceColor = variant === "light" ? "text-white" : "text-slate-800";
  const labColor = "text-sky-500";

  return (
    <div className="flex items-center gap-2">
      <svg
        aria-hidden="true"
        className="h-8 w-8 shrink-0"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="4" y="18" width="5" height="10" rx="1" fill="#2188dd" />
        <rect x="13" y="12" width="5" height="16" rx="1" fill="#2188dd" />
        <rect x="22" y="6" width="5" height="22" rx="1" fill="#2188dd" />
      </svg>
      <span className={`text-xl tracking-tight ${performanceColor}`}>
        <span className="font-bold">Performance</span>
        <span className={`font-light italic ${labColor}`}>lab</span>
      </span>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="relative mx-auto mt-10 w-full max-w-2xl px-6 lg:px-10">
      <div className="absolute -inset-4 rounded-3xl bg-sky-500/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-slate-900/80 p-3 shadow-2xl shadow-sky-950/50">
        <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 p-4">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-400" />
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 h-28 rounded-lg bg-sky-600/30 p-3">
              <div className="flex h-full items-end gap-1.5">
                {[40, 65, 45, 80, 55, 70, 90, 60].map((height, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-sm bg-sky-400/80"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-12 rounded-lg bg-amber-400/20" />
              <div className="h-12 rounded-lg bg-sky-500/20" />
            </div>
            <div className="col-span-3 h-20 rounded-lg bg-slate-700/50 p-2">
              <div className="space-y-2">
                <div className="h-2 w-full rounded bg-slate-600/60" />
                <div className="h-2 w-4/5 rounded bg-slate-600/60" />
                <div className="h-2 w-3/5 rounded bg-slate-600/60" />
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
    <section className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:min-h-screen lg:w-[75%] lg:flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(33,136,221,0.25),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(33,136,221,0.15),transparent_40%)]" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(148,163,184,0.4) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col p-8 xl:p-12">
        <PerformanceLabLogo variant="light" />

        <div className="mt-16 max-w-xl space-y-2 xl:mt-24">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky-500 sm:text-base">
            Soluções tecnológicas
          </p>
          <h1 className="text-2xl font-normal leading-snug text-white sm:text-3xl xl:text-4xl">
            para a gestão de{" "}
            <span className="font-bold uppercase">alta performance</span>
          </h1>
        </div>

        <div className="flex flex-1 items-end pb-8">
          <DashboardMockup />
        </div>
      </div>
    </section>
  );
}
