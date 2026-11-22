<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM shop_special_prices ORDER BY client_code ASC, sales_route ASC, zone ASC");
        $prices = $stmt->fetchAll();
        sendJSON(['success' => true, 'data' => $prices]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    try {
        if (isset($data['id'])) {
            // Update
            $sql = "UPDATE shop_special_prices SET 
                    client_code = ?, zone = ?, sales_route = ?, sku = ?, special_price = ?, start_date = ?, end_date = ?, is_active = ? 
                    WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['client_code'] ?: null,
                $data['zone'] ?: null,
                $data['sales_route'] ?: null,
                $data['sku'],
                $data['special_price'],
                $data['start_date'] ?: null,
                $data['end_date'] ?: null,
                $data['is_active'] ?? 1,
                $data['id']
            ]);
        } else {
            // Create
            $sql = "INSERT INTO shop_special_prices (client_code, zone, sales_route, sku, special_price, start_date, end_date, is_active) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['client_code'] ?: null,
                $data['zone'] ?: null,
                $data['sales_route'] ?: null,
                $data['sku'],
                $data['special_price'],
                $data['start_date'] ?: null,
                $data['end_date'] ?: null,
                $data['is_active'] ?? 1
            ]);
        }
        sendJSON(['success' => true, 'message' => 'Special price saved']);
    } catch (PDOException $e) {
        // Log error for debugging
        file_put_contents('special_prices_error.log', date('Y-m-d H:i:s') . " - Error: " . $e->getMessage() . "\nData: " . json_encode($data) . "\n", FILE_APPEND);
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
} elseif ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        $pdo->prepare("DELETE FROM shop_special_prices WHERE id = ?")->execute([$id]);
        sendJSON(['success' => true, 'message' => 'Special price deleted']);
    }
}
?>
