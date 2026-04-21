// ==========================================================================
// AbuseMap - Punjab Functional App Logic
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // --- STATE MANAGEMENT ---
    // City coordinates in Punjab
    const punjabCities = {
        'Ludhiana': [30.9010, 75.8573],
        'Amritsar': [31.6340, 74.8723],
        'Jalandhar': [31.3260, 75.5762],
        'Patiala': [30.3398, 76.3869],
        'Bathinda': [30.2110, 74.9455],
        'Mohali': [30.7046, 76.7179]
    };

    // Initial Data State (Fetched from Backend)
    let incidents = [];
    
    // Fetch live data from SQLite Backend
    async function fetchIncidents() {
        try {
            const res = await fetch('http://localhost:3000/api/incidents');
            if (res.ok) {
                incidents = await res.json();
                updateUI();
            }
        } catch (err) {
            console.error("Backend offline. Could not load live data.", err);
        }
    }

    let currentSearchQuery = "";
    
    // Global UI references
    let heatLayerOverview = null;
    let heatLayerFull = null;
    let typeChart = null;
    let trendChart = null;
    let overviewMap = null;
    let fullMap = null;
    let fullMapInitialized = false;

    // DOM Elements (declared at top to completely prevent TDZ issues)
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-section');
    const btnReport = document.getElementById('btn-report');
    const reportForm = document.getElementById('report-form');
    const submitBtn = document.getElementById('final-submit-btn');
    const logsTbody = document.getElementById('logs-tbody');
    const statTotal = document.getElementById('stat-total');
    const statHighRisk = document.getElementById('stat-high-risk');
    const statResolved = document.getElementById('stat-resolved');
    const statResolvedTrend = document.getElementById('stat-resolved-trend');
    const statPending = document.getElementById('stat-pending');
    const timeRangeSelect = document.getElementById('timeRange');

    let heatMapTimeRange = 'Last 7 Days';
    if (timeRangeSelect) {
        timeRangeSelect.addEventListener('change', (e) => {
            heatMapTimeRange = e.target.value;
            updateHeatmaps();
        });
    }

    function getDisplayIncidents() {
        if (!currentSearchQuery) return incidents;
        const q = currentSearchQuery.toLowerCase();
        return incidents.filter(inc => {
            const cityMatch = (inc.city || '').toLowerCase().includes(q);
            const typeMatch = (inc.type || '').toLowerCase().includes(q);
            const descMatch = (inc.desc || '').toLowerCase().includes(q);
            const idMatch = (inc.id || '').toLowerCase().includes(q);
            return cityMatch || typeMatch || descMatch || idMatch;
        });
    }

    // --- SEARCH LOGIC ---
    function triggerSearch() {
        currentSearchQuery = searchInput.value.trim();
        updateUI();
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            triggerSearch();
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                triggerSearch();
            }
        });
    }
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            triggerSearch();
        });
    }

    // --- VIEW NAVIGATION ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Update active nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Toggle view
            const targetId = item.getAttribute('data-target');
            views.forEach(v => {
                if(v.id === targetId) {
                    v.classList.remove('hidden');
                    v.classList.add('active');
                    // Invalidate map size if switching to map view so it renders correctly
                    if(targetId === 'view-heatmap-full') {
                        // Lazy-init the full map now that the container is visible
                        initFullMap();
                        setTimeout(() => {
                            if(fullMap) {
                                fullMap.invalidateSize();
                                updateHeatmaps();
                            }
                        }, 200);
                    }
                    if(targetId === 'view-overview') {
                        setTimeout(() => { 
                            if(overviewMap) {
                                overviewMap.invalidateSize();
                                if(heatLayerOverview) heatLayerOverview.redraw();
                            }
                        }, 100);
                    }
                } else {
                    v.classList.add('hidden');
                    v.classList.remove('active');
                }
            });
        });
    });

    // --- REPORT LOGIC (View Based) ---
    // Make top right button switch to report view
    if (btnReport) {
        btnReport.addEventListener('click', () => {
            document.querySelector('.nav-item[data-target="view-report"]').click();
        });
    }

    // Block any native form submission completely
    reportForm.addEventListener('submit', e => e.preventDefault());

    // Custom Submit Logic
    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            try {
                const type = document.getElementById('inc-type').value;
                const city = document.getElementById('inc-city').value;
                const desc = document.getElementById('inc-desc').value;
                
                if (!desc || !desc.trim()) {
                    alert("Please provide a description for the incident.");
                    return;
                }

                const baseCoords = punjabCities[city];
                if (!baseCoords) {
                    alert("Invalid city selected.");
                    return;
                }

                const lat = baseCoords[0] + (Math.random() - 0.5) * 0.05;
                const lng = baseCoords[1] + (Math.random() - 0.5) * 0.05;

                const newIncident = {
                    id: `INC-${Date.now()}`,
                    date: new Date().toISOString().split('T')[0],
                    type: type,
                    city: city,
                    status: 'Pending',
                    desc: desc,
                    lat: lat,
                    lng: lng
                };

                // Send to Node.js Backend
                const response = await fetch('http://localhost:3000/api/incidents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newIncident)
                });
                
                if (!response.ok) throw new Error("Backend save failed");

                // Re-fetch all data and render
                await fetchIncidents();
                
                // Close & reset
                reportForm.reset();
                
                // Notify
                alert('Incident Reported & Saved to Database Successfully!');

                // Switch back to logs view to see the new entry
                const logsTab = document.querySelector('.nav-item[data-target="view-logs"]');
                if (logsTab) logsTab.click();

            } catch (err) {
                alert("An error occurred while submitting. Is the server running? " + err.message);
                console.error(err);
            }
        });
    }

    // --- MAP INITIALIZATION ---
    // Overview map initializes immediately (it's visible on load)
    try {
        overviewMap = L.map('map-overview', { zoomControl: false }).setView([31.1471, 75.3412], 7);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(overviewMap);
        heatLayerOverview = L.heatLayer([], { radius: 25, blur: 15, maxZoom: 10 }).addTo(overviewMap);
    } catch(err) {
        console.error("Overview map initialization failed: ", err);
    }

    // Full map: lazy init — only created when Heatmap tab is first opened
    function initFullMap() {
        if (fullMapInitialized) return;
        try {
            fullMap = L.map('map-full').setView([31.1471, 75.3412], 7);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(fullMap);
            heatLayerFull = L.heatLayer([], {
                radius: 50,
                blur: 35,
                minOpacity: 0.5,
                gradient: { 0.2: '#3B82F6', 0.5: '#F59E0B', 0.8: '#F43F5E', 1.0: '#BE123C' }
            }).addTo(fullMap);
            fullMapInitialized = true;
        } catch(err) {
            console.error("Full map initialization failed: ", err);
        }
    }

    function updateHeatmaps() {
        const disp = getDisplayIncidents();
        
        // Overview heatmap (all data)
        const heatDataOverview = disp.map(inc => [inc.lat, inc.lng, 1.0]);
        if (heatLayerOverview) heatLayerOverview.setLatLngs(heatDataOverview);
        
        // --- Full heatmap (filtered by timeRange) ---
        const countBadge = document.getElementById('heatmap-count');

        // If "All Time", skip date filtering entirely
        if (heatMapTimeRange === 'All Time') {
            const allData = disp.map(inc => [inc.lat, inc.lng, 1.0]);
            if (heatLayerFull) { heatLayerFull.setLatLngs(allData); heatLayerFull.redraw(); }
            if (countBadge) countBadge.textContent = `${allData.length} incident${allData.length !== 1 ? 's' : ''} (All Time)`;
            return;
        }

        // Find reference "today" = newest date in the dataset
        let today = new Date();
        if (disp.length > 0) {
            const maxDateStr = disp.map(inc => inc.date).filter(d => d).sort().reverse()[0];
            if (maxDateStr) {
                const parts = maxDateStr.split('-');
                if (parts.length === 3) today = new Date(parts[0], parts[1] - 1, parts[2]);
            }
        }
        today.setHours(0,0,0,0);

        const dayLimit = heatMapTimeRange === 'Last 7 Days' ? 6 : 29;

        const filteredForFull = disp.filter(inc => {
            if (!inc.date) return false;
            const parts = inc.date.split('-');
            if (parts.length !== 3) return false;
            const incDate = new Date(parts[0], parts[1] - 1, parts[2]);
            incDate.setHours(0,0,0,0);
            const diffDays = Math.round((today.getTime() - incDate.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= dayLimit;
        });

        // Scale intensity so even sparse data is visible
        const intensity = filteredForFull.length <= 3 ? 1.0 : 0.8;
        const heatDataFull = filteredForFull.map(inc => [inc.lat, inc.lng, intensity]);

        // Fallback: show all at dim intensity if the window has nothing
        const finalData = heatDataFull.length > 0 ? heatDataFull : disp.map(inc => [inc.lat, inc.lng, 0.4]);
        const shownCount = heatDataFull.length > 0 ? heatDataFull.length : disp.length;
        const isFallback = heatDataFull.length === 0 && disp.length > 0;

        if (heatLayerFull) {
            heatLayerFull.setLatLngs(finalData);
            heatLayerFull.redraw(); // force canvas repaint
        }

        if (countBadge) {
            countBadge.textContent = isFallback
                ? `No data in range — showing all ${shownCount}`
                : `${shownCount} incident${shownCount !== 1 ? 's' : ''} shown`;
        }
    }


    // --- CHARTS INITIALIZATION ---
    try {
        if (typeof Chart !== 'undefined') {
            Chart.defaults.color = '#9BA5B5';
            Chart.defaults.font.family = "'Inter', sans-serif";

            const ctxType = document.getElementById('typeChart').getContext('2d');
            typeChart = new Chart(ctxType, {
                type: 'doughnut',
                data: { labels: [], datasets: [{ data: [], backgroundColor: ['#3B82F6', '#F43F5E', '#F59E0B', '#10B981', '#8B5CF6'], borderWidth: 0 }] },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '70%',
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } }
                }
            });

            const ctxTrend = document.getElementById('trendChart').getContext('2d');
            const gradient = ctxTrend.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(244, 63, 94, 0.4)'); gradient.addColorStop(1, 'rgba(244, 63, 94, 0.0)');
            
            trendChart = new Chart(ctxTrend, {
                type: 'line',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],

                    datasets: [{
                        data: [0, 0, 0, 0, 0, 0, 0], // Empty trend
                        borderColor: '#F43F5E', backgroundColor: gradient, borderWidth: 2, fill: true, tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }
    } catch (err) {
        console.error("Chart initialization failed: ", err);
    }

    function updateCharts() {
        // Calculate type distributions
        const counts = {};
        const disp = getDisplayIncidents();
        disp.forEach(inc => { counts[inc.type] = (counts[inc.type] || 0) + 1; });
        
        if (typeChart) {
            typeChart.data.labels = Object.keys(counts);
            typeChart.data.datasets[0].data = Object.values(counts);
            typeChart.update();
        }

        // Calculate trend (Last 7 Days)
        if (trendChart) {
            let today = new Date();
            if (disp.length > 0) {
                const maxDateStr = disp.map(inc => inc.date).filter(d => d).sort().reverse()[0];
                if (maxDateStr) {
                    const parts = maxDateStr.split('-');
                    if (parts.length === 3) {
                        today = new Date(parts[0], parts[1] - 1, parts[2]);
                    }
                }
            }
            today.setHours(0,0,0,0);
            
            const labels = [];
            const data = [0, 0, 0, 0, 0, 0, 0];
            
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
            }
            
            disp.forEach(inc => {
                if (!inc.date) return;
                const parts = inc.date.split('-');
                if (parts.length !== 3) return;
                const incDate = new Date(parts[0], parts[1] - 1, parts[2]);
                incDate.setHours(0,0,0,0);
                
                const diffTime = today.getTime() - incDate.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays >= 0 && diffDays <= 6) {
                    data[6 - diffDays]++;
                }
            });
            
            trendChart.data.labels = labels;
            trendChart.data.datasets[0].data = data;
            trendChart.update();
        }
    }

    // --- LOGS TABLE UPDATE ---
    function updateLogsTable() {
        if (!logsTbody) return;
        logsTbody.innerHTML = '';
        const disp = getDisplayIncidents();
        disp.forEach(inc => {
            const row = document.createElement('tr');
            
            // Generate dropdown for status
            const statusOptions = ['Pending', 'Working on it', 'Resolved'].map(opt => {
                return `<option value="${opt}" ${inc.status === opt ? 'selected' : ''}>${opt}</option>`;
            }).join('');

            row.innerHTML = `
                <td><strong>${inc.id}</strong></td>
                <td>${inc.date}</td>
                <td>${inc.type}</td>
                <td>${inc.city}</td>
                <td>
                    <select class="status-dropdown" data-id="${inc.id}" data-status="${inc.status}">
                        ${statusOptions}
                    </select>
                </td>
                <td><button class="btn-secondary btn-small btn-view" data-id="${inc.id}">View</button></td>
            `;
            logsTbody.appendChild(row);
        });
    }

    // --- STATS UPDATE ---
    function updateStats() {
        const disp = getDisplayIncidents();
        const total = disp.length;
        if (statTotal) statTotal.innerText = total;

        if (total === 0) {
            if (statHighRisk) statHighRisk.innerText = 'None';
            if (statResolved) statResolved.innerText = '0';
            if (statResolvedTrend) statResolvedTrend.innerHTML = '<i class="fa-solid fa-minus"></i> 0%';
            if (statPending) statPending.innerText = '0';
            return;
        }

        let resolvedCount = 0;
        let pendingCount = 0;
        let cityCounts = {};

        disp.forEach(inc => {
            if (inc.status === 'Resolved') resolvedCount++;
            else pendingCount++;
            cityCounts[inc.city] = (cityCounts[inc.city] || 0) + 1;
        });

        // Calculate High Risk District (most cases)
        let topCity = 'None';
        let topCount = 0;
        for (const [city, count] of Object.entries(cityCounts)) {
            if (count > topCount) {
                topCount = count;
                topCity = city;
            }
        }

        if (statHighRisk) statHighRisk.innerText = topCity;
        if (statResolved) statResolved.innerText = resolvedCount;
        
        const resolvedPct = Math.round((resolvedCount / total) * 100);
        if (statResolvedTrend) statResolvedTrend.innerHTML = `<i class="fa-solid fa-arrow-up"></i> ${resolvedPct}%`;
        
        if (statPending) statPending.innerText = pendingCount;
    }

    // --- VIEW & STATUS LOGIC (Event Delegation) ---
    if (logsTbody) {
        // Handle View Button
        logsTbody.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-view')) {
                const id = e.target.getAttribute('data-id');
                const inc = incidents.find(i => i.id === id);
                if (inc) {
                    alert(`--- INCIDENT DETAILS ---\n\nID: ${inc.id}\nDate: ${inc.date}\nCity: ${inc.city}\nType: ${inc.type}\nStatus: ${inc.status}\n\nDescription:\n${inc.desc}`);
                }
            }
        });

        // Handle Status Change (Sync with backend)
        logsTbody.addEventListener('change', async (e) => {
            if (e.target.classList.contains('status-dropdown')) {
                const id = e.target.getAttribute('data-id');
                const newStatus = e.target.value;
                try {
                    await fetch(`http://localhost:3000/api/incidents/${id}/status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    await fetchIncidents(); // Refresh all to sync UI
                } catch(err) {
                    console.error("Failed to update status on server", err);
                }
            }
        });
    }

    // --- EXPORT CSV ---
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (incidents.length === 0) {
                alert("No data to export.");
                return;
            }
            
            try {
                // Create CSV content
                let csvContent = "ID,Date,Type,City,Status,Latitude,Longitude,Description\n";
                
                incidents.forEach(inc => {
                    // Escape quotes and wrap description in quotes to handle commas safely
                    const safeDesc = inc.desc ? `"${inc.desc.replace(/"/g, '""')}"` : '""';
                    // Make sure lat/lng exist before calling toFixed
                    const latStr = inc.lat !== undefined ? inc.lat.toFixed(4) : '';
                    const lngStr = inc.lng !== undefined ? inc.lng.toFixed(4) : '';
                    
                    const row = `${inc.id},${inc.date},${inc.type},${inc.city},${inc.status},${latStr},${lngStr},${safeDesc}`;
                    csvContent += row + "\n";
                });
                
                // Trigger download using Blob (much safer than encodeURI which can break on special characters)
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", "abusemap_incidents.csv");
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Cleanup
                setTimeout(() => URL.revokeObjectURL(url), 100);
            } catch(err) {
                alert("Export failed: " + err.message);
                console.error(err);
            }
        });
    }

    // --- MASTER UPDATE ---
    function updateUI() {
        updateHeatmaps();
        updateCharts();
        updateLogsTable();
        updateStats();
    }

    // Initialize UI on load
    fetchIncidents();
});
