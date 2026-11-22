<?php
require_once 'api/common.php';

header('Content-Type: text/plain');

// Retrieve DB connection
$pdo = getDB();

echo "Starting Database Update (V3)...\n";

try {
    // 1. Rename discount_percentage to discount_amount in shop_promotions
    // Checking if column exists to avoid error or handling via try-catch
    try {
        // Check if discount_percentage exists
        $check = $pdo->query("SHOW COLUMNS FROM shop_promotions LIKE 'discount_percentage'");
        if ($check->rowCount() > 0) {
            $pdo->exec("ALTER TABLE shop_promotions CHANGE discount_percentage discount_amount DECIMAL(10,2) NOT NULL");
            echo "[OK] Changed 'discount_percentage' to 'discount_amount' in shop_promotions.\n";
        } else {
             // Check if discount_amount already exists
             $check2 = $pdo->query("SHOW COLUMNS FROM shop_promotions LIKE 'discount_amount'");
             if ($check2->rowCount() == 0) {
                 // Neither exists? Add it.
                 $pdo->exec("ALTER TABLE shop_promotions ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00");
                 echo "[OK] Added 'discount_amount' column.\n";
             } else {
                 echo "[SKIP] 'discount_amount' already exists.\n";
             }
        }
    } catch (PDOException $e) {
        echo "[INFO] Column change info: " . $e->getMessage() . "\n";
    }

    // 2. Update GEC Levels (Truncate and Re-insert) to ensure names are correct
    $pdo->exec("TRUNCATE TABLE shop_gec_discounts");
    $gecLevels = [
        ['Bronce', 0],
        ['Plata', 2],
        ['Oro', 5],
        ['Platino', 7],
        ['Titanio', 10],
        ['Titanio 2', 12]
    ];
    $stmtGEC = $pdo->prepare("INSERT INTO shop_gec_discounts (nivel_gec, discount_percentage) VALUES (?, ?)");
    foreach ($gecLevels as $level) {
        $stmtGEC->execute($level);
    }
    echo "[OK] GEC Levels updated to: Bronce, Plata, Oro, Platino, Titanio, Titanio 2.\n";

    // 3. Ensure 'gec' column in users
    try {
        $pdo->exec("ALTER TABLE shop_client_users ADD COLUMN gec VARCHAR(50) DEFAULT 'Bronce' AFTER client_code");
        echo "[OK] Added 'gec' to shop_client_users.\n";
    } catch (Exception $e) { 
        // Ignore if exists
    }

    // 4. Create shop_promotion_skus if not exists
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
    echo "[OK] shop_promotion_skus table verified.\n";
    
    // 5. Create shop_cooler_reference_photos
    $sqlCooler = "
    CREATE TABLE IF NOT EXISTS shop_cooler_reference_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      photo_url VARCHAR(500) NOT NULL,
      title VARCHAR(255),
      description TEXT,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($sqlCooler);
    echo "[OK] shop_cooler_reference_photos table verified.\n";
    
     // 6. Create shop_point_redemption_products
    $sqlRedeem = "
    CREATE TABLE IF NOT EXISTS shop_point_redemption_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sku VARCHAR(50) NOT NULL,
      points_required INT NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sku (sku)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($sqlRedeem);
    echo "[OK] shop_point_redemption_products table verified.\n";

    echo "Database Upgrade V3 Complete.\n";

} catch (PDOException $e) {
    echo "ERROR: " . $e->getMessage();
}
?>
