"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { PasswordRulesList } from "@/components/PasswordRules";
import { salvarUsuario, type EstadoDoFormulario, type ValoresDoUsuario } from "./actions";
// De `constantes.ts`, e nao de `queries.ts`: este e um Client Component, e
// `queries.ts` importa `lib/supabase/server.ts` -- que puxa `next/headers`.
import { NIVEIS_ACESSO, TIPOS_USUARIO, type FilterOption } from "./constantes";

const LISTAGEM = "/dashboard/cadastros/usuarios";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Campo({
  id,
  rotulo,
  children,
  ajuda,
  className = "",
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
  ajuda?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={rotuloClasses}>
        {rotulo}
      </label>
      {children}
      {ajuda && (
        <p id={`${id}-ajuda`} className="mt-1.5 text-xs text-brand-muted">
          {ajuda}
        </p>
      )}
    </div>
  );
}

export function UsuarioForm({
  id,
  valoresIniciais,
  superiores,
  gruposSites,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: string;
  valoresIniciais: ValoresDoUsuario;
  superiores: FilterOption[];
  gruposSites: FilterOption[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarUsuario,
    {},
  );

  const criando = id === undefined;

  // A lista de requisitos reage enquanto se digita, como na tela de trocar
  // senha. Sem o estado ela ficaria estatica e neutra -- uma legenda, nao um
  // retorno.
  const [senha, setSenha] = useState("");

  // O escopo por grupo de sites so tem efeito no nivel CLIENTE (migration
  // 0014), entao a secao acompanha o select em vez de ficar sempre visivel
  // pedindo uma escolha que seria descartada.
  const [cargo, setCargo] = useState(valoresIniciais.cargo);
  const ehCliente = cargo === "CLIENTE";

  // Depois de uma recusa, o formulario volta com o que a pessoa tinha digitado.
  // A senha e a excecao: a action a devolve sempre vazia, para nao trafegar de
  // volta e ficar no HTML renderizado.
  const valores = estado.valores ?? valoresIniciais;

  return (
    <form action={formAction} className="space-y-4 p-4">
      {!criando && <input type="hidden" name="id" value={id} />}

      {estado.erro && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {estado.erro}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="nome_completo" rotulo="Nome completo" className="sm:col-span-2">
          <input
            id="nome_completo"
            name="nome_completo"
            type="text"
            required
            defaultValue={valores.nomeCompleto}
            aria-invalid={Boolean(estado.erro)}
            className={getInputClasses(Boolean(estado.erro))}
          />
        </Campo>

        <Campo
          id="email"
          rotulo="E-mail"
          ajuda={criando ? undefined : "O e-mail de acesso não é alterado por aqui."}
        >
          <input
            id="email"
            name="email"
            type="email"
            required={criando}
            // Na edicao o campo e so leitura: trocar o e-mail de login e uma
            // operacao de autenticacao (confirmacao no endereco novo), nao de
            // cadastro -- e a action ignora o campo quando ha id.
            readOnly={!criando}
            defaultValue={valores.email}
            className={`${getInputClasses(false)} ${criando ? "" : "cursor-not-allowed opacity-60"}`}
          />
        </Campo>

        <Campo id="login" rotulo="Login">
          <input
            id="login"
            name="login"
            type="text"
            defaultValue={valores.login}
            className={getInputClasses(false)}
          />
        </Campo>

        <Campo id="cargo" rotulo="Nível de acesso">
          <div className="relative">
            <select
              id="cargo"
              name="cargo"
              required
              value={cargo}
              onChange={(evento) => setCargo(evento.target.value)}
              className={`peer ${getInputClasses(false)} appearance-none pr-9`}
            >
              {NIVEIS_ACESSO.map((nivel) => (
                <option key={nivel.value} value={nivel.value}>
                  {nivel.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
          </div>
        </Campo>

        <Campo id="funcao" rotulo="Função" ajuda="Cargo descritivo. Ex: Ronda, Líder de limpeza.">
          <input
            id="funcao"
            name="funcao"
            type="text"
            defaultValue={valores.funcao}
            className={getInputClasses(false)}
          />
        </Campo>

        {/* Migration 0019. Não é o nível de acesso: diz o que a conta é, não
            quanto ela enxerga -- uma conta de integração pode precisar do
            alcance de um gestor sem ser uma pessoa da operação. */}
        <Campo
          id="tipo"
          rotulo="Tipo de usuário"
          ajuda="Contas de pessoa são Padrão. As demais marcam integrações."
          className="sm:col-span-2"
        >
          <div className="relative">
            <select
              id="tipo"
              name="tipo"
              required
              defaultValue={valores.tipo}
              className={`peer ${getInputClasses(false)} appearance-none pr-9`}
            >
              {TIPOS_USUARIO.map((tipo) => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
          </div>
        </Campo>

        <Campo id="superior_id" rotulo="Superior" className="sm:col-span-2">
          <div className="relative">
            <select
              id="superior_id"
              name="superior_id"
              defaultValue={valores.superiorId}
              className={`peer ${getInputClasses(false)} appearance-none pr-9`}
            >
              <option value="">Nenhum</option>
              {superiores.map((superior) => (
                <option key={superior.value} value={superior.value}>
                  {superior.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
          </div>
        </Campo>

        <Campo
          id="senha"
          rotulo={criando ? "Senha" : "Nova senha"}
          ajuda={criando ? undefined : "Deixe em branco para manter a senha atual."}
          className="sm:col-span-2"
        >
          <input
            id="senha"
            name="senha"
            type="password"
            required={criando}
            autoComplete="new-password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            className={getInputClasses(false)}
          />
          {/* Some quando o campo esta vazio numa edicao: ali "sem senha" e uma
              escolha valida (manter a atual), nao uma pendencia a cumprir. */}
          {(criando || senha !== "") && <PasswordRulesList password={senha} />}
        </Campo>
      </div>

      {/* Escopo do cliente (migration 0014). Sem vínculo nenhum um CLIENTE não
          enxerga operação alguma -- que é o padrão seguro, mas parece conta
          quebrada se ninguém avisar. Daí o aviso quando a lista está vazia. */}
      {ehCliente && (
        <fieldset className="rounded-md border border-slate-800 p-4">
          <legend className={`${rotuloClasses} mb-0 px-2`}>Grupos de sites visíveis</legend>

          {gruposSites.length === 0 ? (
            <p className="text-sm text-brand-muted">
              Nenhum grupo de sites cadastrado ainda. Cadastre um em Cadastros → Grupo de Sites.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-brand-muted">
                Um cliente só enxerga as coletas, os sites e os checkpoints dos grupos marcados
                aqui. Sem nenhum marcado, não vê nada.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {gruposSites.map((grupo) => (
                  <label
                    key={grupo.value}
                    htmlFor={`grupo-${grupo.value}`}
                    className="flex items-center gap-2 text-sm text-white"
                  >
                    <input
                      id={`grupo-${grupo.value}`}
                      type="checkbox"
                      name="grupos_do_cliente"
                      value={grupo.value}
                      defaultChecked={valores.gruposDoCliente.includes(grupo.value)}
                      className="h-4 w-4 rounded border-slate-700 bg-brand-navy accent-brand-green"
                    />
                    {grupo.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </fieldset>
      )}

      <div className="flex items-center gap-2">
        <input
          id="ativo"
          name="ativo"
          type="checkbox"
          defaultChecked={valores.ativo}
          className="h-4 w-4 rounded border-slate-700 bg-brand-navy accent-brand-green"
        />
        <label htmlFor="ativo" className="text-sm text-white">
          Ativo
        </label>
      </div>

      {/* Conta nova nasce inativa por decisao de banco (migration 0008). Este
          formulario e justamente o ato deliberado de ativacao que aquela
          migration exige, e o aviso explica por que o checkbox importa. */}
      <p className="text-xs text-brand-muted">
        Um usuário inativo não consegue acessar o sistema, mesmo com a senha correta.
      </p>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="flex h-10 items-center justify-center rounded-md bg-brand-green px-6 text-sm font-semibold text-brand-navy shadow-sm transition-all duration-200 hover:bg-brand-green-hover hover:shadow-lg hover:shadow-brand-green/30 focus:outline-none focus:ring-2 focus:ring-brand-green active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm disabled:active:scale-100"
        >
          {enviando ? "Salvando..." : "Salvar"}
        </button>
        <Link
          href={LISTAGEM}
          className="flex h-10 items-center justify-center rounded-md border border-slate-800 px-6 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-navy hover:text-white"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
