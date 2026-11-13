import { localizedMetadata } from "@/lib/i18n/server";
// FILE: src/app/(auth)/login/page.tsx
import { AuthForm } from "@/components/auth/AuthForm";
import { getRequestRuntime } from "@/lib/services/runtime";

export async function generateMetadata() { return localizedMetadata({
  title: "Log In",
  description: "Log in to your English Learning account and continue your pronunciation practice.",
  robots: { index: false, follow: false },
}); }

export default async function LoginPage() {
  const runtime = await getRequestRuntime();
  return <AuthForm mode="login" runtime={runtime} />;
}
