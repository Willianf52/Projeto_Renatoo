"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { HeroPanel, PerformanceLabLogo } from "./HeroPanel";

type FieldErrors = {
  email: string;
  password: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputBaseClasses =
  "w-full border-0 border-b-2 bg-transparent px-0 py-2 text-slate-800 outline-none transition-colors placeholder:text-slate-400";

const getInputClasses = (hasError: boolean) =>
  `${inputBaseClasses} ${
    hasError
      ? "border-red-500 focus:border-red-500"
      : "border-sky-500 focus:border-sky-600"
  }`;

function FormField({
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({
    email: "",
    password: "",
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const emailError =
      trimmedEmail === ""
        ? "Campo obrigatório"
        : EMAIL_REGEX.test(trimmedEmail)
          ? ""
          : "E-mail inválido";
    const passwordError = password.trim() === "" ? "Campo obrigatório" : "";

    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }

    setErrors({ email: "", password: "" });

    // TODO: Integrar autenticação com Supabase aqui
    // Exemplo futuro:
    // const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    setEmail("");
    setPassword("");
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <HeroPanel />

      {/* Sidebar de login */}
      <section className="flex min-h-screen w-full flex-col bg-gray-100 lg:w-[25%] lg:min-w-[320px] lg:max-w-md">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-10 lg:px-8 xl:px-10">
          <div className="mb-10 flex justify-center lg:mb-12">
            <PerformanceLabLogo variant="dark" />
          </div>

          <form className="mx-auto w-full max-w-xs space-y-8" onSubmit={handleSubmit} noValidate>
            <FormField
              id="email"
              label="E-mail"
              type="email"
              autoComplete="email"
              value={email}
              error={errors.email}
              onChange={(value) => {
                setEmail(value);
                if (errors.email) {
                  setErrors((prev) => ({ ...prev, email: "" }));
                }
              }}
            />

            <FormField
              id="password"
              label="Senha"
              type="password"
              autoComplete="current-password"
              value={password}
              error={errors.password}
              onChange={(value) => {
                setPassword(value);
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: "" }));
                }
              }}
            />

            <div className="flex justify-end">
              <Link
                href="/recuperar-senha"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-sky-600"
              >
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Perdeu sua Senha?
              </Link>
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-sky-600 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              Entrar
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
