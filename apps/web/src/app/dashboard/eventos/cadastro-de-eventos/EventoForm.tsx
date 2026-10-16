"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { SelecaoMultipla } from "@/components/dashboard/SelecaoMultipla";
import { getInputClasses } from "@/components/FormField";
import { salvarEvento, type EstadoDoFormulario, type ValoresDoEvento } from "./actions";
import type { Opcao } from "./queries";
import { LISTAGEM, MAXIMO_DE_EMAILS, UNIDADES } from "./regras";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Selecao({
  id,
  name,
  defaultValue,
  disabled,
  children,
}: {
  id: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`${getInputClasses(false)} appearance-none pr-9 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
    </div>
  );
}

/** Quantidade + unidade, como na referencia ("0" + "Minuto(s)/Hora(s)/Dia(s)"). */
function Prazo({
  prefixo,
  rotulo,
  ajuda,
  quantidade,
  unidade,
}: {
  prefixo: string;
  rotulo: string;
  ajuda: string;
  quantidade: string;
  unidade: string;
}) {
  return (
    <div>
      <label htmlFor={`${prefixo}_quantidade`} className={rotuloClasses}>
        {rotulo}
      </label>
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <input
          id={`${prefixo}_quantidade`}
          name={`${prefixo}_quantidade`}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={6}
          defaultValue={quantidade}
          aria-describedby={`${prefixo}_ajuda`}
          className={getInputClasses(false)}
        />
        <Selecao id={`${prefixo}_unidade`} name={`${prefixo}_unidade`} defaultValue={unidade}>
          {UNIDADES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </Selecao>
      </div>
      <p id={`${prefixo}_ajuda`} className="mt-1.5 text-xs text-brand-muted">
        {ajuda}
      </p>
    </div>
  );
}

export function EventoForm({
  id,
  valoresIniciais,
  superiores,
  temSubtipos,
  sites,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoEvento;
  superiores: Opcao[];
  temSubtipos: boolean;
  sites: Opcao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(salvarEvento, {});
  const valores = estado.valores ?? valoresIniciais;

  return (
    <form action={formAction} className="space-y-4 p-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="nome" className={rotuloClasses}>
            Nome<span className="text-red-400"> *</span>
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            maxLength={100}
            defaultValue={valores.nome}
            className={getInputClasses(false)}
          />
        </div>

        <div>
          <label htmlFor="superior_id" className={rotuloClasses}>
            Superior
          </label>
          <Selecao id="superior_id" name="superior_id" defaultValue={valores.superiorId} disabled={temSubtipos}>
            <option value="">Raiz</option>
            {superiores.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Selecao>
          <p className="mt-1.5 text-xs text-brand-muted">
            {temSubtipos
              ? "Este evento tem subtipos, então fica na raiz."
              : "Com um superior, este evento vira um SubTipo dele no Registrar Evento."}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="descricao" className={rotuloClasses}>
          Descrição
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          maxLength={1000}
          defaultValue={valores.descricao}
          className={`${getInputClasses(false)} resize-y`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Prazo
          prefixo="tempo"
          rotulo="Tempo para Atendimento"
          ajuda="Prazo para atender a ocorrência, mostrado no cadastro. Vazio ou 0: sem prazo."
          quantidade={valores.tempoQuantidade}
          unidade={valores.tempoUnidade}
        />
        <Prazo
          prefixo="bloqueio"
          rotulo="Bloqueio de Repetição"
          ajuda="No Registrar Evento, recusa outro deste evento no mesmo site dentro do intervalo. Vazio ou 0: sem bloqueio."
          quantidade={valores.bloqueioQuantidade}
          unidade={valores.bloqueioUnidade}
        />
      </div>

      <div>
        <label htmlFor="emails" className={rotuloClasses}>
          E-mails
        </label>
        <textarea
          id="emails"
          name="emails"
          rows={2}
          defaultValue={valores.emails}
          aria-describedby="emails_ajuda"
          className={`${getInputClasses(false)} resize-y`}
        />
        <p id="emails_ajuda" className="mt-1.5 text-xs text-brand-muted">
          Recebem o aviso quando abre uma ocorrência deste evento, junto com os contatos do site. Separe por vírgula; até{" "}
          {MAXIMO_DE_EMAILS}.
        </p>
      </div>

      <div>
        <span className={rotuloClasses}>Sites</span>
        <SelecaoMultipla
          name="sites"
          opcoes={sites}
          iniciais={valores.sites}
          rotuloDoItem="site"
          textoSemOpcoes="Nenhum site cadastrado ainda."
        />
        <p className="mt-1.5 text-xs text-brand-muted">Nenhum marcado: o evento vale para todos os sites.</p>
      </div>

      <div className="md:w-1/2">
        <label htmlFor="status" className={rotuloClasses}>
          Status
        </label>
        <Selecao id="status" name="status" defaultValue={valores.ativo ? "ativo" : "inativo"}>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </Selecao>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
