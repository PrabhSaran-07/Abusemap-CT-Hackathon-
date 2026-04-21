const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Initialize table
        db.run(`
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                date TEXT,
                type TEXT,
                city TEXT,
                status TEXT,
                desc TEXT,
                lat REAL,
                lng REAL
            )
        `);
    }
});

module.exports = db;
