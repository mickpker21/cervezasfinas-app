-- This migration creates a database view called `current_asset_locations`.
-- This view simplifies querying by providing a real-time list of which asset is installed at which client.
-- It determines the current location by finding the most recent 'INSTALAR' or 'MOVER' action for each asset.

CREATE OR REPLACE VIEW public.current_asset_locations AS
WITH latest_installation AS (
    SELECT
        id,
        asset_id,
        asset_type,
        client_id,
        action,
        finished_at,
        -- Assign a row number to each asset's history, starting with 1 for the most recent.
        ROW_NUMBER() OVER(PARTITION BY asset_id ORDER BY finished_at DESC) as rn
    FROM
        public.installations
)
SELECT
    li.asset_id,
    li.asset_type,
    li.client_id,
    li.action,
    li.finished_at AS installation_date,
    a.serial AS asset_serial,
    c.name AS client_name,
    c.address AS client_address
FROM
    latest_installation li
JOIN
    public.assets a ON li.asset_id = a.id
JOIN
    public.clients c ON li.client_id = c.id
WHERE
    -- We only want the most recent record for each asset...
    li.rn = 1
    -- ...and only if the asset is currently considered installed or moved to a location.
    AND li.action IN ('INSTALAR', 'MOVER');
