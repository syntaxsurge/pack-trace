import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
  "aria-hidden"?: boolean;
};

export function BrandLogo({
  size = 24,
  className,
  alt = "pack-trace logo",
  priority = false,
  "aria-hidden": ariaHidden,
}: BrandLogoProps) {
  return (
    <Image
      src="/images/pack-trace-logo.png"
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-md", className)}
      priority={priority}
      aria-hidden={ariaHidden}
    />
  );
}
