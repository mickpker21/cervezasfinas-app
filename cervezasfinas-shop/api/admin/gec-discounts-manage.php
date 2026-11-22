<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM shop_gec_discounts ORDER BY discount_percentage ASC");
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendJSON(['success' => true, 'data' => $data]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    // Only Updates allowed easily for simplicty, or create if missing logic handled by frontend knowing the list. 
    // Actually typically fixed set, but let's allow updating percentage.
    
    try {
        if (isset($data['id'])) {
             $stmt = $pdo->prepare("UPDATE shop_gec_discounts SET discount_percentage = ? WHERE id = ?");
             $stmt->execute([$data['discount_percentage'], $data['id']]);
             sendJSON(['success' => true, 'message' => 'Discount updated']);
        }
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
}
?>
