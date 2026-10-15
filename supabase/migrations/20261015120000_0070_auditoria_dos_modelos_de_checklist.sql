-- ============================================================================
-- 0070 — Trilha de auditoria nos modelos e perguntas do checklist
--
-- Achado da revisao de seguranca de 15/10/2026. A `auditoria` (0034) cobre os
-- cadastros de agosto (sites, grupos, QR, perfis, visitas, leituras e, desde a
-- 0066, checklists), mas nao as tabelas que a 0061 criou:
--
--   * `modelos_checklist`, `perguntas_checklist`: a gestao tem INSERT/UPDATE
--     pela API (policies da 0061, `pode_administrar_cadastros()`), mesmo sem
--     tela no painel. Trocar o texto de uma pergunta, desativa-la ou mudar o
--     tipo de resposta muda todo checklist dali para frente -- e a ocorrencia
--     que a resposta abre (0063). Nada disso deixava rastro.
--   * `modelos_checklist_grupos`: qual modelo cada grupo de sites responde.
--     Ligar ou desligar e mudar o checklist de todos os sites do grupo.
--
-- As tres escrevem com o token da sessao (RLS ativo), entao `auth.uid()` no
-- trigger e quem fez a chamada -- o mesmo caso de `sites`/`grupos_sites` na
-- 0034. A carga em massa por SQL de manutencao (importacao dos modelos,
-- 02/10) roda sem sessao e fica com `ator_id` nulo: e o registro honesto de
-- "foi manutencao", nao uma lacuna.
--
-- CHAVE COMPOSTA: `registrar_auditoria()` tirava `registro_id` da coluna `id`,
-- e `auditoria.registro_id` e `not null`. `modelos_checklist_grupos` nao tem
-- `id` (a chave e `modelo_id` + `grupo_site_id`): com o trigger como estava,
-- toda gravacao nela FALHARIA. A funcao passa a aceitar, como argumentos do
-- trigger, as colunas da chave; sem argumento, segue lendo `id`, entao as
-- tabelas ja cobertas nao mudam de comportamento.
--
-- `create or replace` preserva os grants da funcao (0035/0039: nem `anon` nem
-- `authenticated` executam) e o `search_path` vai repetido igual (0041).
--
-- Fora daqui, de proposito:
--   * `ocorrencias`/`ocorrencia_andamentos`: ninguem escreve `ocorrencias`
--     pela API (nao ha policy de escrita), e o andamento e so-INSERT, com
--     `autor_id` -- o proprio andamento ja e o historico.
--   * `grupos_sites_clientes` (escopo do cliente): gravada pela tela de
--     Usuarios com `service_role`, sem JWT -- o trigger daria `ator_id` nulo.
--     A trilha vai no registro explicito de `usuarios/actions.ts`, junto com o
--     perfil (mesmo arranjo de `profiles`, ver o cabecalho da 0034).
--   * `dados_pessoais_dos_usuarios`: a auditoria viraria uma segunda copia de
--     CPF, legivel por outro caminho.
--
-- Idempotente.
-- ============================================================================

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_linha jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_registro_id text;
  i integer;
begin
  -- Sem argumento: a coluna `id`, como sempre foi. Com argumentos: as colunas
  -- da chave composta, unidas por ":" (ex.: "12:7" = modelo 12, grupo 7).
  if tg_nargs = 0 then
    v_registro_id := v_linha ->> 'id';
  else
    v_registro_id := '';
    for i in 0 .. tg_nargs - 1 loop
      v_registro_id := v_registro_id
        || case when i > 0 then ':' else '' end
        || coalesce(v_linha ->> tg_argv[i], '');
    end loop;
  end if;

  insert into public.auditoria (tabela, registro_id, operacao, ator_id, dados_antigos, dados_novos)
  values (
    tg_table_name,
    v_registro_id,
    tg_op,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists auditoria_trigger on public.modelos_checklist;
create trigger auditoria_trigger
  after insert or update or delete on public.modelos_checklist
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.perguntas_checklist;
create trigger auditoria_trigger
  after insert or update or delete on public.perguntas_checklist
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.modelos_checklist_grupos;
create trigger auditoria_trigger
  after insert or update or delete on public.modelos_checklist_grupos
  for each row execute function public.registrar_auditoria('modelo_id', 'grupo_site_id');

comment on table public.auditoria is
  'Uma linha por INSERT/UPDATE/DELETE nas tabelas com auditoria_trigger (0034, 0066, 0070) e nas gravacoes explicitas de usuarios/actions.ts.';
