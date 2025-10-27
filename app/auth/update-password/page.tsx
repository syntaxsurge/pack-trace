import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/update-password-form";

export default function Page() {
  return (
    <AuthShell
      title="Set a new password"
      description="Complete the recovery flow to continue verifying batches."
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
