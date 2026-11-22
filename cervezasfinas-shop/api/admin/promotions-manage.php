<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        // Fetch promotions
        $stmt = $pdo->query("SELECT * FROM shop_promotions ORDER BY start_date DESC");
        $promos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Fetch linked SKUs for each promo
        foreach ($promos as &$promo) {
            $stmtSku = $pdo->prepare("SELECT sku FROM shop_promotion_skus WHERE promotion_id = ?");
            $stmtSku->execute([$promo['id']]);
            $promo['skus'] = $stmtSku->fetchAll(PDO::FETCH_COLUMN);
        }
        
        sendJSON(['success' => true, 'data' => $promos]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    try {
        $pdo->beginTransaction();

        $promoId = $data['id'] ?? null;
        $skus = $data['skus'] ?? [];

        if ($promoId) {
            // Update
            $sql = "UPDATE shop_promotions SET 
                    name = ?, discount_amount = ?, start_date = ?, end_date = ?, is_active = ?,
                    zones = ?, promo_type = ?, buy_n = ?, pay_m = ?
                    WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['name'],
                $data['discount_amount'],
                $data['start_date'],
                $data['end_date'],
                $data['is_active'],
                $data['zones'] ?? null,
                $data['promo_type'] ?? 'amount_off',
                $data['buy_n'] ?? 0,
                $data['pay_m'] ?? 0,
                $promoId
            ]);
        } else {
            // Create
            $sql = "INSERT INTO shop_promotions (name, discount_amount, start_date, end_date, is_active, zones, promo_type, buy_n, pay_m) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['name'],
                $data['discount_amount'],
                $data['start_date'],
                $data['end_date'],
                $data['is_active'] ?? 1,
                $data['zones'] ?? null,
                $data['promo_type'] ?? 'amount_off',
                $data['buy_n'] ?? 0,
                $data['pay_m'] ?? 0
            ]);
            $promoId = $pdo->lastInsertId();
        }

        // Handle SKUs
        $pdo->prepare("DELETE FROM shop_promotion_skus WHERE promotion_id = ?")->execute([$promoId]);
        
        if (!empty($skus)) {
            $stmtSku = $pdo->prepare("INSERT INTO shop_promotion_skus (promotion_id, sku) VALUES (?, ?)");
            foreach ($skus as $sku) {
                $stmtSku->execute([$promoId, $sku]);
            }
        }

        $pdo->commit();
        sendJSON(['success' => true, 'message' => 'Promotion saved']);
    } catch (PDOException $e) {
        $pdo->rollBack();
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        $pdo->prepare("DELETE FROM shop_promotions WHERE id = ?")->execute([$id]);
        sendJSON(['success' => true, 'message' => 'Promotion deleted']);
    }
}
?>
