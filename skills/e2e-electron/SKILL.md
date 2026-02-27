# E2E Electron Testing Skill

This skill provides patterns and instructions for writing Playwright E2E tests for Electron applications.

## Triggers

Load this skill when:
- `apps[*].framework === 'electron'`
- `apps[*].testing.framework === 'playwright-electron'`
- `apps[*].type === 'desktop'` and Electron detected in `package.json`

## Prerequisites

Ensure the project has Playwright installed with Electron support:

```bash
npm install -D @playwright/test playwright
```

No additional packages are needed — Playwright has built-in Electron support via `_electron` API.

## Electron App Structure

Understand the Electron architecture before testing:

```
apps/desktop/
├── src/
│   ├── main/           # Main process (Node.js)
│   │   ├── index.ts    # Entry point
│   │   └── preload.ts  # Preload script (bridge)
│   └── renderer/       # Renderer process (Chromium)
│       └── index.html
├── package.json
└── electron-builder.yml
```

**Key concepts:**
- **Main process**: Node.js process that creates windows, handles system integration
- **Renderer process**: Chromium browser that displays UI (your React/Vue/etc app)
- **Preload script**: Bridge between main and renderer (secure context)

## Test Setup

### Basic Test Configuration

Create a test file (e.g., `e2e/electron.spec.ts`):

```typescript
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../apps/desktop/dist/main/index.js')],
    // Or if using electron-builder output:
    // executablePath: path.join(__dirname, '../apps/desktop/dist/mac/YourApp.app/Contents/MacOS/YourApp'),
  });

  // Wait for first window
  window = await electronApp.firstWindow();
  
  // Wait for app to be ready (adjust selector to your app's ready state)
  await window.waitForSelector('[data-testid="app-ready"]', { timeout: 30000 });
});

test.afterAll(async () => {
  await electronApp.close();
});

test('app window opens', async () => {
  const title = await window.title();
  expect(title).toBe('Your App Name');
});
```

### Launch Options

```typescript
// Development mode (from source)
electronApp = await electron.launch({
  args: ['./apps/desktop/src/main/index.ts'],
  env: {
    ...process.env,
    NODE_ENV: 'test',
  },
});

// Production mode (packaged app)
electronApp = await electron.launch({
  executablePath: '/path/to/YourApp.app/Contents/MacOS/YourApp',
});

// With custom args
electronApp = await electron.launch({
  args: ['./main.js', '--disable-gpu', '--enable-logging'],
});
```

## Common Test Patterns

### Testing the Renderer Process

The renderer is just a browser window — use standard Playwright patterns:

```typescript
test('can interact with UI', async () => {
  await window.click('[data-testid="new-project-button"]');
  await window.fill('[data-testid="project-name-input"]', 'Test Project');
  await window.click('[data-testid="create-button"]');
  
  await expect(window.locator('[data-testid="project-list"]')).toContainText('Test Project');
});
```

### Testing Main Process (IPC)

Use `electronApp.evaluate()` to run code in the main process:

```typescript
test('main process returns correct app version', async () => {
  const version = await electronApp.evaluate(async ({ app }) => {
    return app.getVersion();
  });
  
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
});

test('can access electron APIs', async () => {
  const appPath = await electronApp.evaluate(async ({ app }) => {
    return app.getAppPath();
  });
  
  expect(appPath).toContain('desktop');
});
```

### Testing IPC Communication

```typescript
test('renderer can call main process via IPC', async () => {
  // Trigger IPC call from renderer
  await window.click('[data-testid="fetch-system-info"]');
  
  // Wait for response to be displayed
  await expect(window.locator('[data-testid="system-info"]')).not.toBeEmpty();
});

// Or test IPC directly
test('IPC handler responds correctly', async () => {
  const result = await electronApp.evaluate(async ({ ipcMain }) => {
    // This runs in main process
    return new Promise((resolve) => {
      // Simulate IPC call
      ipcMain.emit('get-system-info', { sender: { send: resolve } });
    });
  });
  
  expect(result).toHaveProperty('platform');
});
```

### Testing Native Dialogs

Native dialogs (file picker, message box) need special handling:

```typescript
test('can open file dialog', async () => {
  // Mock the dialog before triggering
  await electronApp.evaluate(async ({ dialog }) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: ['/mock/path/to/file.txt'],
    });
  });
  
  // Trigger the dialog
  await window.click('[data-testid="open-file-button"]');
  
  // Verify the file was "opened"
  await expect(window.locator('[data-testid="file-path"]')).toHaveText('/mock/path/to/file.txt');
});
```

### Testing Window Management

```typescript
test('can open new window', async () => {
  const windowCount = await electronApp.windows().length;
  
  await window.click('[data-testid="new-window-button"]');
  
  // Wait for new window
  await expect(async () => {
    expect(electronApp.windows().length).toBe(windowCount + 1);
  }).toPass({ timeout: 5000 });
});

test('window has correct dimensions', async () => {
  const bounds = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getFocusedWindow();
    return win?.getBounds();
  });
  
  expect(bounds?.width).toBeGreaterThanOrEqual(800);
  expect(bounds?.height).toBeGreaterThanOrEqual(600);
});
```

## Common Gotchas

### 1. App Lifecycle

Electron apps take time to initialize. Always wait for a ready indicator:

```typescript
// BAD: Race condition
const window = await electronApp.firstWindow();
await window.click('button'); // App might not be ready!

// GOOD: Wait for ready state
const window = await electronApp.firstWindow();
await window.waitForSelector('[data-ready="true"]', { timeout: 30000 });
await window.click('button');
```

### 2. Multiple Windows

Electron apps can have multiple windows. Track them properly:

```typescript
test.beforeEach(async () => {
  // Get the main window (first window that's not a splash screen)
  const windows = electronApp.windows();
  window = windows.find(w => !w.url().includes('splash')) || windows[0];
});
```

### 3. Preload Script Context

Code in `evaluate()` runs in main process, not renderer:

```typescript
// This runs in MAIN process
await electronApp.evaluate(({ app }) => app.quit());

// This runs in RENDERER process  
await window.evaluate(() => document.title);
```

### 4. File System Paths

Use cross-platform paths:

```typescript
import path from 'path';

const appPath = path.join(__dirname, '../apps/desktop/dist/main/index.js');
// NOT: '../apps/desktop/dist/main/index.js' (breaks on Windows)
```

### 5. DevTools

DevTools can interfere with tests. Disable in test mode:

```typescript
// In main process
if (process.env.NODE_ENV === 'test') {
  win.webContents.closeDevTools();
}
```

## Playwright Config for Electron

Add to `playwright.config.ts`:

```typescript
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './e2e',
  testMatch: '**/electron.spec.ts',
  timeout: 60000, // Electron apps take longer to start
  retries: 1,
  workers: 1, // Run serially — Electron tests can't parallelize well
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
};

export default config;
```

## Running Tests

```bash
# Run Electron tests
npx playwright test e2e/electron.spec.ts

# With headed mode (see the app)
npx playwright test e2e/electron.spec.ts --headed

# Debug mode
npx playwright test e2e/electron.spec.ts --debug
```

## CI/CD Considerations

Electron tests need a display. On Linux CI:

```yaml
# GitHub Actions
- name: Run Electron tests
  uses: coactions/setup-xvfb@v1
  with:
    run: npm run test:e2e:electron
```

Or use `xvfb-run`:

```bash
xvfb-run --auto-servernum npm run test:e2e:electron
```

## Detection Fallback

If Electron is not declared in `project.json`, detect via:

```typescript
// Check package.json for electron dependency
const pkgJson = JSON.parse(fs.readFileSync('apps/desktop/package.json', 'utf-8'));
const hasElectron = 'electron' in (pkgJson.devDependencies || {}) 
                 || 'electron' in (pkgJson.dependencies || {});
```

## Related Skills

- `e2e-playwright` — General Playwright patterns (applies to renderer testing)
- `e2e-quality` — Quality-beyond-correctness patterns (visual stability, etc.)
