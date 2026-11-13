
import { UiText } from "@/components/i18n/UiLocale";
import { DesktopSidebar } from '@/components/ui/desktop-sidebar'

/**
 * Wraps the (dashboard) route group.
 *
 * Electron: renders the full sidebar + scrollable content layout.
 * Web:      renders children as-is (no-op passthrough).
 */
export function DesktopShell({
  children,
  enabled,
  topBar,
}: {
  children: React.ReactNode
  enabled: boolean
  topBar?: React.ReactNode
}) {
  if (!enabled) return <>{topBar}{children}</>

  return (
    <div className="flex h-screen overflow-hidden bg-vanilla-cream">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <UiText text={topBar} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <UiText text={children} />
        </div>
      </div>
    </div>
  )
}
