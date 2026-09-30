-- ============================================================================
-- VeloxLab — Limpeza única: visitas vazias criadas pelo toque em "Ver sites"
--
-- NÃO É MIGRATION, DE PROPÓSITO. É correção de dado, uma vez só, em produção.
-- Em `supabase/migrations/` ela rodaria também em todo banco local e em todo
-- preview branch, e ainda entraria na conta do check "Supabase Preview".
-- Rodar à mão no SQL Editor do projeto de produção, na ordem abaixo.
--
-- A ORIGEM -- até o PR #146, tocar num site em "Ver sites" criava a visita na
-- hora (`abrirVisitaPeloSite`). Toda vez que a pessoa voltava sem enviar o
-- checklist, ficava uma visita sem nada no banco (ex.: a 73, na ACE Limpeza).
-- O INSPETOR não consegue apagar: só tem INSERT em `visitas` (0036/0060).
--
-- O QUE CONTA COMO "VAZIA" -- as quatro condições juntas:
--   1. `numero_coleta` é UUID: foi o app que criou. A rota de importação grava
--      o inteiro do sistema de origem (0047), e essas visitas não entram aqui.
--   2. Nenhuma leitura em `leituras`: não é uma ronda por QR. A fila do app só
--      sobe ronda com pelo menos uma leitura.
--   3. Nenhum checklist em `checklists_visita`.
--   4. Criada há mais de 1 dia: não pega quem está preenchendo agora, nem um
--      aparelho que ainda roda a versão antiga do app e acabou de tocar.
--
-- APAGAR NÃO LEVA MAIS NADA JUNTO -- `leituras` e `checklists_visita` têm
-- `on delete cascade`, mas pelas condições 2 e 3 não há linha delas para
-- cascatear. Nenhuma outra tabela referencia `visitas`.
--
-- RASTRO -- `visitas` não tem o trigger de auditoria da 0034. Por isso o passo
-- 2 grava cada linha apagada em `auditoria` (DELETE, `dados_antigos` com a
-- linha inteira, `ator_id` nulo porque quem roda é o SQL Editor, sem pessoa
-- logada). A visita pode ser reconstruída a partir dali, se preciso.
--
-- JÁ RODADO UMA VEZ, em 30/09/2026: 76, 77 e 80 apagadas (todas de teste). A
-- 73 já não existia. Rodar de novo depois que o #146 chegar nos aparelhos, para
-- pegar o que a versão antiga do app tiver criado nesse meio tempo.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASSO 1 — Conferir (só leitura). Rodar primeiro e olhar a lista.
-- ----------------------------------------------------------------------------

select
  v.id,
  v.numero_coleta,
  s.nome        as site,
  p.nome_completo as funcionario,
  v.criado_em,
  (select count(*) from storage.objects o
    where o.bucket_id = 'checklists'
      and o.name like v.id::text || '/%') as arquivos_no_storage
from public.visitas v
join public.sites s on s.id = v.site_id
left join public.profiles p on p.id = v.funcionario_id
where v.numero_coleta ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (select 1 from public.leituras l where l.visita_id = v.id)
  and not exists (select 1 from public.checklists_visita c where c.visita_id = v.id)
  and v.criado_em < now() - interval '1 day'
order by v.criado_em;

-- `arquivos_no_storage` deve vir 0. Se vier maior, uma foto subiu e o
-- `enviar_checklist` falhou depois. A visita pode ser apagada do mesmo jeito,
-- mas os arquivos ficam órfãos no bucket `checklists` e têm que ser apagados
-- pelo painel do Storage (pasta com o id da visita). O Supabase não deixa
-- apagar de `storage.objects` por SQL.


-- ----------------------------------------------------------------------------
-- PASSO 2 — Apagar. Trocar o NULL de `v_esperado` pela quantidade de linhas
-- que o passo 1 mostrou. Se o número não bater na hora de apagar (alguém
-- enviou um checklist entre um passo e outro, por exemplo), nada é apagado.
-- ----------------------------------------------------------------------------

do $$
declare
  v_esperado integer := NULL;  -- <<< quantidade de linhas do passo 1
  v_apagadas integer;
begin
  if v_esperado is null then
    raise exception 'Preencha v_esperado com a quantidade de linhas do passo 1.';
  end if;

  with vazias as (
    select v.id
    from public.visitas v
    where v.numero_coleta ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (select 1 from public.leituras l where l.visita_id = v.id)
      and not exists (select 1 from public.checklists_visita c where c.visita_id = v.id)
      and v.criado_em < now() - interval '1 day'
    for update of v
  ),
  apagadas as (
    delete from public.visitas v
    using vazias
    where v.id = vazias.id
    returning v.*
  ),
  registradas as (
    insert into public.auditoria (tabela, registro_id, operacao, ator_id, dados_antigos)
    select 'visitas', a.id::text, 'DELETE', null, to_jsonb(a)
    from apagadas a
    returning 1
  )
  select count(*) into v_apagadas from registradas;

  if v_apagadas <> v_esperado then
    raise exception 'Esperava apagar % visita(s), mas eram %. Nada foi apagado; rode o passo 1 de novo.',
      v_esperado, v_apagadas;
  end if;

  raise notice '% visita(s) vazia(s) apagada(s) e registrada(s) em auditoria.', v_apagadas;
end;
$$;


-- ----------------------------------------------------------------------------
-- PASSO 3 — Confirmar. Tem que voltar 0, e o rastro tem que estar na auditoria.
-- ----------------------------------------------------------------------------

select count(*) as ainda_vazias
from public.visitas v
where v.numero_coleta ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (select 1 from public.leituras l where l.visita_id = v.id)
  and not exists (select 1 from public.checklists_visita c where c.visita_id = v.id)
  and v.criado_em < now() - interval '1 day';

select registro_id, dados_antigos->>'numero_coleta' as numero_coleta, criado_em
from public.auditoria
where tabela = 'visitas' and operacao = 'DELETE'
order by criado_em desc;
