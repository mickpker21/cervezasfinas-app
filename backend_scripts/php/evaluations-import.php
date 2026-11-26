<?php
// backend_scripts/php/evaluations-import.php (Canal Moderno)
date_default_timezone_set('America/Mexico_City');
include_once 'db.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$rows = $input['evaluations'] ?? [];

if (empty($rows)) {
    echo json_encode(['message' => 'No data', 'processed' => 0]);
    exit;
}

function normEvalDateCm($val) {
    if (empty($val)) return date('Y-m-d');
    $s = trim((string)$val);
    if (preg_match('/^\d{4}-\d{2}-\d{2}/', $s)) {
        return substr($s, 0, 10);
    }
    try {
        $dt = new DateTime($s);
        $dt->setTimezone(new DateTimeZone('America/Mexico_City'));
        return $dt->format('Y-m-d');
    } catch (Exception $e) {
        return date('Y-m-d');
    }
}

function normEvalDateTimeCm($val) {
    if (empty($val)) return date('Y-m-d H:i:s');
    $s = trim((string)$val);
    if (preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/', $s)) {
        return strlen($s) === 16 ? str_replace('T', ' ', $s) . ':00' : str_replace('T', ' ', $s);
    }
    try {
        $dt = new DateTime($s);
        $dt->setTimezone(new DateTimeZone('America/Mexico_City'));
        return $dt->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return date('Y-m-d H:i:s');
    }
}

$stmt = $pdo->prepare("
    INSERT INTO evaluaciones (
        id, tienda_id, fecha, tipo, payload, created_at
    ) VALUES (
        :id, :tienda_id, :fecha, :tipo, :payload, :created_at
    ) ON DUPLICATE KEY UPDATE
        fecha=VALUES(fecha),
        tipo=VALUES(tipo),
        payload=VALUES(payload)
");

$processed = 0;
$errors = [];

foreach ($rows as $row) {
    try {
        $rawTiendaId = $row['tienda_id'] ?? $row['client_id'] ?? ($row['payload']['client_code'] ?? ($row['payload']['storeInfo']['client_code'] ?? 0));
        $digits = preg_replace('/[^0-9]/', '', (string)$rawTiendaId);
        $safeTiendaId = ($digits !== '' && is_numeric($digits)) ? (int)$digits : 0;

        $stmt->execute([
            ':id' => $row['id'],
            ':tienda_id' => $safeTiendaId,
            ':fecha' => normEvalDateCm($row['fecha'] ?? ($row['payload']['storeInfo']['fecha'] ?? null)),
            ':tipo' => $row['tipo'] ?? 'Canal Moderno',
            ':payload' => is_string($row['payload'] ?? null) ? $row['payload'] : json_encode($row['payload'] ?? $row),
            ':created_at' => normEvalDateTimeCm($row['created_at'] ?? null)
        ]);
        $processed++;
    } catch (PDOException $e) {
        $errors[] = "Error ID {$row['id']}: " . $e->getMessage();
    }
}

echo json_encode(['processed' => $processed, 'errors' => $errors]);
?>
