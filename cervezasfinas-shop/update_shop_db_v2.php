<?php
require_once 'api/common.php';

header('Content-Type: text/plain');

$pdo = getDB();

echo "Starting Database Update...\n";

try {
    // 1. Add 'gec' to shop_client_users if missing
    // We check via a dummy select or column check. MySQL doesn't have "ADD COLUMN IF NOT EXISTS" in older versions easily.
    // We'll use a try-catch on the ALTER.
    try {
        $pdo->exec("ALTER TABLE shop_client_users ADD COLUMN gec VARCHAR(50) DEFAULT 'Bronce' AFTER client_code");
        echo "[OK] Added 'gec' column to shop_client_users.\n";
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'Duplicate column') !== false) {
            echo "[SKIP] 'gec' column already exists.\n";
        } else {
            throw $e;
        }
    }

    // 2. Create shop_promotion_skus table
    $sqlPromoSkus = "
    CREATE TABLE IF NOT EXISTS shop_promotion_skus (
      id INT AUTO_INCREMENT PRIMARY KEY,
      promotion_id INT NOT NULL,
      sku VARCHAR(50) NOT NULL,
      FOREIGN KEY (promotion_id) REFERENCES shop_promotions(id) ON DELETE CASCADE,
      UNIQUE KEY unique_promo_sku (promotion_id, sku)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($sqlPromoSkus);
    echo "[OK] Created/Verified shop_promotion_skus table.\n";

    // 3. Create shop_cooler_reference_photos table (already exists in previous schema file, ensuring it)
    $sqlCoolerRefs = "
    CREATE TABLE IF NOT EXISTS shop_cooler_reference_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      photo_url VARCHAR(500) NOT NULL,
      title VARCHAR(255),
      description TEXT,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($sqlCoolerRefs);
    echo "[OK] Created/Verified shop_cooler_reference_photos table.\n";

    // 4. Update GEC Discounts table with correct Levels
    $pdo->exec("TRUNCATE TABLE shop_gec_discounts");
    $gecLevels = [
        ['Bronce', 0.00],
        ['Plata', 2.00],
        ['Oro', 5.00],
        ['Platino', 7.00],
        ['Titanio', 10.00],
        ['Titanio 2', 12.00]
    ];
    $stmtGEC = $pdo->prepare("INSERT INTO shop_gec_discounts (nivel_gec, discount_percentage) VALUES (?, ?)");
    foreach ($gecLevels as $level) {
        $stmtGEC->execute($level);
    }
    echo "[OK] Updated GEC levels to: Bronce, Plata, Oro, Platino, Titanio, Titanio 2.\n";

    // 5. Ensure shop_point_redemption_products exists
    $sqlRedemptionProds = "
    CREATE TABLE IF NOT EXISTS shop_point_redemption_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sku VARCHAR(50) NOT NULL,
      points_required INT NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sku (sku)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($sqlRedemptionProds);
    echo "[OK] Created/Verified shop_point_redemption_products table.\n";

    echo "Database Update Successfully Completed.\n";

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    http_response_code(500);
}
?>
