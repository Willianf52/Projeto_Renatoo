-- ============================================================================
-- 0099: pergunta obrigatoria e descricao do modelo, como no sistema antigo
--
-- POR QUE EXISTE (13/11/2026): na configuracao do checklist do antigo, cada
-- pergunta tem "Obrigatorio" e cada modelo tem "Descricao". Lidas as 1115
-- perguntas e os 77 modelos do antigo, so o "Obrigatorio" esta em uso (137
-- perguntas que o inspetor pode pular); peso, tipo de calculo e desvio estao
-- todos no padrao, e o dono decidiu fazer so o que e usado.
--
--   - perguntas_checklist.obrigatoria: padrao TRUE, entao nada muda para as
--     perguntas de hoje. Falso, o app deixa passar sem resposta; o banco nao
--     exige resposta de pergunta nenhuma (nunca exigiu: quem exigia era o app).
--   - modelos_checklist.descricao: texto livre, opcional, ate 500 caracteres.
--
-- As permissoes de coluna seguem o padrao das tabelas (0061, 0073): ler para
-- authenticated, gravar pela politica de quem edita checklist.
-- ============================================================================

alter table public.perguntas_checklist
  add column if not exists obrigatoria boolean not null default true;

comment on column public.perguntas_checklist.obrigatoria is
  'Falso: o inspetor pode deixar a pergunta sem resposta (o "Obrigatorio" do sistema antigo, 0099).';

alter table public.modelos_checklist
  add column if not exists descricao text;

alter table public.modelos_checklist
  drop constraint if exists modelos_checklist_descricao_check;
alter table public.modelos_checklist
  add constraint modelos_checklist_descricao_check check (descricao is null or length(descricao) <= 500);

comment on column public.modelos_checklist.descricao is
  'Descricao livre do modelo, como no sistema antigo (0099).';

grant select (obrigatoria), insert (obrigatoria), update (obrigatoria) on public.perguntas_checklist to authenticated;
grant select (descricao), insert (descricao), update (descricao) on public.modelos_checklist to authenticated;

-- Duplicar leva as duas colunas novas: a copia de um modelo continua com as
-- mesmas perguntas obrigatorias e a mesma descricao. O resto como na 0073.
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
  insert into public.modelos_checklist (nome, ativo, descricao)
  select btrim(p_nome), true, m.descricao
    from public.modelos_checklist m
   where m.id = p_modelo_id
  returning id into v_id;

  insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta, evento_id, grupo_pergunta_id, ativo, obrigatoria)
  select v_id, p.ordem, p.texto, p.tipo_resposta, p.evento_id, p.grupo_pergunta_id, p.ativo, p.obrigatoria
    from public.perguntas_checklist p
   where p.modelo_id = p_modelo_id;

  return v_id;
end;
$function$;
