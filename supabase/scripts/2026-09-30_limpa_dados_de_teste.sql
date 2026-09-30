-- ============================================================================
-- VeloxLab — Limpeza única: dados de homologação marcados `[TESTE]`
--
-- NÃO É MIGRATION, DE PROPÓSITO. É correção de dado, uma vez só, em produção.
-- Em `supabase/migrations/` ela rodaria em todo banco local e preview branch.
-- Rodar à mão no SQL Editor do projeto de produção, na ordem abaixo.
--
-- QUANDO RODAR -- `docs/piloto-de-operacao.md`: "só depois de tudo isso
-- funcionando com dado real". Na prática, as três coisas abaixo feitas:
--   1. O APK 1.1.0 testado (emulador e aparelho de inspetor, #112): o roteiro
--      usa o site `[TESTE] Posto Central` e os QR `TESTE-RONDA-1/2`.
--   2. As 10 perguntas definitivas cadastradas. O plano (#136) é REESCREVER as
--      5 `[TESTE]` (ordens 1-5) e criar mais 5. Pergunta reescrita perde o
--      prefixo `[TESTE]` e este script deixa de apagá-la -- de propósito.
--      Se ainda houver pergunta `[TESTE]` quando rodar, ela é apagada e o
--      checklist de Consultoria perde essa pergunta.
--   3. Um backup fresco: *Actions -> Backup do banco -> Run workflow*, e
--      conferir o objeto novo no R2 antes do passo 2.
--
-- O QUE APAGA (levantado em 30/09/2026; o passo 1 mostra o estado do dia):
--   - grupo 38 "[TESTE] Homologacao mobile" e o site 30 "[TESTE] Posto Central"
--   - os QR do site (600 `TESTE-RONDA-1`, 601 `TESTE-RONDA-2`), por cascade
--   - TODAS as visitas do site de teste, com leituras, checklists, respostas
--     e fotos (cascade). Em 30/09: 12 visitas, 8 leituras, 10 checklists.
--     ATENCAO: em 30/09 essas 12 eram TODAS as visitas de producao -- depois
--     da limpeza, historico e relatorios ficam vazios ate o piloto.
--   - as perguntas do checklist cujo texto ainda comeca com `[TESTE]`
-- E DESATIVA (nao apaga) a conta "Inspetor de Teste": apagar exigiria remover
-- o login em auth.users; desativada, ela ja nao entra.
--
-- O QUE NAO TOCA: os 268 sites e 565 QR-codes de clientes reais, os outros
-- grupos, as contas reais e a auditoria. O passo 2 recusa tudo se as contagens
-- nao baterem com as que voce preencher a partir do passo 1.
--
-- RASTRO -- `sites`, `grupos_sites`, `qr_codes` e `profiles` ja tem o trigger
-- de auditoria da 0034: cada linha apagada/alterada ali entra sozinha em
-- `auditoria`. `visitas` e `perguntas_checklist` nao tem; o passo 2 grava cada
-- visita (com leituras, checklist, respostas e fotos dentro do JSON) e cada
-- pergunta em `auditoria`, com `ator_id` nulo porque quem roda e o SQL Editor.
--
-- ARQUIVOS DO STORAGE -- fotos e assinaturas moram no bucket `checklists`, em
-- pastas com o id da visita. O Supabase nao deixa apagar `storage.objects` por
-- SQL: o passo 1 lista as pastas, e elas sao apagadas pelo painel do Storage
-- DEPOIS do passo 2 (em 30/09: 26 arquivos, 12 MB).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASSO 1 — Conferir (só leitura). Rodar e anotar cada número.
-- ----------------------------------------------------------------------------

with site_teste as (select id from public.sites where nome like '[TESTE]%'),
     visitas_teste as (select id from public.visitas where site_id in (select id from site_teste))
select 'grupos [TESTE]' as item, count(*)::text as quantidade,
       string_agg(id || ' ' || nome, '; ') as detalhe
  from public.grupos_sites where nome like '[TESTE]%'
union all
select 'sites [TESTE]', count(*)::text, string_agg(id || ' ' || nome, '; ')
  from public.sites where id in (select id from site_teste)
union all
select 'QR dos sites [TESTE] (vao por cascade)', count(*)::text, string_agg(id || ' ' || codigo, '; ')
  from public.qr_codes where site_id in (select id from site_teste)
union all
select 'visitas dos sites [TESTE]', count(*)::text, string_agg(id::text, ',' order by id)
  from public.visitas where id in (select id from visitas_teste)
union all
select 'leituras dessas visitas', count(*)::text, null
  from public.leituras where visita_id in (select id from visitas_teste)
union all
select 'checklists dessas visitas', count(*)::text, string_agg(id::text, ',' order by id)
  from public.checklists_visita where visita_id in (select id from visitas_teste)
union all
select 'perguntas [TESTE]', count(*)::text, string_agg(id || ' ordem ' || ordem, '; ' order by ordem)
  from public.perguntas_checklist where texto like '[TESTE]%'
union all
select 'conta Inspetor de Teste (sera desativada)', count(*)::text, string_agg(cargo || ' ativo=' || ativo, '; ')
  from public.profiles where nome_completo = 'Inspetor de Teste'
-- Os tres abaixo TEM que vir 0. Se nao vierem, pare e descubra por que.
union all
select 'PARE SE > 0: sites reais dentro de grupo [TESTE]', count(*)::text, string_agg(id || ' ' || nome, '; ')
  from public.sites
 where grupo_site_id in (select id from public.grupos_sites where nome like '[TESTE]%')
   and nome not like '[TESTE]%'
union all
select 'PARE SE > 0: respostas reais usando pergunta [TESTE]', count(*)::text, null
  from public.checklist_respostas r
 where r.pergunta_id in (select id from public.perguntas_checklist where texto like '[TESTE]%')
   and r.checklist_id not in (select c.id from public.checklists_visita c where c.visita_id in (select id from visitas_teste))
union all
select 'PARE SE > 0: visitas da conta de teste fora do site [TESTE]', count(*)::text, null
  from public.visitas
 where funcionario_id in (select id from public.profiles where nome_completo = 'Inspetor de Teste')
   and id not in (select id from visitas_teste)
union all
select 'grupos filhos de grupo [TESTE] (so perdem o pai)', count(*)::text, string_agg(id || ' ' || nome, '; ')
  from public.grupos_sites
 where grupo_pai_id in (select id from public.grupos_sites where nome like '[TESTE]%')
union all
select 'pastas no Storage (apagar pelo painel depois)', count(distinct split_part(name, '/', 1))::text,
       string_agg(distinct split_part(name, '/', 1), ',')
  from storage.objects
 where bucket_id = 'checklists' and split_part(name, '/', 1) in (select id::text from visitas_teste);


-- ----------------------------------------------------------------------------
-- PASSO 2 — Apagar. Preencha os NULL com os números do passo 1. Se qualquer
-- contagem não bater na hora de apagar, nada é apagado.
-- ----------------------------------------------------------------------------

do $$
declare
  esperado_grupos    integer := NULL;  -- <<< "grupos [TESTE]"
  esperado_sites     integer := NULL;  -- <<< "sites [TESTE]"
  esperado_qr        integer := NULL;  -- <<< "QR dos sites [TESTE]"
  esperado_visitas   integer := NULL;  -- <<< "visitas dos sites [TESTE]"
  esperado_perguntas integer := NULL;  -- <<< "perguntas [TESTE]"
  esperado_perfis    integer := NULL;  -- <<< "conta Inspetor de Teste" (1)

  site_ids   bigint[];
  visita_ids bigint[];
  feito      integer;
begin
  if esperado_grupos is null or esperado_sites is null or esperado_qr is null
     or esperado_visitas is null or esperado_perguntas is null or esperado_perfis is null then
    raise exception 'Preencha as seis contagens esperadas com os numeros do passo 1.';
  end if;

  select coalesce(array_agg(id), '{}') into site_ids from public.sites where nome like '[TESTE]%';
  select coalesce(array_agg(id), '{}') into visita_ids from public.visitas where site_id = any(site_ids);

  -- A primeira trava do passo 1, de novo, dentro da transacao. As outras duas
  -- nao precisam: resposta real numa pergunta [TESTE] faz o proprio banco
  -- recusar o delete (restrict), e visita fora do site de teste nao e tocada.
  if exists (select 1 from public.sites
              where grupo_site_id in (select id from public.grupos_sites where nome like '[TESTE]%')
                and nome not like '[TESTE]%') then
    raise exception 'Ha site real dentro de grupo [TESTE]. Nada foi apagado.';
  end if;

  -- 1) Rastro das visitas, com tudo o que vai junto por cascade.
  insert into public.auditoria (tabela, registro_id, operacao, ator_id, dados_antigos)
  select 'visitas', v.id::text, 'DELETE', null,
         to_jsonb(v) || jsonb_build_object(
           'leituras', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]') from public.leituras l where l.visita_id = v.id),
           'checklists', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
               'respostas', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.checklist_respostas r where r.checklist_id = c.id),
               'fotos', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.checklist_fotos f where f.checklist_id = c.id)
             )), '[]') from public.checklists_visita c where c.visita_id = v.id))
    from public.visitas v
   where v.id = any(visita_ids);

  -- 2) Visitas (leituras, checklists, respostas e fotos vao por cascade).
  delete from public.visitas where id = any(visita_ids);
  get diagnostics feito = row_count;
  if feito <> esperado_visitas then
    raise exception 'Visitas: esperava %, eram %. Nada foi apagado.', esperado_visitas, feito;
  end if;

  -- 3) Perguntas ainda [TESTE]. Depois das visitas: `checklist_respostas`
  --    aponta para elas com restrict.
  insert into public.auditoria (tabela, registro_id, operacao, ator_id, dados_antigos)
  select 'perguntas_checklist', p.id::text, 'DELETE', null, to_jsonb(p)
    from public.perguntas_checklist p where p.texto like '[TESTE]%';

  delete from public.perguntas_checklist where texto like '[TESTE]%';
  get diagnostics feito = row_count;
  if feito <> esperado_perguntas then
    raise exception 'Perguntas: esperava %, eram %. Nada foi apagado.', esperado_perguntas, feito;
  end if;

  -- 4) QR e site. O QR iria por cascade, mas conferir a contagem pede apagar
  --    explicito antes. Os dois tem trigger de auditoria.
  delete from public.qr_codes where site_id = any(site_ids);
  get diagnostics feito = row_count;
  if feito <> esperado_qr then
    raise exception 'QR-codes: esperava %, eram %. Nada foi apagado.', esperado_qr, feito;
  end if;

  delete from public.sites where id = any(site_ids);
  get diagnostics feito = row_count;
  if feito <> esperado_sites then
    raise exception 'Sites: esperava %, eram %. Nada foi apagado.', esperado_sites, feito;
  end if;

  -- 5) Grupo, depois do site (`sites.grupo_site_id` e restrict).
  delete from public.grupos_sites where nome like '[TESTE]%';
  get diagnostics feito = row_count;
  if feito <> esperado_grupos then
    raise exception 'Grupos: esperava %, eram %. Nada foi apagado.', esperado_grupos, feito;
  end if;

  -- 6) Conta de teste desativada (trigger de auditoria em profiles).
  update public.profiles set ativo = false
   where nome_completo = 'Inspetor de Teste' and ativo;
  get diagnostics feito = row_count;
  if feito <> esperado_perfis then
    raise exception 'Conta de teste: esperava desativar %, foram %. Nada foi apagado.', esperado_perfis, feito;
  end if;

  raise notice 'Limpeza feita: % visita(s), % pergunta(s), % QR, % site(s), % grupo(s); conta de teste desativada.',
    esperado_visitas, esperado_perguntas, esperado_qr, esperado_sites, esperado_grupos;
end;
$$;


-- ----------------------------------------------------------------------------
-- PASSO 3 — Confirmar. As cinco primeiras linhas têm que vir 0 e a conta,
-- ativo=false. Depois, apagar pelo painel do Storage as pastas listadas no
-- passo 1 (bucket `checklists`).
-- ----------------------------------------------------------------------------

select 'grupos [TESTE]' item, count(*)::text valor from public.grupos_sites where nome like '[TESTE]%'
union all select 'sites [TESTE]', count(*)::text from public.sites where nome like '[TESTE]%'
union all select 'QR TESTE-*', count(*)::text from public.qr_codes where codigo like 'TESTE-%'
union all select 'perguntas [TESTE]', count(*)::text from public.perguntas_checklist where texto like '[TESTE]%'
union all select 'visitas sem site valido', count(*)::text from public.visitas v
            where not exists (select 1 from public.sites s where s.id = v.site_id)
union all select 'conta Inspetor de Teste', string_agg('ativo=' || ativo, '; ') from public.profiles where nome_completo = 'Inspetor de Teste'
union all select 'sites reais (antes: 268)', count(*)::text from public.sites
union all select 'QR reais (antes: 565)', count(*)::text from public.qr_codes
union all select 'linhas de auditoria desta limpeza', count(*)::text from public.auditoria
            where criado_em > now() - interval '1 hour'
              and tabela in ('visitas', 'perguntas_checklist', 'sites', 'qr_codes', 'grupos_sites', 'profiles');
