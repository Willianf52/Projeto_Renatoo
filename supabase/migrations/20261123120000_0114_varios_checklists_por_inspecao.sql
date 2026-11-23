-- ============================================================================
-- 0114: varios checklists na mesma inspecao
--
-- Comparacao com o app antigo (17/11/2026, item 6), pedido do dono em
-- 22/11/2026: dentro de uma inspecao o inspetor responde quantos checklists
-- quiser, e a inspecao so termina no "Finalizar inspecao". Se ele esquecer,
-- a inspecao fecha sozinha a meia-noite, com o Termino na hora do ultimo
-- checklist (decisao do dono).
--
-- 1) Sai a unique `checklists_visita_visita_unica` (0042). Ela tambem
--    segurava o REENVIO do app (resposta perdida na rede, o inspetor toca de
--    novo). Essa guarda passa para `assinatura_path`: o app reaproveita o
--    mesmo caminho da assinatura em toda tentativa do mesmo formulario
--    (`midiaJaEnviada`), entao o reenvio colide aqui; um checklist novo tem
--    assinatura nova.
--
-- 2) `visitas.finalizada_em`: quando a inspecao foi finalizada. NAO da para
--    usar "tem Termino": desde a 0096 todo checklist enviado grava o Termino
--    (e a `um_termino_por_visita` o empurra para o ultimo), entao com varios
--    checklists o Termino existe antes de a inspecao acabar. Quem preenche:
--      - o Termino gravado PELO APP ("Finalizar inspecao", "Converter para
--        Visita", "Encerrar ronda"), direto ou pela fila sem sinal -- o
--        gatilho abaixo, antes da `um_termino_por_visita`;
--      - o job da meia-noite, para a inspecao esquecida com checklist.
--    O Termino que o envio do checklist grava (0096, de dentro de outro
--    gatilho) NAO finaliza.
--
-- 3) Metas de visita (0105-0107) contam VISITAS: uma inspecao com tres
--    checklists e uma visita ao lugar.
-- ============================================================================

-- 1) Varios checklists por visita; o reenvio bate na assinatura ------------
alter table public.checklists_visita drop constraint if exists checklists_visita_visita_unica;
create unique index if not exists checklists_visita_assinatura_unica
  on public.checklists_visita (assinatura_path);

comment on index public.checklists_visita_assinatura_unica is
  'Reenvio do mesmo formulario (mesma assinatura) nao vira um segundo checklist (0114).';

-- 2) Inspecao finalizada ----------------------------------------------------
alter table public.visitas add column if not exists finalizada_em timestamptz;

comment on column public.visitas.finalizada_em is
  'Quando a inspecao foi finalizada: Termino gravado pelo app ou fechamento automatico a meia-noite (0114). Nulo: em andamento.';

-- As que ja existem: toda visita com Termino estava encerrada pela regra de
-- antes (um checklist fechava a inspecao).
update public.visitas v
   set finalizada_em = t.fim
  from (
    select l.visita_id, max(l.data_hora) as fim
      from public.leituras l
      join public.areas a on a.id = l.area_id and a.nome = 'Término'
     group by l.visita_id
  ) t
 where t.visita_id = v.id
   and v.finalizada_em is null;

create or replace function manutencao.termino_finaliza_a_inspecao()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $function$
begin
  -- So o Termino gravado direto (app, fila, importacao). O do envio do
  -- checklist vem de dentro do gatilho da 0096 (profundidade 2) e nao fecha.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.area_id is distinct from (select a.id from public.areas a where a.nome = 'Término') then
    return new;
  end if;

  update public.visitas
     set finalizada_em = greatest(new.data_hora, coalesce(finalizada_em, new.data_hora))
   where id = new.visita_id;
  return new;
end;
$function$;

revoke all on function manutencao.termino_finaliza_a_inspecao() from public, anon, authenticated;

-- BEFORE e com nome que vem antes de `um_termino_por_visita` na ordem
-- alfabetica: aquela devolve null quando ja ha Termino (so empurra a hora), e
-- um gatilho AFTER nem chegaria a rodar.
drop trigger if exists finaliza_a_inspecao_pelo_termino on public.leituras;
create trigger finaliza_a_inspecao_pelo_termino
  before insert on public.leituras
  for each row execute function manutencao.termino_finaliza_a_inspecao();

-- A meia-noite: a inspecao com checklist e sem "Finalizar" fecha sozinha,
-- com o Termino (ja gravado pelo ultimo checklist, 0096) como hora. So as
-- abertas a partir desta migration: as anteriores ja estao finalizadas acima.
create or replace function manutencao.fechar_inspecoes_esquecidas()
returns integer
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $function$
declare
  v_hoje timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  v_total integer;
begin
  update public.visitas v
     set finalizada_em = coalesce(
           (select max(l.data_hora)
              from public.leituras l
              join public.areas a on a.id = l.area_id and a.nome = 'Término'
             where l.visita_id = v.id),
           (select max(c.criado_em) from public.checklists_visita c where c.visita_id = v.id)
         )
   where v.finalizada_em is null
     and v.criado_em < v_hoje
     and exists (select 1 from public.checklists_visita c where c.visita_id = v.id);
  get diagnostics v_total = row_count;
  return v_total;
end;
$function$;

revoke all on function manutencao.fechar_inspecoes_esquecidas() from public, anon, authenticated;

-- 00:05 em Brasilia (03:05 UTC).
select cron.unschedule('fechar-inspecoes-esquecidas')
 where exists (select 1 from cron.job where jobname = 'fechar-inspecoes-esquecidas');
select cron.schedule('fechar-inspecoes-esquecidas', '5 3 * * *', $$select manutencao.fechar_inspecoes_esquecidas()$$);

-- 3) Metas contam visitas ---------------------------------------------------
create or replace function public.progresso_das_metas(p_dia date default null::date)
 returns table(meta_id bigint, usuario_id uuid, site_id bigint, periodo text, quantidade integer, feitas integer, inicio date, fim date)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  with d as (select coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date) as dia)
  select
    m.id,
    m.usuario_id,
    m.site_id,
    m.periodo,
    m.quantidade,
    (
      -- Visitas, e nao checklists: varios checklists na mesma inspecao (0114)
      -- sao uma visita ao lugar.
      select count(distinct c.visita_id)::integer
        from public.checklists_visita c
        join public.visitas v on v.id = c.visita_id
       where v.site_id = m.site_id
         and coalesce(c.enviado_por, v.funcionario_id) = m.usuario_id
         and c.criado_em >= (p.inicio::timestamp at time zone 'America/Sao_Paulo')
         and c.criado_em < (p.fim::timestamp at time zone 'America/Sao_Paulo')
    ),
    p.inicio,
    p.fim
  from public.metas_de_visita m
  cross join d
  cross join lateral public.periodo_da_meta(m.periodo, d.dia, m.inicia_em) p
  where m.ativo
    and m.inicia_em <= d.dia;
$function$;

create or replace function manutencao.avisar_metas(p_periodos text[], p_dia date default null::date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'manutencao', 'public', 'pg_temp'
as $function$
declare
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_pessoa record;
  v_total integer := 0;
begin
  for v_pessoa in
    with progresso as (
      select
        m.usuario_id,
        m.periodo,
        p.inicio,
        s.nome as site_nome,
        m.quantidade as meta,
        (
          -- Visitas, e nao checklists (0114).
          select count(distinct c.visita_id)::integer
            from public.checklists_visita c
            join public.visitas v on v.id = c.visita_id
           where v.site_id = m.site_id
             and coalesce(c.enviado_por, v.funcionario_id) = m.usuario_id
             and c.criado_em >= (p.inicio::timestamp at time zone 'America/Sao_Paulo')
             and c.criado_em < (p.fim::timestamp at time zone 'America/Sao_Paulo')
        ) as feitas,
        -- O dia do aviso de cada periodo (ver o cabecalho da 0106).
        case m.periodo
          when 'DIARIA' then p.inicio
          when 'SEMANAL' then p.inicio + 4
          when 'QUINZENAL' then p.fim - 3
          when 'MENSAL' then p.fim - 4
        end as dia_do_aviso
      from public.metas_de_visita m
      cross join lateral public.periodo_da_meta(m.periodo, v_dia, m.inicia_em) p
      join public.sites s on s.id = m.site_id
      join public.profiles pr on pr.id = m.usuario_id and pr.ativo
      where m.ativo and m.periodo = any (p_periodos) and m.inicia_em <= v_dia
    )
    select
      usuario_id,
      periodo,
      inicio,
      count(*) as lugares,
      string_agg(format('%s: %s de %s', site_nome, feitas, meta), '; ' order by site_nome) as resumo
    from progresso
    where feitas < meta and dia_do_aviso = v_dia
    group by usuario_id, periodo, inicio
  loop
    v_total := v_total + manutencao.notificar(
      array[v_pessoa.usuario_id],
      'META_DE_VISITA',
      format(
        'Meta de visitas %s: %s',
        case v_pessoa.periodo
          when 'DIARIA' then 'de hoje'
          when 'SEMANAL' then 'da semana'
          when 'QUINZENAL' then 'da quinzena'
          else 'do mês'
        end,
        case when v_pessoa.lugares = 1 then 'falta 1 lugar' else format('faltam %s lugares', v_pessoa.lugares) end
      ),
      left(v_pessoa.resumo || '.', 1000),
      null,
      format('meta:%s:%s', v_pessoa.periodo, v_pessoa.inicio)
    );
  end loop;
  return v_total;
end;
$function$;
