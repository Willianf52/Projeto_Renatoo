export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputBaseClasses =
  "w-full rounded-lg border bg-brand-navy px-4 py-3 text-white outline-none transition-all placeholder:text-brand-muted";

export const getInputClasses = (hasError: boolean) =>
  `${inputBaseClasses} ${
    hasError
      ? "border-red-500/70 focus:border-red-500 focus:ring-1 focus:ring-red-500"
      : "border-slate-800 hover:border-slate-700 focus:border-brand-green focus:ring-1 focus:ring-brand-green"
  }`;

export function FormField({
  id,
  label,
  type,
  autoComplete,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  error: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={getInputClasses(Boolean(error))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
