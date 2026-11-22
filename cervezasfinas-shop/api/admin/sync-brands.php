<?php
require_once '../../common.php';

// disable CORS or handle usually
// header("Access-Control-Allow-Origin: *");

$response = [
    'added' => [],
    'existing' => [],
    'errors' => []
];

try {
    $pdo = getDB();

    // Define potential image locations
    // 1. Sibling to project (public_html/brands) -> from api/admin is ../../../brands
    // 2. Inside project (cervezasfinas-shop/brands) -> from api/admin is ../../brands
    // 3. Uppercase variants
    $baseDirs = [
        '../../../brands/', 
        '../../brands/',
        '../../../BRANDS/', 
        '../../BRANDS/',
        '../../../portafolio/brands/', // Just in case
    ];

    $foundBrands = [];

    // Scan directories
    foreach ($baseDirs as $dir) {
        if (is_dir($dir)) {
            $files = scandir($dir);
            foreach ($files as $file) {
                if ($file === '.' || $file === '..') continue;
                
                // Check extension
                $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
                if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'svg'])) {
                    // Brand name is filename without extension
                    $brandName = pathinfo($file, PATHINFO_FILENAME);
                    
                    // Clean up name (optional? names usually correspond to brand logic)
                    // e.g. "Amstel Ultra" is good.
                    if (!in_array($brandName, $foundBrands)) {
                        $foundBrands[] = $brandName;
                    }
                }
            }
        }
    }

    // Insert into DB
    $stmtCheck = $pdo->prepare("SELECT id FROM shop_brands WHERE name = ?");
    $stmtInsert = $pdo->prepare("INSERT INTO shop_brands (name, is_active, display_order) VALUES (?, 1, 0)");

    foreach ($foundBrands as $brand) {
        $stmtCheck->execute([$brand]);
        if ($stmtCheck->fetch()) {
            $response['existing'][] = $brand;
        } else {
            if ($stmtInsert->execute([$brand])) {
                $response['added'][] = $brand;
            } else {
                $response['errors'][] = "Failed to add $brand";
            }
        }
    }

} catch (Exception $e) {
    http_response_code(500);
    $response['errors'][] = $e->getMessage();
}

header('Content-Type: application/json');
echo json_encode($response);
?>
