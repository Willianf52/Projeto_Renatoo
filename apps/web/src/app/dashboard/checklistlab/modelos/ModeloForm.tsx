"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { SelecaoMultipla, type OpcaoDeSelecao } from "@/components/dashboard/SelecaoMultipla";
import { getInputClasses } from "@/components/FormField";
import { salvarModelo, type EstadoDoFormulario, type ValoresDoModelo } from "./actions";

const LISTAGEM = "/dashboard/checklistlab/modelos";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function ModeloForm({
  id,
  padrao = false,
  valoresIniciais,
  grupos,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  /** O modelo padrao nao se liga a grupo nem pode ser desligado. */
  padrao?: boolean;
  valoresIniciais: ValoresDoModelo;
  grupos: OpcaoDeSelecao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(salvarModelo, {});

  // Depois de uma recusa, o formulario volta com o que a pessoa tinha
  // digitado, e nao com o valor original do banco.
  const valores = estado.valores ?? valoresIniciais;

  return (
    <form action={formAction} className="space-y-4 p-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      {estado.erro && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {estado.erro}
        </p>
      )}

      <div>
        <label htmlFor="nome" className={rotuloClasses}>
          Nome
          <span className="text-red-400"> *</span>
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          maxLength={200}
          placeholder="Ex.: Condomínios - Portaria"
          defaultValue={valores.nome}
          aria-invalid={Boolean(estado.erro)}
          className={getInputClasses(Boolean(estado.erro))}
        />
      </div>

      {/* "Descricao" (0099), como no sistema de referencia: opcional. */}
      <div>
        <label htmlFor="descricao" className={rotuloClasses}>
          Descrição
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          maxLength={500}
          defaultValue={valores.descricao}
          className={getInputClasses(false)}
        />
      </div>

      {padrao ? (
        <p className="rounded-md border border-slate-800 bg-brand-navy px-4 py-3 text-sm text-brand-muted">
          Este é o modelo padrão: vale para todo grupo de sites que não tem modelo próprio. Por isso
          ele não é ligado a grupos e não pode ser desativado.
        </p>
      ) : (
        <>
          <div>
            <span className={rotuloClasses}>Grupos de Sites</span>
            <SelecaoMultipla
              name="grupos"
              opcoes={grupos}
              iniciais={valores.grupos}
              rotuloDoItem="grupo"
              textoSemOpcoes="Nenhum grupo de sites cadastrado ainda."
            />
            <p className="mt-1.5 text-xs text-brand-muted">
              Os sites destes grupos respondem este checklist. Se um grupo tiver mais de um modelo, o
              inspetor escolhe no celular. Grupo sem modelo nenhum usa o modelo padrão.
            </p>
          </div>

          <div>
            <label htmlFor="status" className={rotuloClasses}>
              Status
            </label>
            <div className="relative">
              <select
                id="status"
                name="status"
                defaultValue={valores.ativo ? "ativo" : "inativo"}
                className={`peer ${getInputClasses(false)} appearance-none pr-9`}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
            </div>
            <p className="mt-1.5 text-xs text-brand-muted">
              Inativo some do app, e os grupos dele passam a usar o que sobrar (ou o padrão). Os
              checklists já respondidos continuam guardados, por isso não existe excluir.
            </p>
          </div>
        </>
      )}

      {/* "Exige aprovacao" (0089): como o "Aguardando Autorizacao" do sistema de referencia. */}
      <label className="flex items-start gap-2 text-sm text-white">
        <input type="checkbox" name="exige_aprovacao" defaultChecked={valores.exigeAprovacao} className="mt-1" />
        <span>
          Exige aprovação
          <span className="block text-xs text-brand-muted">
            O checklist enviado fica &quot;Aguardando Autorização&quot; até a gestão aprovar ou reprovar no Histórico.
          </span>
        </span>
      </label>

      {/* "Foto obrigatoria" (0091): como o checklist dos carros no sistema de referencia. */}
      <label className="flex items-start gap-2 text-sm text-white">
        <input type="checkbox" name="foto_obrigatoria" defaultChecked={valores.fotoObrigatoria} className="mt-1" />
        <span>
          Foto obrigatória em todas as perguntas
          <span className="block text-xs text-brand-muted">
            O app só deixa finalizar o checklist depois que cada pergunta tiver ao menos uma foto. Desmarcado, a foto
            é opcional.
          </span>
        </span>
      </label>

      {/* "Assinaturas" (0092): os checklists dos carros pedem uma so, como no sistema de referencia. */}
      <div>
        <label htmlFor="quantidade_de_assinaturas" className={rotuloClasses}>
          Assinaturas exigidas
        </label>
        <div className="relative">
          <select
            id="quantidade_de_assinaturas"
            name="quantidade_de_assinaturas"
            defaultValue={String(valores.quantidadeDeAssinaturas)}
            className={`peer ${getInputClasses(false)} appearance-none pr-9`}
          >
            <option value="2">2 assinaturas</option>
            <option value="1">1 assinatura</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
        </div>
        <p className="mt-1.5 text-xs text-brand-muted">
          Quantas assinaturas, cada uma com o nome de quem assinou, o app exige para finalizar o checklist.
        </p>
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
