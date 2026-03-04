import Link from 'next/link'

export const metadata = { title: 'Terms of Service - Pokémon Draft League' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-3xl prose dark:prose-invert">
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: March 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using Pokémon Draft League (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>

        <h2>2. Description of Service</h2>
        <p>Pokémon Draft League is a free, fan-made platform for organizing competitive Pokémon draft leagues. The Service allows users to create draft rooms, pick Pokémon teams, and manage league schedules.</p>

        <h2>3. User Accounts</h2>
        <ul>
          <li>You may use the Service as a guest (no account required) or with an email-based account.</li>
          <li>Guest sessions use a locally-generated ID stored in your browser.</li>
          <li>You are responsible for keeping your login credentials secure.</li>
          <li>You must not create accounts for the purpose of abusing or disrupting the Service.</li>
        </ul>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any form of real-money gambling or wagering.</li>
          <li>Attempt to disrupt drafts, manipulate results, or harass other users.</li>
          <li>Use bots, scrapers, or automated tools against the Service without permission.</li>
          <li>Circumvent rate limits or security measures.</li>
        </ul>

        <h2>5. Intellectual Property</h2>
        <p>Pokémon, Pokémon character names, and related media are trademarks and copyrights of Nintendo, Game Freak, and The Pokémon Company. This Service is a non-commercial fan project and is not affiliated with, endorsed, or sponsored by these entities. Pokémon data and sprites are sourced from the community-maintained PokéAPI and Pokémon Showdown projects.</p>

        <h2>6. Content &amp; Data</h2>
        <ul>
          <li>Draft data (team names, picks, room codes) is stored on our servers to provide the Service.</li>
          <li>We do not claim ownership of any content you create through the Service.</li>
          <li>We may delete inactive draft data after 90 days.</li>
        </ul>

        <h2>7. Limitation of Liability</h2>
        <p>The Service is provided &quot;as is&quot; without warranties of any kind. We are not liable for any data loss, service interruptions, or damages arising from use of the Service. Draft results are not guaranteed to be preserved indefinitely.</p>

        <h2>8. Termination</h2>
        <p>We reserve the right to suspend or terminate access to the Service for users who violate these terms or abuse the platform. You may stop using the Service at any time.</p>

        <h2>9. Changes to Terms</h2>
        <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>

        <h2>10. Contact</h2>
        <p>For questions about these Terms, please open an issue on our GitHub repository.</p>

        <div className="mt-8 pt-4 border-t">
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          {' · '}
          <Link href="/" className="text-primary hover:underline">Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
