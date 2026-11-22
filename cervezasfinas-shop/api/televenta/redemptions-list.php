<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    // Obtener todas las solicitudes de canje con info del producto
    $stmt = $pdo->prepare("
        SELECT 
            pr.*,
            p.name as product_name,
            p.image_url as product_image,
            prp.points_required
        FROM shop_point_redemptions pr
        LEFT JOIN shop_point_redemption_products prp ON pr.product_sku = prp.sku
        LEFT JOIN shop_products p ON pr.product_sku = p.sku
        ORDER BY 
            CASE pr.status
                WHEN 'pending' THEN 1
                WHEN 'approved' THEN 2
                WHEN 'delivered' THEN 3
                WHEN 'cancelled' THEN 4
            END,
            pr.created_at DESC
    ");
    $stmt->execute();
    $redemptions = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'data' => $redemptions
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
