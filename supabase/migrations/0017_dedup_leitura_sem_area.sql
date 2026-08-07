-- Fecha o buraco descrito em docs/importacao-de-coletas.md: no Postgres, um
-- indice unico nao considera dois NULL iguais, entao uma leitura sem
-- `area_id` escapava da deduplicacao da 0004 e entrava de novo a cada
-- reenvio do mesmo lote de importacao.
--
-- NULLS NOT DISTINCT (Postgres 15+) faz o par de NULL colidir como
-- duplicata, igual ja acontecia quando `area_id` vinha preenchido. Constraint
-- recriada porque Postgres nao tem ALTER CONSTRAINT para trocar essa opcao.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.

alter table public.leituras
  drop constraint if exists leituras_visita_area_hora_unico;

-- Guardado num bloco, mesmo padrao da 0012: se ja existir uma duplicata real
-- sob a regra nova (duas leituras da mesma visita, no mesmo instante, ambas
-- sem area), a constraint falha ao ser criada e o erro cru nao diria qual.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leituras_visita_area_hora_unico'
  ) then
    begin
      alter table public.leituras
        add constraint leituras_visita_area_hora_unico
        unique nulls not distinct (visita_id, area_id, data_hora);
    exception when unique_violation then
      raise warning 'leituras_visita_area_hora_unico nao recriada: ha leituras duplicadas sob a regra nova (mesma visita, mesmo instante, ambas sem area). Resolva as duplicatas e rode a migration de novo.';
    end;
  end if;
end $$;
