-- ========================================================
-- Base de données : gestion_stock
-- Projet : Gestion Stock & Matériel (GM2026)
-- ========================================================

CREATE DATABASE IF NOT EXISTS gestion_stock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gestion_stock;

-- 1. Table Fournisseurs
CREATE TABLE IF NOT EXISTS fournisseurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  contact VARCHAR(100) DEFAULT '',
  email VARCHAR(100) DEFAULT '',
  telephone VARCHAR(30) DEFAULT '',
  adresse VARCHAR(200) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table Bureaux / Services
CREATE TABLE IF NOT EXISTS bureaux (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(80) NOT NULL,
  batiment VARCHAR(60) DEFAULT '',
  etage VARCHAR(30) DEFAULT '',
  responsable VARCHAR(100) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table Articles
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id) ON DELETE SET NULL
);

-- 4. Table Mouvements (Historique Entrées / Sorties)
CREATE TABLE IF NOT EXISTS mouvements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  article_id INT NULL,
  reference VARCHAR(20),
  designation VARCHAR(120),
  type ENUM('entree','sortie') NOT NULL,
  quantite INT NOT NULL,
  motif VARCHAR(60) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
);

-- 5. Table Utilisateurs
CREATE TABLE IF NOT EXISTS utilisateurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL,
  role ENUM('Administrateur','Gestionnaire','Magasinier') NOT NULL DEFAULT 'Gestionnaire',
  statut ENUM('Actif','Inactif') NOT NULL DEFAULT 'Actif',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Table Paramètres
CREATE TABLE IF NOT EXISTS parametres (
  cle VARCHAR(50) PRIMARY KEY,
  valeur TEXT NOT NULL
);

-- ========================================================
-- Données initiales / Démonstration
-- ========================================================

INSERT INTO fournisseurs (id, nom, contact, email, telephone, adresse) VALUES
(1, 'TechPro Distribution', 'Marc Dupont', 'contact@techpro.fr', '01 42 68 55 10', '15 Rue de l''Informatique, Paris'),
(2, 'Mobilier Pro France', 'Sophie Laurent', 'commercial@mobilierpro.fr', '04 78 92 14 30', '45 Avenue des Entreprises, Lyon'),
(3, 'Connectique & Réseaux', 'Karim Belkacem', 'support@connectique-reseaux.com', '03 20 15 88 40', '8 Rue du Canal, Lille'),
(4, 'Office Supplies SAS', 'Julie Martin', 'commandes@officesupplies.fr', '05 56 44 21 00', '12 Zone Industrielle, Bordeaux')
ON DUPLICATE KEY UPDATE nom=VALUES(nom);

INSERT INTO bureaux (id, nom, batiment, etage, responsable) VALUES
(1, 'Bureau 01', 'Bâtiment A', '1er étage', 'Thomas Bernard'),
(2, 'Bureau 02', 'Bâtiment A', '1er étage', 'Claire Moreau'),
(3, 'Salle 01', 'Bâtiment A', 'Rez-de-chaussée', 'Service Réunion'),
(4, 'Salle 02', 'Bâtiment A', '2ème étage', 'Direction'),
(5, 'Salle 03', 'Bâtiment B', '1er étage', 'Ressources Humaines'),
(6, 'Bureau 04', 'Bâtiment B', '2ème étage', 'Équipe Technique'),
(7, 'Local réseau', 'Bâtiment A', 'Sous-sol', 'Alexandre Petit')
ON DUPLICATE KEY UPDATE nom=VALUES(nom);

INSERT INTO articles (id, reference, designation, categorie, stock, stock_min, prix_unitaire, localisation, fournisseur_id) VALUES
(1, 'MAT-001', 'Ordinateur portable', 'Informatique', 12, 5, 850.00, 'Bureau 01', 1),
(2, 'MAT-002', 'Imprimante HP', 'Informatique', 5, 3, 320.00, 'Bureau 02', 1),
(3, 'MAT-003', 'Écran 24"', 'Informatique', 8, 4, 180.00, 'Bureau 01', 1),
(4, 'MAT-004', 'Chaise de bureau', 'Mobilier', 20, 5, 120.00, 'Salle 03', 2),
(5, 'MAT-005', 'Table de réunion', 'Mobilier', 4, 2, 450.00, 'Salle 02', 2),
(6, 'MAT-006', 'Clavier sans fil', 'Informatique', 15, 5, 35.00, 'Bureau 04', 1),
(7, 'MAT-007', 'Souris optique', 'Informatique', 30, 10, 20.00, 'Bureau 04', 1),
(8, 'MAT-008', 'Projecteur vidéo', 'Audiovisuel', 2, 2, 650.00, 'Salle 01', 1),
(9, 'MAT-009', 'Câble réseau RJ45', 'Réseau', 2, 10, 15.00, 'Local réseau', 3),
(10, 'MAT-010', 'Toner imprimante', 'Consommable', 11, 5, 75.00, 'Bureau 02', 4)
ON DUPLICATE KEY UPDATE designation=VALUES(designation);

INSERT INTO mouvements (id, article_id, reference, designation, type, quantite, motif, created_at) VALUES
(1, 1, 'MAT-001', 'Ordinateur portable', 'entree', 3, 'Réception fournisseur', NOW() - INTERVAL 10 DAY),
(2, 6, 'MAT-006', 'Clavier sans fil', 'sortie', 2, 'Attribution poste', NOW() - INTERVAL 5 DAY),
(3, 10, 'MAT-010', 'Toner imprimante', 'entree', 5, 'Commande réassort', NOW() - INTERVAL 3 DAY),
(4, 8, 'MAT-008', 'Projecteur vidéo', 'sortie', 1, 'Prêt conférence', NOW() - INTERVAL 1 DAY)
ON DUPLICATE KEY UPDATE quantite=VALUES(quantite);

INSERT INTO utilisateurs (id, nom, email, role, statut) VALUES
(1, 'Admin Système', 'admin@entreprise.com', 'Administrateur', 'Actif'),
(2, 'Julie Magasinier', 'julie.magasin@entreprise.com', 'Magasinier', 'Actif'),
(3, 'Nicolas Responsable', 'nicolas.resp@entreprise.com', 'Gestionnaire', 'Actif'),
(4, 'Camille Audit', 'camille.audit@entreprise.com', 'Gestionnaire', 'Inactif')
ON DUPLICATE KEY UPDATE nom=VALUES(nom);

INSERT INTO parametres (cle, valeur) VALUES
('nom_entreprise', 'GM2026 - Direction Générale'),
('seuil_alerte', '5'),
('seuil_critique', '2'),
('devise', '€'),
('email_notification', 'alertes.stock@entreprise.com')
ON DUPLICATE KEY UPDATE valeur=VALUES(valeur);
