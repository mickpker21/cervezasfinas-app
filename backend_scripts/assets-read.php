<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    $serial = isset($_GET['serial']) ? $_GET['serial'] : null;
    $status = isset($_GET['status']) ? $_GET['status'] : null;
    $type = isset($_GET['type']) ? $_GET['type'] : null;
    $client_id = isset($_GET['client_id']) ? $_GET['client_id'] : null;

    $conditions = ["1=1"];
    $params = [];

    if ($serial) {
        $conditions[] = "serial = ?";
        $params[] = $serial;
    }

    if ($status) {
        $conditions[] = "status = ?";
        $params[] = $status;
    }

    if ($type) {
        $conditions[] = "type = ?";
        $params[] = $type;
    }

    if ($client_id) {
        $conditions[] = "l.client_id = ?";
        $params[] = $client_id;
    }

    $warehouse_ids_json = isset($_GET['warehouse_ids']) ? $_GET['warehouse_ids'] : null;
    if ($warehouse_ids_json) {
        $warehouse_ids = json_decode($warehouse_ids_json, true);
        if (is_array($warehouse_ids) && count($warehouse_ids) > 0) {
            $placeholders = implode(',', array_fill(0, count($warehouse_ids), '?'));
            $conditions[] = "a.warehouse_id IN ($placeholders)";
            foreach ($warehouse_ids as $id) {
                $params[] = $id;
            }
        }
    }

    $whereSql = implode(" AND ", $conditions);

    // Join with LATEST current_asset_locations to see where it is currently
    $sql = "SELECT a.*, 
                   l.client_id, l.action as last_action, c.name as current_client_name, c.address as current_client_address,
                   w.name as warehouse_name
            FROM assets a
            LEFT JOIN (
                SELECT t1.*
                FROM current_asset_locations t1
                JOIN (
                    SELECT asset_id, MAX(created_at) as max_created
                    FROM current_asset_locations
                    GROUP BY asset_id
                ) t2 ON t1.asset_id = t2.asset_id AND t1.created_at = t2.max_created
            ) l ON a.id = l.asset_id
            LEFT JOIN clients c ON l.client_id = c.id
            LEFT JOIN warehouses w ON a.warehouse_id = w.id
            WHERE $whereSql
            ORDER BY a.created_at DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['rows' => $rows, 'count' => count($rows)]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
