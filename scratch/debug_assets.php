<?php
require_once 'db_config.php';
header('Content-Type: application/json');

try {
    $conn = getDbConnection();
    
    // Get asset locations
    $sql = "SELECT al.*, c.name as client_name, c.client_code as client_code_db, c.id as client_id_db
            FROM current_asset_locations al
            LEFT JOIN clients c ON al.client_id = c.id
            LIMIT 20";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $locations = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'status' => 'success',
        'sample_locations' => $locations
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
