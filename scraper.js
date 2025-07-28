


const puppeteer = require('puppeteer');
const fs = require('fs').promises;

// Configuration variable for headless mode
const headlessMode = true; // Set to false to show browser window

class WebScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.activeTimeouts = new Set();
    }

    async init(options = {}) {
        const defaultOptions = {
            headless: headlessMode,
            slowMo: headlessMode ? 0 : 50,
            defaultViewport: { width: 1366, height: 768 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--lang=es',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        };
        
        this.browser = await puppeteer.launch({ ...defaultOptions, ...options });
        this.page = await this.browser.newPage();
        
        // Remove automation indicators
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // Remove chrome automation flags
            delete window.chrome.runtime.onConnect;
            delete window.chrome.runtime.onMessage;
            
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['es', 'es-ES', 'en'],
            });
            
            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });
        
        // Set realistic headers
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await this.page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'es,es-ES;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Charset': 'ISO-8859-1,utf-8;q=0.7,*;q=0.3',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        });
    }

    async navigateTo(url, retries = 3) {
        if (!this.page) {
            throw new Error('Browser not initialized. Call init() first.');
        }
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`Navigating to: ${url} (attempt ${attempt}/${retries})`);
                await this.page.goto(url, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });
                console.log(`Successfully navigated to: ${url}`);
                return;
            } catch (error) {
                console.log(`Navigation attempt ${attempt} failed:`, error.message);
                if (attempt === retries) {
                    throw error;
                }
                console.log(`Waiting 3 seconds before retry...`);
                await this.safeTimeout(3000);
            }
        }
    }

    async waitForSelector(selector, timeout = 5000) {
        return await this.page.waitForSelector(selector, { timeout });
    }

    async click(selector) {
        await this.waitForSelector(selector);
        await this.page.click(selector);
        console.log(`Clicked: ${selector}`);
    }

    async type(selector, text, delay = 30) {
        await this.waitForSelector(selector);
        await this.page.type(selector, text, { delay });
        console.log(`Typed "${text}" in: ${selector}`);
    }

    async getText(selector) {
        await this.waitForSelector(selector);
        return await this.page.$eval(selector, el => el.textContent.trim());
    }

    async getElements(selector) {
        return await this.page.$$(selector);
    }

    async screenshot(filename = 'screenshot.png') {
        // Ensure screens directory exists
        const screensDir = './screens';
        try {
            await fs.mkdir(screensDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, ignore error
        }
        
        const fullPath = `${screensDir}/${filename}`;
        await this.page.screenshot({ path: fullPath, fullPage: true });
        console.log(`📸 Screenshot saved: ${fullPath}`);
        
        // Log artifact URL for GitHub Actions
        if (process.env.GITHUB_RUN_NUMBER) {
            const repoUrl = process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY;
            const artifactUrl = `${repoUrl}/actions/runs/${process.env.GITHUB_RUN_ID}`;
            console.log(`🔗 View screenshots at: ${artifactUrl}`);
        }
    }

    async extractData(selector, attribute = 'textContent') {
        const elements = await this.page.$$(selector);
        const data = [];
        
        for (let element of elements) {
            if (attribute === 'textContent') {
                const text = await this.page.evaluate(el => el.textContent.trim(), element);
                data.push(text);
            } else {
                const attr = await this.page.evaluate((el, attr) => el.getAttribute(attr), element, attribute);
                data.push(attr);
            }
        }
        
        return data;
    }

    // Safe timeout method that tracks timeouts for cleanup
    async safeTimeout(ms) {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this.activeTimeouts.delete(timeoutId);
                resolve();
            }, ms);
            this.activeTimeouts.add(timeoutId);
        });
    }

    // Clear all active timeouts
    clearAllTimeouts() {
        this.activeTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        this.activeTimeouts.clear();
        console.log('Cleared all active timeouts');
    }

    async close() {
        // Clear any active timeouts before closing
        this.clearAllTimeouts();
        
        if (this.browser) {
            await this.browser.close();
            console.log('Browser closed');
        }
    }


    // Method to read initial URL from initial.txt (MANDATORY)
    async readInitialFromFile() {
        try {
            const initialContent = await fs.readFile('initial.txt', 'utf8');
            const initialUrl = initialContent.trim();
            if (!initialUrl) {
                throw new Error('initial.txt is empty - URL is required');
            }
            console.log(`🎯 Using primary URL from initial.txt: ${initialUrl}`);
            return initialUrl;
        } catch (error) {
            console.error('❌ Error reading initial.txt:', error.message);
            throw new Error('initial.txt file is required and must contain a valid URL');
        }
    }

    // Method to read search parameters from search.txt
    async readSearchFromFile() {
        try {
            const searchContent = await fs.readFile('search.txt', 'utf8');
            const searchQuery = searchContent.trim();
            if (!searchQuery) {
                throw new Error('Empty search.txt file');
            }
            console.log(`🔍 Found search parameters: ${searchQuery}`);
            return searchQuery;
        } catch (error) {
            console.error('Error reading search.txt:', error.message);
            throw new Error('search.txt file is required');
        }
    }

    // Method to attempt modal close (fast - assume it exists)
    async closeModalIfOpen() {
        try {
            // Just click assuming modal exists - ignore if it fails
            await this.page.click('a.link[aria-controls="modal"]').catch(() => {});
        } catch (error) {
            // Ignore all errors - we don't care if modal doesn't exist
        }
    }

    // Method to check if we're still on the search results page
    async checkIfOnSearchPage() {
        const currentUrl = this.page.url();
        return currentUrl.includes('/results/search');
    }

    // Method to return to search results page if we've navigated away
    async returnToSearchPageIfNeeded() {
        const isOnSearchPage = await this.checkIfOnSearchPage();
        if (!isOnSearchPage) {
            console.log('Page changed - returning to search results...');
            const searchQuery = await this.readSearchFromFile();
            await this.navigateTo(`https://www.brazilcupid.com/es/results/${searchQuery}`);
            await this.safeTimeout(3000); // Wait for page load
            return true;
        }
        return false;
    }

    // Method to click on "Siguiente" button for pagination (fast version)
    async clickNextPageButton() {
        try {
            // Get current URL to extract page number
            const currentUrl = this.page.url();
            const urlParams = new URL(currentUrl).searchParams;
            const currentPage = parseInt(urlParams.get('pageno') || '1');
            const nextPage = currentPage + 1;
            
            // Read search parameters from search.txt to preserve them
            const searchQuery = await this.readSearchFromFile();
            
            // Build next page URL with preserved search parameters
            const nextPageUrl = `https://www.brazilcupid.com/es/results/${searchQuery}&pageno=${nextPage}`;
            
            // Check if siguiente button exists first
            const siguienteExists = await this.page.$('a[href*="pageno="]');
            if (!siguienteExists) {
                console.log('No "Siguiente" button found - reached last page');
                return { success: false, currentPage: currentPage };
            }
            
            // Navigate directly to preserve search parameters
            await this.navigateTo(nextPageUrl);
            console.log(`Found "Siguiente" button - navigating to page ${nextPage} with search parameters...`);
            
            // Verify we actually moved to the next page
            await this.safeTimeout(2000); // Wait for page to load
            const newUrl = this.page.url();
            const newUrlParams = new URL(newUrl).searchParams;
            const actualPage = parseInt(newUrlParams.get('pageno') || '1');
            
            if (actualPage === currentPage) {
                console.log(`WARNING: Still on page ${currentPage} after navigation attempt - page loop detected`);
                return { success: false, currentPage: currentPage, loopDetected: true };
            }
            
            console.log('Successfully navigated to next page');
            return { success: true, currentPage: actualPage };
        } catch (error) {
            // If direct click fails, button doesn't exist
            console.log('No "Siguiente" button found - reached last page');
            return { success: false, currentPage: parseInt(urlParams.get('pageno') || '1') };
        }
    }

    // Method to click on deactivated hearts only
    async clickDeactivatedHearts() {
        
        try {
            console.log('💖 Looking for deactivated hearts...');
            
            // Take screenshot before clicking hearts
            await this.screenshot('before-hearts.png');
            
            // Find all heart containers - deactivated ones have data-showinterest with a URL
            const deactivatedHeartSelector = 'div.pointer.me3.relative.fill-action-unhighlight:not(.fill-action-highlight) [data-showinterest]:not([data-showinterest=""])';
            
            // Wait for hearts to be present
            await this.page.waitForSelector('div.pointer.me3.relative', { timeout: 10000 });
            
            // Get all deactivated hearts
            const deactivatedHearts = await this.page.$$(deactivatedHeartSelector);
            console.log(`🔍 Found ${deactivatedHearts.length} deactivated hearts`);
            
            let heartsClicked = 0;
            let lastClickTime = Date.now();
            
            if (deactivatedHearts.length === 0) {
                // Alternative approach - look for hearts with data-showinterest containing a URL
                const alternativeSelector = '[data-showinterest*="/es/memberrelationship/showInterest/"]';
                const alternativeHearts = await this.page.$$(alternativeSelector);
                console.log(`🔍 Found ${alternativeHearts.length} hearts with alternative selector`);
                
                // Click on alternative hearts
                for (let i = 0; i < alternativeHearts.length; i++) {
                    try {
                        const currentTime = Date.now();
                        const timeSinceLastClick = heartsClicked > 0 ? ((currentTime - lastClickTime) / 1000).toFixed(1) : 0;
                        
                        if (heartsClicked > 0) {
                            console.log(`Clicking heart ${i + 1}/${alternativeHearts.length} - ${timeSinceLastClick} seg`);
                        } else {
                            console.log(`Clicking heart ${i + 1}/${alternativeHearts.length}`);
                        }
                        
                        await alternativeHearts[i].click();
                        heartsClicked++;
                        lastClickTime = Date.now();
                        
                        // Quick modal close attempt (no waiting)
                        this.closeModalIfOpen(); // No await - fire and forget
                        
                        // Very short delay between clicks
                        await this.safeTimeout(100 + Math.random() * 200);
                        
                    } catch (error) {
                        console.log(`Failed to click heart ${i + 1}:`, error.message);
                    }
                }
            } else {
                // Click on each deactivated heart
                for (let i = 0; i < deactivatedHearts.length; i++) {
                    try {
                        const currentTime = Date.now();
                        const timeSinceLastClick = heartsClicked > 0 ? ((currentTime - lastClickTime) / 1000).toFixed(1) : 0;
                        
                        if (heartsClicked > 0) {
                            console.log(`Clicking deactivated heart ${i + 1}/${deactivatedHearts.length} - ${timeSinceLastClick} seg`);
                        } else {
                            console.log(`Clicking deactivated heart ${i + 1}/${deactivatedHearts.length}`);
                        }
                        
                        await deactivatedHearts[i].click();
                        heartsClicked++;
                        lastClickTime = Date.now();
                        
                        // Quick modal close attempt (no waiting)
                        this.closeModalIfOpen(); // No await - fire and forget
                        
                        // Very short delay between clicks
                        await this.safeTimeout(100 + Math.random() * 200);
                        
                    } catch (error) {
                        console.log(`Failed to click heart ${i + 1}:`, error.message);
                    }
                }
            }
            
            // Take screenshot after clicking hearts
            await this.screenshot('after-hearts.png');
            console.log(`✅ Finished clicking hearts on this page - clicked ${heartsClicked} hearts`);
            
            return heartsClicked;
            
        } catch (error) {
            console.error('Error clicking hearts:', error.message);
            await this.screenshot('hearts-error.png');
            return 0;
        }
    }

    // BrazilCupid specific workflow following instructions.md
    async runBrazilCupidWorkflow() {
        try {
            console.log('Starting BrazilCupid workflow...');
            
            // Step 1: Navigate to login page
            console.log('Step 1: Navigating to login page...');
            await this.navigateTo('https://www.brazilcupid.com/es/auth/login');
            
            // Step 2: Wait for page load and perform login
            console.log('Step 2: Waiting for page load and performing login...');
            await this.safeTimeout( 3000); // Wait 3 seconds for page stabilization
            
            // Add random mouse movements to simulate human behavior
            await this.page.mouse.move(100, 100);
            await this.safeTimeout(500);
            await this.page.mouse.move(200, 200);
            
            // Wait for login form elements to be available
            await this.waitForSelector('input[name="email"], input[type="email"]', 10000);
            await this.waitForSelector('input[name="password"], input[type="password"]', 10000);
            
            // Enter credentials (use environment variables for security)
            const emailSelector = 'input[name="email"], input[type="email"]';
            const passwordSelector = 'input[name="password"], input[type="password"]';
            
            const email = process.env.BRAZIL_CUPID_EMAIL;
            const password = process.env.BRAZIL_CUPID_PASSWORD;
            
            if (!email || !password) {
                throw new Error('BRAZIL_CUPID_EMAIL and BRAZIL_CUPID_PASSWORD environment variables are required');
            }
            
            // Simulate human typing with very fast delays
            await this.page.focus(emailSelector);
            await this.safeTimeout(200);
            await this.page.type(emailSelector, email, { delay: 15 });
            
            await this.safeTimeout(250);
            await this.page.focus(passwordSelector);
            await this.safeTimeout(150);
            await this.page.type(passwordSelector, password, { delay: 18 });
            
            // Take screenshot before clicking login
            await this.screenshot('before-login.png');
            
            // Click login button
            const loginButtonSelector = 'button[type="submit"], input[type="submit"], .btn-login, .login-btn, [value="Ingresar"]';
            await this.click(loginButtonSelector);
            console.log('Login button clicked');
            
            // Step 3: Wait for login completion with better error handling
            console.log('Step 3: Waiting for login completion...');
            try {
                // Wait for either navigation OR error messages on same page
                await Promise.race([
                    this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                    this.page.waitForSelector('.error, .alert, .warning, [class*="error"]', { timeout: 5000 })
                ]);
                
                // Take screenshot after login attempt
                await this.screenshot('after-login.png');
                
                // Check if we're still on login page (login failed)
                const currentUrl = this.page.url();
                console.log('🔍 Current URL after login:', currentUrl);
                
                if (currentUrl.includes('login') || currentUrl.includes('auth')) {
                    console.log('⚠️  Still on login page - checking for errors...');
                    
                    // Look for error messages
                    const errorElements = await this.page.$$('.error, .alert, .warning, [class*="error"]');
                    if (errorElements.length > 0) {
                        const errorText = await this.page.evaluate(() => {
                            const errors = document.querySelectorAll('.error, .alert, .warning, [class*="error"]');
                            return Array.from(errors).map(el => el.textContent.trim()).join('; ');
                        });
                        console.log('❌ Login error found:', errorText);
                    }
                    
                    // Wait a bit more in case it's a slow redirect
                    console.log('⏳ Waiting additional time for potential redirect...');
                    await this.safeTimeout(5000);
                } else {
                    console.log('✅ Login correcto! 🎉 - navigated to:', currentUrl);
                }
                
            } catch (error) {
                console.log('No navigation detected, checking current state...');
                await this.screenshot('login-timeout.png');
                
                const currentUrl = this.page.url();
                console.log('Current URL after timeout:', currentUrl);
                
                // Continue anyway if we're not on login page
                if (!currentUrl.includes('login') && !currentUrl.includes('auth')) {
                    console.log('✅ Login correcto! 🎉 (redirected from login page)');
                } else {
                    console.log('❌ Login may have failed - still on login page');
                }
            }
            
            // Step 4: Always use initial.txt as primary URL
            console.log('Step 4: Reading primary URL from initial.txt...');
            const targetUrl = await this.readInitialFromFile();
            
            console.log(`🚀 Navigating to primary URL: ${targetUrl}`);
            await this.navigateTo(targetUrl);
            
            // Step 5: Cyclic heart clicking with pagination
            console.log('Step 5: Starting cyclic heart clicking with pagination...');
            await this.safeTimeout(3000); // Wait for page stabilization
            
            let totalHeartsClicked = 0;
            let consecutiveLoops = 0;
            
            while (true) {
                console.log(`\n=== Processing current page ===`);
                
                // Click hearts on current page
                const heartsClickedOnPage = await this.clickDeactivatedHearts();
                totalHeartsClicked += heartsClickedOnPage;
                
                console.log(`💖 Hearts clicked on this page: ${heartsClickedOnPage}`);
                console.log(`📊 Total hearts clicked so far: ${totalHeartsClicked}`);
                
                // Try to go to next page
                console.log('Checking for next page...');
                const nextPageResult = await this.clickNextPageButton();
                
                if (!nextPageResult.success) {
                    if (nextPageResult.loopDetected) {
                        consecutiveLoops++;
                        console.log(`Page loop detected! Consecutive loops: ${consecutiveLoops}`);
                        
                        if (consecutiveLoops >= 3) {
                            console.log('🔄 Multiple page loops detected - restarting from page 1');
                            const searchQuery = await this.readSearchFromFile();
                            const resetUrl = `https://www.brazilcupid.com/es/results/${searchQuery}`;
                            await this.navigateTo(resetUrl);
                            consecutiveLoops = 0;
                            await this.safeTimeout(3000);
                            continue;
                        }
                    } else {
                        console.log('🆕 No more pages available - restarting from initial URL');
                        
                        console.log('🚀 Navigating back to initial URL...');
                        const initialUrl = await this.readInitialFromFile();
                        await this.navigateTo(initialUrl);
                        await this.safeTimeout(3000); // Wait for page load
                        consecutiveLoops = 0;
                        
                        console.log('♾️ Restarting heart clicking cycle from initial URL...');
                        continue; // Continue the infinite loop
                    }
                } else {
                    // Successfully moved to next page - reset loop counter
                    consecutiveLoops = 0;
                }
                
                // Add delay between pages
                await this.safeTimeout(2000);
            }
            
            // This should never be reached due to infinite loop
            console.log(`\n=== Infinite cycle running ===`);
            console.log(`Total hearts clicked in this session: ${totalHeartsClicked}`);
            
            console.log('BrazilCupid workflow completed successfully');
            
        } catch (error) {
            console.error('Error in BrazilCupid workflow:', error);
            throw error;
        }
    }
}

async function example() {
    const scraper = new WebScraper();
    
    try {
        await scraper.init();
        
        await scraper.navigateTo('https://example.com');
        
        await scraper.screenshot('example-page.png');
        
        const title = await scraper.getText('h1');
        console.log('Page title:', title);
        
        await scraper.close();
        
    } catch (error) {
        console.error('Error:', error);
        await scraper.close();
    }
}

// BrazilCupid workflow function following instructions.md
async function runBrazilCupidFlow() {
    const scraper = new WebScraper();
    
    try {
        console.log('Initializing browser with Spanish locale...');
        await scraper.init();
        
        await scraper.runBrazilCupidWorkflow();
        
        await scraper.close();
        
    } catch (error) {
        console.error('Error in BrazilCupid workflow:', error);
        await scraper.close();
    }
}

module.exports = WebScraper;

if (require.main === module) {
    // Run BrazilCupid workflow by default
    runBrazilCupidFlow();
}