import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Settings, LogOut, User, Mail } from "lucide-react";
import { useLocation } from "wouter";

export default function ProfileDropdown() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  const handleNavigate = (path: string) => {
    setLocation(path);
    setIsOpen(false);
  };

  if (!user) {
    return null;
  }

  const userInitials = user.firstName 
    ? user.firstName.charAt(0).toUpperCase() + (user.lastName ? user.lastName.charAt(0).toUpperCase() : '')
    : user.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="relative" ref={dropdownRef}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="relative h-8 w-8 rounded-full"
            aria-label="User menu"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.profileImageUrl} alt={user.firstName || "User"} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <div className="flex items-center justify-start gap-2 p-2">
            <div className="flex flex-col space-y-1 leading-none">
              {user.firstName && (
                <p className="font-medium">{user.firstName} {user.lastName || ''}</p>
              )}
              {user.email && (
                <p className="w-[200px] truncate text-sm text-muted-foreground">
                  {user.email}
                </p>
              )}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleNavigate("/email-preferences")}>
            <Mail className="mr-2 h-4 w-4" />
            <span>Email Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleNavigate("/album")}>
            <User className="mr-2 h-4 w-4" />
            <span>My Album</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
