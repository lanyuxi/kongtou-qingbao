-- Column-level grants for the fields added to project_current_state in
-- 20260814001000. The view is security_invoker, so querying roles need
-- SELECT on every base-table column the view references. Without these
-- grants anon/authenticated queries fail with 42501 permission denied.

grant select (official_website_url)
  on public.projects to anon, authenticated;

grant select (model_version, input_version, explanation)
  on public.project_scores to anon, authenticated;
