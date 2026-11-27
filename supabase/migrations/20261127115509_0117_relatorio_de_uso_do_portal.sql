-- ============================================================================
-- 0117: relatorio de uso do portal
--
-- Pedido do dono (25-27/11/2026), no lugar do Google Analytics: ver quem usa o
-- portal e quais telas abre, sem cookie novo e sem mandar nada ao Google. A
-- fonte e `eventos_de_uso` (0051), que o portal ja grava a cada login e a
-- cada tela aberta, sem valores de filtro nem dado de operacao.
--
-- Duas funcoes de soma, no banco como os outros relatorios (0049):
--   * `relatorio_uso_do_portal`: uma linha por pessoa no periodo.
--   * `relatorio_telas_do_portal`: uma linha por tela (rota normalizada).
--
-- SECURITY INVOKER: quem le e o RLS de `eventos_de_uso`. GESTOR e SUPERVISOR
-- veem todo mundo ("gestao le os eventos de uso", 0051); qualquer outro so o
-- proprio uso ("pessoa le o proprio uso", 0062). O nome vem de `profiles`,
-- tambem pelo RLS de quem pergunta.
--
-- O periodo e em dias de Brasilia, fim incluso, no maximo 366 dias (o
-- expurgo da 0052 apaga o que passa de 12 meses). Conta apagada (perfil_id
-- nulo, `on delete set null`) aparece numa linha so, "Conta apagada".
-- ============================================================================

create or replace function public.relatorio_uso_do_portal(
  p_inicio date,
  p_fim date,
  p_cargo text default null
)
returns table (
  perfil_id uuid,
  nome text,
  cargo text,
  logins integer,
  telas integer,
  dias_com_acesso integer,
  ultimo_acesso timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 366 then
    raise exception 'Período inválido: até 366 dias, com a data final depois da inicial.'
      using errcode = '22023';
  end if;

  return query
  select
    e.perfil_id,
    coalesce(max(p.nome_completo), 'Conta apagada')::text,
    coalesce(max(p.cargo), max(e.cargo))::text,
    (count(*) filter (where e.evento = 'login'))::integer,
    (count(*) filter (where e.evento = 'tela_aberta'))::integer,
    (count(distinct (e.criado_em at time zone 'America/Sao_Paulo')::date))::integer,
    max(e.criado_em)
  from public.eventos_de_uso e
  left join public.profiles p on p.id = e.perfil_id
  where e.criado_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
    and e.criado_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
    and (p_cargo is null or e.cargo = p_cargo)
  group by e.perfil_id
  order by max(e.criado_em) desc;
end;
$$;

create or replace function public.relatorio_telas_do_portal(
  p_inicio date,
  p_fim date,
  p_cargo text default null
)
returns table (
  rota text,
  aberturas integer,
  pessoas integer
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 366 then
    raise exception 'Período inválido: até 366 dias, com a data final depois da inicial.'
      using errcode = '22023';
  end if;

  return query
  select
    (e.detalhes ->> 'rota')::text,
    count(*)::integer,
    (count(distinct e.perfil_id))::integer
  from public.eventos_de_uso e
  where e.evento = 'tela_aberta'
    and e.detalhes ? 'rota'
    and e.criado_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
    and e.criado_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
    and (p_cargo is null or e.cargo = p_cargo)
  group by e.detalhes ->> 'rota'
  order by count(*) desc, 1;
end;
$$;

revoke all on function public.relatorio_uso_do_portal(date, date, text) from public, anon;
revoke all on function public.relatorio_telas_do_portal(date, date, text) from public, anon;
grant execute on function public.relatorio_uso_do_portal(date, date, text) to authenticated;
grant execute on function public.relatorio_telas_do_portal(date, date, text) to authenticated;
