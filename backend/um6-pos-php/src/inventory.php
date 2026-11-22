<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/**
 * Inserta o asegura existencia de un registro de inventario para tienda + producto.
 *
 * @param PDO $conn
 * @param int $storeId
 * @param int $productId
 * @return void
 */
function um6_upsert_inventory(PDO $conn, int $storeId, int $productId): void
{
    $sql = 'INSERT INTO inventories (store_id, product_id, on_hand, reserved)
            VALUES (?, ?, 0, 0)
            ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)';
    $stmt = $conn->prepare($sql);
    $stmt->execute([$storeId, $productId]);
}

/**
 * Registra un movimiento de inventario.
 *
 * @param PDO $conn
 * @param int $storeId
 * @param int $productId
 * @param string $type
 * @param float $quantity
 * @param string|null $reference
 * @param string $userId
 * @return void
 */
function um6_register_movement(
    PDO $conn,
    int $storeId,
    int $productId,
    string $type,
    float $quantity,
    ?string $reference,
    string $userId
): void {
    $sql = 'INSERT INTO inventory_movements (store_id, product_id, type, quantity, reference, created_by)
            VALUES (?, ?, ?, ?, ?, ?)';
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        $storeId,
        $productId,
        $type,
        $quantity,
        $reference,
        $userId,
    ]);
}

/**
 * Actualiza el inventario sumando un delta a on_hand.
 *
 * @param PDO $conn
 * @param int $storeId
 * @param int $productId
 * @param float $delta
 * @return void
 */
function um6_update_inventory(PDO $conn, int $storeId, int $productId, float $delta): void
{
    $sql = 'UPDATE inventories
               SET on_hand = on_hand + ?
             WHERE store_id = ? AND product_id = ?';
    $stmt = $conn->prepare($sql);
    $stmt->execute([$delta, $storeId, $productId]);
}

