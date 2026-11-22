<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php'; // Ensure you have this file connected to your Hostinger DB

try {
    $pdo = getDBConnection(); // implement this in your db_config

    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;
    $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
    
    // Filters (optional)
    // Filters
    $salesRoute = isset($_GET['sales_route']) ? $_GET['sales_route'] : null;
    $internalRoute = isset($_GET['internal_route']) ? $_GET['internal_route'] : null;
    $clientCode = isset($_GET['client_code']) ? $_GET['client_code'] : null;
    $ownerId = isset($_GET['owner_id']) ? $_GET['owner_id'] : null;
    $search = isset($_GET['search']) ? $_GET['search'] : null;
    $updatedAfter = isset($_GET['updated_after']) ? $_GET['updated_after'] : null;
    $createdAfter = isset($_GET['created_after']) ? $_GET['created_after'] : null;
    
    // List filters (CSV)
    $salesRoutesRaw = isset($_GET['sales_routes']) ? explode(',', $_GET['sales_routes']) : [];
    $internalRoutesRaw = isset($_GET['internal_routes']) ? explode(',', $_GET['internal_routes']) : [];
    
    // Filter out empty strings that result from exploding an empty parameter
    $salesRoutes = array_filter(array_map('trim', $salesRoutesRaw), function($value) { return $value !== ''; });
    $internalRoutes = array_filter(array_map('trim', $internalRoutesRaw), function($value) { return $value !== ''; });


    $conditions = ["1=1"];
    $params = [];

    if ($salesRoute && $salesRoute !== '__ALL__') {
        $conditions[] = "(sales_route = ? OR internal_route = ?)";
        $params[] = $salesRoute;
        $params[] = $salesRoute;
    }
    
    if (!empty($salesRoutes) && !empty($internalRoutes)) {
        $inSales = implode(',', array_fill(0, count($salesRoutes), '?'));
        $inInternal = implode(',', array_fill(0, count($internalRoutes), '?'));
        $conditions[] = "(sales_route IN ($inSales) OR internal_route IN ($inInternal))";
        foreach ($salesRoutes as $r) $params[] = $r;
        foreach ($internalRoutes as $r) $params[] = $r;
    } else {
        if (!empty($salesRoutes)) {
            $inQuery = implode(',', array_fill(0, count($salesRoutes), '?'));
            $conditions[] = "sales_route IN ($inQuery)";
            foreach ($salesRoutes as $r) $params[] = $r;
        }
        if (!empty($internalRoutes)) {
             $inQuery = implode(',', array_fill(0, count($internalRoutes), '?'));
             $conditions[] = "internal_route IN ($inQuery)";
             foreach ($internalRoutes as $r) $params[] = $r;
        }
    }

    if ($internalRoute) {
        $conditions[] = "internal_route = ?";
        $params[] = $internalRoute;
    }

    if ($clientCode) {
        $conditions[] = "client_code = ?";
        $params[] = $clientCode;
    }

    if ($ownerId) {
        $conditions[] = "owner_id = ?";
        $params[] = $ownerId;
    }

    if (isset($_GET['client_codes'])) {
        $codeList = explode(',', $_GET['client_codes']);
        if (!empty($codeList)) {
             $inQuery = implode(',', array_fill(0, count($codeList), '?'));
             $conditions[] = "client_code IN ($inQuery)";
             foreach ($codeList as $c) $params[] = trim($c);
        }
    }

    if ($search) {
        $conditions[] = "(name LIKE ? OR business_name LIKE ? OR client_code LIKE ? OR rfc LIKE ? OR fiscal_name LIKE ?)";
        $term = "%$search%";
        $params[] = $term;
        $params[] = $term;
        $params[] = $term;
        $params[] = $term;
        $params[] = $term;
    }

    if ($updatedAfter) {
        $conditions[] = "updated_at > ?";
        $params[] = $updatedAfter;
    }

    if ($createdAfter) {
        $conditions[] = "created_at >= ?";
        $params[] = $createdAfter;
    }

    if (isset($_GET['id'])) {
        $conditions[] = "id = ?";
        $params[] = $_GET['id'];
    }

    if (isset($_GET['ids'])) {
        $idList = explode(',', $_GET['ids']);
        if (!empty($idList)) {
            $inQuery = implode(',', array_fill(0, count($idList), '?'));
            $conditions[] = "id IN ($inQuery)";
            foreach ($idList as $id) $params[] = trim($id);
        }
    }

    $whereSql = implode(" AND ", $conditions);

    // Count query
    $countSql = "SELECT COUNT(*) as total FROM clients WHERE $whereSql";
    $stmtCount = $pdo->prepare($countSql);
    $stmtCount->execute($params);
    $totalRows = $stmtCount->fetch(PDO::FETCH_ASSOC)['total'];

    // Data query
    $fields = isset($_GET['basic']) 
        ? "id, client_code, cve_cliente, internal_route, sales_route, delivery_route, created_at, updated_at, name, business_name" 
        : "*";

    $sql = "SELECT $fields FROM clients WHERE $whereSql ORDER BY created_at ASC LIMIT $limit OFFSET $offset";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!isset($_GET['basic'])) {
        // Decode JSON fields if stored as strings (only if not basic)
        foreach ($rows as &$row) {
            if (isset($row['coords']) && is_string($row['coords'])) {
                $decoded = json_decode($row['coords']);
                if (json_last_error() === JSON_ERROR_NONE) $row['coords'] = $decoded;
            }
            if (isset($row['cooler_serials']) && is_string($row['cooler_serials'])) {
                $decoded = json_decode($row['cooler_serials']);
                 if (json_last_error() === JSON_ERROR_NONE) $row['cooler_serials'] = $decoded;
            }
        }
    }

    echo json_encode(['rows' => $rows, 'count' => $totalRows]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
