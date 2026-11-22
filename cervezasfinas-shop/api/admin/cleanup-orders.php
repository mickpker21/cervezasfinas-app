<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

try {
    // Delete orders that are 'delivered' AND delivery_date < TODAY
    // This assumes historical data is already captured in 'ventas_por_sku' or similar
    // as per user instruction "se borre el pedido ya que se cargara desde venta por sku"
    
    $sql = "DELETE FROM shop_orders 
            WHERE status = 'delivered' 
            AND delivery_date < CURDATE()";
            
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $deletedCount = $stmt->rowCount();
    
    // Also clean up orphaned order items (if cascade delete isn't set, but schema says ON DELETE CASCADE)
    // Just in case:
    // DELETE FROM shop_order_items WHERE order_id NOT IN (SELECT id FROM shop_orders)
    
    echo json_encode([
        'success' => true,
        'message' => "Cleaned up $deletedCount delivered orders",
        'deleted_count' => $deletedCount
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
