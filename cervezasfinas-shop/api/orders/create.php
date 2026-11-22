<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();
$auth = requireAuth();

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$items = $input['items'] ?? [];
$notes = $input['notes'] ?? '';

if (empty($items)) {
    sendJSON(['error' => 'No items in cart'], 400);
}

try {
    $pdo->beginTransaction();
    
    $client_code = $auth['client_code'];
    $order_number = 'ORD-' . date('YmdHis') . '-' . substr(md5($client_code), 0, 4);
    
    // Calcular total
    $total_amount = 0;
    foreach ($items as $item) {
        $total_amount += floatval($item['subtotal']);
    }
    
    // Crear orden
    $stmt = $pdo->prepare("
        INSERT INTO shop_orders (order_number, client_code, status, total_amount, notes)
        VALUES (?, ?, 'pending', ?, ?)
    ");
    $stmt->execute([$order_number, $client_code, $total_amount, $notes]);
    $order_id = $pdo->lastInsertId();
    
    // Insertar items
    $itemStmt = $pdo->prepare("
        INSERT INTO shop_order_items (order_id, sku, quantity, unit_price, discount_applied, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    
    foreach ($items as $item) {
        $itemStmt->execute([
            $order_id,
            $item['sku'],
            $item['quantity'],
            $item['unit_price'],
            $item['discount_applied'] ?? 0,
            $item['subtotal']
        ]);
    }
    
    $pdo->commit();
    
    sendJSON([
        'success' => true,
        'data' => [
            'order_id' => $order_id,
            'order_number' => $order_number,
            'total_amount' => $total_amount
        ]
    ]);
    
} catch (PDOException $e) {
    $pdo->rollBack();
    sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
}
?>
