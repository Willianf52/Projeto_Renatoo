-- ============================================================================
-- 0115: "Qtd. mínima de caracteres no campo Observação" por checklist
--
-- O dono, em 23/11/2026: o "Criar Checklist > Novo" deve ficar igual ao do
-- sistema antigo. Lá o modelo tem "Qtd. mínima de caracteres no campo
-- Observação"; aqui esse mínimo existia um só para tudo, em Cadastros >
-- Cliente (`cliente.min_caracteres_descricao`, 0085/0086).
--
--   * modelos_checklist.min_caracteres_observacao: opcional. Nulo, vale o do
--     Cliente, como antes; preenchido, vale o do checklist. Nada muda para os
--     modelos de hoje, que nascem nulos.
--   * duplicar_modelo leva o valor junto (o resto como na 0108).
-- ============================================================================

alter table public.modelos_checklist
  add column if not exists min_caracteres_observacao smallint;

alter table public.modelos_checklist drop constraint if exists modelos_checklist_min_caracteres_observacao_check;
alter table public.modelos_checklist
  add constraint modelos_checklist_min_caracteres_observacao_check
  check (min_caracteres_observacao is null or min_caracteres_observacao between 0 and 500);

comment on column public.modelos_checklist.min_caracteres_observacao is
  'Minimo de caracteres da observacao do Nao conforme neste checklist (0115). Nulo: vale o de cliente.min_caracteres_descricao.';

grant select (min_caracteres_observacao), insert (min_caracteres_observacao), update (min_caracteres_observacao)
  on public.modelos_checklist to authenticated;

create or replace function public.duplicar_modelo(p_modelo_id bigint, p_nome text)
returns bigint
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id bigint;
begin
  if not exists (select 1 from public.modelos_checklist where id = p_modelo_id) then
    raise exception 'Modelo inexistente.' using errcode = '23514';
  end if;

  -- Nasce ativo e sem grupos: so passa a valer quando alguem ligar a um grupo.
  insert into public.modelos_checklist (nome, ativo, descricao, ordem_aleatoria, min_caracteres_observacao)
  select btrim(p_nome), true, m.descricao, m.ordem_aleatoria, m.min_caracteres_observacao
    from public.modelos_checklist m
   where m.id = p_modelo_id
  returning id into v_id;

  insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta, evento_id, grupo_pergunta_id, ativo, obrigatoria, peso)
  select v_id, p.ordem, p.texto, p.tipo_resposta, p.evento_id, p.grupo_pergunta_id, p.ativo, p.obrigatoria, p.peso
    from public.perguntas_checklist p
   where p.modelo_id = p_modelo_id;

  update public.perguntas_checklist copia
     set pergunta_base_id = base_copia.id,
         resposta_gatilho = original.resposta_gatilho
    from public.perguntas_checklist original
    join public.perguntas_checklist base_original on base_original.id = original.pergunta_base_id
    join public.perguntas_checklist base_copia
      on base_copia.modelo_id = v_id and base_copia.ordem = base_original.ordem
   where original.modelo_id = p_modelo_id
     and copia.modelo_id = v_id
     and copia.ordem = original.ordem;

  return v_id;
end;
$function$;
