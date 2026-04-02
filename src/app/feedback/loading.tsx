export default function FeedbackLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 w-16 bg-muted rounded" />
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-4 w-72 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="h-11 bg-muted rounded-xl" />
      <div className="h-32 bg-muted rounded-xl" />
      <div className="h-11 bg-muted rounded-xl" />
    </div>
  )
}
