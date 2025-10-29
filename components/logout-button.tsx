"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type LogoutButtonProps = React.ComponentProps<typeof Button> & {
  children?: React.ReactNode;
};

export function LogoutButton({
  className,
  variant = "outline",
  size = "sm",
  children = "Sign out",
  onClick,
  ...props
}: LogoutButtonProps) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    await logout();
  };

  return (
    <Button
      onClick={handleClick}
      variant={variant}
      size={size}
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
}
