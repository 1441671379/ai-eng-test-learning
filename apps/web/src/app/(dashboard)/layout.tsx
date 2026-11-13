
import { getRequestRuntime } from '@/lib/services/runtime'
import { LearningShell } from '@/components/ui/learning-shell'
import { getAppSession } from '@/lib/app-session'
import { Suspense } from 'react'
import { PracticeContinuity } from '@/components/learning/PracticeContinuity'
import { readPracticeSnapshot } from '@/lib/practice-continuity-store'
import type { PracticeSnapshot } from '@/lib/practice-continuity'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAppSession()
  const runtime = await getRequestRuntime()
  const isDesktop = runtime === 'desktop'
  let initial: PracticeSnapshot = {}, loadFailed = false
  try { if (session.user) initial = readPracticeSnapshot(session.user.id) } catch { loadFailed = true }

  return (
    <Suspense><PracticeContinuity key={session.user?.id || "anonymous"} initial={initial} loadFailed={loadFailed}><LearningShell desktop={isDesktop} displayName={session.user?.displayName || "Learner"}>{children}</LearningShell></PracticeContinuity></Suspense>
  )
}
