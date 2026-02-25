---
name: screenshot
description: "Capture authenticated screenshots of web pages for visual verification. Use when you need to see rendered UI, verify dark mode styling, or check visual changes. Triggers on: take screenshot, capture screenshot, show me the page, visual check, verify styling."
---

# Screenshot Capture Skill

Capture screenshots of web application pages for visual verification.

---

## The Job

1. Start the dev server if not running
2. Determine if authentication is needed (public pages don't need it)
3. Navigate to requested page(s)
4. Capture screenshots in BOTH light and dark modes (always capture both)
5. **Actually view the screenshots** using the Read tool to verify the issue
6. Report findings based on visual inspection

---

## CRITICAL: Visual Verification Workflow

When reviewing contrast, color, or visibility issues:

1. **ALWAYS capture screenshots BEFORE analyzing code** - Visual issues are best caught visually
2. **ALWAYS capture BOTH light AND dark modes** - Issues often affect modes differently
3. **ALWAYS use the Read tool to view captured screenshots** - Don't just capture, actually look
4. **Check globals.css for CSS resets** - Rules like `a { color: inherit }` override Tailwind utilities

---

## Public Pages (No Auth Required)

For public pages like the homepage, marketing pages, or login pages, use this simpler script:

### Script Template: `public-screenshot.ts`

```typescript
import { chromium } from 'playwright';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:5001';
const OUTPUT_DIR = '.tmp/screenshots';  // Use project-local .tmp/ (never /tmp/)

// Pages to capture (customize per request)
const PAGES_TO_CAPTURE = [
  { path: '/', name: 'homepage' },
  // Add more pages as needed
];

// Max screenshot height (Claude vision API limit is 8000px, use 4000 for safety)
const MAX_SCREENSHOT_HEIGHT = 4000;

async function capturePublicPages() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  try {
    for (const pageConfig of PAGES_TO_CAPTURE) {
      // Light mode
      await page.goto(`${BASE_URL}${pageConfig.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      
      // Constrain height to avoid Claude vision API rejection
      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      const captureHeight = Math.min(bodyHeight, MAX_SCREENSHOT_HEIGHT);
      
      await page.screenshot({ 
        path: `${OUTPUT_DIR}/${pageConfig.name}-light.png`, 
        clip: { x: 0, y: 0, width: 1920, height: captureHeight }
      });
      console.log(`Captured: ${pageConfig.name}-light.png (${captureHeight}px)`);
      
      // Dark mode
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);
      await page.screenshot({ 
        path: `${OUTPUT_DIR}/${pageConfig.name}-dark.png`, 
        clip: { x: 0, y: 0, width: 1920, height: captureHeight }
      });
      console.log(`Captured: ${pageConfig.name}-dark.png (${captureHeight}px)`);
      
      // Reset for next page
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
      });
    }
    
    console.log(`\nScreenshots saved to ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

capturePublicPages().catch(console.error);
```

### Usage for Public Pages

```bash
# Create script in project e2e directory
cat > apps/web/e2e/public-screenshot.ts << 'EOF'
// ... paste script content ...
EOF

# Run from apps/web directory
cd apps/web && npx tsx e2e/public-screenshot.ts

# View the screenshots
# Use the Read tool on .tmp/screenshots/homepage-light.png etc.

# Clean up
rm apps/web/e2e/public-screenshot.ts
```

---

## Authenticated Pages

For pages that require login (dashboard, settings, etc.), use the full authentication flow below.

### Prerequisites

This skill requires:

1. **Playwright installed** in the project (`npx playwright --version`)
2. **Supabase service role key** in `.env.local` for fetching verification codes (auth pages only)
3. **Dev server** running or startable via `npm run dev`

### Authentication Flow

The project may use passwordless email authentication:

1. Navigate to `/login`
2. Enter test email (check `docs/test-config.json` or use a project-specific test email)
3. Click "Continue" → redirects to `/verify`
4. Fetch verification code from database using service role
5. Enter 6-digit code
6. Click "Verify" → redirects to `/dashboard`

**Note:** The test email should be configured per-project. Check for `TEST_EMAIL` in `.env.local` or `docs/test-config.json`.

### Supabase Code Fetch

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: user } = await supabase
  .from('users')
  .select('verification_code')
  .eq('email', TEST_EMAIL)
  .single();

const code = user.verification_code; // 6-digit string
```

---

## Screenshot Script

Create a temporary Playwright script to capture screenshots:

### Script Template: `screenshot-capture.ts`

```typescript
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com'; // Configure per project
const OUTPUT_DIR = '.tmp/screenshots';  // Use project-local .tmp/ (never /tmp/)

// Max screenshot dimension (Claude vision limit is 8000px)
const MAX_SCREENSHOT_HEIGHT = 4000;

// Pages to capture (customize per request)
const PAGES_TO_CAPTURE = [
  { path: '/dashboard', name: 'dashboard' },
  // Add more pages as needed
];

// Theme modes to capture
const THEMES = ['light', 'dark'];

async function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.trim().match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    });
  }
}

async function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function authenticate(page: any, supabase: any) {
  // Go to login
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]');
  
  // Enter email
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.click('button:has-text("Continue")');
  
  // Wait for verify page
  await page.waitForURL(/\/verify/);
  await page.waitForTimeout(1000); // Allow code to be stored
  
  // Fetch code from database
  const { data: user, error } = await supabase
    .from('users')
    .select('verification_code')
    .eq('email', TEST_EMAIL)
    .single();
  
  if (error || !user?.verification_code) {
    throw new Error(`Failed to get verification code: ${error?.message}`);
  }
  
  // Enter code
  const codeInputs = page.locator('input[maxlength="1"]');
  const code = user.verification_code;
  for (let i = 0; i < 6; i++) {
    await codeInputs.nth(i).fill(code[i]);
  }
  
  // Submit
  await page.click('button:has-text("Verify")');
  await page.waitForURL(/\/dashboard/);
  console.log('Authentication successful');
}

async function setTheme(page: any, theme: 'light' | 'dark') {
  // Navigate to profile to change theme, or use localStorage
  await page.evaluate((t: string) => {
    localStorage.setItem('theme', t);
  }, theme);
  
  // Reload to apply theme
  await page.reload();
  await page.waitForLoadState('networkidle');
  
  // Verify theme class is set
  const htmlClass = await page.locator('html').getAttribute('class');
  console.log(`Theme set to ${theme}, html class: ${htmlClass}`);
}

async function captureScreenshots() {
  await loadEnv();
  const supabase = await getSupabaseClient();
  
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  try {
    // Authenticate
    await authenticate(page, supabase);
    
    // Capture each page in each theme
    for (const theme of THEMES) {
      await setTheme(page, theme as 'light' | 'dark');
      
      for (const pageConfig of PAGES_TO_CAPTURE) {
        await page.goto(`${BASE_URL}${pageConfig.path}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500); // Let animations settle
        
        // Constrain height to avoid Claude vision API rejection (8000px limit)
        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        const captureHeight = Math.min(bodyHeight, MAX_SCREENSHOT_HEIGHT);
        
        const filename = `${pageConfig.name}-${theme}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);
        await page.screenshot({ 
          path: filepath, 
          clip: { x: 0, y: 0, width: 1920, height: captureHeight }
        });
        console.log(`Captured: ${filepath} (${captureHeight}px)`);
      }
    }
    
    console.log(`\nAll screenshots saved to ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
```

---

## Usage

### Step 1: Create the Script

Write the screenshot script to a temporary file in the project's e2e directory:

```bash
# In the web app directory (apps/web)
cat > e2e/screenshot-capture.ts << 'EOF'
// ... paste script content ...
EOF
```

### Step 2: Run the Script

```bash
cd /path/to/project/apps/web
npx tsx e2e/screenshot-capture.ts
```

### Step 3: Review Screenshots

Screenshots are saved to `.tmp/screenshots/` (project-local):
- `dashboard-light.png`
- `dashboard-dark.png`
- etc.

---

## Customization

### Capture Specific Pages

Modify `PAGES_TO_CAPTURE` array:

```typescript
const PAGES_TO_CAPTURE = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/dashboard/calendar', name: 'calendar' },
  { path: '/settings', name: 'settings' },
  { path: '/profile', name: 'profile' },
];
```

### Capture Specific States

Add interaction steps before capture:

```typescript
// Open a modal
await page.click('button:has-text("Create Event")');
await page.waitForSelector('[role="dialog"]');
await page.screenshot({ path: 'create-event-modal.png' });
```

### Mobile Viewport

Change viewport for mobile screenshots:

```typescript
const context = await browser.newContext({
  viewport: { width: 375, height: 812 }, // iPhone X
});
```

---

## Troubleshooting

### "Missing Supabase env vars"

Ensure `.env.local` contains:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### "Failed to get verification code"

- Check that the test email exists in the users table
- The email must have been used at least once to trigger code generation
- Verify service role key has permission to read users table

### Dev Server Not Running

Start it first:
```bash
npm run dev
```

Or modify the script to start it automatically.

---

## Output

After running, report screenshot paths:

```
Screenshots captured:
- .tmp/screenshots/dashboard-light.png
- .tmp/screenshots/dashboard-dark.png
- .tmp/screenshots/calendar-light.png
- .tmp/screenshots/calendar-dark.png
```

The user or aesthetic-critic agent can then view these images to verify styling.
