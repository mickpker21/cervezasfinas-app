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

    $id = $data['id'];
    $fields = [];
    $values = [];

    if (isset($data['name'])) {
        $fields[] = "name = ?";
        $values[] = $data['name'];
    }
    if (isset($data['logo_url'])) {
        $fields[] = "logo_url = ?";
        $values[] = $data['logo_url'];
    }
    if (isset($data['color_gradient'])) {
        $fields[] = "color_gradient = ?";
        $values[] = $data['color_gradient'];
    }
    if (isset($data['display_order'])) {
        $fields[] = "display_order = ?";
        $values[] = $data['display_order'];
    }
    if (isset($data['is_active'])) {
        $fields[] = "is_active = ?";
        $values[] = $data['is_active'];
    }

    if (empty($fields)) {
        throw new Exception('No fields to update');
    }

    $values[] = $id;
    $sql = "UPDATE shop_brands SET " . implode(', ', $fields) . " WHERE id = ?";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($values);

    echo json_encode([
        'success' => true,
        'message' => 'Brand updated successfully'
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
