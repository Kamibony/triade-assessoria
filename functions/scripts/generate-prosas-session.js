const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

async function generateSession() {
  const username = process.env.PROSAS_USERNAME;
  const password = process.env.PROSAS_PASSWORD;

  if (!username || !password) {
    console.error('Error: PROSAS_USERNAME and PROSAS_PASSWORD environment variables are required.');
    process.exit(1);
  }

  console.log('Starting Playwright session generator for Prosas...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to login page...');
    await page.goto('https://prosas.com.br/login', { waitUntil: 'networkidle' });

    console.log('Filling in credentials...');
    // Replace these selectors with the actual ones if they differ.
    // Based on typical login forms:
    await page.fill('input[type="email"], input[name="email"], input#user_email', username);
    await page.fill('input[type="password"], input[name="password"], input#user_password', password);

    console.log('Submitting form...');
    // Try to click the submit button
    await page.click('button[type="submit"], input[type="submit"]');

    console.log('Waiting for authentication to complete...');
    // Wait for a selector that appears only when authenticated
    // or wait for the URL to change.
    // Wait for network to be idle to ensure state is settled.
    await page.waitForLoadState('networkidle');
    // Consider adding a wait for a specific element that shows successful login
    // e.g. await page.waitForSelector('.user-profile-icon', { timeout: 15000 });

    // Slight delay to ensure cookies are fully set
    await page.waitForTimeout(5000);

    console.log('Extracting session state using Playwright storageState API...');

    const outputFile = 'prosas_session.json';

    // Native API saves cookies and localStorage directly to the file
    await context.storageState({ path: outputFile });

    console.log(`Session state successfully saved to ${outputFile}`);

  } catch (error) {
    console.error('Error during session generation:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

generateSession();
