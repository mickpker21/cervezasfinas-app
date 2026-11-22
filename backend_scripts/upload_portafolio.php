<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Configuration
// Since this script is in /api/, we need to go up one level to reach /portafolio/
$uploadDir = '../portafolio/';
$protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http");
$host = $_SERVER['HTTP_HOST'];
// The base url should be the root domain /portafolio/
$baseUrl = $protocol . "://" . $host . "/portafolio/";

if (!file_exists($uploadDir)) {
    // If it doesn't exist, we might not have permissions to create it one level up, but we try
    mkdir($uploadDir, 0755, true);
}

if (!isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded']);
    exit;
}

$file = $_FILES['file'];
$sku = isset($_POST['sku']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['sku']) : '';

if (empty($sku)) {
    http_response_code(400);
    echo json_encode(['error' => 'SKU is required']);
    exit;
}

$filename = $sku . '.png';
$targetPath = $uploadDir . $filename;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    $publicUrl = $baseUrl . $filename;
    echo json_encode([
        'success' => true,
        'url' => $publicUrl,
        'filename' => $filename
    ]);
} else {
    $error = error_get_last();
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to move uploaded file to ' . $targetPath,
        'php_error' => $error ? $error['message'] : 'Unknown error',
        'writable' => is_writable($uploadDir) ? 'yes' : 'no'
    ]);
}
?>
