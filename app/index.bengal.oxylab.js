import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: "../.env.local" });

// --- Oxylabs Credentials ---
// IMPORTANT: Store these in your .env.local file for security
const OXY_USERNAME = process.env.OXY_USERNAME || '';
const OXY_PASSWORD = process.env.OXY_PASSWORD || '';

// This function now uses Cheerio to parse HTML content instead of running in a browser
function extractCalendarData(htmlContent) {
    const $ = cheerio.load(htmlContent);

    const monthName = $('.dpPHeaderLeftTitle').text().trim() || null;

    let startingDate = null;
    let prvMonthEndingDate = null;

    $('span.dpSmallDate').each((i, el) => {
        if ($(el).text().trim() === '1') {
            const targetDiv = $(el).parent().parent();
            const dataUrl = targetDiv.attr('data-url');

            if (dataUrl) {
                startingDate = dataUrl.split('=')[1];
                const elementAbove = targetDiv.prev(); // Get the previous sibling element
                const endingDateUrl = elementAbove.attr('data-url');
                
                if (endingDateUrl) {
                    prvMonthEndingDate = endingDateUrl.split('=')[1];
                }
                return false; // Break the .each loop once we find the first '1'
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
    try {
        console.log('Starting Oxylabs scraper...');

        if (!fs.existsSync('json-data')) {
            fs.mkdirSync('json-data');
        }

        const startYear = 2011;
        const endYear = 2012;
        const allScrapedData = [];
        
        for (let year = startYear; year <= endYear; year++) {
            for (let month = 1; month <= 12; month++) {
                const targetUrl = `https://www.drikpanchang.com/bengali/bengali-month-panjika.html?date=28/${month}/${year}`;
                console.log(`Scraping: ${year}-${String(month).padStart(2, '0')}`);

                try {
                    // --- Oxylabs API Request ---
                    const response = await axios.post(
                        'https://realtime.oxylabs.io/v1/queries',
                        {
                            source: 'universal', // Use 'universal' for any website
                            url: targetUrl,
                            render: 'html',       // Crucial: This executes JavaScript on the page
                        },
                        {
                            auth: {
                                username: OXY_USERNAME,
                                password: OXY_PASSWORD,
                            },
                            timeout: 120000 // 2-minute timeout
                        }
                    );
                    
                    // The HTML content is in the response data
                    const htmlContent = response.data.results[0]?.content;
                    if (!htmlContent) {
                        throw new Error("No HTML content returned from Oxylabs API.");
                    }

                    // Parse the HTML content using our Cheerio function
                    const pageData = extractCalendarData(htmlContent);

                    if (pageData.monthName) {
                        allScrapedData.push({
                            year,
                            month,
                            ...pageData
                        });
                    } else {
                        console.warn(`⚠️ Could not find month name for ${targetUrl}. Skipping.`);
                    }

                } catch (error) {
                    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
                    console.error(`❌ Could not scrape ${targetUrl}. Error: ${errorMessage}`);
                    // Optional: Decide if you want to stop the whole process on a single error
                    // For now, we'll continue with the next month
                }
            }
        }

        console.log(`\n✅ Scraping finished. Found data for ${allScrapedData.length} months.`);
        console.log('Processing data to calculate month ranges...');

        // Sort data chronologically (this part of your logic is unchanged)
        allScrapedData.sort((a, b) => new Date(a.year, a.month - 1) - new Date(b.year, b.month - 1));

        const finalResults = [];
        for (let i = 0; i < allScrapedData.length - 1; i++) {
            const currentMonth = allScrapedData[i];
            const nextMonth = allScrapedData[i + 1];

            if (currentMonth.monthName && currentMonth.startingDate && nextMonth.prvMonthEndingDate) {
                finalResults.push({
                    monthName: currentMonth.monthName,
                    startingDate: currentMonth.startingDate,
                    EndingDate: nextMonth.prvMonthEndingDate
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
    }
}

main();