<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once 'db_config.php';

$data = json_decode(file_get_contents("php://input"));

if (!isset($data->orders) || !is_array($data->orders)) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid data. 'orders' array required."]);
    exit;
}

try {
    $pdo = getDBConnection();
    $pdo->beginTransaction();

    $processed = 0;
    $errors = [];

    foreach ($data->orders as $item) {
        $order = $item->order;
        $items = isset($item->items) ? $item->items : [];

        try {
            // 1. Upsert Order
            $sql = "INSERT INTO installation_orders 
                    (id, client_id, destination_client_id, action, assigned_to, created_by, status, notes, 
                     client_name_cached, client_address_cached, client_business_name_cached,
                     destination_client_name_cached, destination_client_address_cached, destination_client_business_name_cached,
                     created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    assigned_to = VALUES(assigned_to),
                    status = VALUES(status),
                    notes = VALUES(notes),
                    client_name_cached = VALUES(client_name_cached),
                    client_address_cached = VALUES(client_address_cached),
                    client_business_name_cached = VALUES(client_business_name_cached),
                    destination_client_name_cached = VALUES(destination_client_name_cached),
                    destination_client_address_cached = VALUES(destination_client_address_cached),
                    destination_client_business_name_cached = VALUES(destination_client_business_name_cached),
                    updated_at = NOW()";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $order->id,
                $order->client_id,
                isset($order->destination_client_id) ? $order->destination_client_id : null,
                $order->action,
                isset($order->assigned_to) ? $order->assigned_to : null,
                $order->created_by,
                isset($order->status) ? $order->status : 'PENDIENTE',
                isset($order->notes) ? $order->notes : null,
                isset($order->client_name_cached) ? $order->client_name_cached : null,
                isset($order->client_address_cached) ? $order->client_address_cached : null,
                isset($order->client_business_name_cached) ? $order->client_business_name_cached : null,
                isset($order->destination_client_name_cached) ? $order->destination_client_name_cached : null,
                isset($order->destination_client_address_cached) ? $order->destination_client_address_cached : null,
                isset($order->destination_client_business_name_cached) ? $order->destination_client_business_name_cached : null,
                isset($order->created_at) ? $order->created_at : date('Y-m-d H:i:s')
            ]);

            // 2. Refresh Items
            // Delete existing ones for this order
            $stmtDel = $pdo->prepare("DELETE FROM installation_order_items WHERE order_id = ?");
            $stmtDel->execute([$order->id]);

            // Insert new items
            $sqlItem = "INSERT INTO installation_order_items (order_id, asset_id, asset_type, asset_serial, quantity, condition_status, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?)";
            $stmtItem = $pdo->prepare($sqlItem);

            foreach ($items as $oi) {
                // Auto-link asset_id if serial is present but ID is not
                $assetId = isset($oi->asset_id) ? $oi->asset_id : null;
                $serial = isset($oi->asset_serial) ? trim($oi->asset_serial) : null;
                
                if (!$assetId && $serial) {
                    $stmtFind = $pdo->prepare("SELECT id FROM assets WHERE serial = ? LIMIT 1");
                    $stmtFind->execute([$serial]);
                    $found = $stmtFind->fetch();
                    if ($found) {
                        $assetId = $found['id'];
                    }
                }

                $stmtItem->execute([
                    $order->id,
                    $assetId,
                    isset($oi->asset_type) ? $oi->asset_type : null,
                    $serial,
                    isset($oi->quantity) ? $oi->quantity : 1,
                    isset($oi->condition_status) ? $oi->condition_status : null,
                    isset($oi->notes) ? $oi->notes : null
                ]);
            }

            $processed++;

        } catch (Exception $e) {
            $errors[] = ["id" => $order->id, "error" => $e->getMessage()];
        }
    }

    $pdo->commit();
    echo json_encode([
        "processed" => $processed,
        "errors" => $errors
    ]);

} catch (Exception $e) {
    if ($pdo) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(["message" => "Critical error", "error" => $e->getMessage()]);
}
?>
