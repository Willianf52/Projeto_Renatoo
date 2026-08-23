"use client";

import { useState } from "react";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputBaseClasses =
  "w-full rounded-lg border bg-brand-navy px-4 py-3 text-white outline-none transition-all placeholder:text-brand-muted";

export const getInputClasses = (hasError: boolean) =>
  `${inputBaseClasses} ${
    hasError
      ? "border-red-500/70 focus:border-red-500 focus:ring-1 focus:ring-red-500"
      : "border-slate-800 hover:border-slate-700 focus:border-brand-green focus:ring-1 focus:ring-brand-green"
  }`;

function EyeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a17 17 0 0 1-2.42 3.6M6.61 6.61A17.15 17.15 0 0 0 2 11s3.5 7 10 7a9.14 9.14 0 0 0 4.16-.98" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

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
  // So senha ganha o toggle: nao ha razao pra "mostrar" um e-mail ou texto
  // comum, e esconder o valor por padrao so faz sentido pra senha mesmo.
  const isPassword = type === "password";
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={isPassword ? (visible ? "text" : "password") : type}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${getInputClasses(Boolean(error))} ${isPassword ? "pr-11" : ""}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((atual) => !atual)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-brand-muted transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
          >
            {visible ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
