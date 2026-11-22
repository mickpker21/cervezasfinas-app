<?php
require_once 'api/common.php';

$pdo = getDB();
$client_code = 'TEST001';
$sku = '105';
$today = date('Y-m-d');

echo "=== Debug Pricing for $client_code | SKU: $sku ===\n";
echo "Date: $today\n";

// 1. Check Product
$stmt = $pdo->prepare("SELECT * FROM shop_products WHERE sku = ?");
$stmt->execute([$sku]);
$product = $stmt->fetch();
print_r($product);

// 2. Check Special Price
echo "\n--- Special Price Check ---\n";
$stmtSpecial = $pdo->prepare("
    SELECT * 
    FROM shop_special_prices 
    WHERE client_code = ? AND sku = ?
");
$stmtSpecial->execute([$client_code, $sku]);
$special = $stmtSpecial->fetchAll();
print_r($special);

// 3. Check Promos
echo "\n--- Promotions Check ---\n";
$stmtPromos = $pdo->prepare("
    SELECT p.*, GROUP_CONCAT(ps.sku) as skus 
    FROM shop_promotions p 
    LEFT JOIN shop_promotion_skus ps ON p.id = ps.promotion_id 
    WHERE p.start_date <= ? AND p.end_date >= ? AND p.is_active = 1
    GROUP BY p.id
");
$stmtPromos->execute([$today, $today]);
$promos = $stmtPromos->fetchAll();
foreach ($promos as $p) {
    echo "Promo: " . $p['name'] . " (Amount: " . $p['discount_amount'] . ")\n";
    echo "SKUs: " . $p['skus'] . "\n";
}

// 4. Check GEC
echo "\n--- GEC Check ---\n";
$stmtUser = $pdo->prepare("SELECT * FROM shop_client_users WHERE client_code = ?");
$stmtUser->execute([$client_code]);
$user = $stmtUser->fetch();
print_r($user);

if ($user) {
    $stmtGec = $pdo->prepare("SELECT * FROM shop_gec_discounts WHERE nivel_gec = ?");
    $stmtGec->execute([$user['gec']]);
    $gec = $stmtGec->fetch();
    print_r($gec);
}
