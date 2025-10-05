import puppeteer from 'puppeteer-core';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: "../.env.local" });

// const END_POINT = process.env.BRIGHT_DATA || '';
const END_POINT = "wss://brd-customer-hl_5b9b36e1-zone-scraping_browser1:6s5cys084iu2@brd.superproxy.io:9222";

function extractCalendarData() {
  const monthNameElement = document.querySelector('.dpPHeaderLeftTitle');
  const monthName = monthNameElement ? monthNameElement.textContent.trim() : null;

  let startingDate = null;
  let prvMonthEndingDate = null;

  const dateSpans = document.querySelectorAll('span.dpSmallDate');
  dateSpans.forEach(span => {
    if (span.textContent.trim() === '1') {
      const targetDiv = span.parentElement.parentElement;

      if (targetDiv && targetDiv.tagName === 'DIV' && targetDiv.dataset.url) {
        const dataUrl = targetDiv.dataset.url;
        startingDate = dataUrl.split('=')[1];

        const elementAbove = targetDiv.previousElementSibling;
        if (elementAbove && elementAbove.dataset.url) {
          const endingDateUrl = elementAbove.dataset.url;
          prvMonthEndingDate = endingDateUrl.split('=')[1];
        }
      }
    }
  });

  return {
    monthName,
    startingDate,
    prvMonthEndingDate
  };
}


async function main() {
    let browser;

    try {
        console.log(`${END_POINT}\nConnecting to browser...`);
        browser = await puppeteer.connect({
            browserWSEndpoint: END_POINT,
        });
        console.log('✅ Connected!');

        if (!fs.existsSync('json-data')) {
            fs.mkdirSync('json-data');
        }

        const startYear = 2011;
        const endYear = 2025;
        const allScrapedData = [];

        let flag = false;

        for (let year = startYear; year <= endYear; year++) {
            for (let month = 1; month <= 12; month++) {
                const url = `https://www.drikpanchang.com/bengali/bengali-month-panjika.html?date=28/${month}/${year}`;
                console.log(`Scraping: ${year}-${String(month).padStart(2, '0')}`);

                let page;
                try {
                    page = await browser.newPage();
                    page.setDefaultNavigationTimeout(2 * 60 * 1000);

                    await page.goto(url, { waitUntil: 'domcontentloaded' });
                    await page.waitForSelector('.dpMonthGrid', { timeout: 30000 });

                    const pageData = await page.evaluate(extractCalendarData);

                    if (pageData.monthName) {
                        allScrapedData.push({
                            year,
                            month,
                            ...pageData
                        });
                    } else {
                         console.warn(`⚠️ Could not find month name for ${url}. Skipping.`);
                    }

                } catch (error) {
                    console.error(`❌ Could not scrape ${url}. Error: ${error.message}`);
                    flag = true;
                    break;
                } finally {
                    if (page) await page.close();
                }
            }
            if (flag) break;
        }

        console.log(`\n✅ Scraping finished. Found data for ${allScrapedData.length} months.`);
        console.log('Processing data to calculate month ranges...');

        // Sort data chronologically to ensure correct pairing of months
        allScrapedData.sort((a, b) => new Date(a.year, a.month - 1) - new Date(b.year, b.month - 1));

        const finalResults = [];
        // Loop through the sorted data to construct the final month ranges
        for (let i = 0; i < allScrapedData.length - 1; i++) {
            const currentMonth = allScrapedData[i];
            const nextMonth = allScrapedData[i + 1];

            // The end date of the current Bengali month is the day before the next one starts.
            // Our scraper gets this from the `prvMonthEndingDate` field of the *next* month's scrape.
            if (currentMonth.monthName && currentMonth.startingDate && nextMonth.prvMonthEndingDate) {
                 finalResults.push({
                    monthName: currentMonth.monthName,
                    startingDate: currentMonth.startingDate,
                    EndingDate: nextMonth.prvMonthEndingDate // This is the key logic
                });
            } else {
                 console.warn(`⚠️ Incomplete data for month ${currentMonth.month}/${currentMonth.year}, cannot form a complete range.`);
            }
        }

        console.log(`✅ Processing complete. Generated ${finalResults.length} month ranges.`);

        const filename = `json-data/bengali_months_${startYear}-${endYear}.json`;
        fs.writeFileSync(filename, JSON.stringify(finalResults, null, 2));
        console.log(`\n💾 Success! Data saved to ${filename}`);

    } catch (e) {
        console.error('A critical error occurred:', e);
    } finally {
        if (browser) {
            console.log('Closing browser connection...');
            await browser.close();
        }
    }
}

main();
