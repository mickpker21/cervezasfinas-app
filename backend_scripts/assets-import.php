<?php
// assets-import.php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db_config.php';

try {
    $pdo = getDBConnection();
    $body = json_decode(file_get_contents('php://input'), true);
    $assets = $body['assets'] ?? [];

    if (empty($assets)) {
        echo json_encode(['processed' => 0, 'message' => 'No assets provided']);
        exit;
    }

    $processed = 0;
    $errors = [];

    $stmt = $pdo->prepare("
        INSERT INTO assets (id, serial, type, status, brand, model, qr_value, warehouse_id, created_at)
        VALUES (:id, :serial, :type, :status, :brand, :model, :qr_value, :warehouse_id, :created_at)
        ON DUPLICATE KEY UPDATE
        type = VALUES(type),
        status = VALUES(status),
        brand = VALUES(brand),
        model = VALUES(model),
        qr_value = VALUES(qr_value),
        warehouse_id = VALUES(warehouse_id)
    ");

    foreach ($assets as $a) {
        try {
            $id = $a['id'] ?? ('AST-' . md5($a['serial'] . microtime()));
            $stmt->execute([
                ':id'           => $id,
                ':serial'       => $a['serial']       ?? null,
                ':type'         => $a['type']         ?? 'OTRO',
                ':status'       => $a['status']       ?? 'DISPONIBLE',
                ':brand'        => $a['brand']        ?? null,
                ':model'        => $a['model']        ?? null,
                ':qr_value'     => $a['qr_value']     ?? null,
                ':warehouse_id' => $a['warehouse_id'] ?? null,
                ':created_at'   => $a['created_at']   ?? date('Y-m-d H:i:s')
            ]);
            $processed++;
        } catch (Exception $e) {
            $errors[] = ['serial' => $a['serial'] ?? 'unknown', 'error' => $e->getMessage()];
        }
    }

    echo json_encode([
        'status' => 'success',
        'processed' => $processed,
        'errors' => $errors
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>
