-- ============================================================================
-- 0089 -- Portal igual ao do sistema de referencia (o que faltava)
--
--   1) Painel de Eventos: os status que faltavam (Concluido, Nao Realizado,
--      Pre-critico, Alerta, Panico) e a troca de status arrastando o cartao no
--      Quadro. A troca vira um andamento com autor e texto, como toda mudanca
--      de status desde a 0064: `ocorrencia_andamentos.status_novo` diz para
--      onde vai, e o trigger aplica. Encerrados (Atendido, Cancelado,
--      Concluido, Nao Realizado) continuam sem receber andamento.
--
--   2) Aprovacao de checklist: o modelo pode exigir aprovacao; o checklist
--      dele nasce "Aguardando Autorizacao", e a gestao aprova ou reprova no
--      Historico (com motivo na reprovacao).
--
--   3) Anexos do Site/Planta: arquivos por site, num bucket privado.
--
--   4) Permissoes de visualizacao do evento, por Grupo de Locais e Grupo de
--      Usuarios, separadas para web e app. Sem nenhuma linha para um canal, o
--      evento vale para todos nele (o comportamento de ate aqui).
-- ============================================================================

-- 1) Status extras e troca pelo Quadro -------------------------------------------

alter table public.ocorrencias drop constraint if exists ocorrencias_status_check;
alter table public.ocorrencias add constraint ocorrencias_status_check check (status in (
  'AGUARDANDO', 'EM_ANALISE', 'ATENDIDO', 'CANCELADO', 'CRITICO',
  'CONCLUIDO', 'NAO_REALIZADO', 'PRE_CRITICO', 'ALERTA', 'PANICO'
));

alter table public.ocorrencia_andamentos add column if not exists status_novo text;
alter table public.ocorrencia_andamentos drop constraint if exists ocorrencia_andamentos_status_novo_check;
alter table public.ocorrencia_andamentos add constraint ocorrencia_andamentos_status_novo_check check (
  status_novo is null or status_novo in (
    'AGUARDANDO', 'EM_ANALISE', 'ATENDIDO', 'CANCELADO', 'CRITICO',
    'CONCLUIDO', 'NAO_REALIZADO', 'PRE_CRITICO', 'ALERTA', 'PANICO'
  )
);
grant insert (status_novo) on public.ocorrencia_andamentos to authenticated;

comment on column public.ocorrencia_andamentos.status_novo is
  'Status escolhido arrastando o cartao no Quadro do Painel (0089). Nulo nos andamentos de analise/finalizacao comuns.';

create or replace function manutencao.andamento_da_ocorrencia_muda_o_status()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_status text;
begin
  -- A permissao vem PRIMEIRO (ver 0064): sem isto quem nao pode receberia
  -- "ja encerrada" em vez de "sem permissao".
  if auth.uid() is not null and not autorizacao.pode_ver_toda_operacao() then
    raise exception 'Sem permissão para registrar andamento.' using errcode = '42501';
  end if;

  select status into v_status from public.ocorrencias where id = new.ocorrencia_id for update;

  if v_status in ('ATENDIDO', 'CANCELADO', 'CONCLUIDO', 'NAO_REALIZADO') then
    raise exception 'Ocorrência já encerrada (%).', v_status using errcode = '23514';
  end if;

  -- Troca escolhida no Quadro (0089): vale o status pedido.
  if new.status_novo is not null then
    update public.ocorrencias
       set status = new.status_novo,
           finalizada_em = case
             when new.status_novo in ('ATENDIDO', 'CANCELADO', 'CONCLUIDO', 'NAO_REALIZADO') then new.criado_em
             else finalizada_em
           end
     where id = new.ocorrencia_id;
    return new;
  end if;

  if new.tipo = 'ANALISE' then
    if v_status = 'AGUARDANDO' then
      update public.ocorrencias set status = 'EM_ANALISE' where id = new.ocorrencia_id;
    end if;
  else
    update public.ocorrencias
       set status = 'ATENDIDO', finalizada_em = new.criado_em
     where id = new.ocorrencia_id;
  end if;

  return new;
end;
$$;

-- 2) Aprovacao de checklist ------------------------------------------------------

alter table public.modelos_checklist add column if not exists exige_aprovacao boolean not null default false;
grant insert (exige_aprovacao), update (exige_aprovacao) on public.modelos_checklist to authenticated;

comment on column public.modelos_checklist.exige_aprovacao is
  'Checklist deste modelo nasce "Aguardando Autorizacao" e a gestao aprova ou reprova no Historico (0089).';

alter table public.checklists_visita
  add column if not exists aprovacao text,
  add column if not exists aprovacao_por uuid references public.profiles (id) on delete set null,
  add column if not exists aprovacao_em timestamptz,
  add column if not exists aprovacao_motivo text;

alter table public.checklists_visita drop constraint if exists checklists_visita_aprovacao_check;
alter table public.checklists_visita add constraint checklists_visita_aprovacao_check check (
  (aprovacao is null or aprovacao in ('AGUARDANDO', 'APROVADO', 'REPROVADO'))
  and (aprovacao_motivo is null or length(aprovacao_motivo) <= 2000)
);

comment on column public.checklists_visita.aprovacao is
  'AGUARDANDO (Aguardando Autorizacao), APROVADO ou REPROVADO; nulo quando o modelo nao exige aprovacao (0089).';

create or replace function manutencao.checklist_nasce_aguardando_aprovacao()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  if new.modelo_id is not null
     and exists (select 1 from public.modelos_checklist m where m.id = new.modelo_id and m.exige_aprovacao) then
    new.aprovacao := 'AGUARDANDO';
  else
    new.aprovacao := null;
  end if;
  new.aprovacao_por := null;
  new.aprovacao_em := null;
  new.aprovacao_motivo := null;
  return new;
end;
$$;

revoke all on function manutencao.checklist_nasce_aguardando_aprovacao() from public, anon, authenticated;

-- "zz_": triggers BEFORE da mesma tabela rodam em ordem alfabetica, e este
-- precisa ver o `modelo_id` ja posto por `consultoria_sem_modelo_vai_para_o_padrao`.
drop trigger if exists zz_checklist_nasce_aguardando_aprovacao on public.checklists_visita;
create trigger zz_checklist_nasce_aguardando_aprovacao
  before insert on public.checklists_visita
  for each row execute function manutencao.checklist_nasce_aguardando_aprovacao();

create or replace function escrita.decidir_aprovacao_do_checklist(
  p_checklist_id bigint,
  p_decisao text,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = escrita, public, pg_temp
as $$
begin
  if auth.uid() is null or not autorizacao.pode_ver_toda_operacao() then
    raise exception 'Sem permissão para aprovar checklist.' using errcode = '42501';
  end if;
  if p_decisao not in ('APROVADO', 'REPROVADO') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  if p_decisao = 'REPROVADO' and length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da reprovação.' using errcode = '22023';
  end if;

  update public.checklists_visita
     set aprovacao = p_decisao,
         aprovacao_por = auth.uid(),
         aprovacao_em = now(),
         aprovacao_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_checklist_id
     and aprovacao = 'AGUARDANDO';

  if not found then
    raise exception 'Checklist não encontrado ou não está aguardando autorização.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function escrita.decidir_aprovacao_do_checklist(bigint, text, text) from public, anon;
grant execute on function escrita.decidir_aprovacao_do_checklist(bigint, text, text) to authenticated;

create or replace function public.decidir_aprovacao_do_checklist(
  p_checklist_id bigint,
  p_decisao text,
  p_motivo text default null
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.decidir_aprovacao_do_checklist(p_checklist_id, p_decisao, p_motivo);
$$;

comment on function public.decidir_aprovacao_do_checklist(bigint, text, text) is
  'Aprovar ou reprovar checklist que aguarda autorizacao. Envelope de escrita.decidir_aprovacao_do_checklist (0089).';

revoke all on function public.decidir_aprovacao_do_checklist(bigint, text, text) from public, anon;
grant execute on function public.decidir_aprovacao_do_checklist(bigint, text, text) to authenticated;

-- 3) Anexos do Site/Planta -------------------------------------------------------

create table if not exists public.site_anexos (
  id bigint generated always as identity primary key,
  site_id bigint not null references public.sites (id) on delete cascade,
  storage_path text not null unique,
  nome_original text not null,
  criado_por uuid default auth.uid() references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint site_anexos_nome_check check (length(btrim(nome_original)) between 1 and 200)
);

create index if not exists site_anexos_site_idx on public.site_anexos (site_id);

alter table public.site_anexos enable row level security;
revoke all on public.site_anexos from anon, authenticated;
grant select, delete on public.site_anexos to authenticated;
grant insert (site_id, storage_path, nome_original) on public.site_anexos to authenticated;
grant all on public.site_anexos to service_role;

drop policy if exists "Leitura dos anexos do site" on public.site_anexos;
create policy "Leitura dos anexos do site" on public.site_anexos
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()));

drop policy if exists "Cadastro anexa arquivo ao site" on public.site_anexos;
create policy "Cadastro anexa arquivo ao site" on public.site_anexos
  for insert to authenticated
  with check (
    (select autorizacao.pode_administrar_cadastros())
    and storage_path like site_id::text || '/%'
  );

drop policy if exists "Cadastro remove anexo do site" on public.site_anexos;
create policy "Cadastro remove anexo do site" on public.site_anexos
  for delete to authenticated
  using ((select autorizacao.pode_administrar_cadastros()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sites', 'sites', false, 10485760,
  array[
    'image/png', 'image/jpeg', 'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Cadastro envia anexo do site" on storage.objects;
create policy "Cadastro envia anexo do site" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sites'
    and (select autorizacao.pode_administrar_cadastros())
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
    and exists (select 1 from public.sites s where s.id = ((storage.foldername(name))[1])::bigint)
  );

drop policy if exists "Leitura do anexo do site" on storage.objects;
create policy "Leitura do anexo do site" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sites'
    and (select autorizacao.usuario_ativo())
    and not (select autorizacao.e_cliente())
  );

drop policy if exists "Cadastro remove anexo do site" on storage.objects;
create policy "Cadastro remove anexo do site" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sites' and (select autorizacao.pode_administrar_cadastros()));

-- 4) Permissoes de visualizacao do evento ---------------------------------------

create table if not exists public.evento_permissoes (
  id bigint generated always as identity primary key,
  evento_id bigint not null references public.eventos (id) on delete cascade,
  canal text not null,
  grupo_site_id bigint references public.grupos_sites (id) on delete cascade,
  grupo_usuario_id bigint references public.grupos_usuarios (id) on delete cascade,
  constraint evento_permissoes_canal_check check (canal in ('WEB', 'APP')),
  constraint evento_permissoes_um_grupo_check check (num_nonnulls(grupo_site_id, grupo_usuario_id) = 1)
);

create unique index if not exists evento_permissoes_unica
  on public.evento_permissoes (evento_id, canal, coalesce(grupo_site_id, -1), coalesce(grupo_usuario_id, -1));

alter table public.evento_permissoes enable row level security;
revoke all on public.evento_permissoes from anon, authenticated;
grant select, insert, delete on public.evento_permissoes to authenticated;
grant all on public.evento_permissoes to service_role;

drop policy if exists "Leitura das permissoes do evento" on public.evento_permissoes;
create policy "Leitura das permissoes do evento" on public.evento_permissoes
  for select to authenticated using ((select autorizacao.usuario_ativo()));

drop policy if exists "Cadastro grava permissoes do evento" on public.evento_permissoes;
create policy "Cadastro grava permissoes do evento" on public.evento_permissoes
  for insert to authenticated with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists "Cadastro remove permissoes do evento" on public.evento_permissoes;
create policy "Cadastro remove permissoes do evento" on public.evento_permissoes
  for delete to authenticated using ((select autorizacao.pode_administrar_cadastros()));

comment on table public.evento_permissoes is
  'Permissoes de visualizacao do evento por Grupo de Locais e Grupo de Usuarios, para web e app (0089). Sem linha no canal, vale para todos.';

-- 5) Historico de Checklist conhece a aprovacao ---------------------------------
-- A funcao da 0087 com a coluna `aprovacao` na linha e as conclusoes
-- "Aguardando Autorizacao", "Aprovado" e "Reprovado" valendo no filtro.

create or replace function public.historico_de_checklist(
  p_filtros jsonb,
  p_limite integer default null,
  p_deslocamento integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with recursive
  parametros as (
    select
      coalesce(p_filtros ->> 'campo_data', 'checklist') as campo_data,
      (p_filtros ->> 'inicio')::timestamptz as inicio,
      (p_filtros ->> 'fim')::timestamptz as fim,
      (p_filtros ->> 'numero')::integer as numero,
      (p_filtros ->> 'ano')::integer as ano,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'modelos', '[]'::jsonb))::bigint) as modelos,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'sites', '[]'::jsonb))::bigint) as sites,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'grupos_sites', '[]'::jsonb))::bigint) as grupos_sites,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'grupos_usuarios', '[]'::jsonb))::bigint) as grupos_usuarios,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'responsaveis', '[]'::jsonb))::uuid) as responsaveis,
      p_filtros ->> 'conclusao' as conclusao,
      p_filtros ->> 'origem' as origem,
      p_filtros ->> 'situacao' as situacao,
      (p_filtros ->> 'nota_minima')::numeric as nota_minima,
      (p_filtros ->> 'nota_maxima')::numeric as nota_maxima,
      lower(nullif(btrim(p_filtros ->> 'busca'), '')) as busca,
      lower(nullif(btrim(p_filtros ->> 'busca_respostas'), '')) as busca_respostas,
      coalesce(p_filtros ->> 'ordem', 'recentes') = 'antigos' as ascendente
  ),
  -- Do proprio site ate o mais alto que quem pede enxerga.
  subida (site_id, superior_id, caminho, nivel) as (
    select s.id, s.site_superior_id, s.nome::text, 1
      from public.sites s
    union all
    select sb.site_id, acima.site_superior_id, acima.nome || ' → ' || sb.caminho, sb.nivel + 1
      from subida sb
      join public.sites acima on acima.id = sb.superior_id
     where sb.nivel < 10
  ),
  caminhos as (
    select distinct on (site_id) site_id, caminho
      from subida
     order by site_id, nivel desc
  ),
  perguntas_por_modelo as (
    select modelo_id, count(*)::integer as total
      from public.perguntas_checklist
     where ativo
     group by modelo_id
  ),
  base as (
    select
      c.id,
      c.numero,
      c.ano,
      c.tipo,
      c.motivo,
      c.criado_em,
      c.aprovacao,
      c.modelo_id,
      m.nome as modelo_nome,
      v.criado_em as inicio_em,
      v.funcionario_id,
      p.nome_completo as responsavel,
      s.id as site_id,
      s.nome as site_nome,
      coalesce(nullif(cm.caminho, ''), s.nome) as caminho,
      mv.nome as motivo_da_visita,
      coalesce(pm.total, 0) as total_perguntas,
      ag.agenda_id,
      ag.agenda_nome,
      ag.data_planejada,
      case
        when ag.agenda_id is null then 'no_prazo'
        when (c.criado_em at time zone 'America/Sao_Paulo')::date < ag.data_planejada then 'antecipado'
        when (c.criado_em at time zone 'America/Sao_Paulo')::date <= ag.data_planejada + ag.tolerancia_dias then 'no_prazo'
        else 'atrasado'
      end as situacao
    from public.checklists_visita c
    join public.visitas v on v.id = c.visita_id
    join public.sites s on s.id = v.site_id
    left join public.modelos_checklist m on m.id = c.modelo_id
    left join public.profiles p on p.id = v.funcionario_id
    left join public.motivos_visita mv on mv.id = v.motivo_visita_id
    left join caminhos cm on cm.site_id = s.id
    left join perguntas_por_modelo pm on pm.modelo_id = c.modelo_id
    -- A agenda que o checklist cumpre (0084/0087): mesmo modelo, site da
    -- agenda, agenda ativa. A data planejada e a mais recente ate o dia do
    -- checklist; antes da primeira, a primeira (o checklist foi antecipado).
    left join lateral (
      select a.id as agenda_id, a.nome as agenda_nome, d::date as data_planejada, a.tolerancia_dias
        from public.agendas a
        join public.agenda_sites asg on asg.agenda_id = a.id and asg.site_id = s.id
       cross join lateral generate_series(
         a.data_inicial::timestamp,
         a.data_final::timestamp,
         case a.recorrencia
           when 'DIARIO' then interval '1 day'
           when 'SEMANAL' then interval '7 days'
           when 'QUINZENAL' then interval '14 days'
           when 'MENSAL' then interval '1 month'
           when 'BIMESTRAL' then interval '2 months'
           when 'TRIMESTRAL' then interval '3 months'
           when 'SEMESTRAL' then interval '6 months'
           else interval '1 year'
         end
       ) as d
       where a.ativo
         and a.modelo_id = c.modelo_id
       order by
         (d::date > (c.criado_em at time zone 'America/Sao_Paulo')::date),
         abs(d::date - (c.criado_em at time zone 'America/Sao_Paulo')::date),
         a.id
       limit 1
    ) ag on true
    cross join parametros f
    where (cardinality(f.modelos) = 0 or c.modelo_id = any (f.modelos))
      and (cardinality(f.sites) = 0 or s.id = any (f.sites))
      and (cardinality(f.grupos_sites) = 0 or s.grupo_site_id = any (f.grupos_sites))
      and (cardinality(f.responsaveis) = 0 or v.funcionario_id = any (f.responsaveis))
      and (
        cardinality(f.grupos_usuarios) = 0
        or exists (
          select 1
            from public.profiles perfil
            join public.grupos_usuarios_membros gm on gm.profile_id = perfil.id
           where perfil.id = v.funcionario_id
             and gm.grupo_id = any (f.grupos_usuarios)
        )
      )
      and (f.origem is null or (f.origem = 'agenda') = (ag.agenda_id is not null))
      and (
        f.situacao is null
        or f.situacao = case
          when ag.agenda_id is null then 'no_prazo'
          when (c.criado_em at time zone 'America/Sao_Paulo')::date < ag.data_planejada then 'antecipado'
          when (c.criado_em at time zone 'America/Sao_Paulo')::date <= ag.data_planejada + ag.tolerancia_dias then 'no_prazo'
          else 'atrasado'
        end
      )
      and (f.numero is null or c.numero = f.numero)
      and (f.ano is null or c.ano = f.ano)
      and (f.inicio is null or (case when f.campo_data = 'visita' then v.criado_em else c.criado_em end) >= f.inicio)
      and (f.fim is null or (case when f.campo_data = 'visita' then v.criado_em else c.criado_em end) < f.fim)
      and (
        f.busca is null
        or strpos(
             case when length(c.numero::text) >= 5 then c.numero::text else lpad(c.numero::text, 5, '0') end
               || '/' || c.ano,
             f.busca
           ) > 0
        or strpos(lower(coalesce(nullif(cm.caminho, ''), s.nome)), f.busca) > 0
        or strpos(lower(coalesce(p.nome_completo, '')), f.busca) > 0
        or strpos(lower(coalesce(c.motivo, mv.nome, '')), f.busca) > 0
        or strpos(case when c.tipo = 'CORRETIVA' then 'corretiva' else 'consultoria' end, f.busca) > 0
        or strpos(lower(coalesce(m.nome, '')), f.busca) > 0
      )
      and (
        f.busca_respostas is null
        or strpos(lower(coalesce(c.motivo, '')), f.busca_respostas) > 0
        or exists (
          select 1
            from public.checklist_respostas r
           where r.checklist_id = c.id
             and strpos(lower(coalesce(r.observacao, '')), f.busca_respostas) > 0
        )
      )
  ),
  -- Conclusao e Nota pedem as respostas ANTES de cortar a pagina; sem eles,
  -- as respostas so sao somadas para as linhas da pagina (`pagina_simples`).
  --
  -- A soma das respostas aparece DUAS vezes (aqui e em `pagina_simples`) de
  -- proposito: uma CTE usada em dois lugares e materializada inteira pelo
  -- Postgres, e a rota normal voltaria a somar as respostas de todos os
  -- checklists do periodo.
  usa_derivados as (
    select (conclusao is not null or nota_minima is not null or nota_maxima is not null) as sim
      from parametros
  ),
  -- Rota COM Conclusao ou Nota: soma as respostas de todos os candidatos,
  -- filtra e so entao corta a pagina. O `where` com a subconsulta constante
  -- vira um filtro de uma vez so: na rota normal nada disto executa.
  com_respostas as (
    select b.*, a.respondidas, a.nao_conformidades, a.nota
      from base b
      cross join lateral (
        select
          count(*)::integer as respondidas,
          count(*) filter (where t.tipo <> 'SN' and t.resposta = 'NAO')::integer as nao_conformidades,
          case
            when count(*) filter (where t.tipo <> 'SN' and t.resposta <> 'NA') = 0 then null
            else floor(
              (
                (count(*) filter (where t.tipo <> 'SN' and t.resposta = 'SIM'))::float8
                / (count(*) filter (where t.tipo <> 'SN' and t.resposta <> 'NA'))::float8
              ) * 100::float8 + 0.5::float8
            )::integer
          end as nota
        from (
          select
            r.resposta,
            case when pq.tipo_resposta in ('CNA', 'CN', 'SN') then pq.tipo_resposta else 'CNA' end as tipo
          from public.checklist_respostas r
          left join public.perguntas_checklist pq on pq.id = r.pergunta_id
          where r.checklist_id = b.id
        ) t
      ) a
     where (select sim from usa_derivados)
  ),
  filtrado as (
    select cr.*
      from com_respostas cr
      cross join parametros f
     where (
         f.conclusao is null
         or (f.conclusao = 'finalizado' and (cr.tipo = 'CORRETIVA' or cr.respondidas >= cr.total_perguntas))
         or (f.conclusao = 'incompleto' and not (cr.tipo = 'CORRETIVA' or cr.respondidas >= cr.total_perguntas))
         -- Aprovacao (0089).
         or (f.conclusao = 'aguardando_autorizacao' and cr.aprovacao = 'AGUARDANDO')
         or (f.conclusao = 'aprovado' and cr.aprovacao = 'APROVADO')
         or (f.conclusao = 'reprovado' and cr.aprovacao = 'REPROVADO')
       )
       and (
         (f.nota_minima is null and f.nota_maxima is null)
         or (
           cr.nota is not null
           and (f.nota_minima is null or cr.nota >= f.nota_minima)
           and (f.nota_maxima is null or cr.nota <= f.nota_maxima)
         )
       )
  ),
  pagina_derivada as (
    select fd.*
      from filtrado fd
      cross join parametros f
     order by
       case when f.ascendente then fd.criado_em end asc,
       case when f.ascendente then fd.id end asc,
       case when not f.ascendente then fd.criado_em end desc,
       case when not f.ascendente then fd.id end desc
     limit p_limite
    offset coalesce(p_deslocamento, 0)
  ),
  -- Rota normal: corta a pagina na `base` e soma as respostas so dela. A soma
  -- e a mesma de `com_respostas`, repetida de proposito (ver acima).
  pagina_base as (
    select b.*
      from base b
      cross join parametros f
     where not (select sim from usa_derivados)
     order by
       case when f.ascendente then b.criado_em end asc,
       case when f.ascendente then b.id end asc,
       case when not f.ascendente then b.criado_em end desc,
       case when not f.ascendente then b.id end desc
     limit p_limite
    offset coalesce(p_deslocamento, 0)
  ),
  pagina_simples as (
    select pb.*, a.respondidas, a.nao_conformidades, a.nota
      from pagina_base pb
      cross join lateral (
        select
          count(*)::integer as respondidas,
          count(*) filter (where t.tipo <> 'SN' and t.resposta = 'NAO')::integer as nao_conformidades,
          case
            when count(*) filter (where t.tipo <> 'SN' and t.resposta <> 'NA') = 0 then null
            else floor(
              (
                (count(*) filter (where t.tipo <> 'SN' and t.resposta = 'SIM'))::float8
                / (count(*) filter (where t.tipo <> 'SN' and t.resposta <> 'NA'))::float8
              ) * 100::float8 + 0.5::float8
            )::integer
          end as nota
        from (
          select
            r.resposta,
            case when pq.tipo_resposta in ('CNA', 'CN', 'SN') then pq.tipo_resposta else 'CNA' end as tipo
          from public.checklist_respostas r
          left join public.perguntas_checklist pq on pq.id = r.pergunta_id
          where r.checklist_id = pb.id
        ) t
      ) a
  ),
  pagina as (
    select * from pagina_derivada
    union all
    select * from pagina_simples
  )
  select jsonb_build_object(
    'total',
    case
      when (select sim from usa_derivados) then (select count(*) from filtrado)
      else (select count(*) from base)
    end,
    'linhas',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pg.id,
            'numero', pg.numero,
            'ano', pg.ano,
            'tipo', pg.tipo,
            'motivo', pg.motivo,
            'criado_em', pg.criado_em,
            'modelo_id', pg.modelo_id,
            'modelo_nome', pg.modelo_nome,
            'inicio_em', pg.inicio_em,
            'funcionario_id', pg.funcionario_id,
            'responsavel', pg.responsavel,
            'site_id', pg.site_id,
            'site_nome', pg.site_nome,
            'caminho', pg.caminho,
            'motivo_da_visita', pg.motivo_da_visita,
            'total_perguntas', pg.total_perguntas,
            'respondidas', pg.respondidas,
            'nao_conformidades', pg.nao_conformidades,
            'nota', pg.nota,
            'agenda_id', pg.agenda_id,
            'agenda_nome', pg.agenda_nome,
            'data_planejada', pg.data_planejada,
            'situacao', pg.situacao,
            'aprovacao', pg.aprovacao
          )
          order by
            case when f.ascendente then pg.criado_em end asc,
            case when f.ascendente then pg.id end asc,
            case when not f.ascendente then pg.criado_em end desc,
            case when not f.ascendente then pg.id end desc
        )
        from pagina pg
        cross join parametros f
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.historico_de_checklist(jsonb, integer, integer) from public, anon;
grant execute on function public.historico_de_checklist(jsonb, integer, integer) to authenticated;
