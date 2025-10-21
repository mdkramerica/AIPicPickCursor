import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ConvertKitSettings {
  id: string;
  userId: string;
  subscriberId?: string;
  emailConsent: boolean;
  marketingConsent: boolean;
  autoSubscribed: boolean;
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
      try {
        const response = await apiRequest('GET', '/api/convertkit/settings');
        return response.json();
      } catch (error: any) {
        if (error.message.includes('401')) return null;
        throw error;
      }
    },
  });

  // Subscribe to ConvertKit
  const subscribeMutation = useMutation({
    mutationFn: async (data: SubscribeRequest) => {
      console.log('🔔 Subscribing to ConvertKit:', data);
      try {
        const response = await apiRequest('POST', '/api/convertkit/subscribe', data);
        console.log('✅ ConvertKit subscription response:', response);
        return response.json();
      } catch (error) {
        console.error('❌ ConvertKit subscription error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/convertkit/settings'] });
      toast({
        title: "Subscribed! 🎉",
        description: "Check your email for a welcome message.",
      });
    },
    onError: (error: Error) => {
      console.error('❌ ConvertKit subscription failed:', error);
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
      const response = await apiRequest('PATCH', '/api/convertkit/settings', data);
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
    isAutoSubscribed: settings?.autoSubscribed ?? false,
  };
}
