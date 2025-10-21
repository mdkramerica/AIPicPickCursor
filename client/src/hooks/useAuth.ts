import { useKindeAuth } from "@kinde-oss/kinde-auth-react";

export function useAuth() {
  const { user: kindeUser, isLoading, isAuthenticated } = useKindeAuth();

  // Transform Kinde user to match our User type
  const user = kindeUser ? {
    id: kindeUser.id || "",
    email: kindeUser.email || "",
    firstName: kindeUser.givenName || "",
    lastName: kindeUser.familyName || "",
    profileImageUrl: kindeUser.picture || "",
  } : null;

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}
