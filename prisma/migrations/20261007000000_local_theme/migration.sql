-- Appearance is stored per browser by next-themes, not per account.
ALTER TABLE "user_settings" DROP COLUMN "theme";
DROP TYPE "AccountTheme";
