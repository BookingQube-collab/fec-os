
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role_level() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_can_access_location(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role_level() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_location(UUID) TO authenticated, service_role;
