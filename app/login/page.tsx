import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      description="Authenticate to manage custody events and generate compliant labels."
    >
      <LoginForm />
    </AuthShell>
  );
}

