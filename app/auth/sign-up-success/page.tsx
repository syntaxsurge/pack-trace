import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  return (
    <AuthShell
      title="Confirm your email"
      description="Activate your pack-trace workspace to start logging custody events."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Check your inbox</CardTitle>
          <CardDescription>
            We just sent a verification link to your email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Open the message titled <strong>&quot;Activate pack-trace&quot;</strong> and
            follow the link. Once confirmed, you can sign in and begin tracing
            batches end to end.
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
