<?php
require_once '../common.php';

handleCORS();

// Ensure authenticated
$auth = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

if (!isset($_FILES['image'])) {
    sendJSON(['error' => 'No image file uploaded'], 400);
}

// Configuration
// Use Absolute Path to avoid confusion with relative depth
$targetDir = $_SERVER['DOCUMENT_ROOT'] . '/uploads/coolers/'; 
$baseUrl = 'https://cervezasfinas.com/uploads/coolers/';

// Create directory if not exists
if (!is_dir($targetDir)) {
    if (!mkdir($targetDir, 0755, true)) {
        sendJSON(['error' => 'Failed to create upload directory'], 500);
    }
}

$file = $_FILES['image'];
$fileName = basename($file['name']);
$fileType = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

// Validate type
$allowedTypes = ['jpg', 'jpeg', 'png', 'webp'];
if (!in_array($fileType, $allowedTypes)) {
    sendJSON(['error' => 'Invalid file type. Only JPG, PNG, WEBP allowed.'], 400);
}

// Validate size (max 10MB)
if ($file['size'] > 10 * 1024 * 1024) {
    sendJSON(['error' => 'File too large. Max 10MB.'], 400);
}

// Generate unique name
$newFileName = uniqid('cooler_') . '.' . $fileType;
$targetFilePath = $targetDir . $newFileName;

if (move_uploaded_file($file['tmp_name'], $targetFilePath)) {
    sendJSON([
        'success' => true,
        'url' => $baseUrl . $newFileName
    ]);
} else {
    sendJSON(['error' => 'Failed to save file'], 500);
}
?>
