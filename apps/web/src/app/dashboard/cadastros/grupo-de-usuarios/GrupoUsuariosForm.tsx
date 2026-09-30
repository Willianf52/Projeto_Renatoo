"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { SelecaoMultipla } from "@/components/dashboard/SelecaoMultipla";
import { getInputClasses } from "@/components/FormField";
import { salvarGrupoUsuarios, type EstadoDoFormulario, type ValoresDoGrupo } from "./actions";
import type { Opcao } from "./queries";

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function GrupoUsuariosForm({
  id,
  valoresIniciais,
  candidatos,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoGrupo;
  /** Ja vem indentado por hierarquia de chefia -- ver `getCandidatosAMembro`. */
  candidatos: Opcao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarGrupoUsuarios,
    {},
  );

  // Depois de uma recusa, o formulario volta com o que a pessoa tinha digitado,
  // e nao com o valor original do banco.
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
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          placeholder="Digite o nome do Grupo de Usuários"
          defaultValue={valores.nome}
          aria-invalid={Boolean(estado.erro)}
          className={getInputClasses(Boolean(estado.erro))}
        />
      </div>

      <div>
        <label htmlFor="descricao" className={rotuloClasses}>
          Descrição
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          defaultValue={valores.descricao}
          className={`${getInputClasses(false)} resize-y`}
        />
      </div>

      <div>
        <span className={rotuloClasses}>Usuários</span>

        <SelecaoMultipla
          name="membros"
          opcoes={candidatos}
          iniciais={valores.membros}
          rotuloDoItem="usuário"
          textoSemOpcoes="Nenhum usuário cadastrado ainda."
        />
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
