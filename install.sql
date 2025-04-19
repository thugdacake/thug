CREATE TABLE IF NOT EXISTS laundry_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  citizenid VARCHAR(50) NOT NULL,
  amount_dirty INT NOT NULL,
  amount_clean INT NOT NULL,
  rate DECIMAL(4,2) NOT NULL,
  date DATETIME NOT NULL,
  job VARCHAR(50) DEFAULT 'unknown',
  INDEX idx_citizenid (citizenid),
  INDEX idx_date (date),
  INDEX idx_job (job)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
