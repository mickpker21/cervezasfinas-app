<?php
require_once '../common.php';

$id = intval($_GET['id'] ?? 0);

if ($id <= 0) {
    http_response_code(404);
    exit;
}

$pdo = getDB();
$stmt = $pdo->prepare("SELECT image_url FROM shop_banners WHERE id = ?");
$stmt->execute([$id]);
$banner = $stmt->fetch();

if (!$banner || empty($banner['image_url'])) {
    http_response_code(404);
    exit;
}

$filename = basename($banner['image_url']);

// Define potential locations
$baseDirs = [
    $_SERVER['DOCUMENT_ROOT'] . '/assets/img/banners/', // Standard
    $_SERVER['DOCUMENT_ROOT'] . '/assets/banners/',
    $_SERVER['DOCUMENT_ROOT'] . '/uploads/banners/',
    $_SERVER['DOCUMENT_ROOT'] . '/portafolio/', // Just in case
    '../../assets/img/banners/', // Relative to api/frontend
    '../../assets/banners/',
    '../../uploads/banners/',
    '../../' // Root fallback
];

$foundPath = '';

foreach ($baseDirs as $dir) {
    $candidate = $dir . $filename;
    if (file_exists($candidate) && !is_dir($candidate)) {
        $foundPath = $candidate;
        break;
    }
}

if ($foundPath) {
    $mime = mime_content_type($foundPath);
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=86400');
    readfile($foundPath);
} else {
    // Attempt to serve raw image_url if it looks like a path and exists (for legacy full paths)
    // But unlikely given the "basename" extraction.
    // If invalid, 404.
    http_response_code(404);
}
?>
