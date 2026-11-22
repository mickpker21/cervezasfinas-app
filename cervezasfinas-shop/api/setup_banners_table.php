<?php
require_once 'common.php';

try {
    $pdo = getDB();
    
    // Create shop_banners table
    $sql = "CREATE TABLE IF NOT EXISTS shop_banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        subtitle VARCHAR(255),
        color_from VARCHAR(50) DEFAULT 'from-blue-500',
        color_to VARCHAR(50) DEFAULT 'to-blue-600',
        text_color VARCHAR(50) DEFAULT 'text-white',
        image_url VARCHAR(500) DEFAULT NULL,
        display_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )";
    
    $pdo->exec($sql);

    // Add column if missing (for updates)
    try {
        $pdo->exec("ALTER TABLE shop_banners ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER text_color");
        echo "<p>✅ Columna image_url agregada (Actualización).</p>";
    } catch (Exception $e) {
        // Column likely exists, ignore
    }
    
    echo "<h1>✅ Tabla shop_banners lista (V2: Imágenes)</h1>";
    
    // Check if empty, insert default data
    $stmt = $pdo->query("SELECT COUNT(*) FROM shop_banners");
    if ($stmt->fetchColumn() == 0) {
        $insert = "INSERT INTO shop_banners (title, subtitle, color_from, color_to, display_order) VALUES 
        ('Promoción Especial', 'Descuentos en cervezas seleccionadas', 'from-amber-500', 'to-orange-600', 1),
        ('Puntos Dobles', 'Acumula el doble en tus compras', 'from-purple-500', 'to-pink-600', 2),
        ('Envío Gratis', 'En pedidos mayores a $1,000', 'from-green-500', 'to-emerald-600', 3)";
        $pdo->exec($insert);
        echo "<p>Datos de ejemplo insertados.</p>";
    }
    
} catch (PDOException $e) {
    die("Error setup: " . $e->getMessage());
}
?>
