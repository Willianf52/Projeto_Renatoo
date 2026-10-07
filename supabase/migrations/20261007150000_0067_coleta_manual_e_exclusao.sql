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
-- para tras, sem futuro.
--
-- EXCLUSAO: DELETE em `leituras` para GESTOR, pela policy. A visita que fica
-- sem leitura e sem checklist sai junto (trigger), para nao sobrar visita
-- vazia contando nos relatorios. Leitura e visita excluidas vao para a
-- `auditoria`.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Cadastro manual ---------------------------------------------------------------
-- O GESTOR grava em nome de OUTRO funcionario, e as policies de campo (0060)
-- so deixam gravar a propria visita: estas duas policies somam a dele. O
-- grant de coluna da 0054 nao muda -- `data_integracao` fica em branco, como
-- nas leituras do app -- e o trigger da 0054 continua valendo, entao a data
-- da coleta fica na mesma janela das leituras de campo.

drop policy if exists "Gestor cadastra coleta manual" on public.visitas;
create policy "Gestor cadastra coleta manual" on public.visitas
  for insert to authenticated
  with check (autorizacao.pode_administrar_usuarios());

drop policy if exists "Gestor cadastra leitura manual" on public.leituras;
create policy "Gestor cadastra leitura manual" on public.leituras
  for insert to authenticated
  with check (autorizacao.pode_administrar_usuarios());

-- `security invoker`: as policies acima sao o portao, pela regra da 0050
-- (nenhuma funcao `security definer` em `public` chamavel por quem esta
-- logado). A checagem de cargo aqui so da a mensagem certa antes do RLS.
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
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_visita_id bigint;
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

  for i in 1..p_quantidade loop
    insert into public.visitas (numero_coleta, site_id, funcionario_id, coletor_dados_id)
    values (gen_random_uuid()::text, p_site_id, p_funcionario_id, p_coletor_dados_id)
    returning id into v_visita_id;

    insert into public.leituras (
      visita_id, data_hora, area_id, evento_id, acao_id, qualificador_id, observacao, tem_localizacao
    ) values (
      v_visita_id, p_data_hora, p_area_id, p_evento_id, p_acao_id, p_qualificador_id, 'Cadastro manual', false
    );
  end loop;

  return p_quantidade;
end;
$$;

comment on function public.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint) is
  'Cadastro manual de coletas (Coletas Importadas): N visitas com uma leitura
   cada, em nome do funcionario escolhido. So GESTOR, pelas policies da 0067.';

revoke all on function public.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint) from public, anon;
grant execute on function public.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint) to authenticated;

-- Quem cadastrou: a leitura manual vai para a `auditoria` com o autor. So
-- ela -- a leitura de campo de todo dia nao.
drop trigger if exists auditoria_da_leitura_manual on public.leituras;
create trigger auditoria_da_leitura_manual
  after insert on public.leituras
  for each row
  when (new.observacao = 'Cadastro manual')
  execute function public.registrar_auditoria();

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
-- ja tem o trigger proprio, acima).

drop trigger if exists auditoria_trigger on public.leituras;
create trigger auditoria_trigger
  after delete on public.leituras
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.visitas;
create trigger auditoria_trigger
  after delete on public.visitas
  for each row execute function public.registrar_auditoria();
