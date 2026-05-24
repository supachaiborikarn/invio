"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (clerkKey) {
    return (
      <ClerkProvider publishableKey={clerkKey}>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </ClerkProvider>
    );
  }

  return <TooltipProvider delayDuration={150}>{children}</TooltipProvider>;
}
