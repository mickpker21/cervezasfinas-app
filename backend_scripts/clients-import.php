<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    
    $input = file_get_contents("php://input");
    $data = json_decode($input, true);

    if (!isset($data['clients']) || !is_array($data['clients'])) {
        throw new Exception("Invalid payload: 'clients' array required.");
    }

    $clients = $data['clients'];
    $inserted = 0;
    $errors = [];

    // Prepare UPSERT statement
    // Note: We use client_code as the unique key for upsert logic usually, or id if provided.
    // Assuming client_code is UNIQUE in MySQL definition.
    
    $sql = "INSERT INTO clients (
        id, client_code, name, business_name, internal_route, sales_route, delivery_route,
        visit_days, visit_day_televenta, coords, address, phone, contact, email, 
        cooler_serials, level, exclusivity, gec, zona_comercial, region, cadena,
        cross_street, exterior_number, interior_number, colony, postal_code, city, state, reference,
        sales_modality, ritmo, rfc, fiscal_name, fiscal_address, fiscal_colony, fiscal_postal_code, cedula_ieps,
        updated_at
    ) VALUES (
        :id, :client_code, :name, :business_name, :internal_route, :sales_route, :delivery_route,
        :visit_days, :visit_day_televenta, :coords, :address, :phone, :contact, :email,
        :cooler_serials, :level, :exclusivity, :gec, :zona_comercial, :region, :cadena,
        :cross_street, :exterior_number, :interior_number, :colony, :postal_code, :city, :state, :reference,
        :sales_modality, :ritmo, :rfc, :fiscal_name, :fiscal_address, :fiscal_colony, :fiscal_postal_code, :cedula_ieps,
        NOW()
    ) ON DUPLICATE KEY UPDATE
        client_code = COALESCE(VALUES(client_code), client_code),
        name = COALESCE(VALUES(name), name),
        business_name = COALESCE(VALUES(business_name), business_name),
        internal_route = COALESCE(VALUES(internal_route), internal_route),
        sales_route = COALESCE(VALUES(sales_route), sales_route),
        delivery_route = COALESCE(VALUES(delivery_route), delivery_route),
        visit_days = COALESCE(VALUES(visit_days), visit_days),
        visit_day_televenta = COALESCE(VALUES(visit_day_televenta), visit_day_televenta),
        coords = COALESCE(VALUES(coords), coords),
        address = COALESCE(VALUES(address), address),
        phone = COALESCE(VALUES(phone), phone),
        contact = COALESCE(VALUES(contact), contact),
        email = COALESCE(VALUES(email), email),
        cooler_serials = COALESCE(VALUES(cooler_serials), cooler_serials),
        level = COALESCE(VALUES(level), level),
        exclusivity = COALESCE(VALUES(exclusivity), exclusivity),
        gec = COALESCE(VALUES(gec), gec),
        zona_comercial = COALESCE(VALUES(zona_comercial), zona_comercial),
        region = COALESCE(VALUES(region), region),
        cadena = COALESCE(VALUES(cadena), cadena),
        cross_street = COALESCE(VALUES(cross_street), cross_street),
        exterior_number = COALESCE(VALUES(exterior_number), exterior_number),
        interior_number = COALESCE(VALUES(interior_number), interior_number),
        colony = COALESCE(VALUES(colony), colony),
        postal_code = COALESCE(VALUES(postal_code), postal_code),
        city = COALESCE(VALUES(city), city),
        state = COALESCE(VALUES(state), state),
        reference = COALESCE(VALUES(reference), reference),
        sales_modality = COALESCE(VALUES(sales_modality), sales_modality),
        ritmo = COALESCE(VALUES(ritmo), ritmo),
        rfc = COALESCE(VALUES(rfc), rfc),
        fiscal_name = COALESCE(VALUES(fiscal_name), fiscal_name),
        fiscal_address = COALESCE(VALUES(fiscal_address), fiscal_address),
        fiscal_colony = COALESCE(VALUES(fiscal_colony), fiscal_colony),
        fiscal_postal_code = COALESCE(VALUES(fiscal_postal_code), fiscal_postal_code),
        cedula_ieps = COALESCE(VALUES(cedula_ieps), cedula_ieps),
        updated_at = NOW()
    ";

    $stmt = $pdo->prepare($sql);

    foreach ($clients as $c) {
        try {
            // Generate UUID if not present (simulated in PHP if needed, or let MySQL DEFAULT handle it if logic allows, 
            // but for ON DUPLICATE to work on ID we need ID. If key is client_code, we rely on that)
            // Ideally frontend sends ID.
            $id = isset($c['id']) && $c['id'] ? $c['id'] : sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );

            // Jsonify arrays
            $coords = isset($c['coords']) ? (is_string($c['coords']) && $c['coords'] !== '' && $c['coords'] !== 'null' ? $c['coords'] : (is_array($c['coords']) ? json_encode($c['coords']) : null)) : null;

            $coolers = isset($c['cooler_serials']) ? (is_string($c['cooler_serials']) && $c['cooler_serials'] !== '' && $c['cooler_serials'] !== '[]' && $c['cooler_serials'] !== 'null' ? $c['cooler_serials'] : (is_array($c['cooler_serials']) ? json_encode($c['cooler_serials']) : null)) : null;

            $stmt->execute([
                ':id' => $id,
                ':client_code' => $c['client_code'],
                ':name' => $c['name'] ?? $c['client_code'],
                ':business_name' => $c['business_name'] ?? null,
                ':internal_route' => $c['internal_route'] ?? null,
                ':sales_route' => $c['sales_route'] ?? null,
                ':delivery_route' => $c['delivery_route'] ?? null,
                ':visit_days' => $c['visit_days'] ?? null,
                ':visit_day_televenta' => $c['visit_day_televenta'] ?? null,
                ':coords' => $coords,
                ':address' => $c['address'] ?? null,
                ':phone' => $c['phone'] ?? null,
                ':contact' => $c['contact'] ?? null,
                ':email' => $c['email'] ?? null,
                ':cooler_serials' => $coolers,
                ':level' => $c['level'] ?? null,
                ':exclusivity' => $c['exclusivity'] ?? null,
                ':gec' => $c['gec'] ?? null,
                ':zona_comercial' => $c['zona_comercial'] ?? null,
                ':region' => $c['region'] ?? $c['zona_comercial'] ?? '',
                ':cadena' => $c['cadena'] ?? null,
                ':cross_street' => $c['cross_street'] ?? null,
                ':exterior_number' => $c['exterior_number'] ?? null,
                ':interior_number' => $c['interior_number'] ?? null,
                ':colony' => $c['colony'] ?? null,
                ':postal_code' => $c['postal_code'] ?? null,
                ':city' => $c['city'] ?? null,
                ':state' => $c['state'] ?? null,
                ':reference' => $c['reference'] ?? null,
                ':sales_modality' => $c['sales_modality'] ?? null,
                ':ritmo' => $c['ritmo'] ?? null,
                ':rfc' => $c['rfc'] ?? null,
                ':fiscal_name' => $c['fiscal_name'] ?? null,
                ':fiscal_address' => $c['fiscal_address'] ?? null,
                ':fiscal_colony' => $c['fiscal_colony'] ?? null,
                ':fiscal_postal_code' => $c['fiscal_postal_code'] ?? null,
                ':cedula_ieps' => $c['cedula_ieps'] ?? null
            ]);
            
            // Sync coolers to assets and locations if provided
            if ($coolers && $coolers !== '[]' && $coolers !== 'null') {
                $serialsArray = is_array($c['cooler_serials']) ? $c['cooler_serials'] : json_decode($coolers, true);
                if (is_array($serialsArray) && count($serialsArray) > 0) {
                    $assetType = "ENFRIADOR " . ($c['enfriador'] ?? '');
                    $assetType = trim($assetType);

                    // Optional: remove old assignments for this client's coolers to keep it clean
                    $stmtDelLoc = $pdo->prepare("DELETE FROM current_asset_locations WHERE client_id = ? AND asset_type LIKE '%ENFRIADOR%'");
                    $stmtDelLoc->execute([$id]);

                    $stmtAst = $pdo->prepare("INSERT INTO assets (id, serial, type, status) VALUES (?, ?, ?, 'INSTALADO') ON DUPLICATE KEY UPDATE type = VALUES(type), status = 'INSTALADO'");
                    $stmtLoc = $pdo->prepare("INSERT INTO current_asset_locations (asset_id, asset_serial, asset_type, client_id, action, created_at) VALUES (?, ?, ?, ?, 'ALERTA_PDV', NOW()) ON DUPLICATE KEY UPDATE client_id = VALUES(client_id), action = 'ALERTA_PDV', created_at = NOW()");

                    foreach ($serialsArray as $ser) {
                        $ser = trim($ser);
                        if (empty($ser)) continue;
                        $astId = "AST-" . md5($ser);
                        
                        $stmtAst->execute([$astId, $ser, $assetType]);
                        $stmtLoc->execute([$astId, $ser, $assetType, $id]);
                    }
                }
            }

            $inserted++;
        } catch (Exception $ex) {
            $errors[] = ["client_code" => $c['client_code'] ?? 'unknown', "error" => $ex->getMessage()];
        }
    }

    echo json_encode([
        'message' => 'Import processed',
        'inserted_or_updated' => $inserted,
        'errors' => $errors
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
