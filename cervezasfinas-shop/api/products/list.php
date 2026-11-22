<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// DEBUG: Force log
file_put_contents('debug_pricing.log', "Script Hit at " . date('H:i:s') . "\n", FILE_APPEND);

try {
    // 1. Identify User (Optional)
    $user = null;
    $token = getBearerToken();
    $clientCodeInput = null;

    if ($token) {
        $payload = validateJWT($token);
        if ($payload && isset($payload['client_code'])) {
            $clientCodeInput = $payload['client_code'];
        }
    } elseif (isset($_GET['client_code'])) {
        // Fallback for internal simulator usage
        $clientCodeInput = $_GET['client_code'];
    }

    if ($clientCodeInput) {
        $stmtUser = $pdo->prepare("
            SELECT u.client_code, c.gec 
            FROM shop_client_users u
            LEFT JOIN clients c ON u.client_code = c.client_code
            WHERE u.client_code = ? AND u.is_active = 1
        ");
        $stmtUser->execute([$clientCodeInput]);
        $user = $stmtUser->fetch();
    }

    // 2. Fetch Pricing Rules (Optimization: Fetch all relevant rules once)

    // A. Active Promotions
    $today = date('Y-m-d');
    $stmtPromos = $pdo->prepare("
        SELECT p.*, GROUP_CONCAT(ps.sku) as skus 
        FROM shop_promotions p 
        LEFT JOIN shop_promotion_skus ps ON p.id = ps.promotion_id 
        WHERE p.start_date <= ? AND p.end_date >= ? AND p.is_active = 1
        GROUP BY p.id
    ");
    $stmtPromos->execute([$today, $today]);
    $promotions = $stmtPromos->fetchAll();

    // B. GEC Discounts
    $gecRates = [];
    $stmtGec = $pdo->query("SELECT * FROM shop_gec_discounts");
    while ($row = $stmtGec->fetch()) {
        $gecRates[strtoupper($row['nivel_gec'])] = floatval($row['discount_percentage']);
    }

    // C. Special Prices (Only for logged user)
    
    // DEBUG LOGGING
    $logData = "Date: $today\n";
    $logData .= "User: " . ($user ? $user['client_code'] . " (" . $user['gec'] . ")" : "GUEST") . "\n";
    $logData .= "Promos Found: " . count($promotions) . "\n";
    $logData .= "GEC Rates: " . json_encode($gecRates) . "\n";
    file_put_contents('debug_pricing.log', $logData, FILE_APPEND);

    $specialPrices = [];
    if ($user) {
        $clientCode = $user['client_code'];
        
        // 1. Get Extra Context (Route/Zone) from clients table
        // Note: shop_client_users might not have this, need to join or query 'clients'
        // Note: shop_client_users might not have this, need to join or query 'clients'
        // Assuming 'clients' table has 'client_code' matching 'client_code'
        $stmtContext = $pdo->prepare("SELECT zona_comercial, sales_route FROM clients WHERE client_code = ?");
        $stmtContext->execute([$clientCode]);
        $ctx = $stmtContext->fetch();
        
        $clientZone = $ctx ? $ctx['zona_comercial'] : null;
        $clientRoute = $ctx ? $ctx['sales_route'] : null;

        // 2. Fetch ALL applicable rules for this user
        // We fetch Zone rules, Route rules, and Client rules.
        // We order by Specificity ASC (Zone -> Route -> Client) so later iterations overwrite key [sku]
        // This ensures highest priority wins.
        
        $conditions = ["(client_code = ?)"];
        $params = [$clientCode];
        
        if ($clientRoute) {
            $conditions[] = "(sales_route = ? AND (client_code IS NULL OR client_code = ''))";
            $params[] = $clientRoute;
        }
        
        if ($clientZone) {
            $conditions[] = "(zone = ? AND (sales_route IS NULL OR sales_route = '') AND (client_code IS NULL OR client_code = ''))";
            $params[] = $clientZone;
        }
        
        $dateCheck = "AND is_active = 1 
                      AND (start_date IS NULL OR start_date = '' OR start_date = '0000-00-00' OR start_date <= ?) 
                      AND (end_date IS NULL OR end_date = '' OR end_date = '0000-00-00' OR end_date >= ?)";
        array_push($params, $today, $today);

        $sql = "SELECT sku, special_price, client_code, sales_route, zone 
                FROM shop_special_prices 
                WHERE (" . implode(' OR ', $conditions) . ") $dateCheck
                ORDER BY 
                    CASE 
                        WHEN zone IS NOT NULL AND zone != '' THEN 1
                        WHEN sales_route IS NOT NULL AND sales_route != '' THEN 2
                        WHEN client_code IS NOT NULL AND client_code != '' THEN 3
                        ELSE 0
                    END ASC";
                    
        $stmtSpecial = $pdo->prepare($sql);
        $stmtSpecial->execute($params);
        
        while ($row = $stmtSpecial->fetch()) {
            // Because we order Zone -> Route -> Client, 
            // the last one to set the key wins (which is what we want: Client > Route > Zone)
            $specialPrices[$row['sku']] = floatval($row['special_price']);
        }
    }

    // 3. Fetch Products
    // Parsing Filters
    $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 100; // Increased default limit
    $offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;
    $category = $_GET['category'] ?? null;
    $search = $_GET['search'] ?? null;
    
    $where = ["is_active = 1"];
    $params = [];
    
    if ($category) {
        $where[] = "category = ?";
        $params[] = $category;
    }
    if ($search) {
        $where[] = "(name LIKE ? OR sku LIKE ?)";
        $params[] = "%$search%";
        $params[] = "%$search%";
    }
    
    $whereClause = implode(' AND ', $where);
    $sql = "SELECT * FROM shop_products WHERE $whereClause ORDER BY name LIMIT $limit OFFSET $offset";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $products = $stmt->fetchAll();

    // 4. Calculate Prices
    foreach ($products as &$product) {
        $sku = $product['sku'];
        $basePrice = floatval($product['base_price']);
        $finalPrice = $basePrice;
        $hasPromo = false;
        $breakdown = []; // ✅ Changed: Use array like calculate-price.php

        // Priority 1: Special Price
        if (isset($specialPrices[$sku])) {
            $specialPrice = $specialPrices[$sku];
            $finalPrice = $specialPrice;
            $breakdown[] = [
                'type' => 'special_price',
                'amount' => $basePrice - $finalPrice,
                'label' => 'Precio Especial'
            ];
        } else {
            // Priority 2: Promotions (Dollar Amount)
            $totalPromoDiscount = 0;
            foreach ($promotions as $promo) {
                $promoSkus = $promo['skus'] ? explode(',', $promo['skus']) : [];
                if (empty($promoSkus) || in_array($sku, $promoSkus)) {
                    $discountAmt = floatval($promo['discount_amount']);
                    $totalPromoDiscount += $discountAmt;
                    $breakdown[] = [
                        'type' => 'promotion',
                        'amount' => $discountAmt,
                        'label' => $promo['name']
                    ];
                }
            }
            
            if ($totalPromoDiscount > 0) {
                $finalPrice = max(0, $finalPrice - $totalPromoDiscount);
                $hasPromo = true;
            }

            // Priority 3: GEC Discount (Percentage)
            // Skip GEC for MULTIMARCA products
            if ($user && strtoupper($product['category'] ?? '') !== 'MULTIMARCA') {
                $userGec = strtoupper($user['gec'] ?? 'BRONCE');
                $gecPercent = $gecRates[$userGec] ?? 0;
                
                if ($gecPercent > 0) {
                    $discountVal = $finalPrice * ($gecPercent / 100);
                    $finalPrice = max(0, $finalPrice - $discountVal);
                    $breakdown[] = [
                        'type' => 'gec_discount',
                        'percentage' => $gecPercent,
                        'amount' => $discountVal,
                        'label' => "Nivel $userGec"
                    ];
                    $hasPromo = true;
                }
            }

            // D. Surcharge/Cargo Logic (ONLY when NO special price)
            // Fetch Surcharges Config once if not fetched
            if ($surchargesConfig === null) {
                $surchargesConfig = ['returnable_amount' => 0, 'disposable_amount' => 0];
                try {
                    // Try fetching from primary config table
                    $stmtSc = $pdo->query("SELECT returnable_amount, disposable_amount FROM shop_surcharges_config LIMIT 1");
                    if ($rowSc = $stmtSc->fetch(PDO::FETCH_ASSOC)) {
                        $surchargesConfig['returnable_amount'] = floatval($rowSc['returnable_amount']);
                        $surchargesConfig['disposable_amount'] = floatval($rowSc['disposable_amount']);
                    }
                } catch (Exception $e) {
                    // Ignore error, use defaults
                }
            }

            // Apply Surcharge based on Category
            // Logic: If 'MULTIMARCA', no surcharge.
            // If Category contains 'RETORNABLE', use returnable_amount.
            // Otherwise, use disposable_amount (could be 0).
            $catUpper = strtoupper($product['category'] ?? '');
            
            if ($catUpper !== 'MULTIMARCA') {
                $surchargeVal = 0;
                $surchargeLabel = '';

                if (strpos($catUpper, 'RETORNABLE') !== false) {
                    $surchargeVal = $surchargesConfig['returnable_amount'];
                    $surchargeLabel = 'Cargo Envase';
                } else {
                    $surchargeVal = $surchargesConfig['disposable_amount'];
                    $surchargeLabel = 'Cargo Desechable'; // Or generic 'Cargo'
                }

                if ($surchargeVal > 0) {
                    $finalPrice += $surchargeVal;
                    $breakdown[] = [
                        'type' => 'surcharge',
                        'amount' => $surchargeVal, 
                        'label' => $surchargeLabel
                    ];
                }
            }
        }

        // Attach Price Data with proper breakdown format
        $product['priceData'] = [
            'unit_price' => round($finalPrice, 2),
            'original_price' => round($basePrice, 2),
            'has_promo' => $finalPrice < $basePrice,
            'breakdown' => $breakdown // ✅ Now proper array format
        ];
        
        // DEBUG: Log first product
        if ($sku == $products[0]['sku']) {
            $debugLine = "Product [$sku] Base: $basePrice Final: $finalPrice. Breakdown: " . json_encode($breakdown) . "\n";
            file_put_contents('debug_pricing.log', $debugLine, FILE_APPEND);
        }
    }

    sendJSON([
        'success' => true, 
        'data' => $products
    ]);

} catch (PDOException $e) {
    sendJSON(['error' => $e->getMessage()], 500);
}
?>
