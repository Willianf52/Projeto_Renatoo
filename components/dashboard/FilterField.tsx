import { ChevronDownIcon } from "./icons";

const fieldBaseClasses =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500";

export function FilterInput({
  label,
  type = "text",
}: {
  label: string;
  type?: "text" | "date" | "time";
}) {
  return (
    <input
      type={type}
      placeholder={label}
      aria-label={label}
      className={fieldBaseClasses}
    />
  );
}

export function FilterSelect({
  label,
  options = [],
}: {
  label: string;
  options?: string[];
}) {
  return (
    <div className="relative">
      <select
        defaultValue=""
        aria-label={label}
        className={`${fieldBaseClasses} appearance-none pr-9 text-slate-500`}
      >
        <option value="" disabled hidden>
          {label}
        </option>
        {options.map((option) => (
          <option key={option} value={option} className="text-slate-700">
            {option}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
