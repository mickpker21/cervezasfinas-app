<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // List all products
    try {
        $stmt = $pdo->query("SELECT * FROM shop_products ORDER BY name ASC");
        $products = $stmt->fetchAll();
        sendJSON(['success' => true, 'data' => $products]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    // Handle Multipart form data (Files + Text)
    // When using FormData in JS, $_POST has the text fields, $_FILES has files.
    
    $action = $_POST['action'] ?? '';
    
    if (!$action) {
        sendJSON(['error' => 'Action required'], 400);
    }
    
    $sku = $_POST['sku'] ?? '';
    $name = $_POST['name'] ?? '';
    $description = $_POST['description'] ?? '';
    $basePrice = $_POST['base_price'] ?? 0;
    $category = $_POST['category'] ?? 'General';
    $isActive = isset($_POST['is_active']) ? ((int)$_POST['is_active']) : 1;
    $id = $_POST['id'] ?? null;
    $currentImageUrl = $_POST['current_image_url'] ?? '';

    // Handle Image Upload
    $imageUrl = $currentImageUrl;
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $uploadDir = '../../assets/products/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }
        
        $extension = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
        $filename = $sku . '_' . time() . '.' . $extension;
        $targetPath = $uploadDir . $filename;
        
        if (move_uploaded_file($_FILES['image']['tmp_name'], $targetPath)) {
            $imageUrl = 'assets/products/' . $filename;
        }
    }

    try {
        if ($action === 'create') {
            $sql = "INSERT INTO shop_products (sku, name, description, base_price, category, image_url, is_active) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$sku, $name, $description, $basePrice, $category, $imageUrl, $isActive]);
            sendJSON(['success' => true, 'message' => 'Product created']);
            
        } elseif ($action === 'update') {
            $sql = "UPDATE shop_products SET 
                    name = ?, description = ?, base_price = ?, category = ?, image_url = ?, is_active = ? 
                    WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$name, $description, $basePrice, $category, $imageUrl, $isActive, $id]);
            sendJSON(['success' => true, 'message' => 'Product updated']);
        } elseif ($action === 'delete') {
            if (!$id) sendJSON(['error' => 'ID required for deletion'], 400);
            $sql = "DELETE FROM shop_products WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$id]);
            sendJSON(['success' => true, 'message' => 'Product deleted']);
        }
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
}
?>
