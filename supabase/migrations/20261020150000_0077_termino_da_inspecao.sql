-- ============================================================================
-- 0077 — Termino da inspecao
--
-- No sistema de referencia cada inspecao tem duas linhas em Coletas
-- Importadas, com o mesmo numero de coleta: "Inicio" (a leitura do QR) e
-- "Termino" (o fim da inspecao, minutos depois). O app de campo grava so o
-- Inicio; o fim da ronda ficava no aparelho (achado do dono em 20/10/2026).
--
-- O formato ja existe: as areas "Inicio" e "Termino" estao no cadastro, e
-- `visitas_do_periodo` (0049) calcula a duracao pelas leituras dessas areas --
-- foi feito para as coletas importadas do antigo. Entao o Termino e uma
-- LEITURA com a area "Termino", e as telas e relatorios passam a enxerga-lo
-- sem mudanca nenhuma. Duas fontes (decisao do dono, 20/10/2026):
--
--   1. O app grava a leitura "Termino" ao tocar "Encerrar ronda" (pela fila
--      offline, como as outras leituras).
--   2. O envio do checklist da visita: o checklist e a ultima coisa da
--      inspecao, entao o Termino vai para a hora dele.
--
-- UM TERMINO POR VISITA. As duas fontes (e o reenvio da fila) podem mandar
-- mais de um. O gatilho `um_termino_por_visita` nao deixa entrar o segundo:
-- move o que ja existe para o MAIS TARDE dos dois e descarta a linha nova. O
-- Termino e o fim da inspecao, entao o ultimo horario e o que vale.
--
-- O checklist so cria Termino em visita que ja tem leitura: a visita aberta
-- pelo "Ver sites" (0059/#146) nao tem leitura nenhuma, e um Termino sozinho
-- apareceria em Coletas Importadas sem o Inicio.
--
-- RELATORIOS. As leituras do app nao tem area, entao o Inicio de
-- `visitas_do_periodo` (so area "Inicio") vinha nulo, e Horas por Usuario e
-- Inspecoes com Inicio e Fim nao achavam visita nenhuma do app. O Inicio passa
-- a ser a area "Inicio" ou, na falta dela, a primeira leitura sem area.
-- ============================================================================

-- Um Termino por visita ------------------------------------------------------
create or replace function manutencao.um_termino_por_visita()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_termino bigint := (select a.id from public.areas a where a.nome = 'Término');
  v_existente bigint;
begin
  if v_termino is null or new.area_id is distinct from v_termino then
    return new;
  end if;

  select l.id into v_existente
    from public.leituras l
   where l.visita_id = new.visita_id
     and l.area_id = v_termino
   order by l.data_hora desc, l.id desc
   limit 1
   for update;

  if v_existente is null then
    return new;
  end if;

  update public.leituras
     set data_hora = greatest(data_hora, new.data_hora)
   where id = v_existente;
  return null;
end;
$$;

revoke all on function manutencao.um_termino_por_visita() from public, anon, authenticated;

drop trigger if exists um_termino_por_visita on public.leituras;
create trigger um_termino_por_visita
  before insert on public.leituras
  for each row execute function manutencao.um_termino_por_visita();

-- Termino pelo checklist -----------------------------------------------------
create or replace function manutencao.termino_pelo_checklist()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_termino bigint := (select a.id from public.areas a where a.nome = 'Término');
begin
  if v_termino is null
     or not exists (select 1 from public.leituras l where l.visita_id = new.visita_id) then
    return null;
  end if;

  insert into public.leituras (visita_id, area_id, data_hora)
  values (new.visita_id, v_termino, new.criado_em)
  on conflict do nothing;
  return null;
end;
$$;

revoke all on function manutencao.termino_pelo_checklist() from public, anon, authenticated;

drop trigger if exists termino_pelo_checklist on public.checklists_visita;
create trigger termino_pelo_checklist
  after insert on public.checklists_visita
  for each row execute function manutencao.termino_pelo_checklist();

-- As visitas que ja tem leitura e checklist ganham o Termino agora.
insert into public.leituras (visita_id, area_id, data_hora)
select c.visita_id, a.id, c.criado_em
  from public.checklists_visita c
  join public.areas a on a.nome = 'Término'
 where exists (select 1 from public.leituras l where l.visita_id = c.visita_id)
on conflict do nothing;

-- Inicio das leituras sem area ------------------------------------------------
create or replace function public.visitas_do_periodo(
  p_inicio timestamptz, p_fim timestamptz, p_filtros jsonb default '{}'::jsonb
)
returns table (visita_id bigint, site_id bigint, funcionario_id uuid, motivo_visita_id bigint,
               primeira_leitura timestamptz, inicio timestamptz, termino timestamptz,
               tem_localizacao boolean, observacao text, evento_id bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  with f as (
    select
      nullif(p_filtros ->> 'site', '')::bigint          as site,
      nullif(p_filtros ->> 'grupo_site', '')::bigint    as grupo_site,
      nullif(p_filtros ->> 'funcionario', '')::uuid     as funcionario,
      nullif(p_filtros ->> 'motivo', '')::bigint        as motivo,
      nullif(p_filtros ->> 'coletor_dados', '')::bigint as coletor_dados,
      nullif(p_filtros ->> 'grupo_usuario', '')::bigint as grupo_usuario,
      nullif(p_filtros ->> 'tipo_servico', '')::bigint  as tipo_servico,
      nullif(p_filtros ->> 'area', '')::bigint          as area,
      nullif(p_filtros ->> 'evento', '')::bigint        as evento,
      nullif(p_filtros ->> 'qualificador', '')::bigint  as qualificador,
      nullif(p_filtros ->> 'checkpoint', '')::bigint    as checkpoint,
      nullif(p_filtros ->> 'atividade', '')::bigint     as atividade
  ),
  lidas as (
    select
      l.id,
      l.visita_id,
      l.data_hora,
      l.tem_localizacao,
      l.observacao,
      l.evento_id,
      l.area_id,
      v.site_id,
      v.funcionario_id,
      v.motivo_visita_id,
      a.nome as area_nome,
      -- Filtros de DETALHE: avaliados por leitura, decididos por visita no
      -- `having` abaixo. Filtrar a leitura direto no `where` excluiria o
      -- Inicio OU o Termino da ronda e quebraria a duracao -- o motivo de
      -- `combinaFiltrosDeDetalhe` existir em cada tela.
      (    (f.area is null or l.area_id = f.area)
       and (f.evento is null or l.evento_id = f.evento)
       and (f.qualificador is null or l.qualificador_id = f.qualificador)
       and (f.checkpoint is null or l.qr_code_id = f.checkpoint)
       and (f.atividade is null or l.acao_id = f.atividade)) as combina_detalhe
    from public.leituras l
    join public.visitas v on v.id = l.visita_id
    -- `left join`: nem toda tela exigia o site visivel, e um `inner` aqui
    -- mudaria o resultado das que nao exigiam. Quem precisa do nome do site
    -- faz o `join` no proprio relatorio.
    left join public.sites s on s.id = v.site_id
    left join public.areas a on a.id = l.area_id
    cross join f
    where l.data_hora >= p_inicio
      and l.data_hora < p_fim
      -- Filtros de VISITA: valem para todas as leituras dela, entao podem
      -- recortar ja no `where`.
      and (f.site is null or v.site_id = f.site)
      and (f.grupo_site is null or s.grupo_site_id = f.grupo_site)
      and (f.funcionario is null or v.funcionario_id = f.funcionario)
      and (f.motivo is null or v.motivo_visita_id = f.motivo)
      and (f.coletor_dados is null or v.coletor_dados_id = f.coletor_dados)
      and (f.tipo_servico is null or s.tipo_servico_id = f.tipo_servico)
      and (f.grupo_usuario is null or exists (
        select 1 from public.grupos_usuarios_membros m
         where m.profile_id = v.funcionario_id and m.grupo_id = f.grupo_usuario
      ))
  )
  select
    visita_id,
    site_id,
    funcionario_id,
    motivo_visita_id,
    min(data_hora)                                         as primeira_leitura,
    -- A area "Inicio" (coletas importadas) ou, sem ela, a primeira leitura
    -- sem area (o QR lido pelo app de campo) -- 0077.
    coalesce(
      min(data_hora) filter (where area_nome = 'Início'),
      min(data_hora) filter (where area_id is null)
    )                                                      as inicio,
    max(data_hora) filter (where area_nome = 'Término')    as termino,
    coalesce(bool_or(tem_localizacao), false)              as tem_localizacao,
    (array_agg(observacao order by data_hora, id)
       filter (where nullif(btrim(observacao), '') is not null))[1] as observacao,
    (array_agg(evento_id order by data_hora, id)
       filter (where evento_id is not null))[1]            as evento_id
  from lidas
  group by visita_id, site_id, funcionario_id, motivo_visita_id
  having bool_or(combina_detalhe)
$$;
