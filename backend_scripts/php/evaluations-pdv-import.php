<?php
// backend_scripts/php/evaluations-pdv-import.php
date_default_timezone_set('America/Mexico_City');
include_once 'db.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$input = json_decode(file_get_contents('php://input'), true);
$rows = $input['evaluations'] ?? [];

if (empty($rows)) {
    echo json_encode(['message' => 'No data', 'processed' => 0]);
    exit;
}

function normEvalDatePdv($val) {
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

function normEvalDateTimePdv($val) {
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
    INSERT INTO evaluaciones_pdv (
        id, client_id, user_id, fecha, puntaje_total, surtido_porcentaje, payload, created_at
    ) VALUES (
        :id, :client_id, :user_id, :fecha, :puntaje_total, :surtido_porcentaje, :payload, :created_at
    ) ON DUPLICATE KEY UPDATE
        fecha=VALUES(fecha),
        puntaje_total=VALUES(puntaje_total),
        surtido_porcentaje=VALUES(surtido_porcentaje),
        payload=VALUES(payload)
");

$processed = 0;
$errors = [];

foreach ($rows as $row) {
    try {
        $rawClientId = $row['client_id'] ?? ($row['payload']['client_id'] ?? ($row['payload']['client_code'] ?? 0));
        $digits = preg_replace('/[^0-9]/', '', (string)$rawClientId);
        $safeClientId = ($digits !== '' && is_numeric($digits)) ? (int)$digits : 0;

        $stmt->execute([
            ':id' => $row['id'],
            ':client_id' => $safeClientId,
            ':user_id' => $row['user_id'] ?? ($row['payload']['user_id'] ?? null),
            ':fecha' => normEvalDatePdv($row['fecha'] ?? null),
            ':puntaje_total' => (float)($row['puntaje_total'] ?? ($row['payload']['puntaje_total'] ?? 0)),
            ':surtido_porcentaje' => (float)($row['surtido_porcentaje'] ?? ($row['payload']['surtido_porcentaje'] ?? 0)),
            ':payload' => is_string($row['payload'] ?? null) ? $row['payload'] : json_encode($row['payload'] ?? $row),
            ':created_at' => normEvalDateTimePdv($row['created_at'] ?? null)
        ]);
        $processed++;
    } catch (PDOException $e) {
        $errors[] = "Error ID {$row['id']}: " . $e->getMessage();
    }
}

echo json_encode(['processed' => $processed, 'errors' => $errors]);
?>
