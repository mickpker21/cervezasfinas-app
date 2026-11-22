<?php
require_once '../common.php';

handleCORS();

try {
    $pdo = getDB();
    
    // Check if we should show all brands (admin) or only active ones (public)
    // For now, we'll just return all active ones by default, unless specific param
    $showAll = isset($_GET['all']) && $_GET['all'] === 'true';

    $sql = "SELECT * FROM shop_brands";
    if (!$showAll) {
        $sql .= " WHERE is_active = 1";
    }
    $sql .= " ORDER BY display_order ASC, name ASC";

    $stmt = $pdo->query($sql);
    $brands = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'data' => $brands
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
