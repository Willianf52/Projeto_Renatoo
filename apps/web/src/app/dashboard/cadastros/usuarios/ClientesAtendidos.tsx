"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { salvarClientesAtendidos } from "./clientes-atendidos-actions";

/**
 * Os clientes (grupos de sites) que a pessoa atende (0113), na ficha do
 * usuario. Marca e salva a lista inteira. Cadastro e consulta: nao muda o que
 * a pessoa enxerga no sistema.
 */
export function ClientesAtendidos({
  usuarioId,
  grupos,
  marcadosIniciais,
}: {
  usuarioId: string;
  grupos: { value: string; label: string }[];
  marcadosIniciais: number[];
}) {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(marcadosIniciais));
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return termo ? grupos.filter((g) => g.label.toLocaleLowerCase("pt-BR").includes(termo)) : grupos;
  }, [busca, grupos]);

  function alternar(id: number) {
    setMarcados((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(id)) novos.delete(id);
      else novos.add(id);
      return novos;
    });
    setMensagem(null);
  }

  async function salvar() {
    setSalvando(true);
    const resultado = await salvarClientesAtendidos(usuarioId, [...marcados]);
    setSalvando(false);
    setMensagem(resultado.erro ? { texto: resultado.erro, erro: true } : { texto: "Clientes atendidos salvos.", erro: false });
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-brand-muted">
        Os grupos de sites que esta pessoa atende. {marcados.size} marcado(s). Serve de cadastro e consulta; não muda o que
        ela vê no sistema.
      </p>
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar cliente"
        aria-label="Buscar cliente"
        className={getInputClasses(false)}
      />
      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-slate-800 p-2">
        {visiveis.map((g) => {
          const id = Number(g.value);
          return (
            <li key={g.value}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-white hover:bg-white/5">
                <input type="checkbox" checked={marcados.has(id)} onChange={() => alternar(id)} className="accent-brand-green" />
                {g.label}
              </label>
            </li>
          );
        })}
        {visiveis.length === 0 ? <li className="px-2 py-1 text-sm text-brand-muted">Nenhum cliente encontrado.</li> : null}
      </ul>
      <div className="flex items-center justify-between gap-3">
        {mensagem ? (
          <p role={mensagem.erro ? "alert" : "status"} className={`text-sm ${mensagem.erro ? "text-red-300" : "text-brand-green"}`}>
            {mensagem.texto}
          </p>
        ) : (
          <span />
        )}
        <Button type="button" loading={salvando} onClick={() => void salvar()}>
          Salvar clientes
        </Button>
      </div>
    </div>
  );
}
