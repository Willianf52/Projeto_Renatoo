-- ============================================================================
-- 0076 — Nome de quem fez a coleta, para todo cargo que ve as coletas
--
-- A 0075 deixou todo usuario ativo que nao e CLIENTE ver as visitas e
-- leituras de todos os inspetores. Mas `profiles` continua legivel so para o
-- proprio usuario e para GESTOR/SUPERVISOR (`pode_ver_toda_operacao`): um
-- INSPETOR via a coleta de outro inspetor com o nome em branco (achado pelo
-- dono em 20/10/2026), em Coletas Importadas, nos relatorios de Inspecoes e
-- na lista do filtro Funcionario.
--
-- Decisao do dono (20/10/2026): liberar SO O NOME (e o cargo/ativo, que os
-- filtros usam), nao a linha inteira de `profiles` -- e-mail, login, funcao e
-- superior continuam so para GESTOR e SUPERVISOR. RLS e por linha, nao por
-- coluna, entao a saida e por funcoes que devolvem so essas colunas:
--
--   - `autorizacao.nome_do_perfil(uuid)`: o nome de um usuario, para quem pode
--     ver as coletas de todos (ativo e nao CLIENTE) ou para o proprio. Security
--     definer: le `profiles` por cima do RLS e decide aqui quem recebe.
--   - `autorizacao.usuarios_visiveis()`: id, nome, cargo e ativo de todos, na
--     mesma regra; quem nao passa recebe so a propria linha.
--   - Envelopes `security invoker` em public (regra da 0050):
--     `public.usuarios_visiveis()` (RPC dos filtros) e
--     `public.nome_do_funcionario(visitas)`, campo computado que o PostgREST
--     expoe como `visitas(nome_do_funcionario)`.
--   - Os tres relatorios que faziam `left join profiles` passam a pedir o nome
--     a `nome_do_perfil`.
--
-- CLIENTE nao muda: continua sem nome de usuario nenhum, como antes.
-- Nenhuma escrita muda. Desfazer: recriar os tres relatorios com o join da
-- 0049 e apagar as quatro funcoes.
-- ============================================================================

create or replace function autorizacao.nome_do_perfil(p_id uuid)
returns text
language sql
stable
security definer
set search_path = autorizacao, public, pg_temp
as $$
  select p.nome_completo
    from public.profiles p
   where p.id = p_id
     and (
       p.id = auth.uid()
       or (autorizacao.usuario_ativo() and not autorizacao.e_cliente())
     );
$$;

create or replace function autorizacao.usuarios_visiveis()
returns table (id uuid, nome_completo text, cargo text, ativo boolean)
language sql
stable
security definer
set search_path = autorizacao, public, pg_temp
as $$
  select p.id, p.nome_completo, p.cargo, p.ativo
    from public.profiles p
   where p.id = auth.uid()
      or (autorizacao.usuario_ativo() and not autorizacao.e_cliente());
$$;

revoke all on function autorizacao.nome_do_perfil(uuid) from public, anon;
revoke all on function autorizacao.usuarios_visiveis() from public, anon;
grant execute on function autorizacao.nome_do_perfil(uuid) to authenticated;
grant execute on function autorizacao.usuarios_visiveis() to authenticated;

create or replace function public.usuarios_visiveis()
returns table (id uuid, nome_completo text, cargo text, ativo boolean)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from autorizacao.usuarios_visiveis();
$$;

create or replace function public.nome_do_funcionario(v public.visitas)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select autorizacao.nome_do_perfil(v.funcionario_id);
$$;

revoke all on function public.usuarios_visiveis() from public, anon;
revoke all on function public.nome_do_funcionario(public.visitas) from public, anon;
grant execute on function public.usuarios_visiveis() to authenticated;
grant execute on function public.nome_do_funcionario(public.visitas) to authenticated;

-- Relatorios: o mesmo corpo da 0049, com o nome vindo de `nome_do_perfil`.
create or replace function public.relatorio_inspecoes_inicio_fim(
  p_inicio timestamptz, p_fim timestamptz, p_filtros jsonb default '{}'::jsonb
)
returns table (visita_id bigint, inicio timestamptz, termino timestamptz, duracao_ms bigint,
               usuario text, regional text, site text, evento text)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    v.visita_id,
    v.inicio,
    v.termino,
    round(extract(epoch from (v.termino - v.inicio)) * 1000)::bigint,
    coalesce(autorizacao.nome_do_perfil(v.funcionario_id), ''),
    coalesce(s.regional, ''),
    s.nome,
    coalesce(e.nome, '')
  from public.visitas_do_periodo(p_inicio, p_fim, p_filtros) v
  join public.sites s on s.id = v.site_id
  left join public.eventos e on e.id = v.evento_id
  where v.inicio is not null
    and v.termino is not null
    and v.termino > v.inicio
$$;

create or replace function public.relatorio_ranking_de_inspecoes(
  p_inicio timestamptz, p_fim timestamptz, p_filtros jsonb default '{}'::jsonb
)
returns table (funcionario_id uuid, nome text, quantidade integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select v.funcionario_id, coalesce(autorizacao.nome_do_perfil(v.funcionario_id), ''), count(*)::integer
  from public.visitas_do_periodo(p_inicio, p_fim, p_filtros) v
  where v.funcionario_id is not null
  group by v.funcionario_id
$$;

create or replace function public.relatorio_visitas_de_supervisao(
  p_site bigint, p_inicio timestamptz, p_fim timestamptz
)
returns table (visita_id bigint, data_hora timestamptz, funcionario text, local text,
               tem_localizacao boolean, motivo_visita text, observacao text)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    v.visita_id,
    v.primeira_leitura,
    coalesce(autorizacao.nome_do_perfil(v.funcionario_id), ''),
    coalesce(s.nome, ''),
    v.tem_localizacao,
    coalesce(m.nome, ''),
    coalesce(v.observacao, '')
  from public.visitas_do_periodo(p_inicio, p_fim, jsonb_build_object('site', p_site)) v
  left join public.sites s on s.id = v.site_id
  left join public.motivos_visita m on m.id = v.motivo_visita_id
$$;
