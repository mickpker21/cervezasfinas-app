<?php
// One-time script to drop the FK constraint on assets.warehouse_id
// Since warehouses are managed in Supabase (not MySQL), the FK is invalid
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");

require_once __DIR__ . '/db_config.php';

try {
    $pdo = getDBConnection();
    
    // Drop the foreign key constraint
    $pdo->exec("ALTER TABLE assets DROP FOREIGN KEY fk_asset_warehouse");
    
    echo json_encode(['status' => 'success', 'message' => 'FK constraint fk_asset_warehouse dropped successfully']);
} catch (Exception $e) {
    // If it doesn't exist, that's fine too
    $msg = $e->getMessage();
    if (strpos($msg, "check that column/key exists") !== false || strpos($msg, "Can't DROP") !== false) {
        echo json_encode(['status' => 'success', 'message' => 'FK constraint already removed or does not exist']);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $msg]);
    }
}
?>
