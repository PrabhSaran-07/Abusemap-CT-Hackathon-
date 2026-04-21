const express = require('express');
const cors = require('cors');
const db = require('./db');
const runScraper = require('./scraper');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API: Get all incidents
app.get('/api/incidents', (req, res) => {
    db.all('SELECT * FROM incidents ORDER BY rowid DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// API: Create new incident
app.post('/api/incidents', (req, res) => {
    const { id, date, type, city, status, desc, lat, lng } = req.body;
    const stmt = db.prepare('INSERT INTO incidents (id, date, type, city, status, desc, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run([id, date, type, city, status, desc, lat, lng], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, id: req.body.id });
    });
});

// API: Update incident status
app.put('/api/incidents/:id/status', (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    const stmt = db.prepare('UPDATE incidents SET status = ? WHERE id = ?');
    stmt.run([status, id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
    // Run the scraper immediately on startup, then every hour
    runScraper();
    setInterval(runScraper, 60 * 60 * 1000);
});
