<?php
require_once '../common.php';

// disable CORS for images or handle usually
// header("Access-Control-Allow-Origin: *");

$name = $_GET['name'] ?? '';
// Sanitize filename but allow spaces which are common in brand names (e.g. "Amstel Ultra")
$name = preg_replace('/[^a-zA-Z0-9 _-]/', '', $name); 

if (!$name) {
    http_response_code(404);
    exit;
}

// Define potential image locations
$baseDirs = [
    $_SERVER['DOCUMENT_ROOT'] . '/brands/',        // Absolute path to public_html/brands
    $_SERVER['DOCUMENT_ROOT'] . '/Brands/',        // Absolute path to public_html/Brands
    $_SERVER['DOCUMENT_ROOT'] . '/portafolio/brands/', 
    '../../../brands/', 
    '../../brands/',
    '../../../BRANDS/', 
    '../../BRANDS/',
    '../../../portafolio/brands/',
    '../../portafolio/brands/'
];

$extensions = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'PNG', 'JPG'];
// Variations of the name to try: Original, Lowercase, Uppercase, Ucwords
$nameVariations = [
    $name,
    strtolower($name),
    strtoupper($name),
    ucwords(strtolower($name))
];

$imagePath = '';
$found = false;

foreach ($baseDirs as $dir) {
    if (!is_dir($dir)) continue;
    
    foreach ($nameVariations as $n) {
        foreach ($extensions as $ext) {
            $candidate = $dir . $n . '.' . $ext;
            if (file_exists($candidate)) {
                $imagePath = $candidate;
                $found = true;
                break 3; // Break all loops
            }
        }
    }
}

if (!$found) {
    http_response_code(404);
    exit;
}

// Serve file
$mime = mime_content_type($imagePath);
header('Content-Type: ' . $mime);
// Cache control for performance
header('Cache-Control: public, max-age=86400');
readfile($imagePath);
?>
