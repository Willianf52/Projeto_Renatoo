"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { SelecaoMultipla, type OpcaoDeSelecao } from "@/components/dashboard/SelecaoMultipla";
import { enviarEventoPorEmail, type EstadoDoEnvio } from "./actions";
import { MAXIMO_DE_DESTINATARIOS } from "./andamentos";

/**
 * "Enviar Evento" do detalhe, como o envelope do sistema de referencia:
 * "Destinatarios" (pessoas do portal) e o botao. Cada pessoa recebe o evento
 * no e-mail do cadastro; a entrega e da fila (0065/0081).
 */
export function FormularioDeEnvio({ ocorrenciaId, usuarios }: { ocorrenciaId: number; usuarios: OpcaoDeSelecao[] }) {
  const [estado, formAction, enviando] = useActionState<EstadoDoEnvio, FormData>(enviarEventoPorEmail, {});

  return (
    <form action={formAction} className="space-y-4 p-4">
      <input type="hidden" name="ocorrencia_id" value={ocorrenciaId} />
      <div>
        <span className="mb-1 block text-sm font-medium text-white">Destinatários</span>
        <p className="mb-2 text-xs text-brand-muted">
          Cada pessoa escolhida recebe este evento no e-mail do cadastro (até {MAXIMO_DE_DESTINATARIOS}).
        </p>
        <SelecaoMultipla
          name="destinatarios"
          opcoes={usuarios}
          iniciais={[]}
          rotuloDoItem="destinatário"
          textoSemOpcoes="Nenhum usuário cadastrado ainda."
        />
      </div>

      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {estado.erro}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={enviando}>
          Enviar Evento
        </Button>
      </div>
    </form>
  );
}
