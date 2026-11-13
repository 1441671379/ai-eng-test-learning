import { localizedMetadata } from "@/lib/i18n/server";
// FILE: src/app/(auth)/signup/page.tsx
import { AuthForm } from "@/components/auth/AuthForm";
import { getRequestRuntime } from "@/lib/services/runtime";

export async function generateMetadata() { return localizedMetadata({
  title: "Create an Account",
  description: "Sign up for English Learning and start building a real pronunciation practice habit.",
  robots: { index: false, follow: false },
}); }

export default async function SignupPage() {
  const runtime = await getRequestRuntime();
  return <AuthForm mode="signup" runtime={runtime} />;
}
