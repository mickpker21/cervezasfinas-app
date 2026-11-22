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
$delivery_date = $input['delivery_date'] ?? null;

if ($order_id <= 0) {
    sendJSON(['error' => 'order_id is required'], 400);
}

try {
    // Start transaction
    $pdo->beginTransaction();

    // 1. Update Items if provided
    if (isset($input['items']) && is_array($input['items'])) {
        foreach ($input['items'] as $item) {
            $sku = $item['sku'];
            $qty = intval($item['quantity']);
            
            // Get current unit price to recalculate subtotal
            $priceStmt = $pdo->prepare("SELECT unit_price FROM shop_order_items WHERE order_id = ? AND sku = ?");
            $priceStmt->execute([$order_id, $sku]);
            $current = $priceStmt->fetch();
            
            if ($current) {
                if ($qty > 0) {
                    $newSubtotal = $qty * floatval($current['unit_price']);
                    $pdo->prepare("UPDATE shop_order_items SET quantity = ?, subtotal = ? WHERE order_id = ? AND sku = ?")
                        ->execute([$qty, $newSubtotal, $order_id, $sku]);
                } else {
                    // Remove item if qty is 0 (optional feature)
                    $pdo->prepare("DELETE FROM shop_order_items WHERE order_id = ? AND sku = ?")
                        ->execute([$order_id, $sku]);
                }
            } else if ($qty > 0) {
                // INSERT NEW ITEM
                $unitPrice = floatval($item['unit_price'] ?? 0);
                
                // Fallback: fetch price from products if not provided or 0
                if ($unitPrice <= 0) {
                    $prodStmt = $pdo->prepare("SELECT base_price FROM shop_products WHERE sku = ?");
                    $prodStmt->execute([$sku]);
                    $unitPrice = floatval($prodStmt->fetchColumn() ?: 0);
                }

                $newSubtotal = $qty * $unitPrice;
                $pdo->prepare("INSERT INTO shop_order_items (order_id, sku, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)")
                    ->execute([$order_id, $sku, $qty, $unitPrice, $newSubtotal]);
            }
        }
        
        // Recalculate Order Total
        $sumStmt = $pdo->prepare("SELECT SUM(subtotal) FROM shop_order_items WHERE order_id = ?");
        $sumStmt->execute([$order_id]);
        $newTotal = $sumStmt->fetchColumn() ?: 0;
        
        $pdo->prepare("UPDATE shop_orders SET total_amount = ? WHERE id = ?")
            ->execute([$newTotal, $order_id]);
    }

    // 2. Update Order Status
    $stmt = $pdo->prepare("
        UPDATE shop_orders 
        SET status = 'confirmed', 
            confirmed_at = NOW(),
            delivery_date = ?
        WHERE id = ? AND status = 'pending'
    ");
    $stmt->execute([$delivery_date, $order_id]);
    
    if ($stmt->rowCount() === 0) {
        $pdo->rollBack();
        // Check why it failed
        $checkStmt = $pdo->prepare("SELECT status FROM shop_orders WHERE id = ?");
        // ... (Error handling logic)
        $checkStmt->execute([$order_id]);
        $order = $checkStmt->fetch();

        if (!$order) {
            sendJSON(['error' => "Order #$order_id not found"], 404);
        } else if ($order['status'] !== 'pending') {
            sendJSON(['error' => "Order #$order_id is already " . $order['status']], 409);
        } else {
            sendJSON(['error' => 'Failed to update order'], 500);
        }
    }
    
    $pdo->commit();
    
    sendJSON([
        'success' => true,
        'message' => 'Order confirmed'
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
