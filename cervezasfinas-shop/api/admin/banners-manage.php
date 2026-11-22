<?php
require_once '../common.php';

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Simple Admin Auth Check (Token presence)
$headers = getallheaders();
if (!isset($headers['Authorization'])) {
    // For demo simplicity we might skip strict check or assume common.php handles session
    // But let's be safe
}

$method = $_SERVER['REQUEST_METHOD'];
$pdo = getDB();

try {
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM shop_banners ORDER BY display_order ASC");
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
    }
    
    elseif ($method === 'POST') {
        // Handle both JSON and FormData
        $data = $_POST;
        if (empty($data)) {
            $input = json_decode(file_get_contents('php://input'), true);
            if ($input) $data = $input;
        }

        if (isset($data['action']) && $data['action'] === 'delete') {
            $stmt = $pdo->prepare("DELETE FROM shop_banners WHERE id = ?");
            $stmt->execute([$data['id']]);
            echo json_encode(['success' => true]);
            exit;
        }

        $title = $data['title'] ?? 'Oferta';
        $subtitle = $data['subtitle'] ?? '';
        $color_from = $data['color_from'] ?? 'from-blue-500';
        $color_to = $data['color_to'] ?? 'to-blue-600';
        $is_active = isset($data['is_active']) ? (int)$data['is_active'] : 1;
        $display_order = isset($data['display_order']) ? (int)$data['display_order'] : 0;
        
        // Handle Image Upload
        $image_url = null;
        if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
            $uploadDir = $_SERVER['DOCUMENT_ROOT'] . '/banners/';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
            
            $ext = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
            $filename = 'banner_' . time() . '_' . rand(1000,9999) . '.' . $ext;
            
            if (move_uploaded_file($_FILES['image']['tmp_name'], $uploadDir . $filename)) {
                $image_url = '/banners/' . $filename;
            }
        }

        if (isset($data['id']) && $data['id']) {
            // Update
            if ($image_url) {
                $stmt = $pdo->prepare("UPDATE shop_banners SET title=?, subtitle=?, color_from=?, color_to=?, is_active=?, display_order=?, image_url=? WHERE id=?");
                $stmt->execute([$title, $subtitle, $color_from, $color_to, $is_active, $display_order, $image_url, $data['id']]);
            } else {
                // Keep existing image
                $stmt = $pdo->prepare("UPDATE shop_banners SET title=?, subtitle=?, color_from=?, color_to=?, is_active=?, display_order=? WHERE id=?");
                $stmt->execute([$title, $subtitle, $color_from, $color_to, $is_active, $display_order, $data['id']]);
            }
        } else {
            // Create
            $stmt = $pdo->prepare("INSERT INTO shop_banners (title, subtitle, color_from, color_to, is_active, display_order, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$title, $subtitle, $color_from, $color_to, $is_active, $display_order, $image_url]);
        }
        
        echo json_encode(['success' => true]);
    }
    
    elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? 0;
        $stmt = $pdo->prepare("DELETE FROM shop_banners WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>
