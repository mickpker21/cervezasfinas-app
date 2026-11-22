<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list_redemptions';

if ($method === 'GET') {
    try {
        if ($action === 'list_redemptions') {
            // List pending redemptions
            $sql = "SELECT r.*, p.name as product_name 
                    FROM shop_point_redemptions r
                    JOIN shop_products p ON r.product_sku = p.sku
                    ORDER BY r.created_at DESC";
            $stmt = $pdo->query($sql);
            sendJSON(['success' => true, 'data' => $stmt->fetchAll()]);
            
        } elseif ($action === 'list_products') {
            // List redeemable products
            $sql = "SELECT rp.*, p.name 
                    FROM shop_point_redemption_products rp
                    JOIN shop_products p ON rp.sku = p.sku";
            $stmt = $pdo->query($sql);
            sendJSON(['success' => true, 'data' => $stmt->fetchAll()]);
        }
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $postAction = $data['action'] ?? '';

    try {
        if ($postAction === 'update_status') {
            // Approve/Reject redemption
            $sql = "UPDATE shop_point_redemptions SET status = ?, approved_at = NOW() WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$data['status'], $data['id']]);
            
            // If rejected, refund points (logic would go here, simplified for now)
            
            sendJSON(['success' => true, 'message' => 'Status updated']);
            
        } elseif ($postAction === 'save_product') {
            // Add/Edit redeemable product
            if (isset($data['id'])) {
                $sql = "UPDATE shop_point_redemption_products SET points_required = ?, is_active = ? WHERE id = ?";
                $pdo->prepare($sql)->execute([$data['points_required'], $data['is_active'], $data['id']]);
            } else {
                $sql = "INSERT INTO shop_point_redemption_products (sku, points_required, is_active) VALUES (?, ?, ?)";
                $pdo->prepare($sql)->execute([$data['sku'], $data['points_required'], $data['is_active'] ?? 1]);
            }
            sendJSON(['success' => true, 'message' => 'Product saved']);
        }
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
}
?>
