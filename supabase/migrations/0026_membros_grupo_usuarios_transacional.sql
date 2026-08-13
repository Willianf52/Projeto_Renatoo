-- ============================================================================
-- VeloxLab — Sincronizacao de membros de grupo de usuarios, atomica
--
-- `sincronizarMembros` (grupo-de-usuarios/actions.ts) apagava todos os
-- vinculos do grupo e recriava os marcados em duas chamadas PostgREST
-- separadas -- dois round-trips, cada um sua propria transacao. Documentado
-- desde a 0016 como janela sem protecao, aceita porque a tabela so alimentava
-- um filtro de tela.
--
-- O risco real nao e a leitura concorrente que o comentario original cobria
-- -- e a escrita parcial: se o DELETE tiver sucesso e o INSERT falhar depois
-- (FK para um profile que sumiu entre o carregamento do formulario e o envio,
-- por exemplo), o grupo fica sem membro nenhum, e a action ja devolveu erro
-- para a pessoa -- que nao tem como saber que o estado anterior foi perdido
-- junto.
--
-- Esta funcao junta as duas operacoes numa unica chamada de RPC, que e uma
-- unica transacao no Postgres: se o INSERT falhar, o DELETE que rodou antes
-- dele na mesma funcao desfaz junto, automaticamente.
--
-- `security invoker` (o padrao, omitido de proposito -- nao e SECURITY
-- DEFINER) porque a autorizacao nao muda: quem chama continua sujeito as
-- mesmas policies de RLS que ja valem para DELETE/INSERT diretos em
-- `grupos_usuarios_membros` (migration 0016, via
-- `pode_administrar_grupos_usuarios()`). Reimplementar a checagem aqui dentro
-- seria duplicar a regra de autorizacao em dois lugares -- exatamente o que
-- este projeto tem evitado desde que a 0013 substituiu logica de permissao em
-- TypeScript por RPC para as funcoes do banco.
-- ============================================================================

create or replace function public.sincronizar_membros_grupo_usuarios(
  p_grupo_id bigint,
  p_membros uuid[]
)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.grupos_usuarios_membros where grupo_id = p_grupo_id;

  if p_membros is not null and array_length(p_membros, 1) > 0 then
    insert into public.grupos_usuarios_membros (grupo_id, profile_id)
    select p_grupo_id, membro
    from unnest(p_membros) as membro;
  end if;
end;
$$;

comment on function public.sincronizar_membros_grupo_usuarios(bigint, uuid[]) is
  'Substitui os membros de um grupo de usuarios pelo conjunto informado,
   atomicamente. security invoker de proposito: a autorizacao continua sendo
   a policy de RLS de grupos_usuarios_membros, nao uma checagem propria.';

revoke all on function public.sincronizar_membros_grupo_usuarios(bigint, uuid[]) from public;
grant execute on function public.sincronizar_membros_grupo_usuarios(bigint, uuid[]) to authenticated;
