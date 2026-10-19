<?php
// Configuration base de données MySQL et sessions
if (session_status() === PHP_SESSION_NONE) {
  @session_start();
}

$DB_HOST = 'localhost';
$DB_NAME = 'gestion_stock';
$DB_USER = 'root';
$DB_PASS = '';

try {
  $pdo = new PDO("mysql:host=$DB_HOST;charset=utf8mb4", $DB_USER, $DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  $pdo->exec("CREATE DATABASE IF NOT EXISTS `$DB_NAME` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $pdo->exec("USE `$DB_NAME`");

  // Vérification et création automatique des tables si nécessaires
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS fournisseurs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      contact VARCHAR(100) DEFAULT '',
      email VARCHAR(100) DEFAULT '',
      telephone VARCHAR(30) DEFAULT '',
      adresse VARCHAR(200) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bureaux (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(80) NOT NULL,
      batiment VARCHAR(60) DEFAULT '',
      etage VARCHAR(30) DEFAULT '',
      responsable VARCHAR(100) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reference VARCHAR(20) NOT NULL DEFAULT '',
      designation VARCHAR(120) NOT NULL,
      categorie VARCHAR(60) NOT NULL,
      stock INT NOT NULL DEFAULT 0,
      stock_min INT NOT NULL DEFAULT 5,
      prix_unitaire DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      localisation VARCHAR(80) NOT NULL DEFAULT '',
      fournisseur_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mouvements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NULL,
      reference VARCHAR(20),
      designation VARCHAR(120),
      type ENUM('entree','sortie') NOT NULL,
      quantite INT NOT NULL,
      motif VARCHAR(60) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS utilisateurs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      email VARCHAR(120) NOT NULL UNIQUE,
      mot_de_passe VARCHAR(255) NOT NULL DEFAULT '',
      role ENUM('Administrateur','Gestionnaire','Magasinier') NOT NULL DEFAULT 'Gestionnaire',
      statut ENUM('Actif','Inactif') NOT NULL DEFAULT 'Actif',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parametres (
      cle VARCHAR(50) PRIMARY KEY,
      valeur TEXT NOT NULL
    );
  ");

  // Migration de colonnes manquantes
  $pdo->exec("ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS mot_de_passe VARCHAR(255) NOT NULL DEFAULT ''");
  $pdo->exec("ALTER TABLE articles ADD COLUMN IF NOT EXISTS stock_min INT NOT NULL DEFAULT 5");
  $pdo->exec("ALTER TABLE articles ADD COLUMN IF NOT EXISTS prix_unitaire DECIMAL(10,2) NOT NULL DEFAULT 0.00");
  $pdo->exec("ALTER TABLE articles ADD COLUMN IF NOT EXISTS fournisseur_id INT NULL");

  // Initialisation automatique des mots de passe par défaut si vides
  $chk = $pdo->query("SELECT COUNT(*) FROM utilisateurs WHERE mot_de_passe = '' OR mot_de_passe IS NULL")->fetchColumn();
  if ($chk > 0) {
    $hashAdmin = password_hash('admin123', PASSWORD_DEFAULT);
    $hashUser  = password_hash('user123', PASSWORD_DEFAULT);
    $pdo->prepare("UPDATE utilisateurs SET mot_de_passe = ? WHERE role = 'Administrateur' AND (mot_de_passe = '' OR mot_de_passe IS NULL)")->execute([$hashAdmin]);
    $pdo->prepare("UPDATE utilisateurs SET mot_de_passe = ? WHERE role != 'Administrateur' AND (mot_de_passe = '' OR mot_de_passe IS NULL)")->execute([$hashUser]);
  }

} catch (PDOException $e) {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  die(json_encode(['error' => 'Connexion à la base impossible : ' . $e->getMessage()]));
}
