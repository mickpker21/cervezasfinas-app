<?php
require_once '../common.php';

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

// Cache for 10 minutes to reduce load
header('Cache-Control: public, max-age=600');

$pdo = getDB();
$stmt = $pdo->query("SELECT * FROM shop_banners WHERE is_active = 1 ORDER BY display_order ASC");
echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
?>
