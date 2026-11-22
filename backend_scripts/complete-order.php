<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

include_once 'db_config.php';

$data = json_decode(file_get_contents("php://input"), true);
$orderId = isset($data['order_id']) ? $data['order_id'] : null;
$targetWarehouseId = isset($data['target_warehouse_id']) ? $data['target_warehouse_id'] : null;

if (!$orderId) {
    http_response_code(400);
    echo json_encode(["message" => "order_id is required."]);
    exit;
}

try {
    $pdo = getDBConnection();
    $pdo->beginTransaction();

    $orderId = $data['order_id'];

    // 1. Get Order Info
    $stmtOrder = $pdo->prepare("SELECT * FROM installation_orders WHERE id = ?");
    $stmtOrder->execute([$orderId]);
    $order = $stmtOrder->fetch();

    if (!$order) {
        throw new Exception("Order not found: $orderId");
    }

    if ($order['status'] === 'COMPLETADA') {
        echo json_encode(["message" => "Order already completed.", "id" => $orderId]);
        $pdo->rollBack();
        exit;
    }

    // 2. Get Order Items
    $stmtItems = $pdo->prepare("SELECT * FROM installation_order_items WHERE order_id = ?");
    $stmtItems->execute([$orderId]);
    $items = $stmtItems->fetchAll();

    $action = $order['action'];
    $clientId = $order['client_id'];
    $destClientId = $order['destination_client_id'];

    // Helper: resolve asset_id from serial if needed
    $stmtFind = $pdo->prepare("SELECT id, warehouse_id FROM assets WHERE serial = ? LIMIT 1");

    // Prepared statements for reuse
    $stmtAssetStatus = $pdo->prepare("UPDATE assets SET status = ?, warehouse_id = ?, updated_at = NOW() WHERE id = ?");
    $stmtLoc = $pdo->prepare("INSERT INTO current_asset_locations (asset_id, asset_serial, asset_type, client_id, action, created_at)
                            VALUES (?, ?, ?, ?, ?, NOW())
                            ON DUPLICATE KEY UPDATE 
                            client_id = VALUES(client_id),
                            action = VALUES(action),
                            created_at = NOW()");
    $stmtHist = $pdo->prepare("INSERT INTO asset_movements (asset_id, order_id, action, from_client_id, to_client_id, performer_id)
                              VALUES (?, ?, ?, ?, ?, ?)");

    foreach ($items as $item) {
        $assetId = !empty($item['asset_id']) ? $item['asset_id'] : null;
        $assetWarehouseId = null;

        if (!$assetId && !empty($item['asset_serial'])) {
            $stmtFind->execute([$item['asset_serial']]);
            $found = $stmtFind->fetch();
            if ($found) {
                $assetId = $found['id'];
                $assetWarehouseId = $found['warehouse_id'];
            } else {
                // AUTO-CREATE ASSET if not found
                $assetId = "AST-" . bin2hex(random_bytes(4));
                $stmtInsertAsset = $pdo->prepare("INSERT INTO assets (id, serial, type, status, warehouse_id, created_at) VALUES (?, ?, ?, 'EN_ALMACEN', ?, NOW())");
                $stmtInsertAsset->execute([$assetId, $item['asset_serial'], $item['asset_type'], $targetWarehouseId]);
                $assetWarehouseId = $targetWarehouseId;
            }
        }

        if (!$assetId) continue;

        // ... rest of the logic ...
        $itemAction = strtoupper(trim($action));
        if ($itemAction === 'CAMBIO_EQUIPO') {
            $notesData = null;
            if (!empty($item['notes'])) {
                $notesData = json_decode($item['notes'], true);
            }
            $itemAction = isset($notesData['item_action']) ? strtoupper(trim($notesData['item_action'])) : 'INSTALAR';
        }

        $targetClientId = null;
        $newStatus = 'EN_ALMACEN';
        $newWarehouseId = ($itemAction === 'RETIRAR' || $itemAction === 'DESINSTALAR' || $itemAction === 'RETIRADA') ? $targetWarehouseId : $assetWarehouseId;

        if ($itemAction === 'INSTALAR' || $itemAction === 'INSTALACION') {
            $targetClientId = $clientId;
            $newStatus = 'INSTALADO';
            $newWarehouseId = null;
        } else if ($itemAction === 'RETIRAR' || $itemAction === 'DESINSTALAR' || $itemAction === 'RETIRADA') {
            $targetClientId = null;
            $newStatus = 'EN_ALMACEN';
        } else if ($itemAction === 'MOVER' || $itemAction === 'MOVIMIENTO') {
            $targetClientId = $destClientId;
            $newStatus = 'INSTALADO';
            $newWarehouseId = null;
        } else if ($itemAction === 'MANTENIMIENTO') {
            $targetClientId = null;
            $newStatus = 'EN_MANTENIMIENTO';
            $newWarehouseId = $assetWarehouseId;
        }

        // 3. Update Asset Status + warehouse_id by SERIAL to be safer
        $stmtUpdateBySerial = $pdo->prepare("UPDATE assets SET status = ?, warehouse_id = ?, updated_at = NOW() WHERE serial = ?");
        $stmtUpdateBySerial->execute([$newStatus, $newWarehouseId, $item['asset_serial']]);

        // 4. Update Current Location
        $stmtLoc->execute([
            $assetId,
            $item['asset_serial'],
            $item['asset_type'],
            $targetClientId,
            $itemAction
        ]);

        // 4b. Log to history
        $stmtHist->execute([
            $assetId,
            $orderId,
            $itemAction,
            $clientId,
            $targetClientId,
            $order['assigned_to']
        ]);
    }

    // 5. Mark Order as COMPLETED
    $stmtUpdateOrder = $pdo->prepare("UPDATE installation_orders SET status = 'COMPLETADA', updated_at = NOW() WHERE id = ?");
    $stmtUpdateOrder->execute([$orderId]);

    $pdo->commit();
    echo json_encode(["status" => "success", "message" => "Order completed successfully and assets transferred."]);

} catch (Exception $e) {
    if (isset($pdo)) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>
