-- SAYIM SAMİ — Black Rose Vegawin için SADECE OKUMA kullanıcısı (Vegawin programcısı çalıştırır).
-- Köprü bu kullanıcıyla bağlanır; kullanıcının yazma/silme/değiştirme yetkisi OLMAMALI.
-- <VERITABANI> yerine Black Rose'un Vegawin veritabanının adını, <SIFRE> yerine güçlü bir şifre yazın.
-- Şifreyi kimseye (Claude dahil) yazmayın; köprü kurulurken sadece o bilgisayarda bir kez girilir.

CREATE LOGIN <KULLANICI> WITH PASSWORD = '<SIFRE>', CHECK_POLICY = ON;
GO
USE [<VERITABANI>];
GO
CREATE USER <KULLANICI> FOR LOGIN <KULLANICI>;
ALTER ROLE db_datareader ADD MEMBER <KULLANICI>;
DENY INSERT, UPDATE, DELETE, ALTER, EXECUTE TO <KULLANICI>;
GO
-- Kontrol: aşağıdaki sorgu sadece db_datareader göstermeli.
SELECT r.name FROM sys.database_role_members m JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
 JOIN sys.database_principals u ON u.principal_id = m.member_principal_id WHERE u.name = '<KULLANICI>';
