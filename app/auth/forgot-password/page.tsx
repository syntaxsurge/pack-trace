import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function Page() {
  return (
    <AuthShell
      title="Reset access"
      description="We will email a secure link so you can set a new password."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
