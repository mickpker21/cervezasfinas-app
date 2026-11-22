<?php
// asset-update.php
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
    
    $id = $body['id'] ?? null;
    $serial = $body['serial'] ?? null;
    $type = $body['type'] ?? null;
    $status = $body['status'] ?? null;
    $brand = $body['brand'] ?? null;
    $model = $body['model'] ?? null;
    $qr_value = $body['qr_value'] ?? null;
    $warehouse_id = $body['warehouse_id'] ?? null;

    if (!$id) {
        echo json_encode(['status' => 'error', 'message' => 'ID is required']);
        exit;
    }

    $stmt = $pdo->prepare("
        UPDATE assets 
        SET serial = :serial, 
            type = :type, 
            status = :status, 
            brand = :brand, 
            model = :model, 
            qr_value = :qr_value,
            warehouse_id = :warehouse_id,
            updated_at = NOW()
        WHERE id = :id
    ");

    $stmt->execute([
        ':id' => $id,
        ':serial' => $serial,
        ':type' => $type,
        ':status' => $status,
        ':brand' => $brand,
        ':model' => $model,
        ':qr_value' => $qr_value,
        ':warehouse_id' => $warehouse_id
    ]);

    echo json_encode(['status' => 'success', 'message' => 'Asset updated successfully']);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
