-- A linked category owns its label; preserve builtin-only validation for legacy null references.
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_category_valid";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_category_valid" CHECK (
  "categoryId" IS NOT NULL OR
  ("type" = 'income' AND "category" IN ('Salary','Freelance','Other income')) OR
  ("type" = 'expense' AND "category" IN ('Groceries','Dining','Transport','Home','Shopping'))
);
ALTER TABLE "Budget" DROP CONSTRAINT "Budget_category_valid";
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_category_valid" CHECK (
  "categoryId" IS NOT NULL OR "category" IN ('Groceries','Dining','Transport','Home','Shopping')
);
ALTER TABLE "Merchant" DROP CONSTRAINT "Merchant_website_check";
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_website_check" CHECK (length("website") <= 500 AND ("website" = '' OR "website" ~* '^https?://'));
