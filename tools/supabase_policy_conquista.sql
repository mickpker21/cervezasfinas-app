-- Policy para que usuarios tipo Conquista puedan ver clientes de su ruta
CREATE POLICY "Conquista puede ver clientes de su ruta"
  ON clients
  FOR SELECT
  USING (
    internal_route = (auth.jwt() -> 'user_metadata' ->> 'route_number')
  );

-- Policy para que el owner pueda ver sus propios clientes
CREATE POLICY "Owner puede ver sus clientes"
  ON clients
  FOR SELECT
  USING (
    owner_id = auth.uid()
  );
