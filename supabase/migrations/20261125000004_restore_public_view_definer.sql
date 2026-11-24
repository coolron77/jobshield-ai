-- public_community_reports is INTENTIONALLY a definer-rights view (security_invoker off).
-- It is the only way anonymous visitors can read approved reports: anon has no
-- privileges on public.community_reports. The view exposes approved rows only and
-- omits reporter_id, scan_id and flag_count. Supabase's "Security Definer View"
-- advisor flags this as a false positive; do NOT switch it to security_invoker
-- or /community will fail with "permission denied for table community_reports".
alter view public.public_community_reports set (security_invoker = off);

comment on view public.public_community_reports is
  'Approved community reports only; reporter identity never exposed. INTENTIONALLY definer-rights (security_invoker = off) - do not "fix" the Supabase Security Definer View advisor on this view, it would break the public community page.';
