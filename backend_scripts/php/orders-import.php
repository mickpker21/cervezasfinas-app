<?php
// backend_scripts/php/orders-import.php
include_once 'db.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$input = json_decode(file_get_contents('php://input'), true);
// Expects: { orders: [ { order: {...}, items: [...] } ] }
$entries = $input['orders'] ?? [];

if (empty($entries)) {
    echo json_encode(['message' => 'No data', 'processed' => 0]);
    exit;
}

$processed = 0;
$errors = [];

$stmtOrder = $pdo->prepare("
    INSERT INTO installation_orders (
        id, client_id, created_by, status, action, destination_client_id, notes, created_at
    ) VALUES (
        :id, :client_id, :created_by, :status, :action, :destination_client_id, :notes, :created_at
    ) ON DUPLICATE KEY UPDATE
        status=VALUES(status), notes=VALUES(notes), updated_at=NOW()
");

$stmtItem = $pdo->prepare("
    INSERT INTO installation_order_items (order_id, asset_type, asset_serial, quantity, condition_status, notes)
    VALUES (:order_id, :asset_type, :asset_serial, :quantity, :condition_status, :notes)
");

foreach ($entries as $entry) {
    try {
        $pdo->beginTransaction();
        
        $order = $entry['order'] ?? $entry; // Handle if flattened or nested
        $items = $entry['items'] ?? [];

        $stmtOrder->execute([
            ':id' => $order['id'],
            ':client_id' => $order['client_id'],
            ':created_by' => $order['created_by'],
            ':status' => $order['status'] ?? 'PENDIENTE',
            ':action' => $order['action'] ?? null,
            ':destination_client_id' => $order['destination_client_id'] ?? null,
            ':notes' => $order['notes'] ?? null,
            ':created_at' => $order['created_at'] ?? date('Y-m-d H:i:s')
        ]);

        // Replace items: Delete existing for this order first? 
        // Or just append? Usually orders are created once. If updated, maybe clear items?
        // Simple strategy: Delete all items for this order then insert new.
        $pdo->prepare("DELETE FROM installation_order_items WHERE order_id = ?")->execute([$order['id']]);

        foreach ($items as $item) {
            $stmtItem->execute([
                ':order_id' => $order['id'],
                ':asset_type' => $item['asset_type'] ?? null,
                ':asset_serial' => $item['asset_serial'] ?? null,
                ':quantity' => $item['quantity'] ?? 1,
                ':condition_status' => $item['condition_status'] ?? null,
                ':notes' => $item['notes'] ?? null
            ]);
        }

        $pdo->commit();
        $processed++;
    } catch (Throwable $e) {
        $pdo->rollBack();
        $errors[] = "Error Order {$order['id']}: " . $e->getMessage();
    }
}

echo json_encode(['processed' => $processed, 'errors' => $errors]);
?>
