<?php
// backend_scripts/php/evaluations-import.php (Canal Moderno)
include_once 'db.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With'); // FIX: Allow Content-Type

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
        $stmt->execute([
            ':id' => $row['id'],
            ':tienda_id' => $row['tienda_id'] ?? $row['client_id'], // Compatibility
            ':fecha' => $row['fecha'],
            ':tipo' => $row['tipo'] ?? 'Canal Moderno',
            ':payload' => json_encode($row['payload'] ?? $row),
            ':created_at' => $row['created_at'] ?? date('Y-m-d H:i:s')
        ]);
        $processed++;
    } catch (PDOException $e) {
        $errors[] = "Error ID {$row['id']}: " . $e->getMessage();
    }
}

echo json_encode(['processed' => $processed, 'errors' => $errors]);
?>
