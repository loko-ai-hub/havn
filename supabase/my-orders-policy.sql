create policy "users can read own orders by email"
on document_orders
for select
to authenticated
using (requester_email = auth.jwt() ->> 'email');
