import QueryProvider from "@/components/providers/QueryProvider"
import { ThemeProvider } from "@/components/providers/ThemeProvider"

export const metadata = {
  title: "Draft Broadcast - OBS",
  description: "Chrome-free broadcast view for OBS Browser Source",
}

export default function BroadcastLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="pokemon-draft-broadcast-theme">
      <QueryProvider>
        <div className="overflow-hidden">{children}</div>
      </QueryProvider>
    </ThemeProvider>
  )
}
