<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    // Query joining locations with client names and addresses
    $sql = "SELECT 
                cal.asset_id,
                cal.asset_serial,
                cal.asset_type,
                cal.client_id,
                cal.action,
                cal.created_at as installation_date,
                c.name as client_name,
                c.business_name as client_business_name,
                c.address as client_address,
                c.client_code as client_code
            FROM current_asset_locations cal
            LEFT JOIN clients c ON cal.client_id = c.id
            WHERE cal.client_id IS NOT NULL 
              AND cal.client_id != '' 
              AND cal.client_id != 'WAREHOUSE'
            ORDER BY c.name ASC, cal.created_at DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode($results);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>
