<?php
// backend_scripts/php/visitas-read.php
include_once 'db.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$route = $_GET['route'] ?? null;
$startDate = $_GET['start_date'] ?? null;
$endDate = $_GET['end_date'] ?? null;
$clientId = $_GET['client_id'] ?? null;
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;

$query = "SELECT * FROM visitas WHERE 1=1";
$params = [];

if ($route) {
    // Normalization logic if needed, matches frontend
    $query .= " AND ruta = :route";
    $params[':route'] = $route;
}

if ($startDate) {
    $query .= " AND fecha >= :start_date";
    $params[':start_date'] = $startDate;
}

if ($endDate) {
    $query .= " AND fecha <= :end_date";
    $params[':end_date'] = $endDate;
}

if ($clientId) {
    $query .= " AND client_id = :client_id";
    $params[':client_id'] = $clientId;
}

$clientCode = $_GET['client_code'] ?? null;
if (!$clientId && $clientCode) {
    $query .= " AND client_code = :client_code";
    $params[':client_code'] = $clientCode;
}

$query .= " ORDER BY fecha DESC LIMIT " . $limit;

try {
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Decode JSON fields
    foreach ($rows as &$r) {
        if ($r['inventory']) $r['inventory'] = json_decode($r['inventory'], true);
    }
    
    echo json_encode(['rows' => $rows]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
