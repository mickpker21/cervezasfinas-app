<?php
// backend_scripts/php/evaluations-pdv-import.php
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
        $stmt->execute([
            ':id' => $row['id'],
            ':client_id' => $row['client_id'] ?? 0,
            ':user_id' => $row['user_id'] ?? null,
            ':fecha' => !empty($row['fecha']) ? substr((string)$row['fecha'], 0, 10) : date('Y-m-d'),
            ':puntaje_total' => $row['puntaje_total'] ?? 0,
            ':surtido_porcentaje' => $row['surtido_porcentaje'] ?? 0,
            ':payload' => is_string($row['payload'] ?? null) ? $row['payload'] : json_encode($row['payload'] ?? $row),
            ':created_at' => $row['created_at'] ?? date('Y-m-d H:i:s')
        ]);
        $processed++;
    } catch (PDOException $e) {
        $errors[] = "Error ID {$row['id']}: " . $e->getMessage();
    }
}

echo json_encode(['processed' => $processed, 'errors' => $errors]);
?>
