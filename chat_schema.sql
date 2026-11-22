CREATE TABLE IF NOT EXISTS shop_support_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_code VARCHAR(50) NOT NULL,
    sender_type ENUM('client', 'agent') NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (client_code),
    INDEX (is_read),
    INDEX (created_at)
);
