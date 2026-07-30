"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { HeroPanel, PerformanceLabLogo } from "./HeroPanel";
import { EMAIL_REGEX, FormField } from "./FormField";

type FieldErrors = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
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
    router.push("/dashboard");
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
