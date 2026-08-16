"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "./Button";
import { EMAIL_REGEX, FormField } from "./FormField";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/safe-redirect";

type FieldErrors = {
  email: string;
  password: string;
};

const URL_ERRORS: Record<string, string> = {
  "link-invalido": "O link expirou ou já foi utilizado. Solicite um novo abaixo.",
  "acesso-indisponivel": "Esta conta está desativada. Procure o administrador.",
  // Autenticacao valida, mas sem perfil correspondente: e um defeito de
  // cadastro, nao uma desativacao, e o administrador precisa saber a diferenca
  // para nao procurar por um `ativo = false` que nao existe.
  "perfil-ausente":
    "Sua conta está sem perfil configurado. Procure o administrador para concluir o cadastro.",
};

// O Supabase Auth ja limita tentativas no backend; isto e uma camada extra no
// cliente para dar feedback visivel e desencorajar tentativa manual repetida
// direto na tela -- nao substitui o limite do servidor, que continua sendo a
// defesa real contra um script batendo direto na API.
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 30_000;

// Sem isto, tentativasFalhas e bloqueadoAte moram so no estado do componente
// e um F5 no meio do bloqueio zera o contador -- a "camada extra" acima de
// nada serve se um reload a contorna. sessionStorage (nao localStorage):
// o bloqueio e por sessao de aba, nao deve sobreviver ao navegador fechar.
const CHAVE_BLOQUEIO = "login-bloqueio";

/**
 * Le o bloqueio salvo antes de um reload anterior. Chamada de dentro de
 * inicializador preguicoso do useState (nao de um useEffect): e leitura
 * sincrona de fonte externa na montagem, exatamente o caso que o
 * eslint-plugin-react-hooks (`set-state-in-effect`) recusa fazer via
 * setState dentro de efeito -- e tambem evita o flash de um render com o
 * estado default antes do efeito rodar.
 */
function lerBloqueioSalvo(): { tentativas?: number; ate?: number } {
  try {
    const salvo = sessionStorage.getItem(CHAVE_BLOQUEIO);
    if (!salvo) return {};
    return JSON.parse(salvo) as { tentativas?: number; ate?: number };
  } catch {
    // sessionStorage indisponivel (modo privado, iframe restrito) ou
    // conteudo corrompido -- degrada para o comportamento soh em memoria.
    return {};
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({
    email: "",
    password: "",
  });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  // Inicializadores preguicosos (nao 0/null fixos): restauram o que foi
  // salvo antes de um reload anterior ja no primeiro render, sem depender de
  // um efeito rodar depois -- ver o comentario em lerBloqueioSalvo().
  const [tentativasFalhas, setTentativasFalhas] = useState(() => {
    const { tentativas, ate } = lerBloqueioSalvo();
    if (typeof ate === "number" && ate > Date.now()) return 0;
    return typeof tentativas === "number" ? tentativas : 0;
  });
  const [bloqueadoAte, setBloqueadoAte] = useState<number | null>(() => {
    const { ate } = lerBloqueioSalvo();
    return typeof ate === "number" && ate > Date.now() ? ate : null;
  });
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  // Reiniciado a cada tentativa falha (nao "true" fixo): reaplicar a mesma
  // classe sem passar por false antes nao reinicia a animacao no navegador.
  const [shaking, setShaking] = useState(false);

  // Mantem o sessionStorage em sincronia a cada mudanca, para um reload no
  // meio do bloqueio (ou entre tentativas) nao zerar o que foi restaurado
  // acima.
  useEffect(() => {
    try {
      if (bloqueadoAte) {
        sessionStorage.setItem(CHAVE_BLOQUEIO, JSON.stringify({ ate: bloqueadoAte }));
      } else if (tentativasFalhas > 0) {
        sessionStorage.setItem(CHAVE_BLOQUEIO, JSON.stringify({ tentativas: tentativasFalhas }));
      } else {
        sessionStorage.removeItem(CHAVE_BLOQUEIO);
      }
    } catch {
      // sessionStorage indisponivel -- comportamento soh em memoria continua valendo.
    }
  }, [tentativasFalhas, bloqueadoAte]);

  useEffect(() => {
    if (!bloqueadoAte) return;

    const atualizar = () => {
      const restante = Math.ceil((bloqueadoAte - Date.now()) / 1000);
      if (restante <= 0) {
        setBloqueadoAte(null);
        setSegundosRestantes(0);
      } else {
        setSegundosRestantes(restante);
      }
    };

    atualizar();
    const intervalo = setInterval(atualizar, 1000);
    return () => clearInterval(intervalo);
  }, [bloqueadoAte]);

  // Derivado de um valor de estado (nao de Date.now() direto no corpo do
  // componente): chamar uma funcao impura durante a renderizacao produz
  // resultado instavel entre re-renders.
  const bloqueado = segundosRestantes > 0;

  // Avisos sinalizados por outras partes da aplicacao via ?erro= na URL:
  // o /auth/callback quando o link do e-mail falha, e o middleware quando
  // barra o acesso.
  const urlError = URL_ERRORS[searchParams.get("erro") ?? ""] ?? "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (bloqueado) {
      return;
    }

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
    setFormError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      setLoading(false);
      setFormError(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : "Não foi possível entrar. Tente novamente.",
      );
      setShaking(true);

      const proximaContagem = tentativasFalhas + 1;
      if (proximaContagem >= MAX_TENTATIVAS) {
        setTentativasFalhas(0);
        setBloqueadoAte(Date.now() + BLOQUEIO_MS);
        setSegundosRestantes(Math.ceil(BLOQUEIO_MS / 1000));
      } else {
        setTentativasFalhas(proximaContagem);
      }
      return;
    }

    setTentativasFalhas(0);
    router.replace(safeRedirectPath(searchParams.get("redirectTo")));
    router.refresh();
  };

  return (
    <form
      className={`mx-auto w-full max-w-xs space-y-8 ${shaking ? "animate-shake" : ""}`}
      onSubmit={handleSubmit}
      // Filtra pelo nome: sem isso, o fim das animacoes dos campos
      // (fade-in-up) e do banner de erro (slide-down) borbulha ate aqui e
      // desliga o shake antes dele proprio terminar (250ms < 400ms).
      onAnimationEnd={(event) => {
        if (event.animationName === "shake") setShaking(false);
      }}
      noValidate
    >
      <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
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
            if (formError) {
              setFormError("");
            }
          }}
        />
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: "180ms" }}>
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
            if (formError) {
              setFormError("");
            }
          }}
        />
      </div>

      {(formError || urlError || bloqueado) && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 animate-slide-down"
        >
          {bloqueado
            ? `Muitas tentativas. Aguarde ${segundosRestantes}s para tentar de novo.`
            : formError || urlError}
        </p>
      )}

      <div className="flex justify-end animate-fade-in-up" style={{ animationDelay: "260ms" }}>
        <Link
          href="/recuperar-senha"
          className="group inline-flex items-center gap-1.5 text-xs text-brand-muted transition-colors hover:text-brand-green"
        >
          <svg
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5"
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

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={loading}
        disabled={loading || bloqueado}
        style={{ animationDelay: "340ms" }}
        className="animate-fade-in-up"
      >
        {bloqueado ? `Aguarde ${segundosRestantes}s` : loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
