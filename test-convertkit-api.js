#!/usr/bin/env node

/**
 * ConvertKit API Test Script
 * Tests the ConvertKit API connection and subscription functionality
 */

import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.CONVERTKIT_API_KEY;
const API_SECRET = process.env.CONVERTKIT_API_SECRET;
const FORM_ID = process.env.CONVERTKIT_FORM_ID;
const TAG_ID_PHOTO = process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS;
const TAG_ID_NEWSLETTER = process.env.CONVERTKIT_TAG_ID_NEWSLETTER;

console.log('🔍 ConvertKit API Configuration Check\n');
console.log('Environment Variables:');
console.log('  CONVERTKIT_API_KEY:', API_KEY ? `✓ Set (${API_KEY.length} chars)` : '✗ Not set');
console.log('  CONVERTKIT_API_SECRET:', API_SECRET ? `✓ Set (${API_SECRET.length} chars)` : '✗ Not set');
console.log('  CONVERTKIT_FORM_ID:', FORM_ID || '✗ Not set');
console.log('  CONVERTKIT_TAG_ID_PHOTO_ANALYSIS:', TAG_ID_PHOTO || '✗ Not set');
console.log('  CONVERTKIT_TAG_ID_NEWSLETTER:', TAG_ID_NEWSLETTER || '✗ Not set');
console.log('');

if (!API_KEY || !API_SECRET || !FORM_ID) {
  console.error('❌ Required ConvertKit environment variables are not set!');
  console.error('Please set CONVERTKIT_API_KEY, CONVERTKIT_API_SECRET, and CONVERTKIT_FORM_ID in your .env file');
  process.exit(1);
}

const TEST_EMAIL = 'test+' + Date.now() + '@example.com';

async function testSubscription() {
  console.log('📧 Testing ConvertKit Subscription API\n');
  console.log('Test email:', TEST_EMAIL);
  console.log('Form ID:', FORM_ID);
  console.log('Tags:', [TAG_ID_PHOTO, TAG_ID_NEWSLETTER].filter(Boolean));
  console.log('');

  // Use the correct v3 API endpoint for subscribing to a form
  const url = `https://api.convertkit.com/v3/forms/${FORM_ID}/subscribe`;
  
  const payload = {
    api_key: API_KEY,  // v3 forms endpoint uses api_key (public key)
    email: TEST_EMAIL,
    first_name: 'Test User',
    tags: [
      parseInt(TAG_ID_PHOTO || '0'),
      parseInt(TAG_ID_NEWSLETTER || '0'),
    ].filter(id => id > 0),
  };

  console.log('📤 Request URL:', url);
  console.log('📤 Request payload:');
  console.log(JSON.stringify({
    ...payload,
    api_key: '***' + payload.api_key.slice(-4),
  }, null, 2));
  console.log('');

  try {
    console.log('🌐 Making request to ConvertKit API...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    console.log('');
    console.log('📥 Response status:', response.status, response.statusText);
    console.log('📥 Response headers:');
    console.log('  X-RateLimit-Remaining:', response.headers.get('X-RateLimit-Remaining'));
    console.log('  X-RateLimit-Reset:', response.headers.get('X-RateLimit-Reset'));
    console.log('');
    console.log('📥 Response data:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    if (!response.ok) {
      console.error('❌ API request failed!');
      console.error('Status:', response.status);
      console.error('Error:', data.error || data.message || 'Unknown error');
      console.error('');
      
      // Provide helpful error messages
      if (response.status === 401 || response.status === 403) {
        console.error('🔑 Authentication issue detected!');
        console.error('   Check that your CONVERTKIT_API_SECRET is correct');
        console.error('   You can find it at: https://app.convertkit.com/account_settings/developer_settings');
      } else if (response.status === 400) {
        console.error('📝 Invalid request data!');
        console.error('   Check that tag IDs are valid');
      } else if (response.status === 429) {
        console.error('⏱️ Rate limit exceeded!');
        console.error('   Wait before trying again');
      }
      
      return false;
    }

    console.log('✅ Subscription successful!');
    console.log('Subscriber ID:', data.id);
    console.log('Email:', data.email);
    console.log('State:', data.state);
    console.log('');

    return true;
  } catch (error) {
    console.error('');
    console.error('❌ Error making request:', error.message);
    console.error('Error type:', error.constructor.name);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    console.error('');
    return false;
  }
}

async function testGetTags() {
  console.log('🏷️  Testing Get Tags API\n');

  const url = `https://api.convertkit.com/v3/tags?api_secret=${API_SECRET}`;

  try {
    console.log('🌐 Making request to ConvertKit API...');
    const response = await fetch(url);
    const data = await response.json();

    console.log('');
    console.log('📥 Response status:', response.status, response.statusText);
    console.log('');

    if (!response.ok) {
      console.error('❌ API request failed!');
      console.error('Error:', data.error || data.message || 'Unknown error');
      console.error('');
      return false;
    }

    console.log('✅ Tags retrieved successfully!');
    console.log('Total tags:', data.tags?.length || 0);
    console.log('');
    
    if (data.tags && data.tags.length > 0) {
      console.log('📋 Your tags:');
      data.tags.forEach(tag => {
        console.log(`  - ${tag.name} (ID: ${tag.id})`);
      });
      console.log('');
      
      // Check if configured tags exist
      if (TAG_ID_PHOTO) {
        const photoTag = data.tags.find(t => t.id.toString() === TAG_ID_PHOTO);
        if (photoTag) {
          console.log('✅ Photo Analysis tag found:', photoTag.name);
        } else {
          console.log('⚠️  Photo Analysis tag ID not found in your account');
        }
      }
      
      if (TAG_ID_NEWSLETTER) {
        const newsletterTag = data.tags.find(t => t.id.toString() === TAG_ID_NEWSLETTER);
        if (newsletterTag) {
          console.log('✅ Newsletter tag found:', newsletterTag.name);
        } else {
          console.log('⚠️  Newsletter tag ID not found in your account');
        }
      }
      console.log('');
    }

    return true;
  } catch (error) {
    console.error('');
    console.error('❌ Error making request:', error.message);
    console.error('');
    return false;
  }
}

// Run tests
(async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ConvertKit API Test Suite');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Test 1: Get tags (simple auth test)
  const tagsSuccess = await testGetTags();
  
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Test 2: Subscribe user
  const subscribeSuccess = await testSubscription();
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('📊 Test Results:');
  console.log('  Get Tags:', tagsSuccess ? '✅ PASSED' : '❌ FAILED');
  console.log('  Subscribe User:', subscribeSuccess ? '✅ PASSED' : '❌ FAILED');
  console.log('');
  
  if (tagsSuccess && subscribeSuccess) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please review the errors above.');
    process.exit(1);
  }
})();
