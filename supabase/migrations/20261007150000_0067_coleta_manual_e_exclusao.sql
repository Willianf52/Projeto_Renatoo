-- ============================================================================
-- 0067 -- Coletas Importadas: cadastro manual e exclusao de coleta
--
-- ISSUE #177, SEGUNDO ITEM. No sistema de referencia, a tela de Coletas
-- Importadas tem um "cadastro manual" (Data, Hora, Coletor de Dados,
-- Funcionario, Local, Area, Evento, Acao, Qualificador e a quantidade de
-- coletas a cadastrar) e um "Excluir". Os dois ficam escondidos no perfil do
-- dono -- sao de um perfil acima dele. O dono decidiu (07/10/2026):
--
--   - so GESTOR cadastra e exclui (`autorizacao.pode_administrar_usuarios`);
--   - a exclusao e POR LINHA, e nao em massa por coletor e periodo como no
--     antigo; e coleta de visita com checklist enviado nao sai (23514): o
--     checklist se exclui no Historico (0066), e a inspecao fica inteira.
--
-- CADASTRO: cada coleta e uma visita com uma leitura, como as importadas --
-- e o que faz cada uma ter o seu numero na coluna Coleta. `numero_coleta` e um
-- UUID, como no app (0047), e a tela mostra o id da visita no lugar dele. A
-- leitura leva "Cadastro manual" na Observacao, para nunca ser confundida com
-- inspecao feita no local, e vai para a `auditoria` com quem a cadastrou. A
-- data da coleta fica na janela das leituras de campo (0054): ate 30 dias
-- para tras, sem futuro. As policies de INSERT de campo (0060) nao mudam.
--
-- EXCLUSAO: DELETE em `leituras` para GESTOR, pela policy. A visita que fica
-- sem leitura e sem checklist sai junto (trigger), para nao sobrar visita
-- vazia contando nos relatorios. Leitura e visita excluidas vao para a
-- `auditoria`.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Cadastro manual ---------------------------------------------------------------
-- O GESTOR grava em nome de OUTRO funcionario -- e isso a 0060 fechou de
-- proposito para INSERT direto: "registrar visita em nome de outra pessoa
-- continua fechado para todo mundo". As policies de campo NAO mudam. A unica
-- porta e esta funcao, que confere o cargo, marca a leitura como "Cadastro
-- manual" e grava a auditoria -- nao da para usa-la para pendurar leitura
-- forjada na visita real de um inspetor: ela so cria visita nova.
--
-- O trabalho e `security definer` num schema fora do PostgREST (`escrita`),
-- e `public` so tem o envelope `security invoker`: a regra da 0050 (nenhuma
-- funcao `security definer` em `public` chamavel por quem esta logado), no
-- mesmo molde de `autorizacao`. O trigger da 0054 continua valendo -- a
-- sessao segue `authenticated` --, entao a data da coleta fica na janela das
-- leituras de campo.

create schema if not exists escrita;
revoke all on schema escrita from public;
grant usage on schema escrita to authenticated, service_role;

comment on schema escrita is
  'Escritas controladas (security definer) chamadas por envelope em public. Fora do PostgREST de proposito -- ver migration 0067.';

create or replace function escrita.cadastrar_coletas_manuais(
  p_site_id bigint,
  p_funcionario_id uuid,
  p_data_hora timestamptz,
  p_quantidade integer,
  p_coletor_dados_id bigint,
  p_area_id bigint,
  p_evento_id bigint,
  p_acao_id bigint,
  p_qualificador_id bigint
)
returns integer
language plpgsql
security definer
set search_path = escrita, public, pg_temp
as $$
declare
  v_visita_id bigint;
  v_leitura public.leituras%rowtype;
begin
  if not autorizacao.pode_administrar_usuarios() then
    raise exception 'Somente GESTOR cadastra coleta manual' using errcode = '42501';
  end if;

  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 50 then
    raise exception 'A quantidade de coletas deve ficar entre 1 e 50' using errcode = '22023';
  end if;

  -- A mesma janela do trigger da 0054, conferida aqui para a mensagem certa.
  if p_data_hora is null
     or p_data_hora > now() + interval '1 hour'
     or p_data_hora < now() - interval '30 days' then
    raise exception 'A data da coleta deve ficar entre os ultimos 30 dias e agora' using errcode = '22008';
  end if;

  -- O RLS nao filtra aqui (definer): local e funcionario conferidos a mao.
  if not exists (select 1 from public.sites s where s.id = p_site_id and s.ativo) then
    raise exception 'Local inexistente ou inativo' using errcode = '23503';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_funcionario_id and p.ativo) then
    raise exception 'Funcionario inexistente ou inativo' using errcode = '23503';
  end if;

  for i in 1..p_quantidade loop
    insert into public.visitas (numero_coleta, site_id, funcionario_id, coletor_dados_id, data_integracao)
    values (gen_random_uuid()::text, p_site_id, p_funcionario_id, p_coletor_dados_id, now())
    returning id into v_visita_id;

    insert into public.leituras (
      visita_id, data_hora, area_id, evento_id, acao_id, qualificador_id,
      observacao, tem_localizacao, data_integracao
    ) values (
      v_visita_id, p_data_hora, p_area_id, p_evento_id, p_acao_id, p_qualificador_id,
      'Cadastro manual', false, now()
    )
    returning * into v_leitura;

    insert into public.auditoria (tabela, registro_id, operacao, ator_id, dados_antigos, dados_novos)
    values ('leituras', v_leitura.id::text, 'INSERT', auth.uid(), null, to_jsonb(v_leitura));
  end loop;

  return p_quantidade;
end;
$$;

revoke all on function escrita.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint) from public, anon;
grant execute on function escrita.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint) to authenticated;

-- O envelope que o painel chama por RPC: mesmo nome, roda como quem chama.
create or replace function public.cadastrar_coletas_manuais(
  p_site_id bigint,
  p_funcionario_id uuid,
  p_data_hora timestamptz,
  p_quantidade integer,
  p_coletor_dados_id bigint default null,
  p_area_id bigint default null,
  p_evento_id bigint default null,
  p_acao_id bigint default null,
  p_qualificador_id bigint default null
)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.cadastrar_coletas_manuais(
    p_site_id, p_funcionario_id, p_data_hora, p_quantidade,
    p_coletor_dados_id, p_area_id, p_evento_id, p_acao_id, p_qualificador_id
  );
$$;

comment on function public.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint) is
  'Cadastro manual de coletas (Coletas Importadas): N visitas com uma leitura
   cada, em nome do funcionario escolhido. So GESTOR. Envelope de
   escrita.cadastrar_coletas_manuais -- migration 0067.';

revoke all on function public.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint) from public, anon;
grant execute on function public.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint) to authenticated;

-- 2) Exclusao por linha -------------------------------------------------------------

grant delete on public.leituras to authenticated;

drop policy if exists "Gestor exclui coleta" on public.leituras;
create policy "Gestor exclui coleta" on public.leituras
  for delete to authenticated
  using (autorizacao.pode_administrar_usuarios());

-- Coleta de visita com checklist fica. BEFORE DELETE so dispara para a linha
-- que passou pelo USING acima, entao o erro nao revela nada a quem nao pode
-- excluir. So para sessao de pessoa: a cascata de uma visita excluida (e a
-- manutencao com `service_role`) nao e barrada por esta regra de tela.
create or replace function manutencao.coleta_com_checklist_fica()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return old;
  end if;

  if exists (select 1 from public.checklists_visita c where c.visita_id = old.visita_id) then
    raise exception 'Esta coleta é de uma visita com checklist enviado e não pode ser excluída.'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

revoke all on function manutencao.coleta_com_checklist_fica() from public, anon, authenticated;

drop trigger if exists coleta_com_checklist_fica on public.leituras;
create trigger coleta_com_checklist_fica
  before delete on public.leituras
  for each row execute function manutencao.coleta_com_checklist_fica();

-- A visita que ficou sem leitura e sem checklist sai junto.
create or replace function manutencao.visita_vazia_sai()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return old;
  end if;

  delete from public.visitas v
   where v.id = old.visita_id
     and not exists (select 1 from public.leituras l where l.visita_id = v.id)
     and not exists (select 1 from public.checklists_visita c where c.visita_id = v.id);

  return old;
end;
$$;

revoke all on function manutencao.visita_vazia_sai() from public, anon, authenticated;

drop trigger if exists visita_vazia_sai on public.leituras;
create trigger visita_vazia_sai
  after delete on public.leituras
  for each row execute function manutencao.visita_vazia_sai();

-- 3) Rastro na auditoria ----------------------------------------------------------
-- So DELETE aqui: inserir leitura e o trabalho de campo de todo dia (a manual
-- ja grava a propria linha, acima).

drop trigger if exists auditoria_trigger on public.leituras;
create trigger auditoria_trigger
  after delete on public.leituras
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.visitas;
create trigger auditoria_trigger
  after delete on public.visitas
  for each row execute function public.registrar_auditoria();
