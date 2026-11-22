<?php
// backend_scripts/php/evaluations-read.php
include_once 'db.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;
$tienda_id = isset($_GET['tienda_id']) ? $_GET['tienda_id'] : null;

try {
    $whereClauses = [];
    $params = [];

    if ($tienda_id) {
        $whereClauses[] = "tienda_id = :tienda_id";
        $params[':tienda_id'] = $tienda_id;
    }

    // Table 'evaluaciones' is for Canal Moderno
    $sql = "SELECT * FROM evaluaciones";
    if (!empty($whereClauses)) {
        $sql .= " WHERE " . implode(" AND ", $whereClauses);
    }
    
    $sql .= " ORDER BY fecha DESC, created_at DESC LIMIT " . $limit;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Decode payload
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
