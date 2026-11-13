import { localizedMetadata } from "@/lib/i18n/server";
// FILE: src/app/(auth)/reset-password/page.tsx
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getRequestRuntime } from "@/lib/services/runtime";

export async function generateMetadata() { return localizedMetadata({
  title: "Reset Password",
  description: "Set a new password for your English Learning account.",
  robots: { index: false, follow: false },
}); }

export default async function ResetPasswordPage() {
  const runtime = await getRequestRuntime();
  return <ResetPasswordForm runtime={runtime} />;
}
