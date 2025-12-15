/**
 * Upcoming Visits Page Logic
 */

const t = (keyOrEn, ar) => {
    const lang = localStorage.getItem('pos_language') || 'en';
    if (ar) return lang === 'ar' ? ar : keyOrEn;
    if (window.translations && window.translations[keyOrEn]) {
        return window.translations[keyOrEn][lang];
    }
    return keyOrEn;
};

document.addEventListener('DOMContentLoaded', () => {
    if (!window.isSessionValid()) {
        window.location.href = 'index.html';
        return;
    }

    const user = window.getCurrentUser();
    if (user) document.getElementById('currentUserName').textContent = user.fullName;

    // Set default filters (e.g. from Today)
    document.getElementById('filterFromDate').valueAsDate = new Date();

    renderUpcoming();

    window.addEventListener('languageChanged', renderUpcoming);
});

function resetFilters() {
    document.getElementById('filterFromDate').value = '';
    document.getElementById('filterToDate').value = '';
    document.getElementById('filterStatus').value = 'all';
    renderUpcoming();
}

function renderUpcoming() {
    const container = document.getElementById('upcomingContainer');
    container.innerHTML = '';

    const fromDateStr = document.getElementById('filterFromDate').value;
    const toDateStr = document.getElementById('filterToDate').value;
    const statusFilter = document.getElementById('filterStatus').value;

    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    if (fromDate) fromDate.setHours(0, 0, 0, 0);

    const toDate = toDateStr ? new Date(toDateStr) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    // Fetch all visits with nextVisit
    const visits = window.DB.getVisits();
    const customers = window.DB.getCustomers();
    const vehicles = window.DB.getVehicles();

    let upcoming = visits
        .filter(v => v.nextVisit && v.nextVisit.date)
        .map(v => {
            const customer = customers.find(c => c.id === v.customerId);
            const vehicle = vehicles.find(veh => veh.id === v.vehicleId);
            return {
                originalVisitId: v.id,
                date: new Date(v.nextVisit.date),
                service: v.nextVisit.service,
                notes: v.nextVisit.notes,
                customer: customer || { name: 'Unknown', mobile: '' },
                vehicle: vehicle || { brand: '?', plateNumber: '?' }
            };
        });

    // Filter Logic
    upcoming = upcoming.filter(item => {
        const d = new Date(item.date);
        d.setHours(0, 0, 0, 0);

        // Date Range
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;

        // Status Filter
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24));

        if (statusFilter === 'overdue' && diffDays >= 0) return false;
        if (statusFilter === 'today' && diffDays !== 0) return false;
        if (statusFilter === 'tomorrow' && diffDays !== 1) return false;
        if (statusFilter === 'week' && (diffDays < 0 || diffDays > 7)) return false;

        return true;
    });

    // Sort by date ASC
    upcoming.sort((a, b) => a.date - b.date);

    if (upcoming.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#666;">
            <h3>${t('no_upcoming_found')}</h3>
        </div>`;
        return;
    }

    upcoming.forEach(item => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);

        const diffTime = itemDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let color = '#2196f3'; // Blue (Future)
        let statusText = t('Upcoming', 'قادم');
        let statusClass = 'primary'; // bs style

        if (diffDays < 0) {
            color = '#e74c3c'; // Red (Overdue)
            statusText = t('overdue') + ` (${Math.abs(diffDays)} ${t('days')})`;
        } else if (diffDays === 0) {
            color = '#27ae60'; // Green (Today)
            statusText = t('today');
        } else if (diffDays === 1) {
            color = '#f39c12'; // Orange (Tomorrow)
            statusText = t('tomorrow');
        } else if (diffDays <= 7) {
            color = '#3498db';
            statusText = t('this_week');
        }

        const dateStr = item.date.toLocaleDateString(
            localStorage.getItem('pos_language') === 'ar' ? 'ar-EG' : 'en-US',
            { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
        );

        const card = document.createElement('div');
        card.className = 'visit-card';
        card.style.borderLeftColor = color;
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <h3 style="margin:0 0 5px 0;">${item.customer.name}</h3>
                    <div style="color:#666; font-size:0.9em;">
                        📱 ${item.customer.mobile} | 🚗 ${item.vehicle.brand} ${item.vehicle.model} (${item.vehicle.plateNumber})
                    </div>
                    <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-radius:4px;">
                        <strong>🔧 ${t('service')}:</strong> ${item.service}
                        ${item.notes ? `<br><em>📝 ${item.notes}</em>` : ''}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; font-size:1.1em; color:${color}; margin-bottom:5px;">
                        ${dateStr}
                    </div>
                    <span class="status-badge" style="background:${color};">
                        ${statusText}
                    </span>
                    <div style="margin-top:10px;">
                        <button class="btn btn-sm btn-primary" onclick="window.location.href='visits.html'">
                            ${t('go_to_visits')}
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}
