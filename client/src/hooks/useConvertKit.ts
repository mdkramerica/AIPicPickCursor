import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";

interface ConvertKitSettings {
  id: string;
  userId: string;
  subscriberId?: string;
  emailConsent: boolean;
  marketingConsent: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface SubscribeRequest {
  email: string;
  firstName?: string;
  consent: {
    email: boolean;
    marketing?: boolean;
  };
}

interface UpdateSettingsRequest {
  emailConsent?: boolean;
  marketingConsent?: boolean;
}

export function useConvertKit() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current ConvertKit settings
  const { data: settings, isLoading } = useQuery<ConvertKitSettings | null>({
    queryKey: ['/api/convertkit/settings'],
    queryFn: async () => {
      const response = await fetch('/api/convertkit/settings', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch settings');
      }
      
      return response.json();
    },
  });

  // Subscribe to ConvertKit
  const subscribeMutation = useMutation({
    mutationFn: async (data: SubscribeRequest) => {
      const response = await fetch('/api/convertkit/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to subscribe');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/convertkit/settings'] });
      toast({
        title: "Subscribed! 🎉",
        description: "Check your email for a welcome message.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Subscription failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update ConvertKit settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: UpdateSettingsRequest) => {
      const response = await fetch('/api/convertkit/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update settings');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/convertkit/settings'] });
      
      if (variables.emailConsent === false) {
        toast({
          title: "Unsubscribed",
          description: "You've been removed from our email list.",
        });
      } else {
        toast({
          title: "Settings updated",
          description: "Your email preferences have been saved.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    settings,
    isLoading,
    subscribe: subscribeMutation.mutate,
    isSubscribing: subscribeMutation.isPending,
    updateSettings: updateSettingsMutation.mutate,
    isUpdating: updateSettingsMutation.isPending,
    isSubscribed: settings?.emailConsent ?? false,
  };
}
