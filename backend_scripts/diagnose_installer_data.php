<?php
header("Content-Type: application/json; charset=UTF-8");
include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    
    $results = [];

    // 1. Check Installation Orders
    $stmtOrders = $pdo->query("SELECT id, client_id, action, assigned_to, created_by, status FROM installation_orders LIMIT 10");
    $results['installation_orders'] = $stmtOrders->fetchAll(PDO::FETCH_ASSOC);

    // 2. Check Assets
    $stmtAssets = $pdo->query("SELECT id, serial, type, status FROM assets LIMIT 10");
    $results['assets'] = $stmtAssets->fetchAll(PDO::FETCH_ASSOC);
    
    // 3. Check Order Items
    $stmtItems = $pdo->query("SELECT * FROM installation_order_items LIMIT 10");
    $results['order_items'] = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

    // 4. Summarize Counts
    $results['counts'] = [
        'orders' => $pdo->query("SELECT COUNT(*) FROM installation_orders")->fetchColumn(),
        'assets' => $pdo->query("SELECT COUNT(*) FROM assets")->fetchColumn(),
        'items'  => $pdo->query("SELECT COUNT(*) FROM installation_order_items")->fetchColumn(),
        'locations' => $pdo->query("SELECT COUNT(*) FROM current_asset_locations")->fetchColumn()
    ];

    echo json_encode($results, JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
?>
