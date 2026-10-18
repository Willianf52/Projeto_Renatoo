-- ============================================================================
-- 0074 — Numero/Ano do checklist
--
-- O Historico de Checklist mostrava em "Numero/Ano" o `visitas.numero_coleta`,
-- que desde a 0047 e a chave de idempotencia do app (um UUID): o dono viu
-- "db38f3f0-69e0-..." onde esperava "35/2026" (18/10/2026). Coletas Importadas
-- ja escondia o UUID (30/09); o Historico tinha ficado de fora.
--
-- Decisao do dono (18/10/2026): numeracao por ano, como a das ocorrencias
-- ("9/2026"), recomecando em 1 a cada ano. Entao `checklists_visita` ganha
-- `numero` e `ano`, preenchidos SEMPRE pelo banco:
--   - `ano` = ano de `criado_em` no fuso de Sao Paulo. Um checklist feito sem
--     sinal em 31/12 e sincronizado em 01/01 fica no ano em que foi feito;
--   - `numero` vem de um contador por ano (`manutencao.contador_de_checklists`),
--     e nao de max(numero)+1 como nas ocorrencias (0063): excluir o ultimo
--     checklist (0066) liberaria o numero dele para o proximo, e dois
--     checklists diferentes acabariam com o mesmo "18/2026" em PDFs ja
--     impressos. O contador so anda para a frente.
--
-- O gatilho e `security definer` porque o app grava pela `registrar_checklist`
-- (security invoker): o inspetor nao enxerga os checklists dos outros nem o
-- contador, e o numero precisa ser o do sistema inteiro. Ele sobrescreve o que
-- vier no INSERT -- o grant de INSERT da 0042 e na tabela inteira, e um
-- cliente poderia mandar `numero` a mao.
--
-- Os 18 checklists que ja existem (todos de 2026) sao numerados por ordem de
-- `criado_em` (e `id` no empate); o contador comeca de onde a numeracao parou.
-- ============================================================================

create table if not exists manutencao.contador_de_checklists (
  ano smallint primary key,
  ultimo integer not null check (ultimo >= 0)
);

comment on table manutencao.contador_de_checklists is
  'Ultimo numero de checklist dado em cada ano (0074). So o gatilho numerar_checklist escreve aqui.';

revoke all on table manutencao.contador_de_checklists from public, anon, authenticated;

alter table public.checklists_visita
  add column if not exists numero integer,
  add column if not exists ano smallint;

comment on column public.checklists_visita.numero is
  'Numero do checklist no ano (Numero/Ano do Historico). Preenchido pelo gatilho numerar_checklist (0074).';
comment on column public.checklists_visita.ano is
  'Ano de criado_em no fuso de Sao Paulo. Preenchido pelo gatilho numerar_checklist (0074).';

-- Numeracao dos que ja existem ---------------------------------------------
with ordem as (
  select c.id,
         extract(year from c.criado_em at time zone 'America/Sao_Paulo')::smallint as ano,
         row_number() over (
           partition by extract(year from c.criado_em at time zone 'America/Sao_Paulo')
           order by c.criado_em, c.id
         )::integer as numero
    from public.checklists_visita c
   where c.numero is null
)
update public.checklists_visita c
   set numero = o.numero, ano = o.ano
  from ordem o
 where o.id = c.id;

insert into manutencao.contador_de_checklists (ano, ultimo)
  select c.ano, max(c.numero) from public.checklists_visita c group by c.ano
on conflict (ano) do update set ultimo = greatest(manutencao.contador_de_checklists.ultimo, excluded.ultimo);

alter table public.checklists_visita
  alter column numero set not null,
  alter column ano set not null;

alter table public.checklists_visita
  drop constraint if exists checklists_visita_numero_por_ano;
alter table public.checklists_visita
  add constraint checklists_visita_numero_por_ano unique (ano, numero);

-- Numeracao dos novos --------------------------------------------------------
create or replace function manutencao.numerar_checklist()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  new.ano := extract(year from coalesce(new.criado_em, now()) at time zone 'America/Sao_Paulo')::smallint;

  -- O upsert trava a linha do ano ate o fim da transacao: dois envios ao mesmo
  -- tempo recebem numeros diferentes. Se o INSERT do checklist falhar depois
  -- (reenvio da mesma visita, unique da 0042), a transacao inteira volta e o
  -- contador junto -- nao sobra buraco.
  insert into manutencao.contador_de_checklists as c (ano, ultimo)
  values (new.ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
  returning c.ultimo into new.numero;

  return new;
end;
$$;

revoke all on function manutencao.numerar_checklist() from public, anon, authenticated;

drop trigger if exists numerar_checklist on public.checklists_visita;
create trigger numerar_checklist
  before insert on public.checklists_visita
  for each row execute function manutencao.numerar_checklist();
