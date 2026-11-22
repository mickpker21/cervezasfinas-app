<?php
require_once 'common.php';

header("Content-Type: application/json; charset=UTF-8");
handleCORS();

$pdo = getDB();

$action = $_GET['action'] ?? '';

try {
    if ($action === 'get-config') {
        // Fetch global config (legacy support, maybe still used for min_purchase)
        $stmt = $pdo->prepare("SELECT * FROM shop_points_config LIMIT 1");
        $stmt->execute();
        $config = $stmt->fetch(PDO::FETCH_ASSOC);
        
        sendJSON([
            'success' => true,
            'data' => $config ?: [
                'points_per_peso' => 0.1, 
                'min_purchase_for_points' => 0
            ]
        ]);

    } elseif ($action === 'list-products') {
        // List products with points info
        // We only care about products that have points > 0 OR can be redeemed (for the legacy redemption list)
        // Actually, for the new Admin panel, we want to search ALL products to assign points.
        // But let's stick to returning products that are ACTIVE.
        
        $search = $_GET['search'] ?? '';
        $sql = "SELECT id, sku, name, points_awarded, is_active FROM shop_products WHERE is_active = 1";
        $params = [];
        
        if ($search) {
            $sql .= " AND (sku LIKE ? OR name LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }
        
        $sql .= " ORDER BY name LIMIT 50";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        sendJSON([
            'success' => true,
            'data' => $products
        ]);

    } elseif ($action === 'update-product-points') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new Exception("Method not allowed");
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $sku = $input['sku'] ?? '';
        $points = intval($input['points'] ?? 0);
        
        if (!$sku) throw new Exception("SKU is required");
        
        $stmt = $pdo->prepare("UPDATE shop_products SET points_awarded = ? WHERE sku = ?");
        $stmt->execute([$points, $sku]);
        
        sendJSON(['success' => true, 'message' => 'Points updated']);

    } elseif ($action === 'update-config') {
        // Legacy: Update points per peso (we might keep this for backward compatibility or disable it)
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new Exception("Method not allowed");
        }
        $input = json_decode(file_get_contents('php://input'), true);
        $ppp = floatval($input['points_per_peso'] ?? 0);
        $min = floatval($input['min_purchase_for_points'] ?? 0);
        
        // Check if row exists
        $check = $pdo->query("SELECT COUNT(*) FROM shop_points_config")->fetchColumn();
        if ($check == 0) {
            $pdo->prepare("INSERT INTO shop_points_config (points_per_peso, min_purchase_for_points) VALUES (?, ?)")
                ->execute([$ppp, $min]);
        } else {
            $pdo->prepare("UPDATE shop_points_config SET points_per_peso = ?, min_purchase_for_points = ?")
                ->execute([$ppp, $min]);
        }
        
        sendJSON(['success' => true, 'message' => 'Config updated']);

    } else {
        throw new Exception("Invalid action");
    }

} catch (Exception $e) {
    sendJSON(['success' => false, 'error' => $e->getMessage()], 400);
}
?>
