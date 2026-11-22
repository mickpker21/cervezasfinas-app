<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once 'db_config.php';

$data = json_decode(file_get_contents("php://input"));
$response = ["errors" => []];
$insertedCount = 0;

if (!empty($data->sales) && is_array($data->sales)) {
    try {
        $pdo = getDBConnection();

        foreach ($data->sales as $entry) {
            // Estructura esperada: $entry = { sale: {...}, items: [...] }
            // O si el frontend manda un objeto merged, ajustar.
            // Según syncService.js (revisado), payload = { sale: {}, items: [] }
            // Pero mysqlSales.js manda array de payloads.

            $sale = $entry->sale ?? null;
            $items = $entry->items ?? [];

            if (!$sale || empty($sale->id)) {
                $response['errors'][] = "Venta sin ID o datos faltantes";
                continue;
            }
            
            // 1. Insert/Upsert Header
            // Usamos INSERT IGNORE o ON DUPLICATE UPDATE para evitar duplicados si se re-inyecta
            $stmt = $pdo->prepare("
                INSERT INTO direct_sales 
                (id, user_id, client_id, total_amount, status, payment_method, gec_discount, promo_discount, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                status = VALUES(status), updated_at = NOW()
            ");

            // Mapeo seguro de campos con defaults
            $stmt->execute([
                $sale->id,
                $sale->user_id,
                $sale->client_id,
                $sale->total_amount ?? 0,
                $sale->status ?? 'COMPLETED',
                $sale->payment_method ?? 'CASH',
                $sale->gec_discount ?? 0,
                $sale->promo_discount ?? 0,
                $sale->created_at ?? date('Y-m-d H:i:s')
            ]);

            // 2. Items
            // Borramos items previos si es update para re-insertar limpios (simple logic)
            $pdo->prepare("DELETE FROM direct_sales_items WHERE sale_id = ?")->execute([$sale->id]);

            if (!empty($items)) {
                $itemStmt = $pdo->prepare("
                    INSERT INTO direct_sales_items 
                    (sale_id, cve_marca, des_marca, quantity, unit_price, total_price)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                
                foreach ($items as $item) {
                    $itemStmt->execute([
                        $sale->id,
                        $item->cve_marca,
                        $item->des_marca ?? 'Sin Nombre',
                        $item->quantity ?? 1,
                        $item->unit_price ?? 0,
                        $item->total_price ?? 0
                    ]);
                }
            }

            $insertedCount++;
        }
        
        $response['success'] = true;
        $response['inserted'] = $insertedCount;

    } catch (Exception $e) {
        http_response_code(500);
        $response['success'] = false;
        $response['errors'][] = "Exception: " . $e->getMessage();
    }
} else {
    $response['success'] = false;
    $response['errors'][] = "No se recibieron datos de ventas válidos.";
}

echo json_encode($response);
?>
