<?php
require_once 'db_config.php';
header('Content-Type: application/json');

$code = '31425';

try {
    $conn = getDbConnection();
    
    // Check client by code
    $stmt = $conn->prepare("SELECT id, name, client_code FROM clients WHERE client_code = ? OR id = ?");
    $stmt->execute([$code, $code]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$client) {
        die(json_encode(['status' => 'error', 'message' => 'Client not found']));
    }

    // Check assets for this client
    $stmt = $conn->prepare("SELECT * FROM current_asset_locations WHERE client_id = ? OR client_id = ?");
    $stmt->execute([$client['id'], $client['client_code']]);
    $assets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'client' => $client,
        'assets' => $assets
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
