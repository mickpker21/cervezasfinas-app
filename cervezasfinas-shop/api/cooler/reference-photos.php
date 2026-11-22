<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    // Obtener fotos de referencia activas
    $stmt = $pdo->prepare("
        SELECT * FROM shop_cooler_reference_photos 
        WHERE is_active = 1
        ORDER BY created_at DESC
    ");
    $stmt->execute();
    $photos = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'data' => $photos
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
