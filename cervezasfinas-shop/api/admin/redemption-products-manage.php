<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM shop_point_redemption_products ORDER BY points_required ASC");
        $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendJSON(['success' => true, 'data' => $products]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    try {
        if (isset($data['id'])) {
            // Update
            $sql = "UPDATE shop_point_redemption_products SET sku = ?, points_required = ?, is_active = ? WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$data['sku'], $data['points_required'], $data['is_active'], $data['id']]);
            sendJSON(['success' => true, 'message' => 'Product updated']);
        } else {
            // Create
            $sql = "INSERT INTO shop_point_redemption_products (sku, points_required, is_active) VALUES (?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$data['sku'], $data['points_required'], $data['is_active'] ?? 1]);
            sendJSON(['success' => true, 'message' => 'Product added']);
        }
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        $pdo->prepare("DELETE FROM shop_point_redemption_products WHERE id = ?")->execute([$id]);
        sendJSON(['success' => true, 'message' => 'Product deleted']);
    }
}
?>
