-- ============================================================================
-- 0102: o PDF do checklist vai tambem para quem fez a inspecao
--
-- Pedido do gestor (16/11/2026, autorizado em 17/11): o aviso de inspecao com
-- o PDF ja vai ao superior (0068), aos gestores (0080) e aos "E-mails
-- Checklist" do site (0082). Agora vai tambem a quem enviou o checklist, de
-- qualquer cargo: o inspetor mostra o PDF ao cliente na hora.
--
-- Mesma trava das outras fontes (`manutencao.aviso_de_inspecao.somente_para`):
-- enquanto ela estiver restrita, so os e-mails da lista recebem. O autor
-- precisa estar ativo e ter e-mail. `distinct` evita mandar duas vezes a quem
-- ja recebe por outro caminho (um gestor que fez o proprio checklist).
--
-- So a funcao muda; o gatilho que a chama (0068) segue o mesmo.
-- ============================================================================

create or replace function manutencao.email_do_checklist_ao_superior()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  begin
    insert into public.checklist_emails (checklist_id, destinatario)
    select distinct new.id, d.email
      from (
        -- O superior de quem enviou, com a caixa marcada (0068).
        select lower(btrim(superior.email)) as email
          from public.visitas v
          join public.profiles autor on autor.id = v.funcionario_id
          join public.profiles superior on superior.id = autor.superior_id
         where v.id = new.visita_id
           and autor.email_superior_checklist
           and superior.ativo
           and superior.id <> autor.id
        union
        -- Todos os gestores ativos (0080), pela trava.
        select lower(btrim(g.email))
          from public.profiles g
         cross join manutencao.aviso_de_inspecao c
         where g.ativo
           and g.cargo = 'GESTOR'
           and (c.somente_para is null or lower(btrim(g.email)) = any (c.somente_para))
        union
        -- Os "E-mails Checklist" do site da visita (0082), pela mesma trava.
        select lower(btrim(e))
          from public.visitas v
          join public.sites s on s.id = v.site_id
         cross join unnest(s.emails_checklist) as e
         cross join manutencao.aviso_de_inspecao c
         where v.id = new.visita_id
           and (c.somente_para is null or lower(btrim(e)) = any (c.somente_para))
        union
        -- Quem fez a inspecao (0102), de qualquer cargo, pela mesma trava.
        select lower(btrim(autor.email))
          from public.visitas v
          join public.profiles autor on autor.id = v.funcionario_id
         cross join manutencao.aviso_de_inspecao c
         where v.id = new.visita_id
           and autor.ativo
           and (c.somente_para is null or lower(btrim(autor.email)) = any (c.somente_para))
      ) as d
     where coalesce(d.email, '') <> '';
  exception when others then
    -- Como na 0065: um problema aqui nunca recusa o envio do checklist.
    raise warning 'email_do_checklist_ao_superior: e-mails nao enfileirados (checklist %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
