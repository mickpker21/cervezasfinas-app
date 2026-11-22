-- Migration: Create table for telesales call records
-- Adds table `telesales_calls` to store call logs for televenta users

CREATE TABLE IF NOT EXISTS telesales_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    client_code text,
    route text,
    call_time timestamptz NOT NULL DEFAULT now(),
    answered boolean NOT NULL DEFAULT false,
    boxes_sold integer DEFAULT 0,
    comments text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telesales_user_id ON telesales_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_telesales_client_id ON telesales_calls(client_id);
CREATE INDEX IF NOT EXISTS idx_telesales_route ON telesales_calls(route);
CREATE INDEX IF NOT EXISTS idx_telesales_call_time ON telesales_calls(call_time);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_updated_at ON telesales_calls;
CREATE TRIGGER trigger_set_updated_at
BEFORE UPDATE ON telesales_calls
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();
