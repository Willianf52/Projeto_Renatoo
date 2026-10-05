-- ============================================================================
-- 0063 -- Ocorrencias abertas pelo checklist
--
-- ITEM 1 DO PLANO DA #164 (05/10/2026). No sistema de referencia, as
-- ocorrencias (o "Registro de Evento") NASCEM SOZINHAS das respostas do
-- checklist: em 2026 foram 789, todas geradas assim. A observacao de cada uma
-- diz "Evento gerado automaticamente pelo CheckList n X -- Pergunta --
-- Resposta". Aqui nao existia nada disso: o catalogo `eventos` estava vazio e
-- os relatorios de Eventos so contavam leituras importadas com evento (zero).
--
-- O QUE ABRE OCORRENCIA (lido nas 789 de 2026):
--   - "Nao conforme" (resposta NAO em pergunta CNA/CN) -- 582 delas;
--   - "Sim" na pergunta Sim/Nao ("Duvidas com o RH") -- 123.
--   "Conforme" e "Nao se aplica" nunca abrem. O "Nao" da pergunta do RH
--   tambem abria no antigo (84, quase todas vazias); o dono decidiu (05/10)
--   que aqui so o "Sim" abre.
--
-- TIPO DE EVENTO POR PERGUNTA: `perguntas_checklist.evento_id`. No antigo
-- cada pergunta gera sempre o mesmo tipo (LIMPEZA, EPI, RH...). As regras
-- foram lidas do historico e casam 479 das 722 perguntas ativas; elas entram
-- por script de dados FORA do repositorio (os textos citam clientes), como a
-- importacao dos modelos. Pergunta sem tipo abre como "NAO CONFORMIDADE".
--
-- NUMERO/ANO: como no antigo ("666/2026"), sequencial por ano no horario de
-- Brasilia. Lock por ano: dois checklists enviados no mesmo instante nao
-- podem pegar o mesmo numero.
--
-- STATUS: nasce "AGUARDANDO". Os outros (Em Analise, Atendido, Cancelado,
-- Critico) existem no check para os itens 2 e 5 do plano, que fazem a
-- analise e a finalizacao. No antigo, todas as 789 de 2026 estao Aguardando.
--
-- QUEM ESCREVE: so o trigger. `authenticated` nao tem INSERT/UPDATE/DELETE;
-- a leitura segue o escopo da visita (`autorizacao.pode_ver_visita`), o
-- mesmo do checklist que a abriu. O trigger e `security definer` em
-- `manutencao`, fora da API, como os da 0061: o inspetor envia o checklist
-- pela `registrar_checklist` (security invoker) e nao pode gravar
-- ocorrencia direto.
--
-- RELATORIOS: `ocorrencias_de_evento` (0056), a base de todas as telas de
-- Eventos, passa a contar estas ocorrencias junto das leituras com evento.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Tipos de evento ----------------------------------------------------------
-- Os 30 do cadastro do sistema de referencia, com a grafia de la (e o que
-- aparece nos filtros e nos relatorios). Idempotente pelo `unique (nome)`.

insert into public.eventos (nome) values
  ('APONTAMENTOS'), ('Área Exerna'), ('BOMBEIRO'), ('DP'), ('EPI'),
  ('EQUIPAMENTOS'), ('EQUIPAMENTOS DE LIMPEZA'), ('FICHA DE EPI'), ('FROTA'),
  ('Iboton'), ('JARDINAGEM'), ('LIMPEZA'), ('MANUTENÇÃO'),
  ('MATERIAL DE LIMPEZA'), ('NÃO CONFORMIDADE'), ('Nome'), ('OPERACIONAL'),
  ('PAGAMENTOS E BENEFICIOS'), ('PORTARIA'), ('Procedimento'), ('PROCESSO'),
  ('PRODUTOS'), ('RECEPÇÃO'), ('RH'), ('Ronda'), ('Serviços'), ('Uniforme'),
  ('Viaturas'), ('vigia'), ('Zeladoria')
on conflict (nome) do nothing;

-- 2) Tipo de evento da pergunta -------------------------------------------------

alter table public.perguntas_checklist
  add column if not exists evento_id bigint references public.eventos (id) on delete set null;

comment on column public.perguntas_checklist.evento_id is
  'Tipo do evento que a pergunta abre quando a resposta pede ocorrencia
   (0063). Nulo = "NAO CONFORMIDADE".';

-- 3) Ocorrencias ------------------------------------------------------------------

create table if not exists public.ocorrencias (
  id bigint generated always as identity primary key,
  numero integer not null,
  ano smallint not null,
  criado_em timestamptz not null default now(),
  visita_id bigint not null references public.visitas (id) on delete cascade,
  site_id bigint not null references public.sites (id),
  checklist_id bigint not null references public.checklists_visita (id) on delete cascade,
  pergunta_id bigint not null references public.perguntas_checklist (id) on delete restrict,
  evento_id bigint not null references public.eventos (id),
  -- Retrato do momento: a pergunta pode ser reescrita depois, e a ocorrencia
  -- tem que continuar dizendo o que foi perguntado.
  pergunta_texto text not null,
  resposta text not null,
  observacao text,
  aberta_por uuid references public.profiles (id) on delete set null,
  status text not null default 'AGUARDANDO',
  constraint ocorrencias_numero_por_ano unique (ano, numero),
  constraint ocorrencias_uma_por_resposta unique (checklist_id, pergunta_id),
  constraint ocorrencias_status_check
    check (status in ('AGUARDANDO', 'EM_ANALISE', 'ATENDIDO', 'CANCELADO', 'CRITICO'))
);

comment on table public.ocorrencias is
  'Ocorrencia (Registro de Evento) aberta automaticamente por uma resposta do
   checklist. So o trigger escreve. Migration 0063.';

create index if not exists ocorrencias_criado_em_idx on public.ocorrencias (criado_em desc);
create index if not exists ocorrencias_visita_idx on public.ocorrencias (visita_id);
create index if not exists ocorrencias_site_idx on public.ocorrencias (site_id);
create index if not exists ocorrencias_evento_idx on public.ocorrencias (evento_id);

alter table public.ocorrencias enable row level security;

revoke all on public.ocorrencias from anon, authenticated;
grant select on public.ocorrencias to authenticated;
grant all on public.ocorrencias to service_role;

drop policy if exists "Leitura da ocorrencia no escopo da visita" on public.ocorrencias;
create policy "Leitura da ocorrencia no escopo da visita"
  on public.ocorrencias
  for select
  to authenticated
  using (autorizacao.pode_ver_visita(visita_id));

-- 4) O trigger que abre ----------------------------------------------------------

create schema if not exists manutencao;

create or replace function manutencao.abrir_ocorrencia_da_resposta()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_pergunta record;
  v_visita record;
  v_ano smallint;
  v_numero integer;
begin
  select p.texto, p.tipo_resposta, p.evento_id
    into v_pergunta
    from public.perguntas_checklist p
   where p.id = new.pergunta_id;

  -- So "Nao conforme" (CNA/CN) e "Sim" (SN) abrem ocorrencia.
  if not (
    (v_pergunta.tipo_resposta in ('CNA', 'CN') and new.resposta = 'NAO')
    or (v_pergunta.tipo_resposta = 'SN' and new.resposta = 'SIM')
  ) then
    return new;
  end if;

  select v.id, v.site_id, v.funcionario_id
    into v_visita
    from public.checklists_visita c
    join public.visitas v on v.id = c.visita_id
   where c.id = new.checklist_id;

  v_ano := extract(year from now() at time zone 'America/Sao_Paulo')::smallint;
  perform pg_advisory_xact_lock(hashtext('ocorrencias'), v_ano);
  select coalesce(max(o.numero), 0) + 1 into v_numero
    from public.ocorrencias o
   where o.ano = v_ano;

  insert into public.ocorrencias (
    numero, ano, visita_id, site_id, checklist_id, pergunta_id, evento_id,
    pergunta_texto, resposta, observacao, aberta_por
  ) values (
    v_numero, v_ano, v_visita.id, v_visita.site_id, new.checklist_id, new.pergunta_id,
    coalesce(v_pergunta.evento_id, (select e.id from public.eventos e where e.nome = 'NÃO CONFORMIDADE')),
    v_pergunta.texto, new.resposta, new.observacao, v_visita.funcionario_id
  )
  on conflict (checklist_id, pergunta_id) do nothing;

  return new;
end;
$$;

revoke all on function manutencao.abrir_ocorrencia_da_resposta() from public, anon, authenticated;

drop trigger if exists abrir_ocorrencia_da_resposta on public.checklist_respostas;
create trigger abrir_ocorrencia_da_resposta
  after insert on public.checklist_respostas
  for each row execute function manutencao.abrir_ocorrencia_da_resposta();

-- 5) Relatorios de Eventos contam as ocorrencias ---------------------------------
-- Mesma assinatura e mesmo retorno da 0056: so o corpo muda. Ocorrencia nao
-- tem "data de insercao" separada (nasce no servidor, no envio), entao os dois
-- recortes usam `criado_em`. Nao tem atividade (`acao_id`): com o filtro de
-- atividade ligado, so as leituras contam.

create or replace function public.ocorrencias_de_evento(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_por_data_insercao boolean default false,
  p_filtros jsonb default '{}'::jsonb
)
returns table (
  site_id bigint,
  site_nome text,
  grupo_site_nome text,
  evento_id bigint,
  evento_nome text,
  quando timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with f as (
    select
      nullif(p_filtros ->> 'site', '')::bigint          as site,
      nullif(p_filtros ->> 'grupo_site', '')::bigint    as grupo_site,
      nullif(p_filtros ->> 'funcionario', '')::uuid     as funcionario,
      nullif(p_filtros ->> 'evento', '')::bigint        as evento,
      nullif(p_filtros ->> 'grupo_usuario', '')::bigint as grupo_usuario,
      nullif(p_filtros ->> 'coletor_dados', '')::bigint as coletor_dados,
      nullif(p_filtros ->> 'atividade', '')::bigint     as atividade
  ),
  lidas as (
    select
      v.site_id as sid,
      s.nome    as snome,
      g.nome    as gnome,
      l.evento_id as eid,
      e.nome    as enome,
      case when p_por_data_insercao then l.data_integracao else l.data_hora end as q
    from public.leituras l
    join public.visitas v on v.id = l.visita_id
    join public.sites s on s.id = v.site_id
    join public.eventos e on e.id = l.evento_id
    left join public.grupos_sites g on g.id = s.grupo_site_id
    cross join f
    where l.evento_id is not null
      and (f.site is null or v.site_id = f.site)
      and (f.grupo_site is null or s.grupo_site_id = f.grupo_site)
      and (f.funcionario is null or v.funcionario_id = f.funcionario)
      and (f.evento is null or l.evento_id = f.evento)
      and (f.coletor_dados is null or v.coletor_dados_id = f.coletor_dados)
      and (f.atividade is null or l.acao_id = f.atividade)
      and (f.grupo_usuario is null or exists (
        select 1 from public.grupos_usuarios_membros m
         where m.profile_id = v.funcionario_id and m.grupo_id = f.grupo_usuario
      ))
  ),
  do_checklist as (
    select
      o.site_id as sid,
      s.nome    as snome,
      g.nome    as gnome,
      o.evento_id as eid,
      e.nome    as enome,
      o.criado_em as q
    from public.ocorrencias o
    join public.visitas v on v.id = o.visita_id
    join public.sites s on s.id = o.site_id
    join public.eventos e on e.id = o.evento_id
    left join public.grupos_sites g on g.id = s.grupo_site_id
    cross join f
    where f.atividade is null
      and (f.site is null or o.site_id = f.site)
      and (f.grupo_site is null or s.grupo_site_id = f.grupo_site)
      and (f.funcionario is null or v.funcionario_id = f.funcionario)
      and (f.evento is null or o.evento_id = f.evento)
      and (f.coletor_dados is null or v.coletor_dados_id = f.coletor_dados)
      and (f.grupo_usuario is null or exists (
        select 1 from public.grupos_usuarios_membros m
         where m.profile_id = v.funcionario_id and m.grupo_id = f.grupo_usuario
      ))
  )
  select sid, snome, gnome, eid, enome, q
  from (select * from lidas union all select * from do_checklist) t
  where q >= p_inicio
    and q < p_fim
$$;

comment on function public.ocorrencias_de_evento(timestamptz, timestamptz, boolean, jsonb) is
  'Uma linha por ocorrencia de evento em [p_inicio, p_fim): leitura com evento
   (0056) ou ocorrencia aberta pelo checklist (0063). Base dos relatorios de
   Eventos. SECURITY INVOKER: o RLS de quem chama recorta o resultado.';
