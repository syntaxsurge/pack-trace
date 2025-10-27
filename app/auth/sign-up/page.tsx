import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/sign-up-form";

export default function Page() {
  return (
    <AuthShell
      title="Invite a teammate"
      description="Provision access for trusted facilities and keep your traceability chain synchronized."
    >
      <SignUpForm />
    </AuthShell>
  );
}
