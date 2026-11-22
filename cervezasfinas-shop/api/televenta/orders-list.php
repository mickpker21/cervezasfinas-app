<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    // Obtener todos los pedidos con sus items
    $stmt = $pdo->prepare("
        SELECT * FROM shop_orders 
        ORDER BY 
            CASE status
                WHEN 'pending' THEN 1
                WHEN 'confirmed' THEN 2
                WHEN 'delivered' THEN 3
                ELSE 4
            END,
            created_at DESC
    ");
    $stmt->execute();
    $orders = $stmt->fetchAll();
    
    // Para cada pedido, obtener sus items
    $itemStmt = $pdo->prepare("
        SELECT oi.*, p.name as product_name 
        FROM shop_order_items oi
        LEFT JOIN shop_products p ON oi.sku = p.sku
        WHERE oi.order_id = ?
    ");
    
    foreach ($orders as &$order) {
        $itemStmt->execute([$order['id']]);
        $order['items'] = $itemStmt->fetchAll();
    }
    
    sendJSON([
        'success' => true,
        'data' => $orders
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
