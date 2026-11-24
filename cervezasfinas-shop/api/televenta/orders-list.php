<?php
require_once '../common.php';

handleCORS();
requireSupabaseRole(['admin', 'televenta', 'supervisor', 'operaciones', 'jefe de operaciones']);

$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    $month = isset($_GET['month']) ? trim((string)$_GET['month']) : '';
    $params = [];
    $whereSql = '';

    if (preg_match('/^(\d{4})-(\d{2})$/', $month, $m)) {
        $year = intval($m[1]);
        $mon = intval($m[2]);
        $startDate = date('Y-m-d 00:00:00', strtotime(sprintf('%04d-%02d-01 -1 day', $year, $mon)));
        $endDate = date('Y-m-d 23:59:59', strtotime(sprintf('%04d-%02d-01 +1 month +1 day', $year, $mon)));
        $whereSql = " WHERE o.created_at >= ? AND o.created_at <= ? ";
        $params[] = $startDate;
        $params[] = $endDate;
    }

    $registeredShopCodes = [];
    try {
        try {
            $regStmt = $pdo->query("SELECT client_code FROM shop_client_users WHERE is_active = 1 AND COALESCE(points_enabled, 1) = 1");
        } catch (Exception $eCol) {
            $regStmt = $pdo->query("SELECT client_code FROM shop_client_users WHERE is_active = 1");
        }
        while ($rCode = $regStmt->fetchColumn()) {
            $cleanCode = strtoupper(trim((string)$rCode));
            if ($cleanCode !== '') {
                $registeredShopCodes[$cleanCode] = true;
            }
        }
    } catch (Exception $e) {}

    try {
        $stmt = $pdo->prepare("
            SELECT o.*, c.business_name AS client_name, c.phone AS client_phone, c.sales_route AS client_sales_route
            FROM shop_orders o
            LEFT JOIN clients c ON o.client_code = c.client_code
            {$whereSql}
            ORDER BY o.created_at DESC, o.id DESC
            LIMIT 400
        ");
        $stmt->execute($params);
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $joinErr) {
        $fallbackWhere = str_replace('o.created_at', 'created_at', $whereSql);
        $stmt = $pdo->prepare("
            SELECT * FROM shop_orders
            {$fallbackWhere}
            ORDER BY created_at DESC, id DESC
            LIMIT 400
        ");
        $stmt->execute($params);
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    if (!empty($orders)) {
        $orderIds = array_column($orders, 'id');
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        $itemsByOrder = [];

        try {
            $itemStmt = $pdo->prepare("
                SELECT oi.*, p.name as product_name 
                FROM shop_order_items oi
                LEFT JOIN shop_products p ON oi.sku = p.sku
                WHERE oi.order_id IN ({$placeholders})
            ");
            $itemStmt->execute($orderIds);
            while ($row = $itemStmt->fetch(PDO::FETCH_ASSOC)) {
                $oid = $row['order_id'];
                if (!isset($itemsByOrder[$oid])) $itemsByOrder[$oid] = [];
                $itemsByOrder[$oid][] = $row;
            }
        } catch (Exception $itemErr) {
            try {
                $fallbackStmt = $pdo->prepare("SELECT * FROM shop_order_items WHERE order_id IN ({$placeholders})");
                $fallbackStmt->execute($orderIds);
                while ($row = $fallbackStmt->fetch(PDO::FETCH_ASSOC)) {
                    $row['product_name'] = $row['sku'];
                    $oid = $row['order_id'];
                    if (!isset($itemsByOrder[$oid])) $itemsByOrder[$oid] = [];
                    $itemsByOrder[$oid][] = $row;
                }
            } catch (Exception $e2) {}
        }

        foreach ($orders as &$order) {
            $oid = $order['id'];
            $order['items'] = $itemsByOrder[$oid] ?? [];
            if (empty($order['phone']) && !empty($order['client_phone'])) {
                $order['phone'] = $order['client_phone'];
            }
            if (empty($order['sales_route']) && !empty($order['client_sales_route'])) {
                $order['sales_route'] = $order['client_sales_route'];
            }
            $cCodeKey = strtoupper(trim((string)($order['client_code'] ?? '')));
            $order['is_shop_registered'] = isset($registeredShopCodes[$cCodeKey]);
        }
        unset($order);
    }

    sendJSON([
        'success' => true,
        'data' => $orders,
        'registered_shop_codes' => array_keys($registeredShopCodes)
    ]);

} catch (PDOException $e) {
    sendJSON([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage(),
        'data' => [],
        'registered_shop_codes' => []
    ], 200);
}
?>