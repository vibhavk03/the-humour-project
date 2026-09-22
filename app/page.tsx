import { createClient } from '@/app/supabase/server'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: customers, error } = await supabase
    .from('customers')
    .select('*')
  
  if(error) {
    console.error(error)
    return <p>Error loading customers: {error.message}</p>
  }

  if (!customers?.length) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center">
        <p>
          Connected to Supabase, but no customers are visible to this app.
          Check Row Level Security policies or confirm your env vars point to
          the same Supabase project.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="border-b border-zinc-200 px-4 py-3 font-semibold">Index</th>
              <th className="border-b border-zinc-200 px-4 py-3 font-semibold">Customer ID</th>
              <th className="border-b border-zinc-200 px-4 py-3 font-semibold">First Name</th>
              <th className="border-b border-zinc-200 px-4 py-3 font-semibold">Last Name</th>
              <th className="border-b border-zinc-200 px-4 py-3 font-semibold">Company</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-900">
            {customers.map((customer) => (
              <tr
                key={customer['Customer Id'] ?? customer.Index}
                className="transition-colors hover:bg-zinc-50"
              >
                <td className="px-4 py-3">{customer.Index}</td>
                <td className="px-4 py-3 font-mono text-xs">{customer['Customer Id']}</td>
                <td className="px-4 py-3">{customer['First Name']}</td>
                <td className="px-4 py-3">{customer['Last Name']}</td>
                <td className="px-4 py-3">{customer.Company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
