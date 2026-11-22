<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/db_config.php';
$pdo = getDBConnection();

$body = json_decode(file_get_contents('php://input'), true);
$censos = $body['censos'] ?? [];

if (empty($censos)) {
    echo json_encode(['processed' => 0, 'errors' => []]);
    exit;
}

$processed = 0;
$errors    = [];

$stmt = $pdo->prepare("
    INSERT INTO censos_supervisor
        (id, client_id, client_code, client_name, supervisor_id, supervisor_name,
         survey_type, tiene_fachada, tipo_fachada, tiene_enfriador, modelo, serial, posicion, invadido,
         photo_url, photo_fachada, lat, lng, notas, created_at)
    VALUES
        (:id, :client_id, :client_code, :client_name, :supervisor_id, :supervisor_name,
         :survey_type, :tiene_fachada, :tipo_fachada, :tiene_enfriador, :modelo, :serial, :posicion, :invadido,
         :photo_url, :photo_fachada, :lat, :lng, :notas, :created_at)
    ON DUPLICATE KEY UPDATE
        tiene_fachada    = VALUES(tiene_fachada),
        tipo_fachada     = VALUES(tipo_fachada),
        tiene_enfriador  = VALUES(tiene_enfriador),
        modelo           = VALUES(modelo),
        serial           = VALUES(serial),
        posicion         = VALUES(posicion),
        invadido         = VALUES(invadido),
        photo_url        = VALUES(photo_url),
        photo_fachada    = VALUES(photo_fachada),
        lat              = VALUES(lat),
        lng              = VALUES(lng),
        notas            = VALUES(notas)
");

foreach ($censos as $c) {
    try {
        $stmt->execute([
            ':id'               => $c['id']              ?? null,
            ':client_id'        => $c['client_id']       ?? null,
            ':client_code'      => $c['client_code']     ?? null,
            ':client_name'      => $c['client_name']     ?? null,
            ':supervisor_id'    => $c['supervisor_id']   ?? null,
            ':supervisor_name'  => $c['supervisor_name'] ?? null,
            ':survey_type'      => $c['survey_type']     ?? 'CENSO_SUPERVISOR',
            ':tiene_fachada'    => !empty($c['tiene_fachada'])   ? 1 : 0,
            ':tipo_fachada'     => $c['tipo_fachada']    ?? null,
            ':tiene_enfriador'  => !empty($c['tiene_enfriador']) ? 1 : 0,
            ':modelo'           => $c['modelo']          ?? null,
            ':serial'           => $c['serial']          ?? null,
            ':posicion'         => $c['posicion']        ?? null,
            ':invadido'         => !empty($c['invadido']) ? 1 : 0,
            ':photo_url'        => $c['photo_url']       ?? null,
            ':photo_fachada'    => $c['photo_fachada']   ?? null,
            ':lat'              => $c['lat']             ?? null,
            ':lng'              => $c['lng']             ?? null,
            ':notas'            => $c['notas']           ?? null,
            ':created_at'       => $c['created_at']      ?? date('Y-m-d H:i:s'),
        ]);

        // --- NEW: Automatic Asset Registration ---
        try {
            require_once __DIR__ . '/asset-helpers.php';
            registerAssetFromCensus($pdo, $c);
        } catch (Exception $eAsset) {
            // Log error but don't fail the censo import
            error_log("Error registering asset from census import: " . $eAsset->getMessage());
        }

        $processed++;
    } catch (Exception $e) {
        $errors[] = ['id' => $c['id'] ?? 'unknown', 'error' => $e->getMessage()];
    }
}

echo json_encode(['processed' => $processed, 'errors' => $errors]);
