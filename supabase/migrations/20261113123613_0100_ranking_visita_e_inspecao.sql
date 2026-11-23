-- ============================================================================
-- 0100: Ranking de Inspecoes com o "Tipo" do sistema antigo (Visita/Inspecao)
--
-- POR QUE EXISTE (13/11/2026): no antigo o filtro "Tipo" do Ranking tem duas
-- opcoes. Pelo dono: "Visita" conta cada inspecao feita pelo inspetor no app
-- de campo, e "Inspecao" conta cada QR-Code lido. Sem tipo, o antigo soma as
-- duas (de 01 a 12/11/2026: Visita 0, Inspecao 166, total 166).
--
-- No novo o filtro existia, mas ligado a `tipos_servico` do site, que nunca
-- teve linha: aparecia sem opcoes e nao filtrava nada.
--
--   - p_filtros ->> 'tipo' = 'VISITA': uma por visita (o que a 0049 contava);
--   - p_filtros ->> 'tipo' = 'INSPECAO': uma por leitura de QR-Code no
--     periodo (`qr_code_id` preenchido), respeitando o Checkpoint;
--   - sem tipo: a soma das duas, como no antigo.
-- Os demais filtros (funcionario, grupo de usuarios, checkpoint) continuam
-- passando por `visitas_do_periodo`, como antes. Mesma assinatura e grants.
-- ============================================================================

create or replace function public.relatorio_ranking_de_inspecoes(
  p_inicio timestamp with time zone,
  p_fim timestamp with time zone,
  p_filtros jsonb default '{}'::jsonb
)
returns table(funcionario_id uuid, nome text, quantidade integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with tipo as (
    select upper(nullif(btrim(p_filtros ->> 'tipo'), '')) as valor,
           nullif(p_filtros ->> 'checkpoint', '')::bigint as checkpoint
  ),
  visitas as (
    select v.visita_id, v.funcionario_id
      from public.visitas_do_periodo(p_inicio, p_fim, p_filtros - 'tipo') v
     where v.funcionario_id is not null
  ),
  por_visita as (
    select funcionario_id, count(*) as n from visitas group by funcionario_id
  ),
  por_qr as (
    select v.funcionario_id, count(*) as n
      from visitas v
      join public.leituras l on l.visita_id = v.visita_id
     cross join tipo t
     where l.data_hora >= p_inicio
       and l.data_hora < p_fim
       and l.qr_code_id is not null
       and (t.checkpoint is null or l.qr_code_id = t.checkpoint)
     group by v.funcionario_id
  ),
  somado as (
    select f.funcionario_id,
           (case when t.valor is null or t.valor = 'VISITA' then coalesce(pv.n, 0) else 0 end
          + case when t.valor is null or t.valor = 'INSPECAO' then coalesce(pq.n, 0) else 0 end) as n
      from (select funcionario_id from por_visita union select funcionario_id from por_qr) f
      left join por_visita pv on pv.funcionario_id = f.funcionario_id
      left join por_qr pq on pq.funcionario_id = f.funcionario_id
     cross join tipo t
  )
  select s.funcionario_id, coalesce(autorizacao.nome_do_perfil(s.funcionario_id), ''), s.n::integer
    from somado s
   where s.n > 0
$function$;

comment on function public.relatorio_ranking_de_inspecoes(timestamp with time zone, timestamp with time zone, jsonb) is
  'Ranking de Inspecoes por funcionario (0049). Desde a 0100, p_filtros->>tipo: VISITA (uma por visita do app),
   INSPECAO (uma por QR-Code lido) ou vazio (a soma), como o filtro Tipo do sistema antigo.';
