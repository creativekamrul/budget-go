-- Add owned configuration and optional metadata without replacing financial records.
CREATE TABLE "Category" (
 "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "icon" TEXT NOT NULL,
 "parentId" TEXT, "kind" TEXT NOT NULL, "archived" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "Category_pkey" PRIMARY KEY ("userId", "id"),
 CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "Category_parent_fkey" FOREIGN KEY ("userId", "parentId") REFERENCES "Category"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
 CONSTRAINT "Category_kind_check" CHECK ("kind" IN ('income','expense','both')),
 CONSTRAINT "Category_color_check" CHECK ("color" ~ '^#[0-9a-fA-F]{6}$'),
 CONSTRAINT "Category_name_check" CHECK (length("name") BETWEEN 1 AND 80 AND "name" = btrim("name")),
 CONSTRAINT "Category_icon_check" CHECK ("icon" ~ '^[A-Za-z0-9_-]{1,40}$'),
 CONSTRAINT "Category_self_check" CHECK ("parentId" IS NULL OR "parentId" <> "id")
);
CREATE UNIQUE INDEX "Category_owner_name_ci" ON "Category" ("userId", lower("name"));
CREATE TABLE "Tag" (
 "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "archived" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "Tag_pkey" PRIMARY KEY ("userId", "id"),
 CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "Tag_name_check" CHECK (length("name") BETWEEN 1 AND 80 AND "name" = btrim("name")),
 CONSTRAINT "Tag_color_check" CHECK ("color" ~ '^#[0-9a-fA-F]{6}$')
);
CREATE UNIQUE INDEX "Tag_owner_name_ci" ON "Tag" ("userId", lower("name"));
CREATE TABLE "Merchant" (
 "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "website" TEXT NOT NULL DEFAULT '', "archived" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "Merchant_pkey" PRIMARY KEY ("userId", "id"),
 CONSTRAINT "Merchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "Merchant_name_check" CHECK (length("name") BETWEEN 1 AND 80 AND "name" = btrim("name")),
 CONSTRAINT "Merchant_color_check" CHECK ("color" ~ '^#[0-9a-fA-F]{6}$'),
 CONSTRAINT "Merchant_website_check" CHECK (length("website") <= 500 AND ("website" = '' OR "website" ~ '^https?://'))
);
CREATE UNIQUE INDEX "Merchant_owner_name_ci" ON "Merchant" ("userId", lower("name"));
ALTER TABLE "Transaction" ADD COLUMN "categoryId" TEXT, ADD COLUMN "merchantId" TEXT, ADD COLUMN "notes" TEXT NOT NULL DEFAULT '', ADD COLUMN "status" TEXT NOT NULL DEFAULT 'confirmed', ADD COLUMN "excluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_category_fkey" FOREIGN KEY ("userId", "categoryId") REFERENCES "Category"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchant_fkey" FOREIGN KEY ("userId", "merchantId") REFERENCES "Merchant"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_status_check" CHECK ("status" IN ('confirmed','pending')), ADD CONSTRAINT "Transaction_notes_check" CHECK (length("notes") <= 2000);
ALTER TABLE "Budget" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_category_fkey" FOREIGN KEY ("userId", "categoryId") REFERENCES "Category"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE TABLE "TransactionTag" (
 "userId" TEXT NOT NULL, "transactionId" TEXT NOT NULL, "tagId" TEXT NOT NULL,
 CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("userId", "transactionId", "tagId"),
 CONSTRAINT "TransactionTag_transaction_fkey" FOREIGN KEY ("userId", "transactionId") REFERENCES "Transaction"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "TransactionTag_tag_fkey" FOREIGN KEY ("userId", "tagId") REFERENCES "Tag"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE
);
-- These are configuration records only. Preserve financial IDs, dates, values and links.
INSERT INTO "Category" ("userId","id","name","kind","color","icon")
 SELECT u."id", 'builtin-' || c.slug, c.name, c.kind, '#A6BCFF', 'folder'
 FROM "User" u CROSS JOIN (VALUES
 ('salary','Salary','income'),('freelance','Freelance','income'),('other-income','Other income','income'),
 ('groceries','Groceries','expense'),('dining','Dining','expense'),('transport','Transport','expense'),('home','Home','expense'),('shopping','Shopping','expense')
 ) AS c(slug,name,kind);
UPDATE "Transaction" t SET "categoryId" = c."id" FROM "Category" c WHERE t."userId" = c."userId" AND t."category" = c."name" AND (t."type" = c."kind" OR c."kind" = 'both');
UPDATE "Budget" b SET "categoryId" = c."id" FROM "Category" c WHERE b."userId" = c."userId" AND b."category" = c."name" AND c."kind" IN ('expense','both');
