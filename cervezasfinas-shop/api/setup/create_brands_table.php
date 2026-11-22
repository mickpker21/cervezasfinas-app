<?php
require_once __DIR__ . '/../common.php';

// Habilitar visualización de errores
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header('Content-Type: text/plain; charset=utf-8');

try {
    $pdo = getPDO();
    echo "Conexión exitosa a la base de datos.\n\n";

    $sql = "
    CREATE TABLE IF NOT EXISTS shop_brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      logo_url VARCHAR(500),
      color_gradient VARCHAR(255) DEFAULT 'from-gray-500 to-gray-700',
      display_order INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_active (is_active),
      INDEX idx_order (display_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";

    $pdo->exec($sql);
    echo "Tabla 'shop_brands' creada o verificada correctamente.\n";

    // Insertar datos iniciales si la tabla está vacía
    $stmt = $pdo->query("SELECT COUNT(*) FROM shop_brands");
    if ($stmt->fetchColumn() == 0) {
        echo "Insertando marcas iniciales...\n";
        
        $brands = [
            ['Corona', '🍺', 'from-yellow-400 to-yellow-600', 1],
            ['Victoria', '🏺', 'from-amber-500 to-amber-700', 2],
            ['Modelo', '⭐', 'from-yellow-500 to-orange-600', 3],
            ['Pacífico', '🌊', 'from-blue-400 to-blue-600', 4],
            ['Heineken', '💚', 'from-green-400 to-green-600', 5]
        ];

        $insertStmt = $pdo->prepare("INSERT INTO shop_brands (name, logo_url, color_gradient, display_order) VALUES (?, ?, ?, ?)");
        
        foreach ($brands as $brand) {
            $insertStmt->execute($brand);
            echo "Marca insertada: " . $brand[0] . "\n";
        }
    } else {
        echo "La tabla ya contiene datos. No se insertaron marcas iniciales.\n";
    }

} catch (PDOException $e) {
    echo "Error de base de datos: " . $e->getMessage();
} catch (Exception $e) {
    echo "Error general: " . $e->getMessage();
}
?>
