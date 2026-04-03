import Link from 'next/link'

// PERF-03: ISR — static content revalidates every 24 hours
export const revalidate = 86400

export const metadata = { title: 'Privacy Policy - Pokémon Draft League' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-3xl prose dark:prose-invert">
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: March 2026</p>

        <h2>1. Data We Collect</h2>
        <h3>Account Data</h3>
        <ul>
          <li><strong>Email &amp; password</strong> (if you create an account) — stored securely via Supabase Auth with bcrypt hashing.</li>
          <li><strong>Display name</strong> — chosen by you, visible to other draft participants.</li>
        </ul>

        <h3>Guest Sessions</h3>
        <ul>
          <li>A locally-generated guest ID (e.g. <code>guest-timestamp-random</code>) stored in your browser&apos;s localStorage.</li>
          <li>No personal information is collected for guest users.</li>
        </ul>

        <h3>Draft &amp; League Data</h3>
        <ul>
          <li>Draft rooms, team names, Pokémon picks, bid history, wishlist items, match results.</li>
          <li>Room codes and participation records linking you to drafts.</li>
        </ul>

        <h3>Technical Data</h3>
        <ul>
          <li><strong>Error reports</strong> — sent to Sentry for debugging (includes stack traces, browser info, URL). No personal data is intentionally included.</li>
          <li><strong>Connection timestamps</strong> — <code>last_seen</code> used for online/offline status during drafts.</li>
        </ul>

        <h2>2. How We Use Your Data</h2>
        <ul>
          <li>To provide the drafting and league management service.</li>
          <li>To show real-time draft state to all participants.</li>
          <li>To track error reports and improve the Service.</li>
        </ul>

        <h2>3. Data Storage</h2>
        <p>All data is stored in Supabase (PostgreSQL) with Row Level Security policies. Data is hosted in Supabase&apos;s cloud infrastructure. We do not sell, share, or rent your data to third parties.</p>

        <h2>4. Cookies &amp; Local Storage</h2>
        <p>We use browser localStorage for:</p>
        <ul>
          <li>Theme preference (<code>pokemon-draft-theme</code>)</li>
          <li>Guest user session ID</li>
          <li>Draft participation records</li>
          <li>Image display preference</li>
        </ul>
        <p>We do not use advertising or third-party tracking cookies.</p>

        <h2>5. Third-Party Services</h2>
        <ul>
          <li><strong>Supabase</strong> — database, authentication, and real-time features.</li>
          <li><strong>Sentry</strong> — error tracking and monitoring.</li>
          <li><strong>PokéAPI / Pokémon Showdown</strong> — Pokémon data and sprite images (no user data sent).</li>
          <li><strong>Vercel</strong> — hosting and deployment.</li>
        </ul>

        <h2>6. Data Retention</h2>
        <ul>
          <li>Active draft and league data is retained as long as the draft/league exists.</li>
          <li>Inactive draft data may be deleted after 90 days.</li>
          <li>Account data is retained until you delete your account.</li>
        </ul>

        <h2>7. Your Rights (GDPR)</h2>
        <p>You have the right to:</p>
        <ul>
          <li><strong>Access</strong> your data — visit <Link href="/settings" className="text-primary hover:underline">Settings</Link> to download your data.</li>
          <li><strong>Delete</strong> your account and associated data by contacting us.</li>
          <li><strong>Export</strong> your data in JSON format via the Settings page.</li>
        </ul>

        <h2>8. Children&apos;s Privacy</h2>
        <p>The Service is not directed at children under 13. We do not knowingly collect data from children under 13.</p>

        <h2>9. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Changes will be reflected by updating the date at the top of this page.</p>

        <h2>10. Contact</h2>
        <p>For privacy-related questions, please open an issue on our GitHub repository.</p>

        <div className="mt-8 pt-4 border-t">
          <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
          {' · '}
          <Link href="/" className="text-primary hover:underline">Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
