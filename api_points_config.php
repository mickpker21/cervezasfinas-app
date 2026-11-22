<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Configuración de base de datos
$host = 'localhost';
$dbname = 'u710874224_cervezas';
$username = 'u710874224_cervezas';
$password = 'Cervezas2024!';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit();
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// GET - Obtener configuración
if ($method === 'GET' && $action === 'get-config') {
    try {
        $stmt = $pdo->query("SELECT * FROM points_config LIMIT 1");
        $config = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$config) {
            // Crear configuración por defecto
            $pdo->exec("INSERT INTO points_config (points_per_peso, min_purchase_for_points) VALUES (0.1, 0)");
            $config = ['id' => 1, 'points_per_peso' => 0.1, 'min_purchase_for_points' => 0];
        }
        
        echo json_encode(['success' => true, 'data' => $config]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// POST - Actualizar configuración
elseif ($method === 'POST' && $action === 'update-config') {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $points_per_peso = floatval($input['points_per_peso'] ?? 0.1);
        $min_purchase = floatval($input['min_purchase_for_points'] ?? 0);
        
        $stmt = $pdo->prepare("
            UPDATE points_config 
            SET points_per_peso = ?, min_purchase_for_points = ?
            LIMIT 1
        ");
        $stmt->execute([$points_per_peso, $min_purchase]);
        
        echo json_encode(['success' => true, 'message' => 'Configuración actualizada']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// GET - Listar productos para canje
elseif ($method === 'GET' && $action === 'list-products') {
    try {
        $stmt = $pdo->query("
            SELECT * FROM point_redemption_products 
            ORDER BY points_required ASC
        ");
        $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'data' => $products]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// POST - Añadir producto para canje
elseif ($method === 'POST' && $action === 'add-product') {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $sku = $input['sku'] ?? '';
        $points_required = intval($input['points_required'] ?? 0);
        
        if (empty($sku) || $points_required <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'SKU y puntos requeridos son obligatorios']);
            exit();
        }
        
        $stmt = $pdo->prepare("
            INSERT INTO point_redemption_products (sku, points_required, is_active)
            VALUES (?, ?, 1)
        ");
        $stmt->execute([$sku, $points_required]);
        
        echo json_encode(['success' => true, 'message' => 'Producto añadido', 'id' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// PUT - Actualizar producto
elseif ($method === 'POST' && $action === 'update-product') {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $id = intval($input['id'] ?? 0);
        $points_required = isset($input['points_required']) ? intval($input['points_required']) : null;
        $is_active = isset($input['is_active']) ? intval($input['is_active']) : null;
        
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'ID inválido']);
            exit();
        }
        
        $updates = [];
        $params = [];
        
        if ($points_required !== null) {
            $updates[] = "points_required = ?";
            $params[] = $points_required;
        }
        
        if ($is_active !== null) {
            $updates[] = "is_active = ?";
            $params[] = $is_active;
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['error' => 'No hay datos para actualizar']);
            exit();
        }
        
        $params[] = $id;
        $sql = "UPDATE point_redemption_products SET " . implode(', ', $updates) . " WHERE id = ?";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        echo json_encode(['success' => true, 'message' => 'Producto actualizado']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// DELETE - Eliminar producto
elseif ($method === 'POST' && $action === 'delete-product') {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $id = intval($input['id'] ?? 0);
        
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'ID inválido']);
            exit();
        }
        
        $stmt = $pdo->prepare("DELETE FROM point_redemption_products WHERE id = ?");
        $stmt->execute([$id]);
        
        echo json_encode(['success' => true, 'message' => 'Producto eliminado']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

else {
    http_response_code(400);
    echo json_encode(['error' => 'Acción no válida']);
}
?>
