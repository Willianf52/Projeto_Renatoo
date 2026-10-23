"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { HeroPanel } from "@/components/HeroPanel";
import { EMAIL_REGEX, FormField } from "@/components/FormField";
import { createClient } from "@/lib/supabase/client";
// Pelo subcaminho, e nao pelo indice do shared: o login pre-carrega esta
// pagina pelo link "Perdeu sua Senha?", e o indice puxava junto codigo que
// ela nao usa (+39 kB no orcamento de desempenho do login).
// O intervalo do "Reenviar e-mail" e o texto do botao tambem moram la: o app
// tem a mesma tela, nativa, e os dois nao podem se desencontrar.
import {
  AVISO_DE_LIMITE_DE_EMAIL,
  eLimiteDeEnvioDoProjeto,
  INTERVALO_DE_REENVIO_EM_SEGUNDOS,
  rotuloDoReenvio,
} from "@projeto-renatoo/shared/recuperacao-de-senha";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  /** O e-mail do ultimo envio: o campo e limpo, e o reenvio usa este. */
  const [enviadoPara, setEnviadoPara] = useState("");
  const [espera, setEspera] = useState(0);
  const [reenviado, setReenviado] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const relogio = setTimeout(() => setEspera((segundos) => segundos - 1), 1000);
    return () => clearTimeout(relogio);
  }, [espera]);

  const pedirRecuperacao = async (destino: string) => {
    const supabase = createClient();
    const { error: erroDoEnvio } = await supabase.auth.resetPasswordForEmail(destino, {
      redirectTo: `${window.location.origin}/auth/callback?next=/nova-senha`,
    });
    return erroDoEnvio;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const emailError =
      trimmedEmail === ""
        ? "Campo obrigatório"
        : EMAIL_REGEX.test(trimmedEmail)
          ? ""
          : "E-mail inválido";

    if (emailError) {
      setError(emailError);
      return;
    }

    setError("");
    setLoading(true);

    const erroDoEnvio = await pedirRecuperacao(trimmedEmail);

    setLoading(false);

    // A confirmacao é sempre a mesma, com ou sem erro: revelar se o e-mail
    // existe permitiria enumerar contas cadastradas. A unica excecao e o
    // limite de envio do projeto, que vale para todos (ver o shared).
    if (eLimiteDeEnvioDoProjeto(erroDoEnvio)) {
      setError(AVISO_DE_LIMITE_DE_EMAIL);
      return;
    }

    setEnviadoPara(trimmedEmail);
    setEmail("");
    setSubmitted(true);
    setEspera(INTERVALO_DE_REENVIO_EM_SEGUNDOS);
  };

  // Mesma regra do primeiro envio: a resposta nao muda com ou sem conta, so
  // o limite do projeto vira aviso (ver o shared).
  const reenviar = async () => {
    if (espera > 0 || loading) return;
    setError("");
    setReenviado(false);
    setLoading(true);

    const erroDoEnvio = await pedirRecuperacao(enviadoPara);

    setLoading(false);
    setEspera(INTERVALO_DE_REENVIO_EM_SEGUNDOS);
    if (eLimiteDeEnvioDoProjeto(erroDoEnvio)) {
      setError(AVISO_DE_LIMITE_DE_EMAIL);
      return;
    }
    setReenviado(true);
  };

  return (
    <div data-tema="escuro" className="flex min-h-screen flex-col bg-brand-navy text-white lg:flex-row">
      {/* Escuro nos dois temas: a entrada e a vitrine da marca (ver globals.css). */}
      <HeroPanel />

      <section className="flex min-h-screen w-full flex-col border-l border-slate-800 bg-brand-surface lg:w-[25%] lg:min-w-[320px] lg:max-w-md">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-10 lg:px-8 xl:px-10">
          <div className="mx-auto w-full max-w-xs">
            <h1 className="text-2xl font-bold text-white">Esqueceu sua senha?</h1>

            {submitted ? (
              <>
                <p className="mt-2 text-sm text-brand-muted">
                  Se o e-mail informado estiver cadastrado, você receberá em breve as instruções para
                  redefinir sua senha.
                </p>
                <p className="mt-4 text-sm text-brand-muted">
                  Não chegou? Confira a caixa de spam ou lixo eletrônico, ou peça de novo.
                </p>

                {reenviado ? (
                  <p role="status" className="mt-3 text-xs text-brand-green">
                    E-mail reenviado.
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="mt-3 text-xs text-red-400">
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={reenviar}
                  disabled={espera > 0 || loading}
                  className="mt-4 w-full rounded-lg border border-slate-800 py-3 text-sm font-semibold text-white tabular-nums transition-colors hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 focus:ring-offset-brand-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rotuloDoReenvio(espera, loading)}
                </button>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-brand-muted">
                  Por favor entre com seu e-mail no campo abaixo para receber uma nova senha.
                </p>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
                  <FormField
                    id="email"
                    label="Seu e-mail"
                    type="email"
                    autoComplete="email"
                    placeholder="Digite seu e-mail"
                    value={email}
                    error={error}
                    onChange={(value) => {
                      setEmail(value);
                      if (error) {
                        setError("");
                      }
                    }}
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-brand-green py-3.5 text-sm font-bold uppercase tracking-wider text-sobre-verde shadow-lg shadow-brand-green/20 transition-all duration-200 hover:bg-brand-green-hover hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 focus:ring-offset-brand-surface active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
                  >
                    {loading ? "Enviando..." : "Enviar"}
                  </button>
                </form>
              </>
            )}

            <div className="mt-4">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-brand-muted transition-colors hover:text-brand-green"
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
