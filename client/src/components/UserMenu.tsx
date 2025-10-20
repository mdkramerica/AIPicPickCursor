import { UserButton, useUser } from "@clerk/clerk-react";

/**
 * User menu component with Clerk's pre-built UserButton
 * Provides user profile, settings, and sign out
 */
export function UserMenu() {
  const { user } = useUser();

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground hidden sm:inline">
        {user.firstName} {user.lastName}
      </span>
      <UserButton 
        afterSignOutUrl="/"
        appearance={{
          elements: {
            avatarBox: "w-10 h-10"
          }
        }}
      />
    </div>
  );
}
