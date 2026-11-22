<?php
require_once '../common.php';

// disable CORS for images or handle usually
// header("Access-Control-Allow-Origin: *");

$sku = $_GET['sku'] ?? '';
$sku = preg_replace('/[^a-zA-Z0-9_-]/', '', $sku); // sanitize

if (!$sku) {
    http_response_code(404);
    exit;
}

// Define potential image locations (priority order)
// 1. Sibling to project (public_html/portafolio) -> from api/products is ../../../portafolio
// 2. Inside project (cervezasfinas-shop/portafolio) -> from api/products is ../../portafolio
// 3. Uppercase variants just in case
// Define potential image locations (priority order)
$baseDirs = [
    $_SERVER['DOCUMENT_ROOT'] . '/portafolio/', 
    $_SERVER['DOCUMENT_ROOT'] . '/PORTAFOLIO/',
    '../../../portafolio/', 
    '../../portafolio/',
    '../../../PORTAFOLIO/',
    '../../PORTAFOLIO/'
];

$extensions = ['jpg', 'png', 'jpeg', 'webp', 'JPG', 'PNG'];
$imagePath = '';
$found = false;

foreach ($baseDirs as $dir) {
    foreach ($extensions as $ext) {
        $candidate = $dir . $sku . '.' . $ext;
        if (file_exists($candidate) && !is_dir($candidate)) {
            $imagePath = $candidate;
            $found = true;
            break 2;
        }
    }
}

if (!$found) {
   // Fallback: Check if there is an image in the DB (Legacy support)
   // Optional: If you want to strictly use PORTAFOLIO, remove this block.
   // But keeping it as fallback is safer if PORTAFOLIO is missing some images.
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT image_url FROM shop_products WHERE sku = ?");
    $stmt->execute([$sku]);
    $product = $stmt->fetch();
    
    if ($product && !empty($product['image_url'])) {
        $legacyPath = '../../' . $product['image_url'];
        if (file_exists($legacyPath) && !is_dir($legacyPath)) {
            $imagePath = $legacyPath;
            $found = true;
        }
    }
}

if (!$found) {
    // Try to find placeholder with absolute path
    $placeholderCandidates = [
        $_SERVER['DOCUMENT_ROOT'] . '/placeholder-beer.png',
        $_SERVER['DOCUMENT_ROOT'] . '/assets/placeholder-beer.png',
        '../../placeholder-beer.png'
    ];
    
    foreach ($placeholderCandidates as $ph) {
        if (file_exists($ph)) {
            header('Content-Type: image/png');
            header('Cache-Control: public, max-age=86400');
            readfile($ph);
            exit;
        }
    }

    // If no placeholder found
    http_response_code(404);
    echo "404 - Image and Placeholder not found";
    exit;
}

// Serve file
$mime = mime_content_type($imagePath);
header('Content-Type: ' . $mime);
// Cache control for performance
header('Cache-Control: public, max-age=86400');
readfile($imagePath);
?>
