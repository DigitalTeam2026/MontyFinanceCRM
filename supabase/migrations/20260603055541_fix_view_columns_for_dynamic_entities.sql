/*
  # Fix view columns for dynamic entities

  ## Problem
  The default views for Country, Currency, Industry, and Campaign entities only had 1 column
  (just "Name") defined in view_column rows. This caused the entity list grid to show a
  single column instead of a rich multi-column layout matching how Accounts, Contacts etc. look.

  ## Changes
  For every view of each dynamic entity, replace the existing columns with a proper set:

  ### Country views (Active, Inactive, All)
  Columns: Name (link), ISO Code (2-digit), Status, Created On, Modified On

  ### Currency views (Active, Inactive, All)
  Columns: Name (link), Code, Symbol, Exchange Rate, Status

  ### Industry views (Habib's View / default, All, Active, Inactive)
  Columns: Name (link), Code, Description, Status, Created On

  ### Campaign views (all 4)
  Columns: Campaign Name (link), Type, Start Date, End Date, Status, Owner, Created On

  ## Approach
  Delete existing view_column rows for each view and re-insert the correct set.
  Only touches the specific views for these 4 entities — no other data is affected.
*/

-- ─── COUNTRY VIEWS ─────────────────────────────────────────────────────────────
-- Field IDs: name=3216b0eb, isocode2=32fd1e1e, statecode=30b4e415,
--            createdon=7105067b, modifiedon=1bd0dcd8

-- Delete existing columns for all country views
DELETE FROM view_column WHERE view_id IN (
  '6160845e-7fb8-4af6-811e-5070242f8a58', -- Active Countries (default)
  'b5343de8-693a-4620-842b-3a6c49d001c1', -- All Countries
  'b79d3ee0-77c0-4ce6-90f2-1ca49d04fb80'  -- Inactive Countries
);

-- Insert proper columns for all country views
INSERT INTO view_column (view_column_id, view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Active Countries
  (gen_random_uuid(), '6160845e-7fb8-4af6-811e-5070242f8a58', '3216b0eb-7792-4132-a7b6-b655e584bec4', 1, true,  false), -- Name
  (gen_random_uuid(), '6160845e-7fb8-4af6-811e-5070242f8a58', '32fd1e1e-461b-4099-8ebe-ca9f6a0833b2', 2, true,  false), -- ISO Code 2
  (gen_random_uuid(), '6160845e-7fb8-4af6-811e-5070242f8a58', '0b1ea306-6fa0-44f8-af48-486bd7b7aa9d', 3, true,  false), -- ISO Code 3
  (gen_random_uuid(), '6160845e-7fb8-4af6-811e-5070242f8a58', '30b4e415-d188-4398-9c18-c2245507f35d', 4, true,  false), -- Status
  (gen_random_uuid(), '6160845e-7fb8-4af6-811e-5070242f8a58', '7105067b-4561-404c-ad19-e03eac5934ff', 5, true,  false), -- Created On
  -- All Countries
  (gen_random_uuid(), 'b5343de8-693a-4620-842b-3a6c49d001c1', '3216b0eb-7792-4132-a7b6-b655e584bec4', 1, true,  false), -- Name
  (gen_random_uuid(), 'b5343de8-693a-4620-842b-3a6c49d001c1', '32fd1e1e-461b-4099-8ebe-ca9f6a0833b2', 2, true,  false), -- ISO Code 2
  (gen_random_uuid(), 'b5343de8-693a-4620-842b-3a6c49d001c1', '0b1ea306-6fa0-44f8-af48-486bd7b7aa9d', 3, true,  false), -- ISO Code 3
  (gen_random_uuid(), 'b5343de8-693a-4620-842b-3a6c49d001c1', '30b4e415-d188-4398-9c18-c2245507f35d', 4, true,  false), -- Status
  (gen_random_uuid(), 'b5343de8-693a-4620-842b-3a6c49d001c1', '7105067b-4561-404c-ad19-e03eac5934ff', 5, true,  false), -- Created On
  -- Inactive Countries
  (gen_random_uuid(), 'b79d3ee0-77c0-4ce6-90f2-1ca49d04fb80', '3216b0eb-7792-4132-a7b6-b655e584bec4', 1, true,  false), -- Name
  (gen_random_uuid(), 'b79d3ee0-77c0-4ce6-90f2-1ca49d04fb80', '32fd1e1e-461b-4099-8ebe-ca9f6a0833b2', 2, true,  false), -- ISO Code 2
  (gen_random_uuid(), 'b79d3ee0-77c0-4ce6-90f2-1ca49d04fb80', '0b1ea306-6fa0-44f8-af48-486bd7b7aa9d', 3, true,  false), -- ISO Code 3
  (gen_random_uuid(), 'b79d3ee0-77c0-4ce6-90f2-1ca49d04fb80', '30b4e415-d188-4398-9c18-c2245507f35d', 4, true,  false), -- Status
  (gen_random_uuid(), 'b79d3ee0-77c0-4ce6-90f2-1ca49d04fb80', '7105067b-4561-404c-ad19-e03eac5934ff', 5, true,  false)  -- Created On
;

-- ─── CURRENCY VIEWS ────────────────────────────────────────────────────────────
-- Field IDs: name=3e1fdc13, code=b1cb9f82, symbol=ad04dd6c,
--            exchange_rate=729695a7, statecode=dd935df5

DELETE FROM view_column WHERE view_id IN (
  'cd9cfa61-f1b6-4d27-8086-adfb31ad0099', -- Active Currencies (default)
  '3c031e39-ef52-46f2-a649-7ca9064063e8', -- All Currencies
  '6ff2362e-c006-4cb2-b8ee-06561bb845ea'  -- Inactive Currencies
);

INSERT INTO view_column (view_column_id, view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Active Currencies
  (gen_random_uuid(), 'cd9cfa61-f1b6-4d27-8086-adfb31ad0099', '3e1fdc13-82c7-4787-810c-aead1ed5121c', 1, true,  false), -- Name
  (gen_random_uuid(), 'cd9cfa61-f1b6-4d27-8086-adfb31ad0099', 'b1cb9f82-4f30-4ef3-9023-9cebd2f35c9b', 2, true,  false), -- Code
  (gen_random_uuid(), 'cd9cfa61-f1b6-4d27-8086-adfb31ad0099', 'ad04dd6c-dcfb-40a3-a75c-2cde159903a9', 3, true,  false), -- Symbol
  (gen_random_uuid(), 'cd9cfa61-f1b6-4d27-8086-adfb31ad0099', '729695a7-2c92-4367-bb26-1522778c4cc5', 4, true,  false), -- Exchange Rate
  (gen_random_uuid(), 'cd9cfa61-f1b6-4d27-8086-adfb31ad0099', 'dd935df5-9407-4e7c-9e48-092933f2a68d', 5, true,  false), -- Status
  -- All Currencies
  (gen_random_uuid(), '3c031e39-ef52-46f2-a649-7ca9064063e8', '3e1fdc13-82c7-4787-810c-aead1ed5121c', 1, true,  false), -- Name
  (gen_random_uuid(), '3c031e39-ef52-46f2-a649-7ca9064063e8', 'b1cb9f82-4f30-4ef3-9023-9cebd2f35c9b', 2, true,  false), -- Code
  (gen_random_uuid(), '3c031e39-ef52-46f2-a649-7ca9064063e8', 'ad04dd6c-dcfb-40a3-a75c-2cde159903a9', 3, true,  false), -- Symbol
  (gen_random_uuid(), '3c031e39-ef52-46f2-a649-7ca9064063e8', '729695a7-2c92-4367-bb26-1522778c4cc5', 4, true,  false), -- Exchange Rate
  (gen_random_uuid(), '3c031e39-ef52-46f2-a649-7ca9064063e8', 'dd935df5-9407-4e7c-9e48-092933f2a68d', 5, true,  false), -- Status
  -- Inactive Currencies
  (gen_random_uuid(), '6ff2362e-c006-4cb2-b8ee-06561bb845ea', '3e1fdc13-82c7-4787-810c-aead1ed5121c', 1, true,  false), -- Name
  (gen_random_uuid(), '6ff2362e-c006-4cb2-b8ee-06561bb845ea', 'b1cb9f82-4f30-4ef3-9023-9cebd2f35c9b', 2, true,  false), -- Code
  (gen_random_uuid(), '6ff2362e-c006-4cb2-b8ee-06561bb845ea', 'ad04dd6c-dcfb-40a3-a75c-2cde159903a9', 3, true,  false), -- Symbol
  (gen_random_uuid(), '6ff2362e-c006-4cb2-b8ee-06561bb845ea', '729695a7-2c92-4367-bb26-1522778c4cc5', 4, true,  false), -- Exchange Rate
  (gen_random_uuid(), '6ff2362e-c006-4cb2-b8ee-06561bb845ea', 'dd935df5-9407-4e7c-9e48-092933f2a68d', 5, true,  false)  -- Status
;

-- ─── INDUSTRY VIEWS ────────────────────────────────────────────────────────────
-- Field IDs: name=ddf61ff8, code=228fbc78, description=ec890b75,
--            statecode=dd49503c, createdon=67b04c2b

DELETE FROM view_column WHERE view_id IN (
  'a8ec1816-df62-47d9-8143-d1fdacf8351d', -- Habib's View (default)
  '08924065-d17e-4468-af6e-1b912d417924', -- All Industries
  '277315da-0f0e-4601-98ef-36a226c3f07f', -- Active Industries
  '09b74f59-a119-4155-9061-1817137dc3ac', -- Inactive Industries
  '018de697-5e51-415d-b525-48d2df3fa41e', -- Active Records (empty)
  '39a6ab9e-af69-4e68-a9e4-aebce165b301', -- Inactive Records (empty)
  '070e2628-4b35-49a5-9cb9-25fd906d4602'  -- All Records (empty)
);

INSERT INTO view_column (view_column_id, view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Habib's View (default)
  (gen_random_uuid(), 'a8ec1816-df62-47d9-8143-d1fdacf8351d', 'ddf61ff8-8a95-40d8-94bb-ede35369e3c0', 1, true,  false), -- Name
  (gen_random_uuid(), 'a8ec1816-df62-47d9-8143-d1fdacf8351d', '228fbc78-aa39-4eeb-98b0-7ba77f2504e3', 2, true,  false), -- Code
  (gen_random_uuid(), 'a8ec1816-df62-47d9-8143-d1fdacf8351d', 'ec890b75-7bf9-4f09-b182-96eadf0cff12', 3, false, false), -- Description
  (gen_random_uuid(), 'a8ec1816-df62-47d9-8143-d1fdacf8351d', 'dd49503c-69f3-4b0a-820a-31b84ce9fa05', 4, true,  false), -- Status
  (gen_random_uuid(), 'a8ec1816-df62-47d9-8143-d1fdacf8351d', '67b04c2b-088e-4c75-a90e-7c58a0cece3e', 5, true,  false), -- Created On
  -- All Industries
  (gen_random_uuid(), '08924065-d17e-4468-af6e-1b912d417924', 'ddf61ff8-8a95-40d8-94bb-ede35369e3c0', 1, true,  false),
  (gen_random_uuid(), '08924065-d17e-4468-af6e-1b912d417924', '228fbc78-aa39-4eeb-98b0-7ba77f2504e3', 2, true,  false),
  (gen_random_uuid(), '08924065-d17e-4468-af6e-1b912d417924', 'ec890b75-7bf9-4f09-b182-96eadf0cff12', 3, false, false),
  (gen_random_uuid(), '08924065-d17e-4468-af6e-1b912d417924', 'dd49503c-69f3-4b0a-820a-31b84ce9fa05', 4, true,  false),
  (gen_random_uuid(), '08924065-d17e-4468-af6e-1b912d417924', '67b04c2b-088e-4c75-a90e-7c58a0cece3e', 5, true,  false),
  -- Active Industries
  (gen_random_uuid(), '277315da-0f0e-4601-98ef-36a226c3f07f', 'ddf61ff8-8a95-40d8-94bb-ede35369e3c0', 1, true,  false),
  (gen_random_uuid(), '277315da-0f0e-4601-98ef-36a226c3f07f', '228fbc78-aa39-4eeb-98b0-7ba77f2504e3', 2, true,  false),
  (gen_random_uuid(), '277315da-0f0e-4601-98ef-36a226c3f07f', 'ec890b75-7bf9-4f09-b182-96eadf0cff12', 3, false, false),
  (gen_random_uuid(), '277315da-0f0e-4601-98ef-36a226c3f07f', 'dd49503c-69f3-4b0a-820a-31b84ce9fa05', 4, true,  false),
  (gen_random_uuid(), '277315da-0f0e-4601-98ef-36a226c3f07f', '67b04c2b-088e-4c75-a90e-7c58a0cece3e', 5, true,  false),
  -- Inactive Industries
  (gen_random_uuid(), '09b74f59-a119-4155-9061-1817137dc3ac', 'ddf61ff8-8a95-40d8-94bb-ede35369e3c0', 1, true,  false),
  (gen_random_uuid(), '09b74f59-a119-4155-9061-1817137dc3ac', '228fbc78-aa39-4eeb-98b0-7ba77f2504e3', 2, true,  false),
  (gen_random_uuid(), '09b74f59-a119-4155-9061-1817137dc3ac', 'ec890b75-7bf9-4f09-b182-96eadf0cff12', 3, false, false),
  (gen_random_uuid(), '09b74f59-a119-4155-9061-1817137dc3ac', 'dd49503c-69f3-4b0a-820a-31b84ce9fa05', 4, true,  false),
  (gen_random_uuid(), '09b74f59-a119-4155-9061-1817137dc3ac', '67b04c2b-088e-4c75-a90e-7c58a0cece3e', 5, true,  false),
  -- Active Records
  (gen_random_uuid(), '018de697-5e51-415d-b525-48d2df3fa41e', 'ddf61ff8-8a95-40d8-94bb-ede35369e3c0', 1, true,  false),
  (gen_random_uuid(), '018de697-5e51-415d-b525-48d2df3fa41e', '228fbc78-aa39-4eeb-98b0-7ba77f2504e3', 2, true,  false),
  (gen_random_uuid(), '018de697-5e51-415d-b525-48d2df3fa41e', 'dd49503c-69f3-4b0a-820a-31b84ce9fa05', 3, true,  false),
  (gen_random_uuid(), '018de697-5e51-415d-b525-48d2df3fa41e', '67b04c2b-088e-4c75-a90e-7c58a0cece3e', 4, true,  false),
  -- Inactive Records
  (gen_random_uuid(), '39a6ab9e-af69-4e68-a9e4-aebce165b301', 'ddf61ff8-8a95-40d8-94bb-ede35369e3c0', 1, true,  false),
  (gen_random_uuid(), '39a6ab9e-af69-4e68-a9e4-aebce165b301', '228fbc78-aa39-4eeb-98b0-7ba77f2504e3', 2, true,  false),
  (gen_random_uuid(), '39a6ab9e-af69-4e68-a9e4-aebce165b301', 'dd49503c-69f3-4b0a-820a-31b84ce9fa05', 3, true,  false),
  (gen_random_uuid(), '39a6ab9e-af69-4e68-a9e4-aebce165b301', '67b04c2b-088e-4c75-a90e-7c58a0cece3e', 4, true,  false),
  -- All Records
  (gen_random_uuid(), '070e2628-4b35-49a5-9cb9-25fd906d4602', 'ddf61ff8-8a95-40d8-94bb-ede35369e3c0', 1, true,  false),
  (gen_random_uuid(), '070e2628-4b35-49a5-9cb9-25fd906d4602', '228fbc78-aa39-4eeb-98b0-7ba77f2504e3', 2, true,  false),
  (gen_random_uuid(), '070e2628-4b35-49a5-9cb9-25fd906d4602', 'dd49503c-69f3-4b0a-820a-31b84ce9fa05', 3, true,  false),
  (gen_random_uuid(), '070e2628-4b35-49a5-9cb9-25fd906d4602', '67b04c2b-088e-4c75-a90e-7c58a0cece3e', 4, true,  false)
;

-- ─── CAMPAIGN VIEWS ────────────────────────────────────────────────────────────
-- Field IDs: name=d90a35cc, typecode=79d25351, startdate=8bd1956d,
--            enddate=c59c1ded, statecode=d9db049e, ownerid=51d558bf, createdon=a137afda

DELETE FROM view_column WHERE view_id IN (
  '7215f242-20bc-4aa2-8a48-b821edc6e1ed', -- Habib's View (default)
  '7ab6387e-339a-4728-9be3-0ac18a15aeaf', -- Active Campaigns
  'bf4be55d-a839-4a3f-a226-e24ece97edf0', -- Inactive Campaigns
  'fe06acf6-47c2-4b36-b99e-37d93aef8a59'  -- All Campaigns
);

INSERT INTO view_column (view_column_id, view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Habib's View (default)
  (gen_random_uuid(), '7215f242-20bc-4aa2-8a48-b821edc6e1ed', 'd90a35cc-e40f-4367-a3ab-29ff074f6400', 1, true,  false), -- Name
  (gen_random_uuid(), '7215f242-20bc-4aa2-8a48-b821edc6e1ed', '79d25351-da35-46d6-85ad-1d1a6fd9f075', 2, true,  false), -- Type
  (gen_random_uuid(), '7215f242-20bc-4aa2-8a48-b821edc6e1ed', '8bd1956d-6350-42f1-8efd-e673a362d73b', 3, true,  false), -- Start Date
  (gen_random_uuid(), '7215f242-20bc-4aa2-8a48-b821edc6e1ed', 'c59c1ded-11e1-43b5-909c-0bacc34987db', 4, true,  false), -- End Date
  (gen_random_uuid(), '7215f242-20bc-4aa2-8a48-b821edc6e1ed', 'd9db049e-d34c-4d63-a2ae-89773b109336', 5, true,  false), -- Status
  (gen_random_uuid(), '7215f242-20bc-4aa2-8a48-b821edc6e1ed', '51d558bf-7109-4512-a428-d939bf6c72a0', 6, false, false), -- Owner
  (gen_random_uuid(), '7215f242-20bc-4aa2-8a48-b821edc6e1ed', 'a137afda-37f1-4cfb-a6a6-27f4465cefe0', 7, true,  false), -- Created On
  -- Active Campaigns
  (gen_random_uuid(), '7ab6387e-339a-4728-9be3-0ac18a15aeaf', 'd90a35cc-e40f-4367-a3ab-29ff074f6400', 1, true,  false),
  (gen_random_uuid(), '7ab6387e-339a-4728-9be3-0ac18a15aeaf', '79d25351-da35-46d6-85ad-1d1a6fd9f075', 2, true,  false),
  (gen_random_uuid(), '7ab6387e-339a-4728-9be3-0ac18a15aeaf', '8bd1956d-6350-42f1-8efd-e673a362d73b', 3, true,  false),
  (gen_random_uuid(), '7ab6387e-339a-4728-9be3-0ac18a15aeaf', 'c59c1ded-11e1-43b5-909c-0bacc34987db', 4, true,  false),
  (gen_random_uuid(), '7ab6387e-339a-4728-9be3-0ac18a15aeaf', 'd9db049e-d34c-4d63-a2ae-89773b109336', 5, true,  false),
  (gen_random_uuid(), '7ab6387e-339a-4728-9be3-0ac18a15aeaf', '51d558bf-7109-4512-a428-d939bf6c72a0', 6, false, false),
  (gen_random_uuid(), '7ab6387e-339a-4728-9be3-0ac18a15aeaf', 'a137afda-37f1-4cfb-a6a6-27f4465cefe0', 7, true,  false),
  -- Inactive Campaigns
  (gen_random_uuid(), 'bf4be55d-a839-4a3f-a226-e24ece97edf0', 'd90a35cc-e40f-4367-a3ab-29ff074f6400', 1, true,  false),
  (gen_random_uuid(), 'bf4be55d-a839-4a3f-a226-e24ece97edf0', '79d25351-da35-46d6-85ad-1d1a6fd9f075', 2, true,  false),
  (gen_random_uuid(), 'bf4be55d-a839-4a3f-a226-e24ece97edf0', '8bd1956d-6350-42f1-8efd-e673a362d73b', 3, true,  false),
  (gen_random_uuid(), 'bf4be55d-a839-4a3f-a226-e24ece97edf0', 'c59c1ded-11e1-43b5-909c-0bacc34987db', 4, true,  false),
  (gen_random_uuid(), 'bf4be55d-a839-4a3f-a226-e24ece97edf0', 'd9db049e-d34c-4d63-a2ae-89773b109336', 5, true,  false),
  (gen_random_uuid(), 'bf4be55d-a839-4a3f-a226-e24ece97edf0', '51d558bf-7109-4512-a428-d939bf6c72a0', 6, false, false),
  (gen_random_uuid(), 'bf4be55d-a839-4a3f-a226-e24ece97edf0', 'a137afda-37f1-4cfb-a6a6-27f4465cefe0', 7, true,  false),
  -- All Campaigns
  (gen_random_uuid(), 'fe06acf6-47c2-4b36-b99e-37d93aef8a59', 'd90a35cc-e40f-4367-a3ab-29ff074f6400', 1, true,  false),
  (gen_random_uuid(), 'fe06acf6-47c2-4b36-b99e-37d93aef8a59', '79d25351-da35-46d6-85ad-1d1a6fd9f075', 2, true,  false),
  (gen_random_uuid(), 'fe06acf6-47c2-4b36-b99e-37d93aef8a59', '8bd1956d-6350-42f1-8efd-e673a362d73b', 3, true,  false),
  (gen_random_uuid(), 'fe06acf6-47c2-4b36-b99e-37d93aef8a59', 'c59c1ded-11e1-43b5-909c-0bacc34987db', 4, true,  false),
  (gen_random_uuid(), 'fe06acf6-47c2-4b36-b99e-37d93aef8a59', 'd9db049e-d34c-4d63-a2ae-89773b109336', 5, true,  false),
  (gen_random_uuid(), 'fe06acf6-47c2-4b36-b99e-37d93aef8a59', '51d558bf-7109-4512-a428-d939bf6c72a0', 6, false, false),
  (gen_random_uuid(), 'fe06acf6-47c2-4b36-b99e-37d93aef8a59', 'a137afda-37f1-4cfb-a6a6-27f4465cefe0', 7, true,  false)
;
