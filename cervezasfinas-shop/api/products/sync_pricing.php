<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    // 1. GEC Discounts
    $gecDiscounts = [];
    $stmtGec = $pdo->query("SELECT * FROM gec_discounts"); // Usando el nombre de tabla del esquema observado
    while ($row = $stmtGec->fetch()) {
        $gecDiscounts[] = $row;
    }

    // 2. Promotions (Active only, or all robustly to filter on client)
    // We fetch ALL future or current promotions to ensure offline works for a while
    $today = date('Y-m-d');
    $stmtPromos = $pdo->prepare("
        SELECT p.*, GROUP_CONCAT(ps.sku) as skus 
        FROM promotions p 
        LEFT JOIN promotion_skus ps ON p.id = ps.promotion_id 
        WHERE p.end_date >= ? AND p.is_active = 1
        GROUP BY p.id
    ");
    // Nota: Si la tabla 'promotion_skus' no existe en el esquema que vi (vi 'shop_promotion_skus' en querys pero 'promotions' en schema), 
    // ajustaré basado en el schema.sql que leí. 
    // EL SCHEMA.SQL MOSTRABA: 'promotions' con sku directo o 'special_prices'.
    // Revisando database_schema.sql línea 36: 'promotions' tiene 'sku'. No veo tabla intermedia 'promotion_skus'.
    // Ajustaré la query a lo que vi en database_schema.sql.

    /**
     * CORRECCIÓN BASADA EN DATABASE_SCHEMA.SQL
     * CREATE TABLE IF NOT EXISTS promotions (
     *   id INT AUTO_INCREMENT PRIMARY KEY,
     *   sku VARCHAR(50) NOT NULL,
     *   discount_amount DECIMAL(10,2) NOT NULL,
     *   ...
     * )
     */
    $stmtPromos = $pdo->prepare("SELECT * FROM promotions WHERE end_date >= ? AND is_active = 1");
    $stmtPromos->execute([$today]);
    $promotions = $stmtPromos->fetchAll();

    // 3. Special Prices
    // Fetch active ones
    $stmtSpecial = $pdo->prepare("
        SELECT * FROM special_prices 
        WHERE (end_date IS NULL OR end_date = '' OR end_date = '0000-00-00' OR end_date >= ?)
    ");
    $stmtSpecial->execute([$today]);
    $specialPrices = $stmtSpecial->fetchAll();

    // 4. Surcharges Config
    $surcharges = [];
    try {
        $stmtSur = $pdo->query("SELECT * FROM surcharges_config LIMIT 1");
        $surcharges = $stmtSur->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) { /* Ignore if table missing */ }


    sendJSON([
        'success' => true,
        'data' => [
            'gec_discounts' => $gecDiscounts,
            'promotions' => $promotions,
            'special_prices' => $specialPrices,
            'surcharges_config' => $surcharges, // Add to response
            'server_date' => $today
        ]
    ]);

} catch (PDOException $e) {
    // Fallback: intenta con prefijo 'shop_' si las tablas directas fallan
    try {
         // GEC
        $gecDiscounts = $pdo->query("SELECT * FROM shop_gec_discounts")->fetchAll();
        
        // Promos (Logic from list.php) - Include new columns in select
        $stmtPromos = $pdo->prepare("
            SELECT p.*, GROUP_CONCAT(ps.sku) as skus 
            FROM shop_promotions p 
            LEFT JOIN shop_promotion_skus ps ON p.id = ps.promotion_id 
            WHERE p.end_date >= ? AND p.is_active = 1
            GROUP BY p.id
        ");
        $stmtPromos->execute([date('Y-m-d')]);
        $promotions = $stmtPromos->fetchAll();

        // Special
        $stmtSpecial = $pdo->prepare("
             SELECT * FROM shop_special_prices 
             WHERE (end_date IS NULL OR end_date = '' OR end_date = '0000-00-00' OR end_date >= ?)
        ");
        $stmtSpecial->execute([date('Y-m-d')]);
        $specialPrices = $stmtSpecial->fetchAll();

        // Surcharges
        $surcharges = [];
        try {
            $stmtSur = $pdo->query("SELECT * FROM shop_surcharges_config LIMIT 1");
            $surcharges = $stmtSur->fetch(PDO::FETCH_ASSOC);
        } catch (Exception $e) { /* Ignore */ }

        sendJSON([
            'success' => true,
            'data' => [
                'gec_discounts' => $gecDiscounts,
                'promotions' => $promotions,
                'special_prices' => $specialPrices,
                'surcharges_config' => $surcharges,
                'server_date' => date('Y-m-d')
            ]
        ]);

    } catch (Exception $ex) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage() . ' | ' . $ex->getMessage()], 500);
    }
}
?>
