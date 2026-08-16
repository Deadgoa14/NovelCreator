export function ProgressBar({ className }: { className?: string }) {
  return (
    <div className={`nc-progress-track h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700 ${className ?? ''}`}>
      <div className="nc-progress-bar" />
    </div>
  )
}
