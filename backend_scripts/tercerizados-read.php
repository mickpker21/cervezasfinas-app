<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    // Query avanzado para obtener tercerizados con sus métricas reales de ventas
    $sql = "
        SELECT 
            t.*,
            c.name as client_name,
            c.client_code as client_code,
            c.business_name as business_name,
            c.phone as client_phone,
            c.sales_route as client_ruta,
            c.zona_comercial as client_zona,
            (
                SELECT MIN(period_date) 
                FROM ventas_por_sku 
                WHERE cve_cliente COLLATE utf8mb4_unicode_ci = c.client_code COLLATE utf8mb4_unicode_ci
                AND period_date >= t.fecha_compra_manual
            ) as first_real_sale,
            (
                SELECT IFNULL(SUM(venta), 0)
                FROM ventas_por_sku 
                WHERE cve_cliente COLLATE utf8mb4_unicode_ci = c.client_code COLLATE utf8mb4_unicode_ci
                AND period_date >= DATE_FORMAT(NOW(), '%Y-%m-01')
            ) as monthly_purchase,
            (
                SELECT IFNULL(SUM(htls_total), 0)
                FROM ventas_por_sku 
                WHERE cve_cliente COLLATE utf8mb4_unicode_ci = c.client_code COLLATE utf8mb4_unicode_ci
                AND period_date >= DATE_FORMAT(NOW(), '%Y-%m-01')
            ) as monthly_purchase_hl,
            (
                SELECT IFNULL(SUM(venta), 0)
                FROM ventas_por_sku 
                WHERE cve_cliente COLLATE utf8mb4_unicode_ci = c.client_code COLLATE utf8mb4_unicode_ci
                AND period_date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01')
                AND period_date < DATE_FORMAT(NOW(), '%Y-%m-01')
            ) as last_month_purchase,
            (
                SELECT IFNULL(SUM(htls_total), 0)
                FROM ventas_por_sku 
                WHERE cve_cliente COLLATE utf8mb4_unicode_ci = c.client_code COLLATE utf8mb4_unicode_ci
                AND period_date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01')
                AND period_date < DATE_FORMAT(NOW(), '%Y-%m-01')
            ) as last_month_purchase_hl,
            (
                SELECT IFNULL(SUM(venta) / NULLIF(COUNT(DISTINCT period_date), 0), 0)
                FROM ventas_por_sku
                WHERE cve_cliente COLLATE utf8mb4_unicode_ci = c.client_code COLLATE utf8mb4_unicode_ci
                AND period_date >= DATE_FORMAT(DATE_SUB(t.fecha_compra_manual, INTERVAL 3 MONTH), '%Y-%m-01')
                AND period_date < DATE_FORMAT(t.fecha_compra_manual, '%Y-%m-01')
            ) as avg_prev_3_months,
            (
                SELECT IFNULL(SUM(htls_total) / NULLIF(COUNT(DISTINCT period_date), 0), 0)
                FROM ventas_por_sku
                WHERE cve_cliente COLLATE utf8mb4_unicode_ci = c.client_code COLLATE utf8mb4_unicode_ci
                AND period_date >= DATE_FORMAT(DATE_SUB(t.fecha_compra_manual, INTERVAL 3 MONTH), '%Y-%m-01')
                AND period_date < DATE_FORMAT(t.fecha_compra_manual, '%Y-%m-01')
            ) as avg_prev_3_months_hl
        FROM tercerizados t
        JOIN clients c ON t.client_id = c.id
        ORDER BY t.created_at DESC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "success" => true,
        "rows" => $rows,
        "count" => count($rows)
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Error al obtener datos: " . $e->getMessage()]);
}
?>
