CREATE TABLE business_reserves (
  site text PRIMARY KEY,
  restock_at bigint NOT NULL DEFAULT 0,
  billing_day bigint NOT NULL DEFAULT 0,
  calls_spent integer NOT NULL DEFAULT 0 CHECK (calls_spent >= 0)
);
