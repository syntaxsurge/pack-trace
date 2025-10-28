declare module "next-pwa" {
  type NextConfig = import("next").NextConfig;

  interface PWAConfig {
    dest?: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
    runtimeCaching?: Array<Record<string, unknown>>;
    buildExcludes?: RegExp[];
    fallbacks?: {
      document?: string;
      image?: string;
      audio?: string;
      video?: string;
    };
    maximumFileSizeToCacheInBytes?: number;
  }

  type WithPWA = (nextConfig?: NextConfig) => NextConfig;

  export default function withPWA(config?: PWAConfig): WithPWA;
}

declare module "next-pwa/cache" {
  const runtimeCaching: Array<Record<string, unknown>>;
  export default runtimeCaching;
}
