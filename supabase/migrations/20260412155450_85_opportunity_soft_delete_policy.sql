/*
  # Add Soft-Delete Policy for Opportunity, Contact, Lead, and Ticket

  ## Problem
  The general UPDATE policy on opportunity (and contact, lead, ticket) requires
  `can_write` privilege and `modified_by = auth.uid()` in WITH CHECK. This blocks
  soft-deletes because soft-delete is a delete operation (requires can_delete),
  not a write operation.

  The `account` table already has a separate soft-delete UPDATE policy with
  `WITH CHECK (true)` which works correctly. This migration adds the same pattern
  to opportunity, contact, lead, and ticket.

  ## Changes
  - Add a dedicated soft-delete UPDATE policy for `opportunity`
  - Add a dedicated soft-delete UPDATE policy for `contact`
  - Add a dedicated soft-delete UPDATE policy for `lead`
  - Add a dedicated soft-delete UPDATE policy for `ticket`

  Each policy:
  - Requires `can_delete` privilege
  - Requires the user owns the record OR is a system admin
  - Uses WITH CHECK (true) to allow the is_deleted=true transition
*/

-- OPPORTUNITY soft-delete policy
DROP POLICY IF EXISTS "Users with delete privilege can soft-delete opportunities" ON opportunity;
CREATE POLICY "Users with delete privilege can soft-delete opportunities"
  ON opportunity FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('opportunity', 'can_delete')
    AND public.crm_user_has_access('opportunity', opportunity_id, owner_type, owner_id)
  )
  WITH CHECK (true);

-- CONTACT soft-delete policy
DROP POLICY IF EXISTS "Users with delete privilege can soft-delete contacts" ON contact;
CREATE POLICY "Users with delete privilege can soft-delete contacts"
  ON contact FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('contact', 'can_delete')
    AND public.crm_user_has_access('contact', contact_id, owner_type, owner_id)
  )
  WITH CHECK (true);

-- LEAD soft-delete policy
DROP POLICY IF EXISTS "Users with delete privilege can soft-delete leads" ON lead;
CREATE POLICY "Users with delete privilege can soft-delete leads"
  ON lead FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('lead', 'can_delete')
    AND public.crm_user_has_access('lead', lead_id, owner_type, owner_id)
  )
  WITH CHECK (true);

-- TICKET soft-delete policy
DROP POLICY IF EXISTS "Users with delete privilege can soft-delete tickets" ON ticket;
CREATE POLICY "Users with delete privilege can soft-delete tickets"
  ON ticket FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('ticket', 'can_delete')
    AND public.crm_user_has_access('ticket', ticket_id, owner_type, owner_id)
  )
  WITH CHECK (true);
