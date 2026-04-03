import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for Pokémon Champions Draft League — what data we collect, how we use it, and what happens when you clear your browser storage.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-3xl prose dark:prose-invert">
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: April 2026</p>

        <h2>1. Data We Collect</h2>

        <h3>Account Data (Signed-In Users)</h3>
        <ul>
          <li><strong>Authentication</strong> — if you sign in via Twitch, Discord, or Google, we receive your display name and email from those providers. Authentication is handled by Clerk; we do not store your passwords.</li>
          <li><strong>Display name</strong> — visible to other draft participants.</li>
        </ul>

        <h3>Guest Sessions</h3>
        <ul>
          <li>A locally-generated guest ID (e.g. <code>guest-timestamp-random</code>) stored in your browser&apos;s localStorage.</li>
          <li>No personal information is collected for guest users.</li>
        </ul>

        <h3>Draft &amp; League Data</h3>
        <ul>
          <li>Draft rooms, team names, Pokémon picks, bid history, wishlist items, match results, and trade records.</li>
          <li>Room codes and participation records linking you to drafts.</li>
        </ul>

        <h3>Analytics</h3>
        <ul>
          <li><strong>Vercel Analytics</strong> — collects anonymous page view data (pages visited, referrer, country). No cookies are used and no personally identifiable information is collected.</li>
          <li><strong>PostHog</strong> — anonymous product analytics (feature usage, session flow). No personally identifiable information is collected.</li>
        </ul>

        <h3>Error Tracking</h3>
        <ul>
          <li><strong>Sentry</strong> — error reports for debugging (includes stack traces, browser info, URL). No personal data is intentionally included.</li>
          <li><strong>Connection timestamps</strong> — <code>last_seen</code> used for online/offline status during drafts.</li>
        </ul>

        <h2>2. How We Use Your Data</h2>
        <ul>
          <li>To provide the drafting and league management service.</li>
          <li>To show real-time draft state to all participants.</li>
          <li>To understand overall usage patterns and improve the app.</li>
          <li>To track errors and improve reliability.</li>
        </ul>
        <p>We do not sell, share, or transfer your data to third parties.</p>

        <h2>3. Data Storage</h2>
        <p>Server-side data (drafts, leagues, picks, teams) is stored in Supabase (PostgreSQL) with Row Level Security policies. Data is hosted on Supabase&apos;s cloud infrastructure.</p>

        <h2>4. Cookies &amp; Local Storage</h2>
        <p>We use browser localStorage to store preferences and session data locally on your device. This data never leaves your device unless you participate in a draft (which syncs picks to the server).</p>
        <p><strong>What is stored in localStorage:</strong></p>
        <ul>
          <li>Guest user session ID and draft participation records</li>
          <li>Theme preference, sound settings, image display preference</li>
          <li>Custom draft templates you create</li>
          <li>Pokémon data cache (for faster loading)</li>
          <li>Onboarding tour completion state</li>
        </ul>
        <p>We do not use advertising or third-party tracking cookies.</p>

        <h2>5. What Happens If You Clear Your Browser Data</h2>
        <p>This is an important distinction depending on how you use the app:</p>

        <h3>Signed-In Users (Twitch, Discord, or Google)</h3>
        <p>All your draft and league data is stored server-side and tied to your account. Clearing your browser data (cookies, localStorage, cache) will sign you out, but <strong>no data is lost</strong>. Simply sign back in to restore full access to all your drafts, leagues, and teams.</p>

        <h3>Guest Users (No Account)</h3>
        <p>If you are using the app as a guest (without signing in), clearing your browser data <strong>will cause you to lose access</strong> to any drafts or teams you participated in. Here&apos;s why:</p>
        <ul>
          <li>Your guest identity is a randomly generated ID stored only in your browser&apos;s localStorage.</li>
          <li>The draft and team data still exists on our servers, but without your guest ID, we cannot reconnect you to it.</li>
          <li>There is no way to recover a lost guest session.</li>
        </ul>
        <p><strong>We strongly recommend creating a free account</strong> (via Twitch, Discord, or Google) if you want your data to persist across browser clears, device changes, or private/incognito sessions.</p>

        <h3>For All Users</h3>
        <p>Clearing localStorage will also reset:</p>
        <ul>
          <li>Theme and sound preferences (reset to defaults)</li>
          <li>Custom draft templates you saved locally</li>
          <li>Pokémon data cache (will re-download on next visit)</li>
        </ul>

        <h2>6. Third-Party Services</h2>
        <ul>
          <li><strong>Clerk</strong> — authentication via Twitch, Discord, and Google OAuth. <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a></li>
          <li><strong>Supabase</strong> — database and real-time features. <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a></li>
          <li><strong>Vercel</strong> — hosting, deployment, and analytics. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy policy</a></li>
          <li><strong>Sentry</strong> — error tracking and monitoring. <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">Privacy policy</a></li>
          <li><strong>PostHog</strong> — anonymous product analytics. <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a></li>
          <li><strong>PokéAPI / Pokémon Showdown</strong> — Pokémon data and sprite images (no user data is sent to these services).</li>
        </ul>

        <h2>7. Data Retention</h2>
        <ul>
          <li>Active draft and league data is retained as long as the draft/league exists.</li>
          <li>Inactive draft data may be deleted after 90 days.</li>
          <li>Account data is retained until you delete your account.</li>
          <li>Analytics data is retained according to each provider&apos;s data retention policy.</li>
        </ul>

        <h2>8. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li><strong>Access</strong> your data — visit <Link href="/settings" className="text-primary hover:underline">Settings</Link> to view your data.</li>
          <li><strong>Delete</strong> your account and associated data by contacting us.</li>
          <li><strong>Clear local data</strong> at any time by clearing your browser storage.</li>
        </ul>

        <h2>9. Children&apos;s Privacy</h2>
        <p>The Service is not directed at children under 13. We do not knowingly collect data from children under 13.</p>

        <h2>10. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Changes will be reflected by updating the date at the top of this page.</p>

        <h2>11. Contact</h2>
        <p>For privacy-related questions, please open an issue on our GitHub repository.</p>

        <div className="mt-8 pt-4 border-t border-border/50 space-y-4">
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            Pokémon, Pokémon character names, and all related trademarks are the property of Nintendo, Game Freak, and The Pokémon Company. This application is a fan-made community tool and is not affiliated with, endorsed by, or sponsored by Nintendo, Game Freak, or The Pokémon Company. All Pokémon imagery and data is sourced from publicly available community resources (PokéAPI, Pokémon Showdown).
          </p>
          <div>
            <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
            {' · '}
            <Link href="/" className="text-primary hover:underline">Back to Home</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
