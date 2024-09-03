const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');
const { differenceInDays, parse} = require('date-fns'); // Use date-fns for date manipulation
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const allowedUsersFile = path.join(__dirname, 'allowedUsers.json');

// Load allowed users from the JSON file, or start with the default values if the file doesn't exist
let allowedUsers = new Set();
if (fs.existsSync(allowedUsersFile)) {
  const data = fs.readFileSync(allowedUsersFile, 'utf8');
  allowedUsers = new Set(JSON.parse(data));
} else {
  allowedUsers = new Set([5966357024, 7272558097]); // Default values
}

let scrapeState = {}; // To store state of scraping process for each user
let websiteOrder = ['https://www.kleinanzeigen.de/', 'https://www.ebay.de/', 'https://www.willhaben.at/'];

// Mapping of numbers to websites
const websiteMap = {
  1: 'https://www.kleinanzeigen.de/',
  2: 'https://www.ebay.de/',
  3: 'https://www.willhaben.at/'
};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id; 
    const userId = msg.from.id;
    const text = msg.text;

    if (!allowedUsers.has(userId)) {
      return bot.sendMessage(chatId, 'You are not authorized to use this bot.');
    }

    if (text === '/addUser') {
      bot.sendMessage(chatId, 'Please enter the user ID to add:');
      scrapeState[chatId] = { step: 'awaiting_user_id' };
      return;
    }

    if (text === '/removeUser') {
      bot.sendMessage(chatId, 'Please enter the user ID to remove:');
      scrapeState[chatId] = { step: 'awaiting_remove_user_id' };
      return;
    }
    
    if (scrapeState[chatId] && scrapeState[chatId].step === 'awaiting_user_id') {
      const newUserId = parseInt(text.trim(), 10);
      
      if (isNaN(newUserId)) {
        bot.sendMessage(chatId, 'Invalid user ID. Please enter a valid numeric user ID.');
        return;
      }

      if (allowedUsers.has(newUserId)) {
        bot.sendMessage(chatId, 'User ID is already in the allowed list.');
      } else {
        allowedUsers.add(newUserId);
        bot.sendMessage(chatId, `User ID ${newUserId} has been added to the allowed list.`);

        // Save the updated allowedUsers set to the JSON file
        fs.writeFileSync(allowedUsersFile, JSON.stringify([...allowedUsers], null, 2));
      }

      delete scrapeState[chatId];
      return;
    }

    if (scrapeState[chatId] && scrapeState[chatId].step === 'awaiting_remove_user_id') {
      const userIdToRemove = parseInt(text.trim(), 10);
      
      if (isNaN(userIdToRemove)) {
        bot.sendMessage(chatId, 'Invalid user ID. Please enter a valid numeric user ID.');
        return;
      }

      if (allowedUsers.has(userIdToRemove)) {
        allowedUsers.delete(userIdToRemove);
        bot.sendMessage(chatId, `User ID ${userIdToRemove} has been removed from the allowed list.`);

        // Save the updated allowedUsers set to the JSON file
        fs.writeFileSync(allowedUsersFile, JSON.stringify([...allowedUsers], null, 2));
      } else {
        bot.sendMessage(chatId, 'User ID is not in the allowed list.');
      }

      delete scrapeState[chatId];
      return;
    }

    // if (text === '/addUser') {
    //   if (!allowedUsers.has(userId)) {
    //     return bot.sendMessage(chatId, 'You are not authorized to add users.');
    //   }
    //   bot.sendMessage(chatId, 'Please enter the user ID to add:');
    //   scrapeState[chatId] = { step: 'awaiting_user_id' };
    //   return;
    // }
    
    // if (scrapeState[chatId] && scrapeState[chatId].step === 'awaiting_user_id') {
    //   const newUserId = parseInt(text.trim(), 10);
      
    //   if (isNaN(newUserId)) {
    //     bot.sendMessage(chatId, 'Invalid user ID. Please enter a valid numeric user ID.');
    //     return;
    //   }

    //   if (allowedUsers.has(newUserId)) {
    //     bot.sendMessage(chatId, 'User ID is already in the allowed list.');
    //   } else {
    //     allowedUsers.add(newUserId);
    //     bot.sendMessage(chatId, `User ID ${newUserId} has been added to the allowed list.`);

    //     // Save the updated allowedUsers set to the JSON file
    //     fs.writeFileSync(allowedUsersFile, JSON.stringify([...allowedUsers], null, 2));
    //   }

    //   delete scrapeState[chatId];
    //   return;
    // }

    /////////////
  
    // if (!allowedUsers.has(userId)) {
    //   return bot.sendMessage(chatId, 'You are not authorized to use this bot.');
    // }
  
    if (text === '/scrape') {
      bot.sendMessage(chatId, 'Do you want to change the order of websites? (Yes/No)');
      scrapeState[chatId] = { step: 'awaiting_change_order' };
    } else if (scrapeState[chatId] && scrapeState[chatId].step === 'awaiting_change_order') {
      if (text.toLowerCase() === 'yes') {
        bot.sendMessage(chatId, 'Please enter the website order using numbers (e.g., 123 for kleinanzeigen, eBay, willhaben):');
        scrapeState[chatId].step = 'awaiting_new_order';
      } else if (text.toLowerCase() === 'no') {
        bot.sendMessage(chatId, 'Please enter the product parameter:');
        scrapeState[chatId].step = 'awaiting_product';
      } else {
        bot.sendMessage(chatId, 'Please respond with "Yes" or "No".');
      }
    } else if (scrapeState[chatId] && scrapeState[chatId].step === 'awaiting_new_order') {
      // Convert the user input into the corresponding website order
      websiteOrder = text.split('').map(num => websiteMap[num]).filter(Boolean);
      if (websiteOrder.length === 0) {
        bot.sendMessage(chatId, 'Invalid input. Please use the numbers 1, 2, and 3 to specify the order.');
        return;
      }
      bot.sendMessage(chatId, 'Order updated. Please enter the product parameter:');
      scrapeState[chatId].step = 'awaiting_product';
    } else if (scrapeState[chatId] && scrapeState[chatId].step === 'awaiting_product') {
      scrapeState[chatId].productParam = text;
      bot.sendMessage(chatId, 'Please enter the min and max price (e.g., 50-200):');
      scrapeState[chatId].step = 'awaiting_price_range';
    } else if (scrapeState[chatId] && scrapeState[chatId].step === 'awaiting_price_range') {
      const priceRange = text.split('-').map(Number);
  
      if (priceRange.length !== 2 || priceRange.some(isNaN) || priceRange[0] <= 0 || priceRange[1] <= 0 || priceRange[0] > priceRange[1]) {
        bot.sendMessage(chatId, 'Please enter a valid price range in the format "min-max".');
        return;
      }
  
      const [minPrice, maxPrice] = priceRange;
      scrapeState[chatId].minPrice = minPrice;
      scrapeState[chatId].maxPrice = maxPrice;
      
      bot.sendMessage(chatId, 'How many days the product is online?');
      scrapeState[chatId].step = 'awaiting_days_online';
    } else if (scrapeState[chatId] && scrapeState[chatId].step === 'awaiting_days_online') {
      const daysOnline = parseInt(text, 10);
      
      if (isNaN(daysOnline) || daysOnline <= 0) {
        bot.sendMessage(chatId, 'Please enter a valid number of days.');
        return;
      }
  
      scrapeState[chatId].daysOnline = daysOnline;
      const { productParam, minPrice, maxPrice } = scrapeState[chatId];
  
      bot.sendMessage(chatId, 'Waiting for data...');

      try {
        for (const site of websiteOrder) {
          let links = [];

          if (site === 'https://www.kleinanzeigen.de/') {
            links = await scrapeData(site, productParam, minPrice, maxPrice, {
              // Kleinanzeigen selectors here
              searchInputSelector: 'input[placeholder="Was suchst du?"]',
              submitButtonSelector: 'div.a-span-4.l-col > button[type="submit"]',
              minPriceSelector: 'input[placeholder="Von"]',
              maxPriceSelector: 'input[placeholder="Bis"]',
              applyButtonSelector: 'button.button-iconized > i.icon-play-interactive',
              itemLinkSelector: '#srchrslt-adtable li.ad-listitem .aditem .aditem-main h2 a[href]',
              priceSelector: '#srchrslt-adtable li.ad-listitem .aditem .aditem-main .aditem-main--middle .aditem-main--middle--price-shipping .aditem-main--middle--price-shipping--price',
              timeSelector: '#srchrslt-adtable li.ad-listitem .aditem .aditem-main--top .aditem-main--top--right', // Selector for time
              nextPageSelector: '.pagination-pages .pagination-current + a',
              linkFilter: link => link.includes('/s-anzeige/'),
            }, daysOnline);
          } else if (site === 'https://www.ebay.de/') {
            links = await scrapeData(site, productParam, minPrice, maxPrice, {
              // eBay selectors here
              searchInputSelector: 'input[placeholder="Bei eBay finden"]',
              submitButtonSelector: 'td.gh-td.gh-sch-btn input#gh-btn',
              minPriceSelector: 'input[aria-label="Mindestwert in EUR"]',
              maxPriceSelector: 'input[aria-label="Höchstwert in EUR"]',
              // applyButtonSelector: 'button[aria-label="Preisspanne senden"]',
              // applyButtonSelector: 'button.btn--states[aria-label="Preisspanne senden"]',
              // applyButtonSelector: 'div.x-textrange__button > button[type="button"]',
              applyButtonSelector: 'button[title="Preisspanne senden"]',
              itemLinkSelector: '#srp-river-results .srp-results.srp-list li.s-item .s-item__wrapper .s-item__image-section .s-item__image a[href]',
              priceSelector: '#srp-river-results .srp-results.srp-list li.s-item  .s-item__wrapper .s-item__info .s-item__details .s-item__details-section--primary .s-item__detail.s-item__detail--primary .s-item__price',
              nextPageSelector: 'ol.pagination__items li a[aria-current="page"] + li a',
              // nextPageSelector: '.pagination__items li a[aria-current="page"] + li a',
              linkFilter: link => link.includes('/itm/'),
            });
            // }, daysOnline);
          } else if (site === 'https://www.willhaben.at/') {
            links = await scrapeData(site, productParam, minPrice, maxPrice, {
              // Willhaben selectors here
              searchInputSelector: 'input#keyword[aria-controls="keyword-menu"][placeholder="Was suchst du?"]',
              submitButtonSelector: 'button[data-testid="suchbegriff-search-button"]',
              minPriceSelector: 'input[aria-label="Preis von"]',
              maxPriceSelector: 'input[aria-label="Preis bis"]',
              applyButtonSelector: 'input[aria-label="Preis bis"]',
              itemLinkSelector: '#skip-to-resultlist .Box-sc-wfmb7k-0.fyHDKe a[href^="/iad/kaufen-und-verkaufen/"]',
              priceSelector: '#skip-to-resultlist .Box-sc-wfmb7k-0.fyHDKe .Box-sc-wfmb7k-0.fxndFB .Box-sc-wfmb7k-0.hkVNCM .Box-sc-wfmb7k-0.kuqpal .Text-sc-10o2fdq-0.kpkFyD',
              timeSelector: '#skip-to-resultlist .Box-sc-wfmb7k-0.fyHDKe .Box-sc-wfmb7k-0.fxndFB .Box-sc-wfmb7k-0.gWWtTS .Text-sc-10o2fdq-0', // Selector for time
              nextPageSelector: '.pagination__items li a[aria-current="page"] + li a',
              linkFilter: link => link.includes('/d/'),
            }, daysOnline);
          }

          if (links.length > 0) {
            await sendLinksInBatches(chatId, links, 5, 2000);
          } else {
            bot.sendMessage(chatId, `No product found on ${site}.`);
          }
        }
      } catch (error) {
        bot.sendMessage(chatId, `Error scraping data: ${error.message}`);
      }
  
      delete scrapeState[chatId];
    } else {
      bot.sendMessage(chatId, 'Please use /scrape to start the process.');
    }
  });

// Function to send links with callback data
async function sendLinksWithCallback(chatId, links) {
  links.forEach((link, index) => {
    bot.sendMessage(chatId, link, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Mark as Done', callback_data: `done_${index}` }
          ]
        ]
      }
    });
  });
}

// Function to send links in batches
async function sendLinksInBatches(chatId, links, batchSize, delay) {
  for (let i = 0; i < links.length; i += batchSize) {
    const batch = links.slice(i, i + batchSize);
    await sendLinksWithCallback(chatId, batch);

    if (i + batchSize < links.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Function to scroll the page down a specific number of times
async function scrollPage(page, scrollTimes = 10, delay = 1000) {
  for (let i = 0; i < scrollTimes; i++) {
    try {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(resolve => setTimeout(resolve, delay)); // Wait for specified delay between scrolls
    } catch (error) {
      console.error('Error during scrolling:', error);
      break; // Exit the loop if scrolling fails
    }
  }
}

// Function to scrape data with site-specific selectors
async function scrapeData(url, productParam, minPrice, maxPrice, selectors, daysOnline) {

  // Define the path to the Chromium executable
  // const chromiumPath = path.join(__dirname, 'browser', 'puppeteer', 'chrome', 'win64-128.0.6613.86', 'chrome-win64', 'chrome.exe');
  const chromiumPath = path.join(__dirname, 'browser', 'puppeteer', 'chrome-headless-shell', 'win64-128.0.6613.86', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');

  console.log('Chromium Path:', chromiumPath); // Log the path to verify it

  const browser = await puppeteer.launch({ 
    // headless: false,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
    executablePath: chromiumPath, // Use the custom Chromium path
  });

  const page = await browser.newPage();
  let allLinks = []; // To store all the links from all pages

  try {
    console.log('Navigating to:', url);
    await page.goto(url, { timeout: 180000, waitUntil: 'networkidle2' });


    // Check for GDPR banner in www.kleinanzeigen.de and click if it exists
    try {
      console.log('Checking for GDPR banner');
      const gdprButton = await page.waitForSelector('button[data-testid="gdpr-banner-accept"]', { timeout: 5000 });
      if (gdprButton) {
        console.log('Clicking GDPR banner accept button');
        await gdprButton.click();
        // Wait for any potential changes after accepting
        await page.waitForTimeout(2000); // Adjust this as needed
      }
    } catch (error) {
      console.log('No GDPR banner found');
    }

    // Attempt to click the allow cookie selector in www.willhaben.at if it exists
    try {
      console.log('Checking for allow cookie selector to click');
      const specificSelector = await page.waitForSelector('#didomi-notice-agree-button', { timeout: 5000 });
      if (specificSelector) {
        console.log('Clicking the allow cookie selector');
        await specificSelector.click();
        // Wait for any potential changes after the click
        await page.waitForTimeout(2000); // Adjust this as needed
      }
    } catch (error) {
      console.log('allow cookie selector not found, continuing...');
    }

    // Attempt to click the marketplace selector in www.willhaben.at if it exists
    try {
      console.log('Checking for marketplace selector to click');
      const specificSelector = await page.waitForSelector('div.Box-sc-wfmb7k-0.kOtDau span', { timeout: 5000 });
      if (specificSelector) {
        console.log('Clicking the marketplace selector');
        await specificSelector.click();
        // Wait for any potential changes after the click
        await page.waitForTimeout(2000); // Adjust this as needed
      }
    } catch (error) {
      console.log('allow cookie selector not found, continuing...');
    }

    console.log('Waiting for search input selector');
    await page.waitForSelector(selectors.searchInputSelector, { timeout: 120000 });

    console.log('Delaying for 30 seconds before typing the parameter...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Type in the product parameter and submit
    console.log('Typing product parameter:', productParam);
    await page.type(selectors.searchInputSelector, productParam);
    await page.click(selectors.submitButtonSelector);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

    await scrollPage(page); // Scroll the page 10 times before starting to scrape

    console.log('Applying price filter');

    // Focus and type minPrice
    await page.waitForSelector(selectors.minPriceSelector, { timeout: 120000 });
    const minPriceInput = await page.$(selectors.minPriceSelector);
    await minPriceInput.click({ clickCount: 3 });
    await minPriceInput.type(minPrice.toString(), { delay: 700 });

    // Focus and type maxPrice
    await page.waitForSelector(selectors.maxPriceSelector, { timeout: 120000 });
    const maxPriceInput = await page.$(selectors.maxPriceSelector);
    await maxPriceInput.click({ clickCount: 3 });
    await maxPriceInput.type(maxPrice.toString(), { delay: 700 });

    console.log('Delaying for 5 seconds before clicking the filter parameter...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Apply the filter
    console.log('Clicked the apply filter button');
    await page.click(selectors.applyButtonSelector);
    // await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 180000 });
    console.log('Delaying for 5 seconds after clicking the filter parameter...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Scrolling through the page');
    await scrollPage(page); // Scroll the page 10 times before starting to scrape

    console.log('Delaying for 1 minute before scraping...');
    await new Promise(resolve => setTimeout(resolve, 60000));

    let hasNextPage = true;  

    while (hasNextPage) {
      // Scrape href links and time values on the current page
      console.log('Scraping links and time values on current page');
      const links = await page.evaluate((linkSelector, priceSelector, timeSelector) => {
        const items = document.querySelectorAll(linkSelector);
        return Array.from(items).map(item => {
          const link = item.href;
    
          let priceElement;
          let priceText = null;
          let timeText = null;
    
          // Determine which site is being scraped based on URL or a characteristic selector
          // if (document.location.hostname.includes('kleinanzeigen.de') || document.location.hostname.includes('ebay.de')) {
          if (document.location.hostname.includes('kleinanzeigen.de')) {
            // For Kleinanzeigen and eBay, use closest('li')
            priceElement = item.closest('li').querySelector(priceSelector);
            // Extract the time value using timeSelector
            timeElement = item.closest('li').querySelector(timeSelector);
          } else if (document.location.hostname.includes('ebay.de')) {
            priceElement = item.closest('li').querySelector(priceSelector);
            // Extract the time value using timeSelector
            timeElement = item.closest('li').querySelector(timeSelector);
          } else if (document.location.hostname.includes('willhaben.at')) {
            // For Willhaben, directly query the price element
            priceElement = item.querySelector(priceSelector);
            timeElement = item.querySelector(timeSelector);
          }
    
          if (priceElement) {
            priceText = priceElement.innerText;
          }

          if (timeElement) {
            timeText = timeElement.innerText;
          }
          
          // const timeText = timeElement ? timeElement.innerText : 'Time not found';
    
          const price = priceText ? parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.')) : null;
          return { link, price, timeText };
        });
      }, selectors.itemLinkSelector, selectors.priceSelector, selectors.timeSelector);
    
      // Log all links and their corresponding time values before filtering
      // links.forEach(({ link, timeText }) => {
      //   console.log('Link:', link, 'Time value:', timeText);
      // });
    
      // First filter based on the price range
      let filteredLinks = links.filter(({ price }) => price !== null && price >= minPrice && price <= maxPrice);

      // Second filter to exclude links with "WatchListAdd" in the href
      filteredLinks = filteredLinks.filter(({ link }) => !link.includes("WatchListAdd"));

      // Conditionally apply the third filter (based on time) if not scraping ebay.de
      if (!url.includes('ebay.de')) {
        filteredLinks = filteredLinks.filter(({ timeText }) => {
          if (timeText.includes("Gestern") || timeText.includes("Heute")) {
            return true;
          }
          
          const datePattern = /(\d{2})\.(\d{2})\.(\d{4})?/;
          const dateTimePattern = /(\d{2})\.(\d{2}) - \d{2}:\d{2} Uhr/;

          if (datePattern.test(timeText) || dateTimePattern.test(timeText)) {
            const match = timeText.match(datePattern);

            if (match) {
              const [_, day, month, year] = match;
              const parsedDate = parse(
                `${day}.${month}.${year || new Date().getFullYear()}`,
                'dd.MM.yyyy',
                new Date()
              );

              const difference = differenceInDays(new Date(), parsedDate);
              console.log(`Parsed Date: ${parsedDate}, Difference in days: ${difference}, Days Online Filter: ${daysOnline}`);
              return difference <= daysOnline;
            }
          }

          return false;
        });
      }

      // Third filter to handle time values
      // filteredLinks = filteredLinks.filter(({ timeText }) => {
      // // Check if the timeText includes "Heute" or "Gestern"
      // if (timeText.includes("Gestern") || timeText.includes("Heute")) {
      //   return true;
      // }
      
      //  // Check if the timeText matches date patterns like "dd.MM.yyyy" or "dd.MM. - HH:mm Uhr"
      // const datePattern = /(\d{2})\.(\d{2})\.(\d{4})?/; // Matches "23.03.2024"
      // const dateTimePattern = /(\d{2})\.(\d{2}) - \d{2}:\d{2} Uhr/; // Matches "28.08. - 16:49 Uhr"

      // if (datePattern.test(timeText) || dateTimePattern.test(timeText)) {
      //   const match = timeText.match(datePattern);

      //   if (match) {
      //     const [_, day, month, year] = match;
      //     const parsedDate = parse(
      //       `${day}.${month}.${year || new Date().getFullYear()}`,
      //       'dd.MM.yyyy',
      //       new Date()
      //     );

      //     // Calculate the difference in days and check against daysOnline
      //     const difference = differenceInDays(new Date(), parsedDate);
      //     console.log(`Parsed Date: ${parsedDate}, Difference in days: ${difference}, Days Online Filter: ${daysOnline}`);
      //     return difference <= daysOnline;
      //   }
      // }

      // // Return false if none of the above conditions are met
      // return false;
      // });
    
      // Map to extract the link only
      filteredLinks = filteredLinks.map(({ link }) => link);

      // console.log(...filteredLinks);
    
      // Ensure links are added in order as they appear on the page
      allLinks.push(...filteredLinks);
    
      // Check if there's a next page
      console.log('Checking for next page');
      const nextPageLink = await page.$(selectors.nextPageSelector);
    
      if (nextPageLink) {
        console.log('Navigating to next page');
        await nextPageLink.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Scrolling through the next page');
        await scrollPage(page); // Scroll the new page 10 times before scraping
      } else {
        console.log('No more pages to scrape');
        hasNextPage = false;
      }
    }     

    // After all pages are scraped, log a message indicating that the product scraping for this website is done
    // console.log(`${new URL(url).hostname} product scraped. Send to Telegram.`);

    return allLinks;
  } catch (error) {
    console.error('Scraping failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Handle callback queries for inline buttons
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;

  // Extract the index from the callback data
  const index = data.split('_')[1];

  // Get the current message text
  let newText = msg.text;

  // Remove existing check marks if any
  newText = newText.replace(/✅ /, '');

  // Add the check mark to the corresponding link
  newText = `✅ ${newText}`;

  // Edit the message with the check mark
  await bot.editMessageText(newText, {
    chat_id: msg.chat.id,
    message_id: msg.message_id
  });

  // Optionally, you can send a confirmation message or log the action
});


