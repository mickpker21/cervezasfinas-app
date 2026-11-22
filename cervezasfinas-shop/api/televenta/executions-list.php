<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    // Obtener todas las ejecuciones ordenadas por pendientes primero
    $client_code = $_GET['client_code'] ?? null;

    $sql = "SELECT * FROM shop_cooler_executions";
    $params = [];

    if ($client_code) {
        $sql .= " WHERE client_code = ?";
        $params[] = $client_code;
    }

    $sql .= " ORDER BY 
            CASE status
                WHEN 'pending' THEN 1
                WHEN 'approved' THEN 2
                WHEN 'rejected' THEN 3
            END,
            created_at DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $executions = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'data' => $executions
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
