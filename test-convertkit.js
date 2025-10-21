// Test ConvertKit Integration
// Run this with: node test-convertkit.js

import 'dotenv/config';

const API_KEY = process.env.CONVERTKIT_API_KEY;
const API_SECRET = process.env.CONVERTKIT_API_SECRET;
const FORM_ID = process.env.CONVERTKIT_FORM_ID;
const TAG_ID_PHOTO = process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS;
const TAG_ID_NEWSLETTER = process.env.CONVERTKIT_TAG_ID_NEWSLETTER;

console.log('🔍 Testing ConvertKit Configuration...\n');

// Test 1: Check environment variables
console.log('📋 Environment Variables:');
console.log(`  API Key: ${API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  API Secret: ${API_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log(`  Form ID: ${FORM_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`  Photo Analysis Tag: ${TAG_ID_PHOTO ? '✅ Set' : '❌ Missing'}`);
console.log(`  Newsletter Tag: ${TAG_ID_NEWSLETTER ? '✅ Set' : '❌ Missing'}`);
console.log();

if (!API_KEY || !API_SECRET) {
  console.error('❌ Missing required ConvertKit credentials');
  process.exit(1);
}

// Test 2: Test API connection by fetching tags
console.log('🔌 Testing API Connection...');
const testConnection = async () => {
  try {
    const response = await fetch(
      `https://api.convertkit.com/v3/tags?api_key=${API_KEY}`,
      { method: 'GET' }
    );
    
    const data = await response.json();
    
    if (response.ok && data.tags) {
      console.log(`✅ Connection successful! Found ${data.tags.length} tags:`);
      data.tags.forEach(tag => {
        const isPhoto = tag.id.toString() === TAG_ID_PHOTO;
        const isNewsletter = tag.id.toString() === TAG_ID_NEWSLETTER;
        const marker = isPhoto ? ' (Photo Analysis)' : isNewsletter ? ' (Newsletter)' : '';
        console.log(`  - ${tag.name} (ID: ${tag.id})${marker}`);
      });
      console.log();
      return true;
    } else {
      console.error('❌ API Error:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    return false;
  }
};

// Test 3: Verify Form ID
console.log('📝 Testing Form ID...');
const testForm = async () => {
  try {
    const response = await fetch(
      `https://api.convertkit.com/v3/forms?api_key=${API_KEY}`,
      { method: 'GET' }
    );
    
    const data = await response.json();
    
    if (response.ok && data.forms) {
      const form = data.forms.find(f => f.id.toString() === FORM_ID);
      if (form) {
        console.log(`✅ Form found: "${form.name}" (ID: ${form.id})`);
        console.log();
        return true;
      } else {
        console.error(`❌ Form ID ${FORM_ID} not found`);
        console.log('Available forms:');
        data.forms.forEach(f => console.log(`  - ${f.name} (ID: ${f.id})`));
        console.log();
        return false;
      }
    } else {
      console.error('❌ API Error:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Form test failed:', error.message);
    return false;
  }
};

// Run all tests
(async () => {
  const connectionOk = await testConnection();
  const formOk = await testForm();
  
  if (connectionOk && formOk) {
    console.log('✅ All ConvertKit tests passed! Integration is ready to use.');
  } else {
    console.log('❌ Some tests failed. Please check your configuration.');
    process.exit(1);
  }
})();
