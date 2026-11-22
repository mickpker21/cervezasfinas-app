<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    // Obtener productos disponibles para canje (activos)
    $stmt = $pdo->prepare("
        SELECT 
            prp.id,
            prp.sku,
            prp.points_required,
            prp.is_active,
            p.name,
            p.description,
            p.image_url
        FROM shop_point_redemption_products prp
        LEFT JOIN shop_products p ON prp.sku = p.sku
        WHERE prp.is_active = 1
        ORDER BY prp.points_required ASC
    ");
    $stmt->execute();
    $products = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'data' => $products
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
