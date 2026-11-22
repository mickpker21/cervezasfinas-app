<?php
require_once 'db_config.php';
header('Content-Type: application/json');

try {
    $conn = getDbConnection();
    
    // Count total clients
    $sql = "SELECT COUNT(*) as total FROM clients";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $total = $stmt->fetch(PDO::FETCH_ASSOC)['total'];
    
    // Count clients with coordinates
    $sqlCoords = "SELECT COUNT(*) as total FROM clients WHERE coords IS NOT NULL AND coords != '' AND coords != '{}'";
    $stmtCoords = $conn->prepare($sqlCoords);
    $stmtCoords->execute();
    $totalCoords = $stmtCoords->fetch(PDO::FETCH_ASSOC)['total'];

    echo json_encode([
        'status' => 'success',
        'total_clients' => $total,
        'total_with_coords' => $totalCoords
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
