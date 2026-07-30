export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputBaseClasses =
  "w-full border-0 border-b-2 bg-transparent px-0 py-2 text-slate-800 outline-none transition-colors placeholder:text-slate-400";

export const getInputClasses = (hasError: boolean) =>
  `${inputBaseClasses} ${
    hasError
      ? "border-red-500 focus:border-red-500"
      : "border-sky-500 focus:border-sky-600"
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
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
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
        <p id={errorId} className="mt-1 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
