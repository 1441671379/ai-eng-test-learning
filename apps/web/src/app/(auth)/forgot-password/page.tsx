import { localizedMetadata } from "@/lib/i18n/server";
// FILE: src/app/(auth)/forgot-password/page.tsx
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getRequestRuntime } from "@/lib/services/runtime";

export async function generateMetadata() { return localizedMetadata({
  title: "Forgot Password",
  description: "Reset your English Learning password and get back to your practice.",
  robots: { index: false, follow: false },
}); }

export default async function ForgotPasswordPage() {
  const runtime = await getRequestRuntime();
  return <ForgotPasswordForm runtime={runtime} />;
}
