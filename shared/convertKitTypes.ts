// ConvertKit API Types and Interfaces

export interface ConvertKitSubscriber {
  id: string;
  first_name: string | null;
  email: string;
  state: 'active' | 'inactive' | 'bounced' | 'complained' | 'cancelled';
  created_at: string;
  fields: Record<string, any>;
}

export interface ConvertKitTag {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ConvertKitForm {
  id: string;
  name: string;
  description: string | null;
  sign_up_button_text: string;
  success_message: string;
  redirect_url: string | null;
  embed_js: string;
  embed_url: string;
  archived: boolean;
  created_at: string;
}

export interface ConvertKitBroadcast {
  id: string;
  subject: string;
  description: string | null;
  thumbnail_alt: string | null;
  thumbnail_url: string | null;
  public_id: string;
  published_at: string | null;
  created_at: string;
  send_at: string | null;
  thumbnail_url_2: string | null;
}

export interface ConvertKitWebhookEvent {
  event_type: 'subscriber.subscriber_activate' | 'subscriber.subscriber_unsubscribe' | 'subscriber.subscriber_subscribe' | 'form.subscriber_subscribe';
  created_at: string;
  data: {
    subscriber: ConvertKitSubscriber;
    [key: string]: any;
  };
}

export interface ConvertKitSubscriptionRequest {
  email: string;
  first_name?: string;
  fields?: Record<string, any>;
  tags?: number[];
  form_id?: number;
  sequences?: number[];
}

export interface ConvertKitTagRequest {
  name: string;
  description?: string;
}

export interface ConvertKitBroadcastRequest {
  subject: string;
  content: string;
  thumbnail_alt?: string;
  thumbnail_url?: string;
  description?: string;
  public?: boolean;
  send_at?: string;
  recipients?: {
    segment_id?: number;
    tag_ids?: number[];
    exclude_ids?: number[];
  };
}

export interface ConvertKitApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ConvertKitRateLimitInfo {
  remaining: number;
  reset_time: number;
  limit: number;
}

// Email Campaign Types for GroupSnapAI
export type CampaignType = 'analysis_complete' | 'tips' | 'follow_up' | 'newsletter' | 'welcome';

export interface EmailCampaignData {
  sessionId: string;
  campaignType: CampaignType;
  userEmail: string;
  userName?: string;
  analysisResults?: {
    photoCount: number;
    bestPhotoUrl?: string;
    qualityScore?: number;
    facesDetected?: number;
  };
  customData?: Record<string, any>;
}

// ConvertKit Configuration
export interface ConvertKitConfig {
  apiKey: string;
  apiSecret: string;
  defaultFormId: string;
  tagIds: {
    photoAnalysis: string;
    newsletter: string;
    welcome: string;
    analysisComplete: string;
  };
  webhookSecret?: string;
}

// Error Types
export class ConvertKitError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ConvertKitError';
  }
}

export class ConvertKitRateLimitError extends ConvertKitError {
  constructor(
    message: string,
    public resetTime: number,
    public remainingRequests: number
  ) {
    super(message, 429);
    this.name = 'ConvertKitRateLimitError';
  }
}
