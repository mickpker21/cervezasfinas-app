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
$uploadDir = 'uploads/';
// Protocols and host detection
$protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http");
$host = $_SERVER['HTTP_HOST'];
$scriptPath = dirname($_SERVER['PHP_SELF']);
// Ensure scriptPath doesn't end with a slash, then add /uploads/
$baseUrl = $protocol . "://" . $host . rtrim($scriptPath, '/\\') . "/uploads/";

// Ensure upload directory exists
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

if (!isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded']);
    exit;
}

$file = $_FILES['file'];
$folder = isset($_POST['folder']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['folder']) : 'default';

// Validate file type
$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$mimeType = null;

if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
} elseif (function_exists('mime_content_type')) {
    $mimeType = mime_content_type($file['tmp_name']);
}

// If MIME detection fails or returns generic, use the value from $_FILES if available
if (!$mimeType || $mimeType === 'application/octet-stream') {
    $mimeType = $file['type'];
}

if ($mimeType && !in_array($mimeType, $allowedTypes)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid file type (' . $mimeType . '). Only images are allowed.']);
    exit;
}

// Create target folder
$targetDir = $uploadDir . $folder . '/';
if (!file_exists($targetDir)) {
    mkdir($targetDir, 0755, true);
}

// Generate unique filename
$extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

if (!$extension || $extension === 'blob') {
    $mime_map = [
        'image/jpeg' => 'jpg',
        'image/pjpeg' => 'jpg',
        'image/png' => 'png',
        'image/x-png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp'
    ];
    $extension = isset($mime_map[$mimeType]) ? $mime_map[$mimeType] : 'jpg';
}

// Final safety check to avoid trailing dots
if (empty($extension)) {
    $extension = 'jpg';
}

$filename = uniqid('img_') . '_' . time() . '.' . $extension;
$targetPath = $targetDir . $filename;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    $publicUrl = $baseUrl . $folder . '/' . $filename;
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
        'writable' => is_writable($targetDir) ? 'yes' : 'no'
    ]);
}
?>
