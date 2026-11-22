import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UserIcon } from "@/components/dashboard/icons";
import { linkDaFoto } from "@/lib/foto-do-usuario";
import { filtroDeUuid } from "@/lib/id-na-url";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { EditorDeFoto } from "@/app/dashboard/minha-foto/EditorDeFoto";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClientesAtendidos } from "../../ClientesAtendidos";
import { UsuarioForm } from "../../UsuarioForm";
import { getDadosPessoais } from "../../ler-dados-pessoais";
import {
  getEscopoDoCliente,
  getGruposSitesParaEscopo,
  getListasDoUsuario,
  getSuperiores,
  getUsuario,
} from "../../queries";

const LISTAGEM = "/dashboard/cadastros/usuarios";

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo (permissao e
 * consultas recortadas por RLS) travava a navegacao ate tudo voltar -- ver
 * `site-planta/novo/page.tsx`.
 */
export default function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={8} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // `profiles.id` e uuid. Um id malformado NAO "simplesmente nao acha
  // ninguem": o Postgres recusa a consulta (22P02), `getUsuario` lanca e a
  // tela caia em erro em vez de 404 -- ver `lib/id-na-url.ts`.
  if (filtroDeUuid(id) === undefined) notFound();

  if (!(await podeAdministrarUsuarios())) {
    redirect(LISTAGEM);
  }

  // `getDadosPessoais` le com a service_role: so depois da checagem acima.
  const [usuario, superiores, gruposSites, escopo, dadosPessoais, listas] = await Promise.all([
    getUsuario(id),
    getSuperiores(id),
    getGruposSitesParaEscopo(),
    getEscopoDoCliente(id),
    getDadosPessoais(id),
    getListasDoUsuario(),
  ]);
  if (!usuario) notFound();
  // A foto do usuario (0112): o GESTOR coloca, troca ou remove.
  const foto = await linkDaFoto(usuario.id).catch(() => null);

  // Ficha do supervisor/usuario (pedido do gestor, Fase 2): os clientes que
  // ele atende (0113) e os veiculos no nome dele (0104/0109).
  const supabase = await createClient();
  const [atendidos, veiculos] = await Promise.all([
    supabase.from("clientes_atendidos").select("grupo_site_id").eq("usuario_id", usuario.id),
    supabase.from("veiculos").select("id, placa, modelo, ativo").eq("usuario_id", usuario.id).order("modelo"),
  ]);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "Cadastros" },
            { label: "Usuários" },
            { label: usuario.nome_completo || usuario.email },
          ]}
        />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UserIcon className="h-4 w-4" />
            Editar Usuário
          </h1>
        </div>

        <UsuarioForm
          id={usuario.id}
          superiores={superiores}
          listas={listas}
          gruposSites={gruposSites}
          valoresIniciais={{
            nomeCompleto: usuario.nome_completo ?? "",
            email: usuario.email,
            // Sempre vazia: a senha atual nao e legivel nem pelo service_role,
            // e em branco quer dizer "manter" na action.
            senha: "",
            login: usuario.login ?? "",
            funcao: usuario.funcao ?? "",
            pais: usuario.pais,
            lingua: usuario.lingua,
            setorId: usuario.setor_id ? String(usuario.setor_id) : "",
            alertaPanicoId: usuario.alerta_panico_id ? String(usuario.alerta_panico_id) : "",
            cargo: usuario.cargo,
            tipo: usuario.tipo,
            superiorId: usuario.superior_id ?? "",
            ativo: usuario.ativo,
            gruposDoCliente: escopo,
            ...dadosPessoais,
            emailSuperiorOcorrencia: usuario.email_superior_ocorrencia ?? false,
            emailSuperiorChecklist: usuario.email_superior_checklist ?? false,
            emailSuperiorEvento: usuario.email_superior_evento ?? false,
          }}
        />
      </div>

      <section className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Clientes atendidos</h2>
        <ClientesAtendidos
          usuarioId={usuario.id}
          grupos={gruposSites}
          marcadosIniciais={(atendidos.data ?? []).map((a) => a.grupo_site_id)}
        />
      </section>

      <section className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Veículos</h2>
        {(veiculos.data ?? []).length === 0 ? (
          <p className="px-4 py-4 text-sm text-brand-muted">
            Nenhum veículo no nome desta pessoa. Ligue um em{" "}
            <Link href="/dashboard/cadastros/veiculos" className="text-brand-green underline">
              Cadastros &gt; Veículos
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {(veiculos.data ?? []).map((v) => (
              <li key={v.id}>
                <Link
                  href={`/dashboard/cadastros/veiculos/${v.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm text-white hover:bg-white/5"
                >
                  <span>
                    {v.modelo} · {v.placa.length === 7 ? `${v.placa.slice(0, 3)}-${v.placa.slice(3)}` : v.placa}
                  </span>
                  <span className="text-xs text-brand-muted">{v.ativo ? "Ativo" : "Inativo"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Foto</h2>
        <EditorDeFoto usuarioId={usuario.id} fotoAtual={foto} />
      </section>
    </div>
  );
}
