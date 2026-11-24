import { LogOutIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/primitives";

/** A real form POST so sign-out works without JavaScript and can't be triggered by a cross-site GET. */
export function SignOutButton({ className, full = false }: { className?: string; full?: boolean }) {
  return (
    <form action="/auth/signout" method="post" className={full ? "w-full" : undefined}>
      <button type="submit" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), full && "w-full justify-start", className)}>
        <LogOutIcon className="h-4 w-4" />
        Sign out
      </button>
    </form>
  );
}
