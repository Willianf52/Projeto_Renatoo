"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { SelecaoMultipla, type OpcaoDeSelecao } from "@/components/dashboard/SelecaoMultipla";
import { getInputClasses } from "@/components/FormField";
import { salvarModelo, type EstadoDoFormulario, type ValoresDoModelo } from "./actions";

const LISTAGEM = "/dashboard/checklistlab/modelos";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";
const ajudaClasses = "mt-1.5 text-xs text-brand-muted";

function Seta() {
  return (
    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
  );
}

/**
 * "Adicionar Checklist", na ordem e com os nomes do formulario do sistema
 * antigo (dono, 23/11/2026): Nome, Descricao, Ordenacao das perguntas, Grupo
 * de Sites, Assinaturas, Requer aprovacao e Qtd. minima de caracteres no campo
 * Observacao. Os campos do antigo que aqui ainda nao funcionam (Usuarios,
 * Envio Email, Tipo de calculo, Layout PDF...) ficam de fora de proposito: um
 * campo que nao muda nada enganaria quem cadastra. Os dois que so existem no
 * novo (Foto obrigatoria e Status) vem no fim.
 */
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

      {/* "Ordenacao das perguntas" do sistema antigo: Randomica ou Na ordem (0108). */}
      <div>
        <label htmlFor="ordenacao_perguntas" className={rotuloClasses}>
          Ordenação das perguntas
          <span className="text-red-400"> *</span>
        </label>
        <div className="relative">
          <select
            id="ordenacao_perguntas"
            name="ordenacao_perguntas"
            required
            defaultValue={valores.ordemAleatoria ? "1" : "2"}
            className={`peer ${getInputClasses(false)} appearance-none pr-9`}
          >
            <option value="1">Randômica</option>
            <option value="2">Na ordem</option>
          </select>
          <Seta />
        </div>
        <p className={ajudaClasses}>
          Randômica: o app embaralha as perguntas dentro de cada grupo, e cada inspeção vê a sua ordem (sempre a mesma
          enquanto é respondida). A pergunta condicional continua logo depois da pergunta base.
        </p>
      </div>

      {padrao ? (
        <p className="rounded-md border border-slate-800 bg-brand-navy px-4 py-3 text-sm text-brand-muted">
          Este é o modelo padrão: vale para todo grupo de sites que não tem modelo próprio. Por isso
          ele não é ligado a grupos e não pode ser desativado.
        </p>
      ) : (
        <div>
          <span className={rotuloClasses}>Grupo de Sites</span>
          <SelecaoMultipla
            name="grupos"
            opcoes={grupos}
            iniciais={valores.grupos}
            rotuloDoItem="grupo"
            textoSemOpcoes="Nenhum grupo de sites cadastrado ainda."
          />
          <p className={ajudaClasses}>
            Os sites destes grupos respondem este checklist. Se um grupo tiver mais de um checklist, o inspetor
            escolhe no celular. Grupo sem checklist nenhum usa o padrão.
          </p>
        </div>
      )}

      {/* "Assinaturas" (0092): os checklists dos carros pedem uma so, como no sistema de referencia. */}
      <div>
        <label htmlFor="quantidade_de_assinaturas" className={rotuloClasses}>
          Assinaturas
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
          <Seta />
        </div>
        <p className={ajudaClasses}>
          Quantas assinaturas, cada uma com o nome de quem assinou, o app exige para finalizar o checklist.
        </p>
      </div>

      {/* "Requer aprovacao" (0089): como o "Aguardando Autorizacao" do sistema de referencia. */}
      <label className="flex items-start gap-2 text-sm text-white">
        <input type="checkbox" name="exige_aprovacao" defaultChecked={valores.exigeAprovacao} className="mt-1" />
        <span>
          Requer aprovação
          <span className="block text-xs text-brand-muted">
            O checklist enviado fica &quot;Aguardando Autorização&quot; até a gestão aprovar ou reprovar no Histórico.
          </span>
        </span>
      </label>

      {/* "Qtd. minima de caracteres no campo Observacao" (0115), por checklist. */}
      <div>
        <label htmlFor="min_caracteres_observacao" className={rotuloClasses}>
          Qtd. mínima de caracteres no campo Observação
        </label>
        <input
          id="min_caracteres_observacao"
          name="min_caracteres_observacao"
          type="number"
          min={0}
          max={500}
          defaultValue={valores.minCaracteresObservacao}
          className={`${getInputClasses(false)} max-w-[10rem]`}
        />
        <p className={ajudaClasses}>
          Mínimo de caracteres que o inspetor precisa escrever na observação do Não conforme. Vazio: vale o de
          Cadastros &gt; Cliente.
        </p>
      </div>

      {/* So no portal novo: "Foto obrigatoria" (0091), como o checklist dos carros. */}
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

      {padrao ? null : (
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
            <Seta />
          </div>
          <p className={ajudaClasses}>
            Inativo some do app, e os grupos dele passam a usar o que sobrar (ou o padrão). Os
            checklists já respondidos continuam guardados, por isso não existe excluir.
          </p>
        </div>
      )}

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
