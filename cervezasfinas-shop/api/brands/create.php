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

    if (!isset($data['name'])) {
        throw new Exception('Name is required');
    }

    $name = $data['name'];
    $logo_url = $data['logo_url'] ?? '';
    $color_gradient = $data['color_gradient'] ?? 'from-gray-500 to-gray-700';
    $display_order = $data['display_order'] ?? 0;
    $is_active = isset($data['is_active']) ? $data['is_active'] : 1;

    $stmt = $pdo->prepare("INSERT INTO shop_brands (name, logo_url, color_gradient, display_order, is_active) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$name, $logo_url, $color_gradient, $display_order, $is_active]);

    echo json_encode([
        'success' => true,
        'id' => $pdo->lastInsertId(),
        'message' => 'Brand created successfully'
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
