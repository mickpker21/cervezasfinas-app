<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$sku = $input['sku'] ?? '';
$client_code = $input['client_code'] ?? ''; // Optional if user not logged in context, but usually required for cart
// Try to get client_code from token if not in body
if (!$client_code) {
    $token = getBearerToken();
    if ($token) {
        $payload = validateJWT($token);
        if ($payload && isset($payload['client_code'])) {
            $client_code = $payload['client_code'];
        }
    }
}

$quantity = intval($input['quantity'] ?? 1);

if (empty($sku)) {
    sendJSON(['error' => 'SKU is required'], 400);
}

try {
    // 1. Fetch Product
    $stmt = $pdo->prepare("SELECT * FROM shop_products WHERE sku = ? AND is_active = 1");
    $stmt->execute([$sku]);
    $product = $stmt->fetch();
    
    if (!$product) {
        sendJSON(['error' => 'Product not found'], 404);
    }
    
    $base_price = floatval($product['base_price']);
    $final_price = $base_price;
    $discounts_applied = [];
    
    // 2. Fetch User GEC if client_code exists
    $userGec = 'Bronce'; // Default
    if ($client_code) {
        $stmtUser = $pdo->prepare("SELECT gec FROM clients WHERE client_code = ?");
        $stmtUser->execute([$client_code]);
        $u = $stmtUser->fetch();
        if ($u) $userGec = $u['gec'];
    }

    // 3. Pricing Logic (Priority: Special > Promo > GEC)
    $today = date('Y-m-d');

    // A. Special Price
    // A. Special Price (Hierarchy: Client > Route > Zone)
    $specialPrice = null;
    $appliedRule = '';

    if ($client_code) {
        // 1. Get Client Details for Context (Zone/Route)
        $clientZone = null;
        $clientRoute = null;
        
        // Try to get from token/user context first if available, else query DB
        // Try to get from token/user context first if available, else query DB
        // Assuming we need to query 'clients' table for 'zona_comercial' and 'sales_route'
        $stmtClient = $pdo->prepare("SELECT zona_comercial, sales_route FROM clients WHERE client_code = ?");
        $stmtClient->execute([$client_code]);
        $clientData = $stmtClient->fetch();
        
        if ($clientData) {
            $clientZone = $clientData['zona_comercial'];
            $clientRoute = $clientData['sales_route'];
        }

        // 2. Query Special Prices with Specificity Priorities
        // We look for any rule that matches Client OR (Route & No Client) OR (Zone & No Route & No Client)
        // And pick the one with highest specificity.
        
        $params = [$sku, $today, $today];
        $whereClause = "sku = ? AND is_active = 1 
                        AND (start_date IS NULL OR start_date = '' OR start_date = '0000-00-00' OR start_date <= ?) 
                        AND (end_date IS NULL OR end_date = '' OR end_date = '0000-00-00' OR end_date >= ?)";
        
        // Logic:
        // Match Client Code
        // OR Match Sales Route (if client has one) AND rule has no client
        // OR Match Zone (if client has one) AND rule has no route AND rule has no client
        
        $ors = ["(client_code = ?)"];
        $queryParams = [$client_code];
        
        if ($clientRoute) {
            $ors[] = "(sales_route = ? AND (client_code IS NULL OR client_code = ''))";
            $queryParams[] = $clientRoute;
        }
        
        if ($clientZone) {
            $ors[] = "(zone = ? AND (sales_route IS NULL OR sales_route = '') AND (client_code IS NULL OR client_code = ''))";
            $queryParams[] = $clientZone;
        }
        
        $fullQuery = "SELECT special_price, client_code, sales_route, zone 
                      FROM shop_special_prices 
                      WHERE $whereClause AND (" . implode(' OR ', $ors) . ")
                      ORDER BY 
                        CASE 
                            WHEN client_code IS NOT NULL AND client_code != '' THEN 1
                            WHEN sales_route IS NOT NULL AND sales_route != '' THEN 2
                            WHEN zone IS NOT NULL AND zone != '' THEN 3
                            ELSE 4
                        END ASC
                      LIMIT 1";
                      
        $stmtSpecial = $pdo->prepare($fullQuery);
        $stmtSpecial->execute(array_merge($params, $queryParams));
        $rowSpecial = $stmtSpecial->fetch();

        if ($rowSpecial) {
            $specialPrice = floatval($rowSpecial['special_price']);
            // Debug label
            if ($rowSpecial['client_code']) $appliedRule = 'Cliente';
            elseif ($rowSpecial['sales_route']) $appliedRule = 'Ruta';
            elseif ($rowSpecial['zone']) $appliedRule = 'Zona';
        }
    }

    if ($specialPrice !== null) {
        $final_price = $specialPrice;
        $discounts_applied[] = ['type' => 'special_price', 'amount' => $base_price - $final_price, 'label' => 'Precio Especial'];
    } else {
        // B. Promotions (Dollar Amount)
        $stmtPromo = $pdo->prepare("
            SELECT p.* 
            FROM shop_promotions p
            JOIN shop_promotion_skus ps ON p.id = ps.promotion_id
            WHERE ps.sku = ? AND p.is_active = 1 
            AND p.start_date <= ? AND p.end_date >= ?
            UNION
            SELECT p.* 
            FROM shop_promotions p
            LEFT JOIN shop_promotion_skus ps ON p.id = ps.promotion_id
            WHERE ps.sku IS NULL AND p.is_active = 1
            AND p.start_date <= ? AND p.end_date >= ?
        ");
        // Check specific SKU matches first, then global (NULL SKU)
        // Simplified query: Find all active promos for this SKU or Global
        // To be precise like list.php:
        $stmtPromo = $pdo->prepare("
            SELECT p.*, GROUP_CONCAT(ps.sku) as skus 
            FROM shop_promotions p 
            LEFT JOIN shop_promotion_skus ps ON p.id = ps.promotion_id 
            WHERE p.start_date <= ? AND p.end_date >= ? AND p.is_active = 1
            GROUP BY p.id
        ");
        $stmtPromo->execute([$today, $today]);
        $promos = $stmtPromo->fetchAll();

        $totalPromoDiscount = 0;
        foreach ($promos as $promo) {
            $promoSkus = $promo['skus'] ? explode(',', $promo['skus']) : [];
            if (empty($promoSkus) || in_array($sku, $promoSkus)) {
                $amt = floatval($promo['discount_amount']);
                $totalPromoDiscount += $amt;
                $discounts_applied[] = ['type' => 'promotion', 'amount' => $amt, 'label' => $promo['name']];
            }
        }

        if ($totalPromoDiscount > 0) {
            $final_price = max(0, $final_price - $totalPromoDiscount);
        }

             
        // C. GEC Discount %
        if ($client_code) {
             $stmtGec = $pdo->prepare("SELECT discount_percentage FROM shop_gec_discounts WHERE nivel_gec = ?");
             $stmtGec->execute([$userGec]);
             $gecRow = $stmtGec->fetch();
             $gecPercent = $gecRow ? floatval($gecRow['discount_percentage']) : 0;
             
             if ($gecPercent > 0) {
                 $discountVal = $final_price * ($gecPercent / 100);
                 $final_price = max(0, $final_price - $discountVal);
                 $discounts_applied[] = ['type' => 'gec_discount', 'percentage' => $gecPercent, 'amount' => $discountVal, 'label' => "Nivel $userGec"];
             }
        }
        
        // D. Surcharge/Cargo (Applied after all discounts)
        $surchargesConfig = ['returnable_amount' => 0, 'disposable_amount' => 0];
        try {
            $stmtSc = $pdo->query("SELECT returnable_amount, disposable_amount FROM shop_surcharges_config LIMIT 1");
            if ($rowSc = $stmtSc->fetch(PDO::FETCH_ASSOC)) {
                $surchargesConfig['returnable_amount'] = floatval($rowSc['returnable_amount']);
                $surchargesConfig['disposable_amount'] = floatval($rowSc['disposable_amount']);
            }
        } catch (Exception $e) {}

        $catUpper = strtoupper($product['category'] ?? '');
        if ($catUpper !== 'MULTIMARCA') {
            $surchargeVal = 0;
            $surchargeLabel = '';

            if (strpos($catUpper, 'RETORNABLE') !== false) {
                $surchargeVal = $surchargesConfig['returnable_amount'];
                $surchargeLabel = 'Cargo Envase';
            } else {
                $surchargeVal = $surchargesConfig['disposable_amount'];
                $surchargeLabel = 'Cargo Desechable'; 
            }

            if ($surchargeVal > 0) {
                $final_price += $surchargeVal;
                // Add to discounts_applied for breakdown display (though it's a surcharge)
                // The frontend handles positive amounts as addition if type is surcharge?
                // Standardizing breakdown format: usually discounts are subtracted.
                // But this array is simply a list of adjustments.
                $discounts_applied[] = [
                    'type' => 'surcharge', 
                    'amount' => $surchargeVal, 
                    'label' => $surchargeLabel
                ];
            }
        }
    }

    sendJSON([
        'success' => true,
        'data' => [
            'product' => $product,
            'pricing' => [
                'base_price' => round($base_price, 2),
                'final_price' => round($final_price, 2),
                'unit_price' => round($final_price, 2), // Compatibility
                'total' => round($final_price * $quantity, 2),
                'has_promo' => $final_price < $base_price,
                'breakdown' => $discounts_applied
            ]
        ]
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
}
?>
