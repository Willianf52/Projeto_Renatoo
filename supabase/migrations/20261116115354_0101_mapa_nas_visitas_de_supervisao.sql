-- ============================================================================
-- 0101: Visitas de Supervisao com a coordenada da leitura, para o link do mapa
--
-- POR QUE EXISTE (16/11/2026): no antigo, a coluna "Geolocalizacao" das
-- Visitas de Supervisao e um link que abre um mapa com um marcador no ponto
-- onde a visita foi feita (so o marcador: sem circulo de raio, sem distancia).
-- No novo a coluna mostrava so "Sim", embora desde a 0088 cada leitura guarde
-- latitude e longitude. A decisao de nao mostrar a coordenada (docs/melhorias.md)
-- era de antes da 0088, quando o valor nao era guardado.
--
-- A funcao passa a devolver `latitude` e `longitude` da visita: as da leitura
-- mais antiga que as tem (a de Inicio, tipicamente). Visita sem coordenada
-- (anterior a 0088, ou aparelho sem sinal) volta com os dois nulos, e a tela
-- continua mostrando "Sim" quando a flag `tem_localizacao` diz que houve sinal.
--
-- `returns table` mudou, entao e drop + create (create or replace nao troca o
-- tipo de retorno). Mesmas permissoes da 0049. A funcao roda como quem chama
-- (invoker): a leitura de `leituras` continua recortada pela seguranca por
-- linha, como em `visitas_do_periodo`.
-- ============================================================================

drop function if exists public.relatorio_visitas_de_supervisao(bigint, timestamptz, timestamptz);

create function public.relatorio_visitas_de_supervisao(
  p_site bigint, p_inicio timestamptz, p_fim timestamptz
)
returns table (visita_id bigint, data_hora timestamptz, funcionario text, local text,
               tem_localizacao boolean, motivo_visita text, observacao text,
               latitude double precision, longitude double precision)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    v.visita_id,
    v.primeira_leitura,
    coalesce(autorizacao.nome_do_perfil(v.funcionario_id), ''),
    coalesce(s.nome, ''),
    v.tem_localizacao,
    coalesce(m.nome, ''),
    coalesce(v.observacao, ''),
    ponto.latitude,
    ponto.longitude
  from public.visitas_do_periodo(p_inicio, p_fim, jsonb_build_object('site', p_site)) v
  left join public.sites s on s.id = v.site_id
  left join public.motivos_visita m on m.id = v.motivo_visita_id
  left join lateral (
    select l.latitude, l.longitude
      from public.leituras l
     where l.visita_id = v.visita_id
       and l.latitude is not null
       and l.longitude is not null
     order by l.data_hora, l.id
     limit 1
  ) ponto on true
$$;

revoke all on function public.relatorio_visitas_de_supervisao(bigint, timestamptz, timestamptz) from public, anon;
grant execute on function public.relatorio_visitas_de_supervisao(bigint, timestamptz, timestamptz) to authenticated;

comment on function public.relatorio_visitas_de_supervisao(bigint, timestamptz, timestamptz) is
  'Visitas de Supervisao de um site no periodo (0049), com o nome de quem fez (0076) e, desde a 0101, a coordenada da primeira leitura que a tem.';
