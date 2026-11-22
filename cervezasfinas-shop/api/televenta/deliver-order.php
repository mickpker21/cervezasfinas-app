<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$order_id = intval($input['order_id'] ?? 0);

if ($order_id <= 0) {
    sendJSON(['error' => 'order_id is required'], 400);
}

try {
    $pdo->beginTransaction();
    
    // 1. Obtener datos del pedido
    $orderStmt = $pdo->prepare("
        SELECT * FROM shop_orders WHERE id = ? AND status = 'confirmed'
    ");
    $orderStmt->execute([$order_id]);
    $order = $orderStmt->fetch();
    
    if (!$order) {
        sendJSON(['error' => 'Order not found or not confirmed'], 404);
    }
    
    $client_code = $order['client_code'];
    $total_amount = floatval($order['total_amount']);
    
    // 2. Marcar orden como entregada
    $updateStmt = $pdo->prepare("
        UPDATE shop_orders 
        SET status = 'delivered', delivered_at = NOW()
        WHERE id = ?
    ");
    $updateStmt->execute([$order_id]);
    
    // 3. Obtener configuración de puntos
    $configStmt = $pdo->prepare("SELECT * FROM shop_points_config LIMIT 1");
    $configStmt->execute();
    $config = $configStmt->fetch();
    
    $points_per_peso = $config ? floatval($config['points_per_peso']) : 0.1;
    $min_purchase = $config ? floatval($config['min_purchase_for_points']) : 0;
    
    $points_awarded = 0;
    
    // 4. Calcular y otorgar puntos si cumple mínimo
    // 4. Calcular y otorgar puntos (POR SKU)
    $points_awarded = 0;
    
    // Fetch items with their points_awarded value
    $itemsStmt = $pdo->prepare("
        SELECT oi.quantity, p.points_awarded 
        FROM shop_order_items oi
        JOIN shop_products p ON oi.sku = p.sku
        WHERE oi.order_id = ?
    ");
    $itemsStmt->execute([$order_id]);
    $items = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($items as $item) {
        $points_awarded += ($item['quantity'] * intval($item['points_awarded']));
    }
    
    // Check minimum purchase (TOTAL amount check still applies as global rule?)
    // Assuming we keep the min purchase rule but apply it to the total order value
    if ($total_amount >= $min_purchase && $points_awarded > 0) {
        // Points calculated above
        
        // Crear transacción de puntos (expiran en 6 meses)
        $expires_at = date('Y-m-d H:i:s', strtotime('+6 months'));
        
        $transStmt = $pdo->prepare("
            INSERT INTO shop_points_transactions 
            (client_code, type, points, reason, related_order_id, expires_at)
            VALUES (?, 'earned', ?, 'Compra - Pedido entregado', ?, ?)
        ");
        $transStmt->execute([$client_code, $points_awarded, $order_id, $expires_at]);
        
        // Actualizar balance
        $balanceStmt = $pdo->prepare("
            INSERT INTO shop_client_points (client_code, points_balance)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE 
                points_balance = points_balance + ?,
                updated_at = NOW()
        ");
        $balanceStmt->execute([$client_code, $points_awarded, $points_awarded]);
    }
    
    $pdo->commit();
    
    sendJSON([
        'success' => true,
        'data' => [
            'message' => 'Order delivered successfully',
            'points_awarded' => $points_awarded
        ]
    ]);
    
} catch (PDOException $e) {
    $pdo->rollBack();
    sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
}
?>
