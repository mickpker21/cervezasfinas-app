-- This migration fixes the logic of the `current_asset_locations` view.
-- The previous version incorrectly displayed a retired asset as still being at its last client.
-- This version correctly sets the client_id and related fields to NULL if the asset's last action was RETIRAR.
-- FIX: Removed non-existent 'DESINSTALAR' value from the IN clauses.

CREATE OR REPLACE VIEW public.current_asset_locations AS
WITH latest_installation AS (
    SELECT
        id,
        asset_id,
        asset_type,
        client_id,
        action,
        finished_at,
        ROW_NUMBER() OVER(PARTITION BY asset_id ORDER BY finished_at DESC) as rn
    FROM
        public.installations
)
SELECT
    li.asset_id,
    li.asset_type,
    -- CORE FIX: If the last action is a removal, the asset is no longer at a client.
    CASE
        WHEN li.action IN ('RETIRAR') THEN NULL
        ELSE li.client_id
    END AS client_id,
    li.action,
    li.finished_at AS installation_date,
    a.serial AS asset_serial,
    -- CORE FIX: If the last action is a removal, the client name should be NULL.
    CASE
        WHEN li.action IN ('RETIRAR') THEN NULL
        ELSE c.name
    END AS client_name,
     -- CORE FIX: If the last action is a removal, the client address should be NULL.
    CASE
        WHEN li.action IN ('RETIRAR') THEN NULL
        ELSE c.address
    END AS client_address
FROM
    latest_installation li
JOIN
    public.assets a ON li.asset_id = a.id
-- Use a LEFT JOIN for clients to avoid losing assets that are correctly unassigned.
LEFT JOIN
    public.clients c ON li.client_id = c.id
WHERE
    -- We only want the most recent record for each asset.
    li.rn = 1;
