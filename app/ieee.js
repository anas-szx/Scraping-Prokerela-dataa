import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: "../.env.local" });

// Your Bright Data or other browser endpoint
const BROWSER_WSE_ENDPOINT = process.env.BRIGHT_DATA || '';
if (!BROWSER_WSE_ENDPOINT) {
    console.error("Error: BRIGHT_DATA environment variable is not set.");
    console.log("Please create a .env file and add your browser's WebSocket endpoint.");
    console.log("Example: BRIGHT_DATA=wss://user:password@zproxy.lum-superproxy.io:9222");
    process.exit(1);
}

// List of topics to search for on IEEE Xplore
const topics = [
    "Machine%20Learning"
];

// Directory to save the downloaded PDFs
const OUTPUT_DIR = 'ieee_pdfs';

/**
 * This function runs in the browser context to extract the top 5 PDF links.
 * @returns {string[]} An array of PDF URLs.
 */
function getTop5PdfLinks() {
    const baseUrl = "https://ieeexplore.ieee.org";
    // Get the first 5 result items
    const results = [...document.querySelectorAll(".List-results-items")].slice(0, 5);

    const pdfLinks = results.map((item) => {
        const id = item.getAttribute("id");
        if (!id) return null;

        // The PDF link is typically found inside an anchor tag with a specific class
        const pdfLinkElement = item.querySelector(`a.stats-document-LNK-PDF`);
        if (!pdfLinkElement) return null;
        
        // The link often points to an abstract page, but the download link is what we need.
        // It's usually in a stamp.jsp format. We will try to find it.
        const href = pdfLinkElement.getAttribute("href");

        // The direct PDF link is often found in the stamp URL format.
        // Example: /stamp/stamp.jsp?tp=&arnumber=1234567
        // We will assume the link found is the correct one to navigate to for the PDF.
        if (href) {
             return baseUrl + href;
        }
        
        return null;

    }).filter(Boolean); // Filter out any null values

    return pdfLinks;
}


/**
 * The main function to orchestrate the web scraping and downloading process.
 */
async function main() {
    console.log("Starting the IEEE PDF scraper...");
    let browser;
    try {
        // Create the output directory if it doesn't exist
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR);
            console.log(`Created directory: ${OUTPUT_DIR}`);
        }

        console.log("Connecting to the browser...");
        
        browser = await puppeteer.connect({
            browserWSEndpoint: BROWSER_WSE_ENDPOINT
        });
        console.log("Successfully connected to the browser.");

        for (const topic of topics) {
            const searchUrl = `https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=${topic}&highlight=true&returnType=SEARCH&matchPubs=true&refinements=ContentType:Journals&returnFacets=ALL&subscribed=true`;
            console.log(`\n--- Processing topic: ${decodeURIComponent(topic)} ---`);
            
            let page;
            try {
                page = await browser.newPage();
                page.setDefaultNavigationTimeout(2 * 60 * 1000); // 2 minutes

                console.log(`Navigating to search results for "${decodeURIComponent(topic)}"...`);
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
                
                // Wait for the search results container to be present on the page
                await page.waitForSelector('.List-results-items', { timeout: 60000 });
                console.log("Search results page loaded.");

                console.log("Extracting PDF links...");
                const pdfLinks = await page.evaluate(getTop5PdfLinks);
                console.log(`Found ${pdfLinks.length} PDF links.`);

                if (pdfLinks.length === 0) {
                    console.log(`No PDF links found for ${decodeURIComponent(topic)}. Moving to the next topic.`);
                    continue;
                }

                // Download each PDF
                for (let i = 0; i < pdfLinks.length; i++) {
                    const pdfLink = pdfLinks[i];
                    let pdfPage;
                    try {
                        console.log(` -> Downloading PDF ${i + 1}/${pdfLinks.length} from: ${pdfLink}`);
                        pdfPage = await browser.newPage();
                        
                        // Navigate to the page that contains the PDF
                        const response = await pdfPage.goto(pdfLink, { waitUntil: 'networkidle0', timeout: 120000 });
                        
                        // Check if the response is valid and is a PDF file
                        if (response && response.ok() && response.headers()['content-type'] === 'application/pdf') {
                            const pdfBuffer = await response.buffer();
                            const safeTopic = decodeURIComponent(topic).replace(/[^a-zA-Z0-9]/g, '_');
                            const filePath = path.join(OUTPUT_DIR, `${safeTopic}_${i + 1}.pdf`);
                            
                            fs.writeFileSync(filePath, pdfBuffer);
                            console.log(`    Successfully saved to ${filePath}`);
                        } else {
                            console.error(`    Failed to download PDF. Status: ${response ? response.status() : 'N/A'}, Content-Type: ${response ? response.headers()['content-type'] : 'N/A'}`);
                        }

                    } catch (downloadError) {
                        console.error(`    Error downloading PDF from ${pdfLink}:`, downloadError.message);
                    } finally {
                        if (pdfPage) {
                            await pdfPage.close();
                        }
                    }
                }

            } catch (topicError) {
                console.error(`Error processing topic "${decodeURIComponent(topic)}":`, topicError.message);
            } finally {
                if (page) {
                    await page.close();
                }
            }
        }
    } catch (e) {
        console.error('An unexpected error occurred:', e);
    } finally {
        if (browser) {
            console.log("\nClosing browser connection...");
            await browser.close();
        }
        console.log("Scraping process finished.");
    }
}

main();