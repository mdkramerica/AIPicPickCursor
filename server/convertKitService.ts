import { ConvertKitConfig, ConvertKitSubscriber, ConvertKitTag, ConvertKitBroadcast, ConvertKitSubscriptionRequest, ConvertKitBroadcastRequest, ConvertKitApiResponse, ConvertKitRateLimitError, ConvertKitError, EmailCampaignData, CampaignType } from '../shared/convertKitTypes';
import { db } from './db';
import { convertKitSettings, emailCampaigns } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from './middleware/logger';

class ConvertKitService {
  private config: ConvertKitConfig;
  private baseUrl = 'https://api.convertkit.com/v3';
  private rateLimitInfo: { resetTime: number; remaining: number } = {
    resetTime: 0,
    remaining: 120
  };

  constructor(config: ConvertKitConfig) {
    this.config = config;
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ConvertKitApiResponse<T>> {
    // Check rate limiting
    await this.checkRateLimit();

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Update rate limit info from headers
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const resetTime = response.headers.get('X-RateLimit-Reset');
      
      if (remaining && resetTime) {
        this.rateLimitInfo.remaining = parseInt(remaining);
        this.rateLimitInfo.resetTime = parseInt(resetTime);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new ConvertKitError(
          data.error || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          data
        );
      }

      return {
        success: true,
        data: data.subscribers || data.tags || data.broadcasts || data,
      };
    } catch (error) {
      if (error instanceof ConvertKitError) {
        throw error;
      }
      
      logger.error('ConvertKit API request failed', {
        endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ConvertKitError(
        `Failed to make request to ${endpoint}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async checkRateLimit(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    if (this.rateLimitInfo.remaining <= 0 && now < this.rateLimitInfo.resetTime) {
      const waitTime = this.rateLimitInfo.resetTime - now;
      logger.warn(`ConvertKit rate limit exceeded, waiting ${waitTime} seconds`);
      
      throw new ConvertKitRateLimitError(
        'Rate limit exceeded',
        this.rateLimitInfo.resetTime,
        this.rateLimitInfo.remaining
      );
    }
  }

  // Subscriber Management
  async subscribeUser(request: ConvertKitSubscriptionRequest): Promise<ConvertKitApiResponse<ConvertKitSubscriber>> {
    logger.info('Subscribing user to ConvertKit', { email: request.email });

    const response = await this.makeRequest<ConvertKitSubscriber>('/subscribers', {
      method: 'POST',
      body: JSON.stringify({
        api_secret: this.config.apiSecret,
        ...request,
      }),
    });

    if (response.success && response.data) {
      // Store subscriber info in our database
      await this.updateUserSettings(response.data.email, {
        subscriberId: response.data.id.toString(),
        emailConsent: true,
        tags: request.tags?.map(tag => tag.toString()) || [],
      });
    }

    return response;
  }

  async getSubscriber(subscriberId: string): Promise<ConvertKitApiResponse<ConvertKitSubscriber>> {
    return this.makeRequest<ConvertKitSubscriber>(`/subscribers/${subscriberId}`);
  }

  async getSubscriberByEmail(email: string): Promise<ConvertKitApiResponse<ConvertKitSubscriber[]>> {
    return this.makeRequest<ConvertKitSubscriber[]>(`/subscribers?email_address=${encodeURIComponent(email)}`);
  }

  async updateSubscriberTags(subscriberId: string, tagIds: number[]): Promise<ConvertKitApiResponse<any>> {
    return this.makeRequest(`/subscribers/${subscriberId}/tags`, {
      method: 'POST',
      body: JSON.stringify({
        api_secret: this.config.apiSecret,
        tags: tagIds.map(id => ({ id })),
      }),
    });
  }

  async unsubscribeSubscriber(subscriberId: string): Promise<ConvertKitApiResponse<any>> {
    const response = await this.makeRequest(`/subscribers/${subscriberId}/unsubscribe`, {
      method: 'POST',
    });

    if (response.success) {
      // Update our database
      await this.markUserAsUnsubscribed(subscriberId);
    }

    return response;
  }

  // Tag Management
  async getTags(): Promise<ConvertKitApiResponse<ConvertKitTag[]>> {
    return this.makeRequest<ConvertKitTag[]>('/tags');
  }

  async createTag(name: string, description?: string): Promise<ConvertKitApiResponse<ConvertKitTag>> {
    return this.makeRequest<ConvertKitTag>('/tags', {
      method: 'POST',
      body: JSON.stringify({
        api_secret: this.config.apiSecret,
        name,
        description,
      }),
    });
  }

  // Broadcast Management
  async createBroadcast(request: ConvertKitBroadcastRequest): Promise<ConvertKitApiResponse<ConvertKitBroadcast>> {
    return this.makeRequest<ConvertKitBroadcast>('/broadcasts', {
      method: 'POST',
      body: JSON.stringify({
        api_secret: this.config.apiSecret,
        ...request,
      }),
    });
  }

  async getBroadcasts(): Promise<ConvertKitApiResponse<ConvertKitBroadcast[]>> {
    return this.makeRequest<ConvertKitBroadcast[]>('/broadcasts');
  }

  // Email Campaigns for AIPicPick
  async sendPhotoAnalysisEmail(campaignData: EmailCampaignData): Promise<ConvertKitApiResponse<ConvertKitBroadcast>> {
    logger.info('Sending photo analysis email', {
      sessionId: campaignData.sessionId,
      campaignType: campaignData.campaignType,
      email: campaignData.userEmail,
    });

    // Create campaign record
    const campaignId = await this.createCampaignRecord(campaignData);

    try {
      const broadcastRequest = this.buildBroadcastRequest(campaignData);
      const response = await this.createBroadcast(broadcastRequest);

      if (response.success && response.data) {
        // Update campaign record with success
        await this.updateCampaignRecord(campaignId, {
          convertKitBroadcastId: response.data.id.toString(),
          status: 'sent',
          sentAt: new Date(),
        });
      }

      return response;
    } catch (error) {
      // Update campaign record with error
      await this.updateCampaignRecord(campaignId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async createCampaignRecord(campaignData: EmailCampaignData): Promise<string> {
    // For now, return a mock ID since we can't create the record
    // In a real implementation, this would create the email campaign record
    logger.info('createCampaignRecord called', { 
      sessionId: campaignData.sessionId,
      campaignType: campaignData.campaignType 
    });
    
    return 'mock-campaign-id';
  }

  private async updateCampaignRecord(
    campaignId: string, 
    updates: Record<string, any>
  ): Promise<void> {
    // For now, just log the update since we can't update the record
    logger.info('updateCampaignRecord called', { campaignId, updates });
  }

  private buildBroadcastRequest(campaignData: EmailCampaignData): ConvertKitBroadcastRequest {
    const { campaignType, userEmail, userName, analysisResults } = campaignData;

    const baseContent = `Hi ${userName || 'there'},`;

    const requests: Record<CampaignType, ConvertKitBroadcastRequest> = {
      welcome: {
        subject: 'Welcome to AIPicPick! 📸',
        content: `${baseContent}

Welcome to AIPicPick! We're excited to help you find the perfect photos from your group shots.

Here's what you can do:
• Upload your group photos
• Get AI-powered analysis of each photo
• Find the best shot where everyone looks great
• Download high-quality results

Ready to get started? Upload your first photos now!

Best,
The AIPicPick Team`,
        public: false,
      },

      analysis_complete: {
        subject: 'Your Photo Analysis is Ready! 🎉',
        content: `${baseContent}

Great news! Your photo analysis is complete.

Results:
• ${analysisResults?.photoCount || 0} photos analyzed
• ${analysisResults?.facesDetected || 0} faces detected
• Best photo quality score: ${analysisResults?.qualityScore || 0}/100

${analysisResults?.bestPhotoUrl ? `Your best photo is ready for download!` : ''}

Check out your results and download the perfect shot.

Best,
The AIPicPick Team`,
        public: false,
      },

      tips: {
        subject: 'Photo Tips for Better Group Shots 📸',
        content: `${baseContent}

Want to take better group photos? Here are our top tips:

1. **Lighting is Key** - Use natural light when possible
2. **Count Down** - Give everyone a 3-2-1 countdown
3. **Take Multiple Shots** - Burst mode increases your chances
4. **Check Eyes** - Make sure everyone's eyes are open
5. **Smile Naturally** - Tell a joke instead of saying "cheese"

Remember, AIPicPick is here to help you find the perfect shot from any group photo session!

Best,
The AIPicPick Team`,
        public: false,
      },

      follow_up: {
        subject: 'How are your photos turning out? 📸',
        content: `${baseContent}

We hope you're loving your photo analysis results! 

Did you know?
• You can analyze unlimited photo sessions
• Each analysis helps you find the perfect group shot
• Our AI gets smarter with every photo

Have questions or feedback? Just reply to this email - we'd love to hear from you!

Keep capturing those perfect moments,
The AIPicPick Team`,
        public: false,
      },

      newsletter: {
        subject: 'AIPicPick Updates & New Features ✨',
        content: `${baseContent}

Here's what's new at AIPicPick:

🆕 Latest Features
• Improved face detection accuracy
• Faster photo processing
• Better quality scoring algorithms

💡 Pro Tips
• Upload photos in good lighting for best results
• Take multiple shots of the same group
• Use our analysis to learn what makes a great photo

📊 Community Stats
• Photos analyzed this month: [Number]
• Happy users: [Number]
• Best quality scores achieved: [Number]

Thank you for being part of the AIPicPick community!

Best,
The AIPicPick Team`,
        public: false,
      },
    };

    return requests[campaignType];
  }

  // Database Integration
  private async updateUserSettings(email: string, settings: Partial<typeof convertKitSettings.$inferInsert>): Promise<void> {
    // This method is used for creating/updating ConvertKit settings
    // In a real implementation, you'd find the user by email and get their actual ID
    // For now, this is a placeholder that would need proper user lookup
    
    logger.info('updateUserSettings called', { email, settings });
    
    // This is a placeholder - in a real implementation, you'd:
    // 1. Find the user by email from the users table
    // 2. Update/insert their ConvertKit settings using their actual user ID
    
    // For now, we'll just log this since the webhook handlers handle the actual updates
  }

  private async markUserAsUnsubscribed(subscriberId: string): Promise<void> {
    // This is handled by the webhook handlers
    logger.info('markUserAsUnsubscribed called', { subscriberId });
  }

  // Utility Methods
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.getTags();
      return response.success;
    } catch (error) {
      logger.error('ConvertKit connection test failed', { error });
      return false;
    }
  }

  getRateLimitInfo() {
    return {
      remaining: this.rateLimitInfo.remaining,
      resetTime: this.rateLimitInfo.resetTime,
      resetDate: new Date(this.rateLimitInfo.resetTime * 1000),
    };
  }
}

// Export singleton instance
export const convertKitService = new ConvertKitService({
  apiKey: process.env.CONVERTKIT_API_KEY || '',
  apiSecret: process.env.CONVERTKIT_API_SECRET || '',
  defaultFormId: process.env.CONVERTKIT_FORM_ID || '',
  tagIds: {
    photoAnalysis: process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS || '',
    newsletter: process.env.CONVERTKIT_TAG_ID_NEWSLETTER || '',
    welcome: '', // Add to env vars
    analysisComplete: '', // Add to env vars
  },
  webhookSecret: process.env.CONVERTKIT_WEBHOOK_SECRET,
});
