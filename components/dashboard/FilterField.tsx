import { ChevronDownIcon } from "./icons";

/**
 * min-w-0 e essencial: inputs date/time tem largura minima intrinseca imposta
 * pelo navegador (~150px e ~98px). Sem isso eles se recusam a encolher e
 * vazam por cima do campo vizinho quando a coluna da grade e mais estreita.
 */
const fieldBaseClasses =
  "h-10 w-full min-w-0 rounded-md border border-slate-800 bg-brand-surface px-3 text-sm text-white shadow-sm outline-none transition-all duration-200 placeholder:text-brand-muted hover:border-slate-700 focus:border-brand-green focus:ring-1 focus:ring-brand-green";

export function FilterInput({
  label,
  type = "text",
  name,
  defaultValue,
}: {
  label: string;
  type?: "text" | "date" | "time";
  name?: string;
  defaultValue?: string;
}) {
  return (
    <input
      type={type}
      name={name}
      defaultValue={defaultValue}
      placeholder={label}
      aria-label={label}
      className={fieldBaseClasses}
    />
  );
}

export function FilterSelect({
  label,
  options = [],
  name,
  defaultValue,
}: {
  label: string;
  options?: string[];
  name?: string;
  defaultValue?: string;
}) {
  return (
    <div className="relative min-w-0">
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-label={label}
        className={`peer ${fieldBaseClasses} appearance-none pr-9 text-brand-muted`}
      >
        <option value="" disabled hidden>
          {label}
        </option>
        {options.map((option) => (
          <option key={option} value={option} className="text-white">
            {option}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
    </div>
  );
}
