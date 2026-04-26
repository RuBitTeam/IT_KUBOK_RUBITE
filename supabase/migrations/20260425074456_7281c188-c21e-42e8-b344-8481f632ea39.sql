UPDATE auth.users
SET email_confirmed_at = now()
WHERE id = '22e96bb2-262e-4bb6-a65c-8fa703d99262' AND email_confirmed_at IS NULL;

INSERT INTO public.user_roles (user_id, role)
VALUES ('22e96bb2-262e-4bb6-a65c-8fa703d99262', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles
WHERE user_id = '22e96bb2-262e-4bb6-a65c-8fa703d99262' AND role = 'viewer';