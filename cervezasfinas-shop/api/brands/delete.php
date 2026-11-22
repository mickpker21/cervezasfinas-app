<?php
require_once '../common.php';

handleCORS();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    $pdo = getDB();
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id'])) {
        throw new Exception('ID is required');
    }

    // Soft delete by setting is_active to 0
    $stmt = $pdo->prepare("UPDATE shop_brands SET is_active = 0 WHERE id = ?");
    $stmt->execute([$data['id']]);

    echo json_encode([
        'success' => true,
        'message' => 'Brand deactivated successfully'
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
