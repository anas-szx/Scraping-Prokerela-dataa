import puppeteer from 'puppeteer-core'
import dotenv from 'dotenv'
import fs from 'fs';

dotenv.config({ path: "../.env.local" });

const END_POINT = process.env.BRIGHT_DATA || '';


async function main2() {
    let browser;
    try {
      browser = await puppeteer.connect({
        browserWSEndpoint: END_POINT
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(2*60*1000);
      await page.goto(`https://www.drikpanchang.com/bengali/bengali-month-panjika.html?date=28/5/2020`);
      const body = await page.$('body');

      const html = await page.evaluate(() => document.documentElement.outerHTML);
      console.log('-->', html);


    } catch(e) {
      console.log('Error while scraping:', e);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
}

function extractAmavasyaEvents() {
    const events = [];
    const amavasyaImages = document.querySelectorAll('.events img[title="Amavasya"]');

    amavasyaImages.forEach(img => {
        const amavasyaCell = img.closest('td.cal-day');
        if (!amavasyaCell || !amavasyaCell.dataset.day) return;

        const amavasyaDay = amavasyaCell.dataset.day | null;

        let nextDayCell = amavasyaCell.nextElementSibling;
        if (!nextDayCell || nextDayCell.classList.contains('cal-day-blank')) {
            const currentRow = amavasyaCell.closest('tr');
            const nextRow = currentRow ? currentRow.nextElementSibling : null;
            if (nextRow) {
                nextDayCell = nextRow.querySelector('td.cal-day:not(.cal-day-blank)');
            }
        }
        
        let newMonthName = ""
        const startingNextMonth = nextDayCell.dataset.day | null;

        if (nextDayCell) {
            const submonthElement = nextDayCell.querySelector('.day-info .submonth-name');
            if (submonthElement) {
                newMonthName = submonthElement.textContent.trim();
            }
        }

        events.push({
            amavasyaDay: amavasyaDay,
            newMonthName: newMonthName,
            startingMonth: startingNextMonth
        });
    });
    return events;
}


async function main() {
    let browser;

    try {
        console.log('Connecting to browser...');
        browser = await puppeteer.connect({
            browserWSEndpoint: END_POINT,
        });
        console.log('✅ Connected!');

        const startYear = 2020;
        const endYear = 2025;
        const allAmavasyaEvents = [];

        for (let year = startYear; year <= endYear; year++) {
            for (let month = 1; month <= 12; month++) {
                // const url = `https://www.prokerala.com/general/calendar/gujaraticalendar.php?year=${year}&month=${month}&sb=1`;
                const url = `https://www.drikpanchang.com/bengali/bengali-month-panjika.html?date=31/${month}/${year}`;
                console.log(`Scraping: ${year}-${String(month).padStart(2, '0')}`);
                
                let page;
                try {
                    page = await browser.newPage();
                    page.setDefaultNavigationTimeout(2 * 60 * 1000);
                    
                    await page.goto(url, { waitUntil: 'domcontentloaded' });
                    await page.waitForSelector('#calendar', { timeout: 30000 });

                    const pageEvents = await page.evaluate(extractAmavasyaEvents);
                    
                    pageEvents.forEach(event => {
                        allAmavasyaEvents.push({
                            year: year,
                            month: month,
                            day: parseInt(event.amavasyaDay, 10),
                            monthName: event.newMonthName
                        });
                    });

                } catch (error) {
                    console.error(`❌ Could not scrape ${url}. Error: ${error.message}`);
                } finally {
                    if (page) await page.close();
                }
            }
        }
        
        console.log(`\n✅ Scraping finished. Found ${allAmavasyaEvents.length} Amavasya events.`);

        console.log('Processing data to calculate month start and end dates...');

        allAmavasyaEvents.sort((a, b) => new Date(a.year, a.month - 1, a.day) - new Date(b.year, b.month - 1, b.day));

        const finalResults = [];
        for (let i = 0; i < allAmavasyaEvents.length - 1; i++) {
            const currentEvent = allAmavasyaEvents[i];
            const nextEvent = allAmavasyaEvents[i + 1];

            const startDate = new Date(currentEvent.year, currentEvent.month - 1, currentEvent.day);
            startDate.setDate(startDate.getDate() + 1);

            const endDate = new Date(nextEvent.year, nextEvent.month - 1, nextEvent.day);
            
            const format_date = (date) => {
                const d = String(date.getDate()).padStart(2, '0');
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const y = date.getFullYear();
                return `${d}-${m}-${y}`;
            };
            
            finalResults.push({
                month_name: currentEvent.monthName,
                starting_date: format_date(startDate),
                ending_date: format_date(endDate)
            });
        }

        console.log(`✅ Processing complete. Generated ${finalResults.length} month ranges.`);

        fs.writeFileSync(`json-data/gujarati_months_${startYear}-${endYear}.json`, JSON.stringify(finalResults, null, 2));
        console.log(`\n💾 Success! Data saved to json-data/gujarati_months_${startYear}-${endYear}.json`);

    } catch (e) {
        console.error('A critical error occurred:', e);
    } finally {
        if (browser) {
            console.log('Closing browser connection...');
            await browser.close();
        }
    }
}

main2();
