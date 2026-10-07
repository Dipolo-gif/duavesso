-- DUAVESSO: inventário de segurança do banco, somente leitura. Rode cada bloco separado no SQL Editor
-- (o editor mostra o resultado da última consulta). Compare com o que as migrações 0001..0005 prometem.

-- [I1] RLS ligado em todas as tabelas expostas (esperado: rls = true em todas)
select n.nspname as schema, c.relname as tabela, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname in ('public', 'storage') order by 1, 2;

-- [I2] Políticas existentes (esperado: profiles 3, orders 1, order_items 1, products 1, store_settings 1, storage.objects 2 de insert)
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3;

-- [I3] Grants de tabela para anon/authenticated (esperado: anon só SELECT em products/store_settings;
--      authenticated SELECT em products/store_settings/orders/order_items e SELECT/INSERT/UPDATE em profiles)
select table_schema, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated') and table_schema = 'public'
group by 1, 2, 3 order by 2, 3;

-- [I4] Privilégios padrão do schema public (se aparecer anon/authenticated aqui, tabela nova nasce exposta)
select pg_get_userbyid(d.defaclrole) as dono, n.nspname as schema, d.defaclobjtype as tipo, d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace order by 1, 2;

-- [I5] Funções do schema public: SECURITY DEFINER, search_path e quem executa
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer,
       p.proconfig as config, p.provolatile as volat,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;
-- esperado: place_order/get_order/subscribe_newsletter = definer + search_path="" (executáveis, de propósito);
-- handle_new_user = definer, deveria ter anon_exec/auth_exec = false (hoje, pelas migrações, fica true).

-- [I6] O código das funções no banco é o mesmo das migrações? (procure diferenças de corpo)
select p.proname, md5(pg_get_functiondef(p.oid)) as hash, length(pg_get_functiondef(p.oid)) as tamanho
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1;

-- [I7] Há pre-request (limite por IP) configurado no PostgREST? (esperado hoje: nada)
select rolname, rolconfig from pg_roles where rolname in ('authenticator', 'anon', 'authenticated');

-- [I8] Bucket designs: privado, 5 MB, só webp/jpeg
select id, public, file_size_limit, allowed_mime_types from storage.buckets;

-- [I9] Sessões e refresh tokens (rotação funcionando: tokens antigos revogados; sessões com not_after = time-box)
select count(*) as sessoes, count(*) filter (where not_after is not null) as com_timebox,
       min(created_at) as mais_antiga, max(refreshed_at) as ultimo_refresh
from auth.sessions;
select revoked, count(*) from auth.refresh_tokens group by revoked;

-- [I10] Modelagem: quantos usuários e clientes são do RJ
select count(*) filter (where state = 'RJ') as perfis_uf_rj,
       count(*) filter (where state is null) as perfis_sem_uf,
       count(*) filter (where unaccent_city = 'rio de janeiro') as perfis_cidade_rio
from (select state, lower(translate(trim(city), 'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC')) as unaccent_city from public.profiles) p;
select count(*) as pedidos_rj, count(distinct customer_email) as clientes_rj
from public.orders where substr(regexp_replace(cep, '\D', '', 'g'), 1, 2)::int between 20 and 28;

-- [I11] Catálogo do banco x catálogo do site (o site usa dist/commerce.js, não o banco)
select id, name, category, base, price_cents, active from public.products order by sort_order, id;
-- comparar com dist/commerce.js: heavy-avesso, heavy-faces (brown), heavy-eclipse (brown), simples (brown/white/black), geek-*, ...

-- [I12] Dados de teste da sondagem antiga ainda no banco?
select id, email, created_at from auth.users where email ilike 'pentest%';
select code, customer_email, created_at from public.orders where customer_email ilike 'pentest%';
