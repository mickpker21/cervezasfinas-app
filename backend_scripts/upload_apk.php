<?php
/**
 * APK Upload Endpoint for Cervezas Finas Admin Panel
 * 
 * Place this file at: public_html/api/upload_apk.php on Hostinger
 * It receives an APK file + version info, saves the APK to /apps/
 * and creates/updates version.json automatically.
 * 
 * Security: Protected by a shared secret token.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ─── CONFIG ───
$UPLOAD_SECRET = 'cf-apk-upload-2026-secret'; // Change this to your own secret
$APK_DIR = __DIR__ . '/../apps';
$APK_FILENAME = 'cervezas-finas.apk';
$VERSION_FILE = $APK_DIR . '/version.json';
$MAX_SIZE_MB = 500; // Increased to 500MB as the APK is around 205MB

// ─── VALIDATION ───
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Check auth token
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = str_replace('Bearer ', '', $authHeader);
if ($token !== $UPLOAD_SECRET) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized. Invalid token.']);
    exit;
}

// Check file
if (!isset($_FILES['apk']) || $_FILES['apk']['error'] !== UPLOAD_ERR_OK) {
    $errorCode = $_FILES['apk']['error'] ?? 'no file';
    http_response_code(400);
    echo json_encode(['error' => "No APK file received. Error code: $errorCode"]);
    exit;
}

$file = $_FILES['apk'];
$fileSizeMB = $file['size'] / (1024 * 1024);

if ($fileSizeMB > $MAX_SIZE_MB) {
    http_response_code(413);
    echo json_encode(['error' => "File too large ({$fileSizeMB}MB). Max: {$MAX_SIZE_MB}MB"]);
    exit;
}

// Get version and notes from POST
$version = $_POST['version'] ?? '0.0.0';
$notes = $_POST['notes'] ?? '';
$force = isset($_POST['force']) && $_POST['force'] === 'true';

// ─── CREATE DIRECTORY ───
if (!is_dir($APK_DIR)) {
    mkdir($APK_DIR, 0755, true);
}

// ─── MOVE FILE ───
$destination = $APK_DIR . '/' . $APK_FILENAME;
if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save APK file. Check directory permissions.']);
    exit;
}

// ─── CREATE version.json ───
$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http');
$baseUrl .= '://' . $_SERVER['HTTP_HOST'];
$apkUrl = $baseUrl . '/apps/' . $APK_FILENAME;

$versionData = [
    'version' => $version,
    'url' => $apkUrl,
    'force' => $force,
    'notes' => $notes,
    'date' => date('c'),
    'size' => round($fileSizeMB, 1) . ' MB'
];

file_put_contents($VERSION_FILE, json_encode($versionData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// ─── RESPONSE ───
http_response_code(200);
echo json_encode([
    'success' => true,
    'message' => "APK v{$version} uploaded successfully",
    'version' => $versionData
]);
