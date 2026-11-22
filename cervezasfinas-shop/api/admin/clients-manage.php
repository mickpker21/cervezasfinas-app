<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $sql = "SELECT u.id, u.client_code, c.gec, u.is_active, u.created_at, u.last_login 
                FROM shop_client_users u
                LEFT JOIN clients c ON u.client_code = c.client_code
                ORDER BY u.client_code ASC";
        $stmt = $pdo->query($sql);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendJSON(['success' => true, 'data' => $users]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    try {
        if (isset($data['id'])) {
            // Update
            $sql = "UPDATE shop_client_users SET is_active = ? WHERE id = ?";
            $params = [$data['is_active'], $data['id']];
            
            // Password reset if provided
            if (!empty($data['password'])) {
                $sql = "UPDATE shop_client_users SET is_active = ?, password_hash = ? WHERE id = ?";
                $params = [$data['is_active'], password_hash($data['password'], PASSWORD_DEFAULT), $data['id']];
            }
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            sendJSON(['success' => true, 'message' => 'Client updated']);
        } else {
            // Create
            if (empty($data['client_code']) || empty($data['password'])) {
                sendJSON(['error' => 'Client Code and Password required'], 400);
            }
            // Check existence
            $check = $pdo->prepare("SELECT id FROM shop_client_users WHERE client_code = ?");
            $check->execute([$data['client_code']]);
            if ($check->fetch()) {
                sendJSON(['error' => 'Client Code already exists'], 400);
            }

            $sql = "INSERT INTO shop_client_users (client_code, password_hash, is_active) VALUES (?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['client_code'],
                password_hash($data['password'], PASSWORD_DEFAULT),
                $data['is_active'] ?? 1
            ]);
            sendJSON(['success' => true, 'message' => 'Client created']);
        }
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
}
?>
