"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type LogoutButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "onClick"
>;

export function LogoutButton({
  className,
  variant = "outline",
  size = "sm",
  ...props
}: LogoutButtonProps) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Button
      onClick={logout}
      variant={variant}
      size={size}
      className={className}
      {...props}
    >
      Sign out
    </Button>
  );
}
