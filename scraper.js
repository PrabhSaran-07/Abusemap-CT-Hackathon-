const Parser = require('rss-parser');
const db = require('./db');
const parser = new Parser();

const punjabCities = {
    'Ludhiana': [30.9010, 75.8573],
    'Amritsar': [31.6340, 74.8723],
    'Jalandhar': [31.3260, 75.5762],
    'Patiala': [30.3398, 76.3869],
    'Bathinda': [30.2110, 74.9455],
    'Mohali': [30.7046, 76.7179]
};
const cityNames = Object.keys(punjabCities);

async function runScraper() {
    console.log('[Scraper] Fetching latest live data from Google News...');
    try {
        // Fetch news for animal issues in Punjab
        const feed = await parser.parseURL('https://news.google.com/rss/search?q=animal+cruelty+OR+rescue+punjab+india&hl=en-IN&gl=IN&ceid=IN:en');
        
        // Process recent articles
        const articles = feed.items.slice(0, 10);
        let addedCount = 0;

        for (const item of articles) {
            // Generate deterministic ID
            let hash = 0;
            const str = item.guid || item.link || item.title;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            const articleId = 'NEWS-' + Math.abs(hash);

            // Check if already in DB
            const existing = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM incidents WHERE id = ?', [articleId], (err, row) => resolve(row));
            });

            if (!existing) {
                // Determine city by searching keywords
                const textToSearch = (item.title + ' ' + (item.contentSnippet || '')).toLowerCase();
                let matchedCity = 'Ludhiana'; // Default
                for (const city of cityNames) {
                    if (textToSearch.includes(city.toLowerCase())) {
                        matchedCity = city;
                        break;
                    }
                }

                // Generate random offset for lat/lng
                const baseCoords = punjabCities[matchedCity];
                const lat = baseCoords[0] + (Math.random() - 0.5) * 0.05;
                const lng = baseCoords[1] + (Math.random() - 0.5) * 0.05;

                // Format Date
                const dateObj = item.pubDate ? new Date(item.pubDate) : new Date();
                const formattedDate = dateObj.toISOString().split('T')[0];

                // Determine type
                let type = 'Other';
                if (textToSearch.includes('dog')) type = 'Stray Dog Abuse';
                else if (textToSearch.includes('cow') || textToSearch.includes('cattle')) type = 'Cattle Neglect';
                else if (textToSearch.includes('poach') || textToSearch.includes('wild')) type = 'Wildlife Poaching';

                // Insert
                db.run(
                    'INSERT INTO incidents (id, date, type, city, status, desc, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [articleId, formattedDate, type, matchedCity, 'Pending', item.title, lat, lng]
                );
                addedCount++;
            }
        }
        console.log(`[Scraper] Successfully added ${addedCount} new live incidents from news.`);

    } catch(err) {
        console.error('[Scraper] Error fetching data:', err.message);
    }
}

module.exports = runScraper;
