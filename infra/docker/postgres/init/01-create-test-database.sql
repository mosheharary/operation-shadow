-- Runs once, when the local Postgres volume is first initialized.
-- A separate database keeps integration tests away from local development data.
CREATE DATABASE operation_shadow_test OWNER shadow;
