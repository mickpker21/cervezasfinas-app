<?php
// backend_scripts/php/visitas-import.php
date_default_timezone_set('America/Mexico_City');
include_once 'db.php'; // Assumes PDO $pdo connection

function normalizeMexicoDateTimeVisit($val, $defaultNow = true) {
    if ($val === null || trim((string)$val) === '') {
        return $defaultNow ? date('Y-m-d H:i:s') : null;
    }
    $str = trim((string)$val);
    if (preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/', $str)) {
        return strlen($str) === 16 ? str_replace('T', ' ', $str) . ':00' : str_replace('T', ' ', $str);
    }
    try {
        $dt = new DateTime($str);
        $dt->setTimezone(new DateTimeZone('America/Mexico_City'));
        return $dt->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return $defaultNow ? date('Y-m-d H:i:s') : $str;
    }
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$rows = $input['visitas'] ?? [];

if (empty($rows)) {
    echo json_encode(['message' => 'No data provided', 'inserted' => 0, 'processed' => 0]);
    exit;
}

$processed = 0;
$errors = [];
$server_timestamp = date('Y-m-d H:i:s');

try {
    // Inspect existing columns in 'visitas' table to ensure compatibility
    $colStmt = $pdo->query("SHOW COLUMNS FROM visitas");
    $existingCols = $colStmt->fetchAll(PDO::FETCH_COLUMN, 0);
    $hasUpdatedAt = in_array('updated_at', $existingCols);
    $hasBusinessName = in_array('business_name', $existingCols);
    $hasClientCode = in_array('client_code', $existingCols);
    $hasClientName = in_array('cliente_nombre', $existingCols);
    $hasHora = in_array('hora', $existingCols);
    $hasNotes = in_array('notes', $existingCols);
    $hasMotivo = in_array('motivo', $existingCols);
    $hasInventory = in_array('inventory', $existingCols);

    $sql = "
        INSERT INTO visitas (
            id, client_id" . 
            ($hasClientCode ? ", client_code" : "") . 
            ($hasBusinessName ? ", business_name" : "") . 
            ($hasClientName ? ", cliente_nombre" : "") . 
            ", user_id, fecha" . 
            ($hasHora ? ", hora" : "") . 
            ", ruta" . 
            ($hasMotivo ? ", motivo" : "") . 
            ($hasNotes ? ", notes" : "") . "
            , photo_fachada, photo_interior, photo_enfriador, lat, lng" . 
            ($hasInventory ? ", inventory" : "") . "
            , created_at
        ) VALUES (
            :id, :client_id" . 
            ($hasClientCode ? ", :client_code" : "") . 
            ($hasBusinessName ? ", :business_name" : "") . 
            ($hasClientName ? ", :cliente_nombre" : "") . 
            ", :user_id, :fecha" . 
            ($hasHora ? ", :hora" : "") . 
            ", :ruta" . 
            ($hasMotivo ? ", :motivo" : "") . 
            ($hasNotes ? ", :notes" : "") . "
            , :photo_fachada, :photo_interior, :photo_enfriador, :lat, :lng" . 
            ($hasInventory ? ", :inventory" : "") . "
            , :created_at
        ) ON DUPLICATE KEY UPDATE
            fecha=VALUES(fecha)" . 
            ($hasHora ? ", hora=VALUES(hora)" : "") . 
            ($hasMotivo ? ", motivo=VALUES(motivo)" : "") . 
            ($hasNotes ? ", notes=VALUES(notes)" : "") . 
            ($hasClientCode ? ", client_code=VALUES(client_code)" : "") . 
            ($hasBusinessName ? ", business_name=VALUES(business_name)" : "") . "
            " . ($hasClientName ? ", cliente_nombre=VALUES(cliente_nombre)" : "") . "
            , photo_fachada=VALUES(photo_fachada), photo_interior=VALUES(photo_interior)
            , photo_enfriador=VALUES(photo_enfriador)" . 
            ($hasInventory ? ", inventory=VALUES(inventory)" : "") . 
            ($hasUpdatedAt ? ", updated_at=:server_timestamp" : "");

    $stmt = $pdo->prepare($sql);

    foreach ($rows as $row) {
        try {
            $createdAtMx = normalizeMexicoDateTimeVisit($row['created_at'] ?? null, true);
            $fechaMx = !empty($row['fecha']) ? substr(trim((string)$row['fecha']), 0, 10) : substr($createdAtMx, 0, 10);
            $horaMx = !empty($row['hora']) ? trim((string)$row['hora']) : substr($createdAtMx, 11, 8);

            $params = [
                ':id' => $row['id'],
                ':client_id' => $row['client_id'],
                ':user_id' => $row['user_id'] ?? 'unknown',
                ':fecha' => $fechaMx,
                ':ruta' => $row['ruta'] ?? null,
                ':photo_fachada' => $row['photo_fachada'] ?? null,
                ':photo_interior' => $row['photo_interior'] ?? null,
                ':photo_enfriador' => $row['photo_enfriador'] ?? null,
                ':lat' => $row['lat'] ?? null,
                ':lng' => $row['lng'] ?? null,
                ':created_at' => $createdAtMx
            ];

            if ($hasClientCode) $params[':client_code'] = $row['client_code'] ?? null;
            if ($hasBusinessName) $params[':business_name'] = $row['business_name'] ?? null;
            if ($hasClientName) $params[':cliente_nombre'] = $row['cliente_nombre'] ?? null;
            if ($hasHora) $params[':hora'] = $horaMx;
            if ($hasMotivo) $params[':motivo'] = $row['motivo'] ?? null;
            if ($hasNotes) $params[':notes'] = $row['notes'] ?? null;
            if ($hasInventory) {
                $params[':inventory'] = is_array($row['inventory'] ?? null) 
                    ? json_encode($row['inventory']) 
                    : ($row['inventory'] ?? null);
            }
            if ($hasUpdatedAt) {
                $params[':server_timestamp'] = $server_timestamp;
            }

            $stmt->execute($params);
            $processed++;
        } catch (PDOException $e) {
            $errors[] = "Error ID " . ($row['id'] ?? 'unknown') . ": " . $e->getMessage();
        }
    }

    echo json_encode([
        'success' => true,
        'processed' => $processed, 
        'errors' => $errors
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'processed' => $processed,
        'errors' => $errors
    ]);
}
?>
