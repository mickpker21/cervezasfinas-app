<?php
// backend_scripts/php/evaluations-pdv-read.php
include_once 'db.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With'); // CORS FIX

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

// Parameters
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;
$user_id = isset($_GET['user_id']) ? $_GET['user_id'] : null;
$client_id = isset($_GET['client_id']) ? $_GET['client_id'] : null;

try {
    $whereClauses = [];
    $params = [];

    if ($user_id) {
        $whereClauses[] = "user_id = :user_id";
        $params[':user_id'] = $user_id;
    }

    if ($client_id) {
        $whereClauses[] = "client_id = :client_id";
        $params[':client_id'] = $client_id;
    }

    $sql = "SELECT * FROM evaluaciones_pdv";
    if (!empty($whereClauses)) {
        $sql .= " WHERE " . implode(" AND ", $whereClauses);
    }
    
    $sql .= " ORDER BY fecha DESC, created_at DESC LIMIT " . $limit;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Decode payload if stored as string
    foreach ($rows as &$row) {
        if (isset($row['payload']) && is_string($row['payload'])) {
            $decoded = json_decode($row['payload'], true);
            if ($decoded) {
                $row['payload'] = $decoded;
            }
        }
    }

    echo json_encode($rows);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
