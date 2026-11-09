ALTER TABLE "FinancialAccount" DROP CONSTRAINT "FinancialAccount_kind_valid";
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_kind_valid" CHECK ("kind" IN ('bank','cash','mobile','investment','crypto','property','vehicle','credit_card','loan','other_asset','other_liability'));
