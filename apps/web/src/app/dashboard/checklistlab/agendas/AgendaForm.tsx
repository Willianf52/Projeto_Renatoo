"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { SelecaoMultipla } from "@/components/dashboard/SelecaoMultipla";
import { salvarAgenda, type EstadoDoFormulario } from "./actions";
import type { OpcoesDaAgenda } from "./queries";
import { LISTAGEM, RECORRENCIAS, type ValoresDaAgenda } from "./regras";

const rotulo = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Selecao({
  id,
  defaultValue,
  vazio,
  opcoes,
}: {
  id: string;
  defaultValue: string;
  vazio?: string;
  opcoes: { value: string; label: string }[];
}) {
  return (
    <select id={id} name={id} defaultValue={defaultValue} className={getInputClasses(false)}>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {opcoes.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * "Criar Agenda" (0084): o checklist, os sites, a recorrencia entre duas
 * datas, a tolerancia e de quem e a responsabilidade. Os sites daqui sao o
 * "Adicionar/Remover Locais" e o responsavel o "trocar responsavel" do antigo.
 */
export function AgendaForm({
  id,
  valoresIniciais,
  opcoes,
}: {
  id?: number;
  valoresIniciais: ValoresDaAgenda;
  opcoes: OpcoesDaAgenda;
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(salvarAgenda, {});
  const v = estado.valores ?? valoresIniciais;

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
          <label htmlFor="nome" className={rotulo}>
            Nome da Agenda<span className="text-red-400"> *</span>
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            maxLength={100}
            defaultValue={v.nome}
            className={getInputClasses(false)}
          />
        </div>
        <div>
          <label htmlFor="modelo_id" className={rotulo}>
            Checklist<span className="text-red-400"> *</span>
          </label>
          <Selecao id="modelo_id" defaultValue={v.modeloId} vazio="Selecione" opcoes={opcoes.modelos} />
        </div>
      </div>

      <div>
        <span className={rotulo}>
          Sites<span className="text-red-400"> *</span>
        </span>
        <SelecaoMultipla
          name="sites"
          opcoes={opcoes.sites}
          iniciais={v.sites}
          rotuloDoItem="site"
          textoSemOpcoes="Nenhum site cadastrado."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <span className={rotulo}>
            Data Inicial<span className="text-red-400"> *</span>
          </span>
          <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={v.dataInicial} />
        </div>
        <div>
          <span className={rotulo}>
            Data Final<span className="text-red-400"> *</span>
          </span>
          <FilterDatePicker label="Data Final" name="data_final" defaultValue={v.dataFinal} />
        </div>
        <div>
          <label htmlFor="recorrencia" className={rotulo}>
            Padrão de Recorrência<span className="text-red-400"> *</span>
          </label>
          <Selecao
            id="recorrencia"
            defaultValue={v.recorrencia}
            opcoes={RECORRENCIAS.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
        <div>
          <label htmlFor="tolerancia_dias" className={rotulo}>
            Tolerância (dias)
          </label>
          <input
            id="tolerancia_dias"
            name="tolerancia_dias"
            type="text"
            inputMode="numeric"
            defaultValue={v.toleranciaDias}
            className={getInputClasses(false)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="responsavel_id" className={rotulo}>
            Responsável
          </label>
          <Selecao id="responsavel_id" defaultValue={v.responsavelId} vazio="Nenhum" opcoes={opcoes.usuarios} />
        </div>
        <div>
          <label htmlFor="grupo_usuario_id" className={rotulo}>
            Grupo de Usuários
          </label>
          <Selecao id="grupo_usuario_id" defaultValue={v.grupoUsuarioId} vazio="Nenhum" opcoes={opcoes.grupos} />
        </div>
        <div>
          <label htmlFor="status" className={rotulo}>
            Status
          </label>
          <select id="status" name="status" defaultValue={v.ativo ? "ativo" : "inativo"} className={getInputClasses(false)}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-brand-muted">
        Cada data da recorrência, em cada site, vira um agendamento. Ele fica Finalizado quando um checklist deste
        modelo é feito no site entre a data planejada e o fim da tolerância.
      </p>

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
