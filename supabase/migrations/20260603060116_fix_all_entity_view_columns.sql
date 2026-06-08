/*
  # Fix view columns for all entities with insufficient columns

  ## Summary
  Several entities had views with 0–2 columns instead of the proper multi-column layout.
  This migration rebuilds view_column rows for:
    - account (Active Accounts view had only 1 column)
    - contact (Active/All Contacts had only 2 columns)
    - event (Active Events had only 1 column)
    - product (all 3 views had 0 columns)
    - product_family (Active had 1, All/Inactive had 0 columns)
    - crm_user (all 3 views had only 3 columns — missing full name, job title, phone)

  ## Changes
  Each entity's public views get a consistent, rich column set matching the quality
  of the Accounts list (name, key fields, status, owner, created on).
*/

-- ============================================================
-- ACCOUNT: Fix Active Accounts (only had 1 col — name)
-- All Accounts & Inactive Accounts already have 5 cols, sync them all
-- ============================================================
DELETE FROM view_column WHERE view_id IN (
  'a7477a46-45b2-4552-8b32-db818d4cac09', -- Active Accounts
  'dbdeff97-ae1f-4002-9e34-8ed216e36dd5', -- All Accounts
  'da229dd4-4239-402e-bc17-b877987e0ec7'  -- Inactive Accounts
);

INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Active Accounts
  ('a7477a46-45b2-4552-8b32-db818d4cac09', '366dccd7-f807-4622-8e1b-4c1bb89ec373', 0, true, false),  -- Account Name
  ('a7477a46-45b2-4552-8b32-db818d4cac09', '0eac8214-e657-4251-9195-5c2627b10863', 1, false, false), -- Phone
  ('a7477a46-45b2-4552-8b32-db818d4cac09', '85bf8b2c-6844-4ed6-ab06-399e3fefe62d', 2, true, false),  -- City
  ('a7477a46-45b2-4552-8b32-db818d4cac09', '5e589516-c17c-45a5-b6d6-6136422c4d7b', 3, true, false),  -- Status
  ('a7477a46-45b2-4552-8b32-db818d4cac09', 'e8178944-59ef-4e01-abcc-efb17a257875', 4, true, false),  -- Owner
  ('a7477a46-45b2-4552-8b32-db818d4cac09', 'a4762974-93e8-4ec2-b8ef-cd27b8041145', 5, true, false),  -- Created On
  -- All Accounts
  ('dbdeff97-ae1f-4002-9e34-8ed216e36dd5', '366dccd7-f807-4622-8e1b-4c1bb89ec373', 0, true, false),
  ('dbdeff97-ae1f-4002-9e34-8ed216e36dd5', '0eac8214-e657-4251-9195-5c2627b10863', 1, false, false),
  ('dbdeff97-ae1f-4002-9e34-8ed216e36dd5', '85bf8b2c-6844-4ed6-ab06-399e3fefe62d', 2, true, false),
  ('dbdeff97-ae1f-4002-9e34-8ed216e36dd5', '5e589516-c17c-45a5-b6d6-6136422c4d7b', 3, true, false),
  ('dbdeff97-ae1f-4002-9e34-8ed216e36dd5', 'e8178944-59ef-4e01-abcc-efb17a257875', 4, true, false),
  ('dbdeff97-ae1f-4002-9e34-8ed216e36dd5', 'a4762974-93e8-4ec2-b8ef-cd27b8041145', 5, true, false),
  -- Inactive Accounts
  ('da229dd4-4239-402e-bc17-b877987e0ec7', '366dccd7-f807-4622-8e1b-4c1bb89ec373', 0, true, false),
  ('da229dd4-4239-402e-bc17-b877987e0ec7', '0eac8214-e657-4251-9195-5c2627b10863', 1, false, false),
  ('da229dd4-4239-402e-bc17-b877987e0ec7', '85bf8b2c-6844-4ed6-ab06-399e3fefe62d', 2, true, false),
  ('da229dd4-4239-402e-bc17-b877987e0ec7', '5e589516-c17c-45a5-b6d6-6136422c4d7b', 3, true, false),
  ('da229dd4-4239-402e-bc17-b877987e0ec7', 'e8178944-59ef-4e01-abcc-efb17a257875', 4, true, false),
  ('da229dd4-4239-402e-bc17-b877987e0ec7', 'a4762974-93e8-4ec2-b8ef-cd27b8041145', 5, true, false);

-- ============================================================
-- CONTACT: Fix Active Contacts and All Contacts (only had 2 cols)
-- Columns: Full Name (last+first), Account, Email, Phone, Status, Owner, Created On
-- ============================================================
DELETE FROM view_column WHERE view_id IN (
  'a6817ffd-962f-41ed-ae53-4337c00e847b', -- Active Contacts
  '033ec41c-2591-4bc2-8386-2d2bef33f373', -- All Contacts
  '5ee4e0f6-546d-4572-8d8c-fec3aed6745b'  -- Inactive Contacts
);

INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Active Contacts
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', '1faf0d99-62c7-4ed6-a061-05bb1905610b', 0, true, false),  -- Last Name
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', '6ea1a4e1-99a3-484a-959c-e087719755d7', 1, true, false),  -- First Name
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', '272bb636-0f60-4db8-a651-688c70f3c9cc', 2, true, false),  -- Account
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', 'eaec5e2e-27a8-435c-b958-e120a2d78f14', 3, true, false),  -- Email
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', 'aa5167b0-19f1-4452-ab3c-b32583ad0dbb', 4, false, false), -- Business Phone
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', 'f1448c24-f18f-4256-8f3b-3c931341aa28', 5, true, false),  -- Job Title
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', 'bb581980-3bf1-4441-bbf1-d7ad556c387f', 6, true, false),  -- Status
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', 'c641f0df-b17a-474f-bc86-1e2ec549ddd9', 7, true, false),  -- Owner
  ('a6817ffd-962f-41ed-ae53-4337c00e847b', 'dd44d9c5-bc5b-4fc5-aa07-1eb582d48cdb', 8, true, false),  -- Created On
  -- All Contacts
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', '1faf0d99-62c7-4ed6-a061-05bb1905610b', 0, true, false),
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', '6ea1a4e1-99a3-484a-959c-e087719755d7', 1, true, false),
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', '272bb636-0f60-4db8-a651-688c70f3c9cc', 2, true, false),
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', 'eaec5e2e-27a8-435c-b958-e120a2d78f14', 3, true, false),
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', 'aa5167b0-19f1-4452-ab3c-b32583ad0dbb', 4, false, false),
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', 'f1448c24-f18f-4256-8f3b-3c931341aa28', 5, true, false),
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', 'bb581980-3bf1-4441-bbf1-d7ad556c387f', 6, true, false),
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', 'c641f0df-b17a-474f-bc86-1e2ec549ddd9', 7, true, false),
  ('033ec41c-2591-4bc2-8386-2d2bef33f373', 'dd44d9c5-bc5b-4fc5-aa07-1eb582d48cdb', 8, true, false),
  -- Inactive Contacts
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', '1faf0d99-62c7-4ed6-a061-05bb1905610b', 0, true, false),
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', '6ea1a4e1-99a3-484a-959c-e087719755d7', 1, true, false),
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', '272bb636-0f60-4db8-a651-688c70f3c9cc', 2, true, false),
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', 'eaec5e2e-27a8-435c-b958-e120a2d78f14', 3, true, false),
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', 'aa5167b0-19f1-4452-ab3c-b32583ad0dbb', 4, false, false),
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', 'f1448c24-f18f-4256-8f3b-3c931341aa28', 5, true, false),
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', 'bb581980-3bf1-4441-bbf1-d7ad556c387f', 6, true, false),
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', 'c641f0df-b17a-474f-bc86-1e2ec549ddd9', 7, true, false),
  ('5ee4e0f6-546d-4572-8d8c-fec3aed6745b', 'dd44d9c5-bc5b-4fc5-aa07-1eb582d48cdb', 8, true, false);

-- ============================================================
-- EVENT: Fix Active Events (only had 1 col)
-- Columns: Event Name, Type, Start Date, End Date, Location, Status, Owner, Created On
-- ============================================================
DELETE FROM view_column WHERE view_id IN (
  '545f3815-484d-47cd-9213-fc3108bf7f84', -- Active Events
  '2dc2c30e-699a-4387-8599-695ef5832a76', -- All Events
  '1e2e6c37-b673-4009-8779-6bcbf94cce2f'  -- Inactive Events
);

INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Active Events
  ('545f3815-484d-47cd-9213-fc3108bf7f84', '16b10a8b-b02a-4700-a5b8-818578018ace', 0, true, false),  -- Event Name
  ('545f3815-484d-47cd-9213-fc3108bf7f84', 'ffc98c0b-af6d-4cc3-8a70-a6fa69212a01', 1, true, false),  -- Type
  ('545f3815-484d-47cd-9213-fc3108bf7f84', 'a5df0c4a-9ebe-4076-8395-48f58a14d7fa', 2, true, false),  -- Start Date/Time
  ('545f3815-484d-47cd-9213-fc3108bf7f84', '386125c8-ab56-40d7-b512-699fa86753a5', 3, true, false),  -- End Date/Time
  ('545f3815-484d-47cd-9213-fc3108bf7f84', '403285b4-2102-4ef6-ab11-9516e5145ba1', 4, true, false),  -- Location
  ('545f3815-484d-47cd-9213-fc3108bf7f84', '9d53131a-ecec-4e29-a08f-dbbeefec72db', 5, true, false),  -- Status
  ('545f3815-484d-47cd-9213-fc3108bf7f84', '16527436-a1f7-4ea9-a367-6f0e047f9f8b', 6, true, false),  -- Owner
  ('545f3815-484d-47cd-9213-fc3108bf7f84', '95c9cdc7-6208-4f24-ac27-a645f53f77bc', 7, true, false),  -- Created On
  -- All Events
  ('2dc2c30e-699a-4387-8599-695ef5832a76', '16b10a8b-b02a-4700-a5b8-818578018ace', 0, true, false),
  ('2dc2c30e-699a-4387-8599-695ef5832a76', 'ffc98c0b-af6d-4cc3-8a70-a6fa69212a01', 1, true, false),
  ('2dc2c30e-699a-4387-8599-695ef5832a76', 'a5df0c4a-9ebe-4076-8395-48f58a14d7fa', 2, true, false),
  ('2dc2c30e-699a-4387-8599-695ef5832a76', '386125c8-ab56-40d7-b512-699fa86753a5', 3, true, false),
  ('2dc2c30e-699a-4387-8599-695ef5832a76', '403285b4-2102-4ef6-ab11-9516e5145ba1', 4, true, false),
  ('2dc2c30e-699a-4387-8599-695ef5832a76', '9d53131a-ecec-4e29-a08f-dbbeefec72db', 5, true, false),
  ('2dc2c30e-699a-4387-8599-695ef5832a76', '16527436-a1f7-4ea9-a367-6f0e047f9f8b', 6, true, false),
  ('2dc2c30e-699a-4387-8599-695ef5832a76', '95c9cdc7-6208-4f24-ac27-a645f53f77bc', 7, true, false),
  -- Inactive Events
  ('1e2e6c37-b673-4009-8779-6bcbf94cce2f', '16b10a8b-b02a-4700-a5b8-818578018ace', 0, true, false),
  ('1e2e6c37-b673-4009-8779-6bcbf94cce2f', 'ffc98c0b-af6d-4cc3-8a70-a6fa69212a01', 1, true, false),
  ('1e2e6c37-b673-4009-8779-6bcbf94cce2f', 'a5df0c4a-9ebe-4076-8395-48f58a14d7fa', 2, true, false),
  ('1e2e6c37-b673-4009-8779-6bcbf94cce2f', '386125c8-ab56-40d7-b512-699fa86753a5', 3, true, false),
  ('1e2e6c37-b673-4009-8779-6bcbf94cce2f', '403285b4-2102-4ef6-ab11-9516e5145ba1', 4, true, false),
  ('1e2e6c37-b673-4009-8779-6bcbf94cce2f', '9d53131a-ecec-4e29-a08f-dbbeefec72db', 5, true, false),
  ('1e2e6c37-b673-4009-8779-6bcbf94cce2f', '16527436-a1f7-4ea9-a367-6f0e047f9f8b', 6, true, false),
  ('1e2e6c37-b673-4009-8779-6bcbf94cce2f', '95c9cdc7-6208-4f24-ac27-a645f53f77bc', 7, true, false);

-- ============================================================
-- PRODUCT: Fix all 3 views (had 0 columns each)
-- Columns: Name, Product Code, Product Family, Description, Status, Created On
-- ============================================================
DELETE FROM view_column WHERE view_id IN (
  'b801c491-acdb-4951-88c8-d2a4af1a1b1c', -- Active Products
  '2fea99dc-e2e6-4dab-99c1-679750241661', -- All Products
  'bc297048-8274-45f2-8e17-69950595ff8f'  -- Inactive Products
);

INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Active Products
  ('b801c491-acdb-4951-88c8-d2a4af1a1b1c', '21628af9-35c2-4f7c-919b-bfccf9895730', 0, true, false),  -- Name
  ('b801c491-acdb-4951-88c8-d2a4af1a1b1c', 'bea8d36e-6d5d-4999-93f5-eb6b40641b98', 1, true, false),  -- Product Code
  ('b801c491-acdb-4951-88c8-d2a4af1a1b1c', '61f675a0-c08b-4ea6-8caa-d4ded2a9416c', 2, true, false),  -- Product Family
  ('b801c491-acdb-4951-88c8-d2a4af1a1b1c', 'bdab84ca-ccbd-48dc-8667-566ebaa78581', 3, false, false), -- Description
  ('b801c491-acdb-4951-88c8-d2a4af1a1b1c', '5b3cbc36-33ef-4c85-b25c-9763a91e3863', 4, true, false),  -- Status
  ('b801c491-acdb-4951-88c8-d2a4af1a1b1c', '1a85ba1b-eea6-41da-a1f0-6d7388ba8824', 5, true, false),  -- Created On
  -- All Products
  ('2fea99dc-e2e6-4dab-99c1-679750241661', '21628af9-35c2-4f7c-919b-bfccf9895730', 0, true, false),
  ('2fea99dc-e2e6-4dab-99c1-679750241661', 'bea8d36e-6d5d-4999-93f5-eb6b40641b98', 1, true, false),
  ('2fea99dc-e2e6-4dab-99c1-679750241661', '61f675a0-c08b-4ea6-8caa-d4ded2a9416c', 2, true, false),
  ('2fea99dc-e2e6-4dab-99c1-679750241661', 'bdab84ca-ccbd-48dc-8667-566ebaa78581', 3, false, false),
  ('2fea99dc-e2e6-4dab-99c1-679750241661', '5b3cbc36-33ef-4c85-b25c-9763a91e3863', 4, true, false),
  ('2fea99dc-e2e6-4dab-99c1-679750241661', '1a85ba1b-eea6-41da-a1f0-6d7388ba8824', 5, true, false),
  -- Inactive Products
  ('bc297048-8274-45f2-8e17-69950595ff8f', '21628af9-35c2-4f7c-919b-bfccf9895730', 0, true, false),
  ('bc297048-8274-45f2-8e17-69950595ff8f', 'bea8d36e-6d5d-4999-93f5-eb6b40641b98', 1, true, false),
  ('bc297048-8274-45f2-8e17-69950595ff8f', '61f675a0-c08b-4ea6-8caa-d4ded2a9416c', 2, true, false),
  ('bc297048-8274-45f2-8e17-69950595ff8f', 'bdab84ca-ccbd-48dc-8667-566ebaa78581', 3, false, false),
  ('bc297048-8274-45f2-8e17-69950595ff8f', '5b3cbc36-33ef-4c85-b25c-9763a91e3863', 4, true, false),
  ('bc297048-8274-45f2-8e17-69950595ff8f', '1a85ba1b-eea6-41da-a1f0-6d7388ba8824', 5, true, false);

-- ============================================================
-- PRODUCT FAMILY: Fix all 3 views (0–1 columns)
-- Columns: Name, Code, Description, Status, Created On
-- ============================================================
DELETE FROM view_column WHERE view_id IN (
  'ebc0a4e6-d89d-41fa-849e-757d76cbe017', -- Active Product Families
  '2853bb5b-311a-4327-8447-97c8b4c1ddda', -- All Product Families
  'cda04cfb-bde1-4509-af43-0decf474f521'  -- Inactive Product Families
);

INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Active Product Families
  ('ebc0a4e6-d89d-41fa-849e-757d76cbe017', 'a0bb503f-c380-44f5-8bd6-b64f058d3809', 0, true, false),  -- Name
  ('ebc0a4e6-d89d-41fa-849e-757d76cbe017', '894de44c-99b0-483c-a241-6749c3d2afa2', 1, true, false),  -- Code
  ('ebc0a4e6-d89d-41fa-849e-757d76cbe017', '3e5c3f23-0e3d-47ad-a622-5da634385a07', 2, false, false), -- Description
  ('ebc0a4e6-d89d-41fa-849e-757d76cbe017', 'ccbe1220-fef7-4409-a66f-bdc6cb9b42ae', 3, true, false),  -- Status
  ('ebc0a4e6-d89d-41fa-849e-757d76cbe017', '97b3ffdb-0b62-47ee-9280-ff4ae0df9284', 4, true, false),  -- Created On
  -- All Product Families
  ('2853bb5b-311a-4327-8447-97c8b4c1ddda', 'a0bb503f-c380-44f5-8bd6-b64f058d3809', 0, true, false),
  ('2853bb5b-311a-4327-8447-97c8b4c1ddda', '894de44c-99b0-483c-a241-6749c3d2afa2', 1, true, false),
  ('2853bb5b-311a-4327-8447-97c8b4c1ddda', '3e5c3f23-0e3d-47ad-a622-5da634385a07', 2, false, false),
  ('2853bb5b-311a-4327-8447-97c8b4c1ddda', 'ccbe1220-fef7-4409-a66f-bdc6cb9b42ae', 3, true, false),
  ('2853bb5b-311a-4327-8447-97c8b4c1ddda', '97b3ffdb-0b62-47ee-9280-ff4ae0df9284', 4, true, false),
  -- Inactive Product Families
  ('cda04cfb-bde1-4509-af43-0decf474f521', 'a0bb503f-c380-44f5-8bd6-b64f058d3809', 0, true, false),
  ('cda04cfb-bde1-4509-af43-0decf474f521', '894de44c-99b0-483c-a241-6749c3d2afa2', 1, true, false),
  ('cda04cfb-bde1-4509-af43-0decf474f521', '3e5c3f23-0e3d-47ad-a622-5da634385a07', 2, false, false),
  ('cda04cfb-bde1-4509-af43-0decf474f521', 'ccbe1220-fef7-4409-a66f-bdc6cb9b42ae', 3, true, false),
  ('cda04cfb-bde1-4509-af43-0decf474f521', '97b3ffdb-0b62-47ee-9280-ff4ae0df9284', 4, true, false);

-- ============================================================
-- CRM USER: Enrich all 3 views (had only 3 columns — missing key fields)
-- Columns: Full Name (first+last), Email, Job Title, Phone, Status, Created On
-- ============================================================
DELETE FROM view_column WHERE view_id IN (
  'cc159071-94b2-4749-952e-98711e737dc3', -- Active Users
  '02ff1380-a2fb-4a83-b0bb-4d273265be9d', -- All Users
  '14dec88c-bc3a-45df-9fd1-0d63ccb4e142'  -- Inactive Users
);

INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
VALUES
  -- Active Users
  ('cc159071-94b2-4749-952e-98711e737dc3', '7bdcfd3c-8834-441b-8498-7f09476daf12', 0, true, false),  -- First Name
  ('cc159071-94b2-4749-952e-98711e737dc3', '9a04e6ea-9f97-4847-86d5-10d28eae1868', 1, true, false),  -- Last Name
  ('cc159071-94b2-4749-952e-98711e737dc3', '40d02acf-47a6-4457-9692-02a45321d6c2', 2, true, false),  -- Email
  ('cc159071-94b2-4749-952e-98711e737dc3', 'fc9e41c5-0099-4de9-8a8b-c0e533e6a9d9', 3, true, false),  -- Job Title
  ('cc159071-94b2-4749-952e-98711e737dc3', '8775e5eb-8b26-4c64-89a9-8ce861e1740e', 4, false, false), -- Phone
  ('cc159071-94b2-4749-952e-98711e737dc3', '4d323283-0ce2-4af7-957b-fd02abbe54a3', 5, true, false),  -- Status
  ('cc159071-94b2-4749-952e-98711e737dc3', '521ebe37-d49f-4a4c-b732-2b28e7375a8e', 6, true, false),  -- Created On
  -- All Users
  ('02ff1380-a2fb-4a83-b0bb-4d273265be9d', '7bdcfd3c-8834-441b-8498-7f09476daf12', 0, true, false),
  ('02ff1380-a2fb-4a83-b0bb-4d273265be9d', '9a04e6ea-9f97-4847-86d5-10d28eae1868', 1, true, false),
  ('02ff1380-a2fb-4a83-b0bb-4d273265be9d', '40d02acf-47a6-4457-9692-02a45321d6c2', 2, true, false),
  ('02ff1380-a2fb-4a83-b0bb-4d273265be9d', 'fc9e41c5-0099-4de9-8a8b-c0e533e6a9d9', 3, true, false),
  ('02ff1380-a2fb-4a83-b0bb-4d273265be9d', '8775e5eb-8b26-4c64-89a9-8ce861e1740e', 4, false, false),
  ('02ff1380-a2fb-4a83-b0bb-4d273265be9d', '4d323283-0ce2-4af7-957b-fd02abbe54a3', 5, true, false),
  ('02ff1380-a2fb-4a83-b0bb-4d273265be9d', '521ebe37-d49f-4a4c-b732-2b28e7375a8e', 6, true, false),
  -- Inactive Users
  ('14dec88c-bc3a-45df-9fd1-0d63ccb4e142', '7bdcfd3c-8834-441b-8498-7f09476daf12', 0, true, false),
  ('14dec88c-bc3a-45df-9fd1-0d63ccb4e142', '9a04e6ea-9f97-4847-86d5-10d28eae1868', 1, true, false),
  ('14dec88c-bc3a-45df-9fd1-0d63ccb4e142', '40d02acf-47a6-4457-9692-02a45321d6c2', 2, true, false),
  ('14dec88c-bc3a-45df-9fd1-0d63ccb4e142', 'fc9e41c5-0099-4de9-8a8b-c0e533e6a9d9', 3, true, false),
  ('14dec88c-bc3a-45df-9fd1-0d63ccb4e142', '8775e5eb-8b26-4c64-89a9-8ce861e1740e', 4, false, false),
  ('14dec88c-bc3a-45df-9fd1-0d63ccb4e142', '4d323283-0ce2-4af7-957b-fd02abbe54a3', 5, true, false),
  ('14dec88c-bc3a-45df-9fd1-0d63ccb4e142', '521ebe37-d49f-4a4c-b732-2b28e7375a8e', 6, true, false);
