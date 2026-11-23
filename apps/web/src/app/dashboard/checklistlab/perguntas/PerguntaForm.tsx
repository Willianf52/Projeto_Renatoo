"use client";

import { useActionState, useState } from "react";
import {
  ROTULO_DO_TIPO_DE_RESPOSTA,
  TIPOS_DE_RESPOSTA,
  respostasDoTipo,
  rotuloDaResposta,
} from "@projeto-renatoo/shared";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarPergunta, type EstadoDoFormulario, type ValoresDaPergunta } from "./actions";
import type { OpcaoDeBase } from "./queries";

const LISTAGEM = "/dashboard/checklistlab/perguntas";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function PerguntaForm({
  id,
  valoresIniciais,
  modelos,
  grupos,
  eventos,
  bases,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDaPergunta;
  modelos: { value: string; label: string }[];
  grupos: { value: string; label: string }[];
  eventos: { value: string; label: string }[];
  /** Perguntas que podem ser base de condicional (0108), de todos os modelos. */
  bases: OpcaoDeBase[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarPergunta,
    {},
  );

  // Depois de uma recusa, o formulario volta com o que a pessoa tinha
  // digitado, e nao com o valor original do banco.
  const valores = estado.valores ?? valoresIniciais;
  const editando = id !== undefined;
  const nomeDoModelo = modelos.find((modelo) => modelo.value === valores.modelo)?.label ?? "";

  // O modelo e a base mudam o que a condicional oferece: a base precisa ser do
  // mesmo modelo, e as respostas-gatilho sao as do tipo da base. A `key` no
  // select de resposta reinicia a escolha quando a base troca.
  const [modeloEscolhido, setModeloEscolhido] = useState(valores.modelo);
  const [base, setBase] = useState(valores.base);
  const basesDoModelo = bases.filter((b) => b.modelo === modeloEscolhido && b.value !== String(id ?? ""));
  const tipoDaBase = basesDoModelo.find((b) => b.value === base)?.tipo;

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

      {/* Modelo e tipo so se escolhem no cadastro: a 0061 deixa os dois fora do
          grant de UPDATE, porque mover ou retipar pergunta ja respondida
          reinterpretaria as respostas antigas. Na edicao eles aparecem como
          texto, e o modelo vai escondido so para a volta cair na listagem
          filtrada por ele. */}
      {editando ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="modelo" value={valores.modelo} />
          <div>
            <span className={rotuloClasses}>Modelo</span>
            <p className="text-sm text-white">{nomeDoModelo}</p>
          </div>
          <div>
            <span className={rotuloClasses}>Respostas</span>
            <p className="text-sm text-white">{ROTULO_DO_TIPO_DE_RESPOSTA[valores.tipoResposta]}</p>
          </div>
          <p className="text-xs text-brand-muted sm:col-span-2">
            Modelo e respostas não mudam depois de cadastrada, para não mudar o sentido das respostas
            já dadas. Para trocar, desative esta pergunta e cadastre outra.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="modelo" className={rotuloClasses}>
              Modelo
              <span className="text-red-400"> *</span>
            </label>
            <div className="relative">
              <select
                id="modelo"
                name="modelo"
                required
                defaultValue={valores.modelo}
                onChange={(evento) => {
                  setModeloEscolhido(evento.target.value);
                  setBase("");
                }}
                className={`peer ${getInputClasses(false)} appearance-none pr-9`}
              >
                {modelos.map((modelo) => (
                  <option key={modelo.value} value={modelo.value}>
                    {modelo.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
            </div>
          </div>

          <div>
            <label htmlFor="tipo_resposta" className={rotuloClasses}>
              Respostas
            </label>
            <div className="relative">
              <select
                id="tipo_resposta"
                name="tipo_resposta"
                defaultValue={valores.tipoResposta}
                className={`peer ${getInputClasses(false)} appearance-none pr-9`}
              >
                {TIPOS_DE_RESPOSTA.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ROTULO_DO_TIPO_DE_RESPOSTA[tipo]}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
            </div>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="ordem" className={rotuloClasses}>
          Ordem
          <span className="text-red-400"> *</span>
        </label>
        <input
          id="ordem"
          name="ordem"
          type="number"
          min={1}
          max={9999}
          required
          defaultValue={valores.ordem}
          className={getInputClasses(Boolean(estado.erro))}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          Define a sequência em que a pergunta aparece no celular do inspetor. Dentro do mesmo
          modelo, dois números não podem se repetir. Para encaixar uma pergunta no meio da lista,
          renumere as seguintes.
        </p>
      </div>

      <div>
        <label htmlFor="texto" className={rotuloClasses}>
          Pergunta
          <span className="text-red-400"> *</span>
        </label>
        {/* `textarea` e nao `input`: a pergunta e lida na tela de um celular,
            e o campo precisa mostrar de uma vez o que vai caber la. */}
        <textarea
          id="texto"
          name="texto"
          rows={3}
          required
          maxLength={300}
          defaultValue={valores.texto}
          className={`${getInputClasses(Boolean(estado.erro))} resize-y`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="grupo" className={rotuloClasses}>
            Grupo de Perguntas
          </label>
          <div className="relative">
            <select
              id="grupo"
              name="grupo"
              defaultValue={valores.grupo}
              className={`peer ${getInputClasses(false)} appearance-none pr-9`}
            >
              <option value="">Sem grupo</option>
              {grupos.map((grupo) => (
                <option key={grupo.value} value={grupo.value}>
                  {grupo.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
          </div>
        </div>

        <div>
          <label htmlFor="evento" className={rotuloClasses}>
            Tipo de Evento
          </label>
          <div className="relative">
            <select
              id="evento"
              name="evento"
              defaultValue={valores.evento}
              aria-describedby="evento_ajuda"
              className={`peer ${getInputClasses(false)} appearance-none pr-9`}
            >
              <option value="">NÃO CONFORMIDADE</option>
              {eventos.map((evento) => (
                <option key={evento.value} value={evento.value}>
                  {evento.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
          </div>
          <p id="evento_ajuda" className="mt-1.5 text-xs text-brand-muted">
            A ocorrência que esta pergunta abrir no Painel de Eventos (com Não conforme, ou Sim nas de Sim/Não) sai com
            este evento.
          </p>
        </div>
      </div>

      {/* "Obrigatorio" (0099), como no sistema de referencia. */}
      <div>
        <label htmlFor="obrigatoria" className={rotuloClasses}>
          Obrigatória
        </label>
        <div className="relative">
          <select
            id="obrigatoria"
            name="obrigatoria"
            defaultValue={valores.obrigatoria ? "sim" : "nao"}
            className={`peer ${getInputClasses(false)} appearance-none pr-9`}
          >
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
        </div>
        <p className="mt-1.5 text-xs text-brand-muted">
          Não: o inspetor pode passar sem responder esta pergunta no app.
        </p>
      </div>

      {/* Peso e condicional (0108), como no cadastro do sistema de referencia. */}
      <div>
        <label htmlFor="peso" className={rotuloClasses}>
          Peso
        </label>
        <input
          id="peso"
          name="peso"
          type="number"
          min={1}
          max={10}
          required
          defaultValue={valores.peso}
          className={getInputClasses(Boolean(estado.erro))}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          De 1 a 10. A nota do checklist é a média ponderada: uma pergunta de peso 3 vale três vezes uma de peso 1.
        </p>
      </div>

      <fieldset className="space-y-3 rounded-md border border-slate-800 p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-brand-muted">
          Mostrar esta pergunta só quando
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="base" className={rotuloClasses}>
              Pergunta base
            </label>
            <div className="relative">
              <select
                id="base"
                name="base"
                value={base}
                onChange={(evento) => setBase(evento.target.value)}
                className={`peer ${getInputClasses(false)} appearance-none pr-9`}
              >
                <option value="">Sempre mostrar</option>
                {basesDoModelo.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>
                    {opcao.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
            </div>
          </div>
          {tipoDaBase ? (
            <div>
              <label htmlFor="gatilho" className={rotuloClasses}>
                For respondida com
                <span className="text-red-400"> *</span>
              </label>
              <div className="relative">
                <select
                  key={base}
                  id="gatilho"
                  name="gatilho"
                  required
                  defaultValue={base === valores.base ? valores.gatilho : ""}
                  className={`peer ${getInputClasses(false)} appearance-none pr-9`}
                >
                  <option value="">Escolha</option>
                  {respostasDoTipo(tipoDaBase).map((resposta) => (
                    <option key={resposta} value={resposta}>
                      {rotuloDaResposta(tipoDaBase, resposta)}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
              </div>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-brand-muted">
          Exemplo: &quot;Qual o problema?&quot; aparece só quando a anterior for Não conforme. A pergunta base é do
          mesmo modelo e não pode ser condicional. Escondida, a pergunta não é cobrada nem enviada.
        </p>
      </fieldset>

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
            <option value="ativo">Ativa</option>
            <option value="inativo">Inativa</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
        </div>
        <p className="mt-1.5 text-xs text-brand-muted">
          Inativa some do checklist do app, mas as respostas já dadas continuam guardadas. É por
          isso que não existe excluir aqui.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </Button>
        <Button
          href={valores.modelo ? `${LISTAGEM}?modelo=${encodeURIComponent(valores.modelo)}` : LISTAGEM}
          variant="secondary"
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
