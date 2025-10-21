import { ConvertKitWebhookEvent } from '../shared/convertKitTypes';
import { db } from './db';
import { convertKitSettings, users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from './middleware/logger';
import * as crypto from 'node:crypto';

export class ConvertKitWebhookHandler {
  private webhookSecret: string;

  constructor(webhookSecret: string) {
    this.webhookSecret = webhookSecret;
  }

  /**
   * Verify webhook signature to ensure request is from ConvertKit
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      logger.warn('Webhook secret not configured, skipping signature verification');
      return true; // In development, you might want to skip verification
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Handle incoming webhook events from ConvertKit
   */
  async handleWebhook(event: ConvertKitWebhookEvent): Promise<void> {
    logger.info('Processing ConvertKit webhook', {
      eventType: event.event_type,
      subscriberId: event.data.subscriber.id,
      email: event.data.subscriber.email,
    });

    try {
      switch (event.event_type) {
        case 'subscriber.subscriber_activate':
          await this.handleSubscriberActivate(event);
          break;

        case 'subscriber.subscriber_subscribe':
          await this.handleSubscriberSubscribe(event);
          break;

        case 'subscriber.subscriber_unsubscribe':
          await this.handleSubscriberUnsubscribe(event);
          break;

        case 'form.subscriber_subscribe':
          await this.handleFormSubscribe(event);
          break;

        default:
          logger.warn('Unhandled webhook event type', { eventType: event.event_type });
      }
    } catch (error) {
      logger.error('Error processing webhook event', {
        eventType: event.event_type,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private async handleSubscriberActivate(event: ConvertKitWebhookEvent): Promise<void> {
    const subscriber = event.data.subscriber;
    
    await this.upsertSubscriberSettings(subscriber.id.toString(), {
      subscriberId: subscriber.id.toString(),
      emailConsent: true,
      marketingConsent: true,
      unsubscribedAt: null, // Clear unsubscribed date if they resubscribe
    }, subscriber.email);

    logger.info('Subscriber activated', { subscriberId: subscriber.id, email: subscriber.email });
  }

  private async handleSubscriberSubscribe(event: ConvertKitWebhookEvent): Promise<void> {
    const subscriber = event.data.subscriber;
    
    await this.upsertSubscriberSettings(subscriber.id.toString(), {
      subscriberId: subscriber.id.toString(),
      emailConsent: true,
      marketingConsent: true,
      unsubscribedAt: null,
    }, subscriber.email);

    logger.info('New subscriber', { subscriberId: subscriber.id, email: subscriber.email });

    // You could trigger welcome emails or other onboarding here
    // For example, send a welcome notification to your internal systems
  }

  private async handleSubscriberUnsubscribe(event: ConvertKitWebhookEvent): Promise<void> {
    const subscriber = event.data.subscriber;
    
    await this.upsertSubscriberSettings(subscriber.id.toString(), {
      subscriberId: subscriber.id.toString(),
      emailConsent: false,
      marketingConsent: false,
      unsubscribedAt: new Date(),
    }, subscriber.email);

    logger.info('Subscriber unsubscribed', { subscriberId: subscriber.id, email: subscriber.email });

    // You might want to:
    // - Remove them from marketing lists
    // - Update their user status in your app
    // - Send internal notifications
  }

  private async handleFormSubscribe(event: ConvertKitWebhookEvent): Promise<void> {
    const subscriber = event.data.subscriber;
    const formId = event.data.form_id;
    
    await this.upsertSubscriberSettings(subscriber.id.toString(), {
      subscriberId: subscriber.id.toString(),
      emailConsent: true,
      marketingConsent: true,
      unsubscribedAt: null,
    }, subscriber.email);

    logger.info('Subscriber from form', { 
      subscriberId: subscriber.id, 
      email: subscriber.email,
      formId 
    });

    // Handle form-specific logic
    // For example, different forms might mean different user segments
  }

  private async upsertSubscriberSettings(
    subscriberId: string, 
    settings: Partial<typeof convertKitSettings.$inferInsert>,
    email?: string
  ): Promise<void> {
    // First try to find existing settings by subscriber ID
    const existing = await db
      .select()
      .from(convertKitSettings)
      .where(eq(convertKitSettings.subscriberId, subscriberId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(convertKitSettings)
        .set({ 
          ...settings, 
          updatedAt: new Date() 
        })
        .where(eq(convertKitSettings.subscriberId, subscriberId));
    } else {
      // Try to find user by email through the users table
      if (email) {
        const userByEmail = await this.findUserByEmail(email);
        
        if (userByEmail) {
          await db.insert(convertKitSettings).values({
            userId: userByEmail.id,
            ...settings,
          });
        } else {
          logger.warn('Could not find user for ConvertKit subscriber', {
            subscriberId,
            email,
          });
        }
      }
    }
  }

  private async findUserByEmail(email: string): Promise<{ id: string } | null> {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    return user || null;
  }
}

// Export singleton instance
export const convertKitWebhookHandler = new ConvertKitWebhookHandler(
  process.env.CONVERTKIT_WEBHOOK_SECRET || ''
);

// Helper function to parse webhook request body
export function parseWebhookBody(body: string | null): ConvertKitWebhookEvent | null {
  if (!body) {
    logger.warn('Empty webhook body received');
    return null;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    logger.error('Failed to parse webhook body', { 
      body: body.substring(0, 200), // Log first 200 chars for debugging
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

// Webhook event type guards
export function isValidWebhookEvent(event: any): event is ConvertKitWebhookEvent {
  return (
    event &&
    typeof event.event_type === 'string' &&
    event.data &&
    event.data.subscriber &&
    typeof event.data.subscriber.id === 'string' &&
    typeof event.data.subscriber.email === 'string'
  );
}
