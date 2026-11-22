<?php
require_once '../common.php';

handleCORS();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    if (!isset($_FILES['logo'])) {
        throw new Exception('No file uploaded');
    }

    $file = $_FILES['logo'];
    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    
    if (!in_array($file['type'], $allowedTypes)) {
        throw new Exception('Invalid file type. Allowed: JPG, PNG, WEBP, SVG');
    }

    // Create uploads directory if not exists
    $uploadDir = '../../public/uploads/brands/';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    // Generate unique filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid('brand_') . '.' . $extension;
    $filepath = $uploadDir . $filename;

    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        // Return URL relative to domain root
        // Assuming api is at /api/shop/brands/upload.php and public is at /public_html/
        // We want /uploads/brands/filename
        
        $publicUrl = '/uploads/brands/' . $filename;
        
        echo json_encode([
            'success' => true,
            'url' => $publicUrl
        ]);
    } else {
        throw new Exception('Failed to move uploaded file');
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
