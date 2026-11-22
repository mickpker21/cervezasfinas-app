<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();
$auth = requireAuth();

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    $client_code = $auth['client_code'];
    
    // Obtener pedidos del cliente
    $showHistory = isset($_GET['history']) && $_GET['history'] === 'true';

    
    if ($showHistory) {
        // 1. Fetch raw sales data first (Robustness)
        $stmt = $pdo->prepare("SELECT * FROM ventas_por_sku WHERE cve_cliente = ? ORDER BY fecha_alta DESC");
        $stmt->execute([$client_code]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 2. Collect SKUs to fetch product details
        $skus = [];
        foreach ($rows as $row) {
            if (!empty($row['cve_marca'])) {
                $skus[] = $row['cve_marca'];
            }
        }
        $skus = array_unique($skus);

        // 3. Fetch Product Details (Name, Image)
        $productMap = [];
        if (!empty($skus)) {
            $placeholders = str_repeat('?,', count($skus) - 1) . '?';
            $pStmt = $pdo->prepare("SELECT sku, name, image_url FROM shop_products WHERE sku IN ($placeholders)");
            $pStmt->execute(array_values($skus));
            while ($pRow = $pStmt->fetch(PDO::FETCH_ASSOC)) {
                $productMap[$pRow['sku']] = $pRow;
            }
        }

        // 4. Group and Build Orders
        $historyOrders = [];
        
        foreach ($rows as $row) {
            $remision = $row['num_remision'] ?? '';
            // If no remision, create a synthetic one based on date to avoid grouping unrelated items
            if (empty($remision)) {
                $dateKey = substr($row['fecha_alta'] ?? 'unknown', 0, 10);
                $remision = 'DIA-' . str_replace('-', '', $dateKey);
            }

            $date = $row['fecha_alta'] ?? $row['period_date'] ?? 'Unknown Date';
            if (strlen($date) > 10) $date = substr($date, 0, 10);

            $amount = $row['venta'] ?? $row['importe'] ?? $row['monto'] ?? 0;
            $units = $row['unidades'] ?? $row['cantidad'] ?? 0;
            $sku = $row['cve_marca'];

            // Initialize order
            if (!isset($historyOrders[$remision])) {
                $historyOrders[$remision] = [
                    'id' => 'hist_' . $remision,
                    'order_number' => $remision,
                    'created_at' => $date,
                    'delivery_date' => $date, // Assumed delivered
                    'status' => 'delivered',
                    'total_amount' => 0,
                    'client_code' => $client_code,
                    'items' => [],
                    'notes' => 'Pedido Histórico'
                ];
            }

            $historyOrders[$remision]['total_amount'] += (float)$amount;

            // Enrich Item
            $productInfo = $productMap[$sku] ?? null;
            $productName = $productInfo['name'] ?? $sku;
            // Force use of dynamic image endpoint to find image in portafolio (ignoring DB image_url if broken)
            $productImage = "api/shop/products/image.php?sku=" . urlencode($sku);

            $historyOrders[$remision]['items'][] = [
                'sku' => $sku,
                'quantity' => $units,
                'subtotal' => (float)$amount,
                'product_name' => $productName,
                'image_url' => $productImage
            ];
        }
        
        $orders = array_values($historyOrders);
        
    } else {
        // Show pending orders (no date or future date) from shop_orders
        $stmt = $pdo->prepare("
            SELECT * FROM shop_orders 
            WHERE client_code = ?
            AND status IN ('pending', 'confirmed')
            ORDER BY created_at DESC
        ");
        $stmt->execute([$client_code]);
        $orders = $stmt->fetchAll();
        
        // Items logic for shop_orders
        $itemStmt = $pdo->prepare("
            SELECT oi.*, p.name as product_name 
            FROM shop_order_items oi
            LEFT JOIN shop_products p ON oi.sku = p.sku
            WHERE oi.order_id = ?
        ");
        
        foreach ($orders as &$order) {
            $itemStmt->execute([$order['id']]);
            $order['items'] = $itemStmt->fetchAll();
        }
    }
    
    sendJSON([
        'success' => true,
        'data' => $orders
    ]);
    
} catch (PDOException $e) {
    // If table doesn't exist or column error, allow graceful failure?
    // For now, return error to debug.
    sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
}
?>
