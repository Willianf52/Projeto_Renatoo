import { ChevronDownIcon } from "./icons";

const fieldBaseClasses =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-500 hover:border-slate-400 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/15";

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
    <div className="relative">
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-label={label}
        className={`peer ${fieldBaseClasses} appearance-none pr-9 text-slate-600`}
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
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform duration-200 peer-focus:rotate-180" />
    </div>
  );
}
