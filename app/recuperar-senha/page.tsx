"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { HeroPanel } from "@/components/HeroPanel";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (email.trim() === "") {
      setError("Campo obrigatório");
      return;
    }

    setError("");

    // TODO: Integrar envio de e-mail de recuperação de senha (Supabase) aqui
    // Exemplo futuro:
    // const { error } = await supabase.auth.resetPasswordForEmail(email);

    setEmail("");
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <HeroPanel />

      <section className="flex min-h-screen w-full flex-col bg-gray-100 lg:w-[25%] lg:min-w-[320px] lg:max-w-md">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-10 lg:px-8 xl:px-10">
          <div className="mx-auto w-full max-w-xs">
            <h1 className="text-2xl font-bold text-slate-800">Esqueceu sua senha?</h1>
            <p className="mt-2 text-sm text-slate-500">
              Por favor entre com seu e-mail no campo abaixo para receber uma nova senha.
            </p>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="email" className="mb-1 block text-sm text-slate-600">
                  Seu e-mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) {
                      setError("");
                    }
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "email-error" : undefined}
                  className={`w-full border-0 border-b-2 bg-transparent px-0 py-2 text-slate-800 outline-none transition-colors placeholder:text-slate-400 ${
                    error
                      ? "border-red-500 focus:border-red-500"
                      : "border-indigo-500 focus:border-indigo-600"
                  }`}
                />
                {error && (
                  <p id="email-error" className="mt-1 text-xs text-red-500">
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-indigo-500 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Enviar
              </button>
            </form>

            <div className="mt-4">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-indigo-600"
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
                Voltar
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
