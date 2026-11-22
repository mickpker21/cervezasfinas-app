
CREATE TABLE public.client_visits (
    id bigint NOT NULL PRIMARY KEY generated always as identity,
    client_id uuid NOT NULL references public.clients(id),
    requested_at timestamp with time zone NOT NULL DEFAULT now(),
    visited_at timestamp with time zone NULL,
    advisor_id uuid NULL references public.profiles(id),
    status character varying COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::character varying
);

ALTER TABLE public.client_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for admin" ON public.client_visits FOR ALL
    USING (is_admin());

CREATE POLICY "Allow read for supervisor" ON public.client_visits FOR SELECT
    USING (is_supervisor());

CREATE POLICY "Allow read for dynamic advisor" ON public.client_visits FOR SELECT
    USING (is_asesor_dinamico());

CREATE POLICY "Allow update for dynamic advisor" ON public.client_visits FOR UPDATE
    USING (is_asesor_dinamico() AND advisor_id = auth.uid());

CREATE POLICY "Allow insert for televenta" ON public.client_visits FOR INSERT
    WITH CHECK (is_televenta());
