<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
    $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
    
    $created_by = isset($_GET['created_by']) ? $_GET['created_by'] : null;
    $status = isset($_GET['status']) ? $_GET['status'] : null;
    $updated_after = isset($_GET['updated_after']) ? $_GET['updated_after'] : null;
    $order_id = isset($_GET['id']) ? $_GET['id'] : null;
    $assigned_to = isset($_GET['assigned_to']) ? $_GET['assigned_to'] : null;

    $conditions = ["1=1"];
    $params = [];

    if ($order_id) {
        $conditions[] = "o.id = :order_id";
        $params[':order_id'] = $order_id;
    }

    if ($assigned_to) {
        $conditions[] = "o.assigned_to = :assigned_to";
        $params[':assigned_to'] = $assigned_to;
    }

    if ($created_by) {
        $conditions[] = "o.created_by = :created_by";
        $params[':created_by'] = $created_by;
    }

    if ($status) {
        $conditions[] = "o.status = :status";
        $params[':status'] = $status;
    }

    if ($updated_after) {
        $conditions[] = "o.updated_at > :updated_after";
        $params[':updated_after'] = $updated_after;
    }

    $whereSql = implode(" AND ", $conditions);

    // 1. Fetch Orders with Client names
    $sql = "SELECT o.*, 
            COALESCE(c1.name, o.client_name_cached) as origin_client_name, 
            c1.client_code as origin_client_code, 
            COALESCE(c1.address, o.client_address_cached) as origin_client_address, 
            COALESCE(c1.business_name, o.client_business_name_cached) as origin_client_business_name,
            c1.coords as origin_client_coords,
            COALESCE(c2.name, o.destination_client_name_cached) as destination_client_name, 
            COALESCE(c2.address, o.destination_client_address_cached) as destination_client_address, 
            COALESCE(c2.business_name, o.destination_client_business_name_cached) as destination_client_business_name,
            c2.coords as destination_client_coords
            FROM installation_orders o
            LEFT JOIN clients c1 ON o.client_id = c1.id
            LEFT JOIN clients c2 ON o.destination_client_id = c2.id
            WHERE $whereSql 
            ORDER BY o.created_at DESC 
            LIMIT :limit OFFSET :offset";
            
    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $v) $stmt->bindValue($k, $v);
    $stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Fetch Items for these orders
    if (!empty($orders)) {
        $orderIds = array_column($orders, 'id');
        $placeholders = [];
        foreach ($orderIds as $idx => $oid) {
            $key = ":oid" . $idx;
            $placeholders[] = $key;
        }
        $inQuery = implode(',', $placeholders);
        
        $sqlItems = "SELECT * FROM installation_order_items WHERE order_id IN ($inQuery)";
        $stmtItems = $pdo->prepare($sqlItems);
        foreach ($orderIds as $idx => $oid) {
            $stmtItems->bindValue(":oid" . $idx, $oid);
        }
        $stmtItems->execute();
        $allItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        // Group items by order_id
        $itemsMap = [];
        foreach ($allItems as $item) {
            $itemsMap[$item['order_id']][] = $item;
        }

        // Attach items to orders
        foreach ($orders as &$order) {
            $order['items'] = isset($itemsMap[$order['id']]) ? $itemsMap[$order['id']] : [];
        }
    }

    echo json_encode(['rows' => $orders, 'count' => count($orders)]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'General error: ' . $e->getMessage()]);
} catch (Error $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fatal error: ' . $e->getMessage()]);
}
?>
