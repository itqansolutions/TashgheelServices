/**
 * Visit Management Logic (Service Center)
 * Handles Visits, Services, Parts, and Invoicing.
 */

// Hybrid Translation Helper
const t = (keyOrEn, ar) => {
    const lang = localStorage.getItem('pos_language') || 'en';
    if (ar) return lang === 'ar' ? ar : keyOrEn;
    if (window.translations && window.translations[keyOrEn]) {
        return window.translations[keyOrEn][lang];
    }
    return keyOrEn;
};

let currentVisit = null; // Object holding current editing visit state for Draft
let isEditingExisting = false;

document.addEventListener('DOMContentLoaded', () => {
    if (!window.isSessionValid()) { window.location.href = 'index.html'; return; }

    // Auth info
    const user = window.getCurrentUser();
    if (user) document.getElementById('currentUserName').textContent = user.fullName;

    renderDashboard();
    renderReminders();
    renderTechnicians(); // Populate technicians dropdown

    // Re-render when language changes
    window.addEventListener('languageChanged', () => {
        renderDashboard();
    });
});

// === REMINDERS ===
function renderReminders() {
    const reminders = window.DB.getMaintenanceReminders();
    const card = document.getElementById('remindersCard');
    const list = document.getElementById('remindersList');

    if (reminders.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    reminders.forEach(r => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px; margin-bottom: 8px; background: white; border-radius: 4px; border-left: 3px solid #ff9800;';
        div.innerHTML = `
            <strong>${r.customerName}</strong> - ${r.vehicle}<br>
            <small>📞 ${r.mobile} | ${t('Last Service:', 'آخر خدمة:')} ${r.lastServiceDate} (${r.daysSince} ${t('days ago', 'أيام مضت')})</small>
        `;
        list.appendChild(div);
    });
}

// === TECHNICIANS ===
function renderTechnicians() {
    const select = document.getElementById('visitTechnician');
    // Keep the first option (Select Technician)
    const firstOpt = select.firstElementChild;
    select.innerHTML = '';
    select.appendChild(firstOpt);

    const salesmen = JSON.parse(localStorage.getItem('salesmen') || '[]');

    salesmen.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = s.name;
        select.appendChild(opt);
    });
}

// === DASHBOARD ===
function renderDashboard() {
    document.getElementById('dashboardView').style.display = 'block';
    document.getElementById('editorView').style.display = 'none';

    const container = document.getElementById('visitsGrid');
    container.innerHTML = '';

    const visits = window.DB.getVisits().filter(v => v.status !== 'Completed'); // Only active or Draft

    if (visits.length === 0) {
        container.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#666;">${t('No active visits. Start a new one!', 'لا توجد زيارات نشطة. ابدأ زيارة جديدة!')}</p>`;
        return;
    }

    // Sort by date desc
    visits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const customers = window.DB.getCustomers();
    const vehicles = window.DB.getVehicles();

    visits.forEach(v => {
        const customer = customers.find(c => c.id === v.customerId) || { name: 'Unknown' };
        const vehicle = vehicles.find(veh => veh.id === v.vehicleId) || { brand: '?', plateNumber: '?' };

        const card = document.createElement('div');
        card.className = 'visit-card';
        card.onclick = () => openVisitEditor(v.id);
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;">
                <h3>#${v.id}</h3>
                <span style="font-size:0.8em;color:#999;">${new Date(v.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="visit-info">👤 ${customer.name}</div>
            <div class="visit-info">🚗 ${vehicle.brand} ${vehicle.model} (${vehicle.plateNumber})</div>
            <div style="margin-top:10px; font-weight:bold; color:#3498db;">
                ${t('Total:', 'الإجمالي:')} ${v.finalTotal?.toFixed(2) || '0.00'}
            </div>
        `;
        container.appendChild(card);
    });
}

// === VISIT EDITOR ===
function startNewVisit() {
    // Open Customer Selector
    document.getElementById('customerSelectModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
    searchCustomers();
    document.getElementById('customerSearchInput').focus();
}

function searchCustomers() {
    const term = document.getElementById('customerSearchInput').value.toLowerCase();
    const results = document.getElementById('customerSearchResults');
    results.innerHTML = '';

    const customers = window.DB.getCustomers();
    const vehicles = window.DB.getVehicles();

    // Optimization 1: Map vehicles by customerId -> O(V)
    const vehiclesByCustomer = {};
    vehicles.forEach(v => {
        if (!vehiclesByCustomer[v.customerId]) vehiclesByCustomer[v.customerId] = [];
        vehiclesByCustomer[v.customerId].push(v);
    });

    const MAX_RESULTS = 50;
    let count = 0;
    const fragment = document.createDocumentFragment();

    for (const c of customers) {
        if (count >= MAX_RESULTS) break;

        const cVehicles = vehiclesByCustomer[c.id] || [];

        // If customer matches name, show all their vehicles
        // If vehicle matches plate, show that vehicle

        const customerMatches = !term || c.name.toLowerCase().includes(term);

        cVehicles.forEach(v => {
            if (count >= MAX_RESULTS) return;

            const vehicleMatches = !term || v.plateNumber.toLowerCase().includes(term);

            if (customerMatches || vehicleMatches) {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.innerHTML = `
                    <strong>${c.name}</strong> - ${v.brand} ${v.model} (${v.plateNumber})
                `;
                div.onclick = () => {
                    initializeNewVisit(c, v);
                    closeModal('customerSelectModal');
                };
                fragment.appendChild(div);
                count++;
            }
        });
    }

    if (count === 0) {
        results.innerHTML = `<div style="padding:10px;text-align:center;">${t('No match.', 'لم يتم العثور على نتيجة.')} <a href="customers.html">${t('Add New?', 'إضافة جديد؟')}</a></div>`;
        return;
    }

    results.appendChild(fragment);

    // Hint if truncated
    if (count >= MAX_RESULTS) {
        const info = document.createElement('div');
        info.style.textAlign = 'center';
        info.style.padding = '5px';
        info.style.color = '#888';
        info.style.fontSize = '0.8em';
        info.textContent = t('Showing top 50 results. Refine search.', 'إظهار أول ٥٠ نتيجة. ابحث للمزيد.');
        results.appendChild(info);
    }
}

function initializeNewVisit(customer, vehicle) {
    currentVisit = {
        id: null, // assigned on save
        customerId: customer.id,
        vehicleId: vehicle.id,
        status: 'Draft',
        services: [],
        parts: [],
        notes: '',
        discount: 0,
        createdAt: new Date().toISOString()
    };
    isEditingExisting = false;

    updateEditorUI(customer, vehicle);
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('editorView').style.display = 'grid';
}

function openVisitEditor(visitId) {
    const visit = window.DB.getVisit(visitId);
    if (!visit) return;

    currentVisit = JSON.parse(JSON.stringify(visit)); // deep copy
    isEditingExisting = true;

    const customer = window.DB.getCustomers().find(c => c.id === currentVisit.customerId);
    const vehicle = window.DB.getVehicles().find(v => v.id === currentVisit.vehicleId);

    updateEditorUI(customer, vehicle);
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('editorView').style.display = 'grid';
}

function updateEditorUI(customer, vehicle) {
    document.getElementById('editorCustomer').textContent = customer.name;
    document.getElementById('editorMobile').textContent = customer.mobile;
    document.getElementById('editorVehicle').textContent = `${vehicle.brand} ${vehicle.model} ${vehicle.year || ''}`;
    document.getElementById('editorPlate').textContent = vehicle.plateNumber;

    document.getElementById('visitNotes').value = currentVisit.notes || '';
    document.getElementById('visitDiscount').value = currentVisit.discount || 0;

    // Set technician if exists
    if (currentVisit.technician) {
        document.getElementById('visitTechnician').value = currentVisit.technician;
    } else {
        document.getElementById('visitTechnician').value = '';
    }

    document.getElementById('visitPaymentMethod').value = currentVisit.paymentMethod || 'cash';

    renderVisitItems();
}

function renderVisitItems() {
    const sList = document.getElementById('servicesList');
    const pList = document.getElementById('partsList');

    sList.innerHTML = '';
    pList.innerHTML = '';

    currentVisit.services.forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'service-row';
        div.innerHTML = `
            <span>🔧 ${s.name}</span>
            <div>
                <strong>${parseFloat(s.cost).toFixed(2)}</strong>
                <button class="btn btn-sm btn-danger" onclick="removeService(${idx})" style="margin-left:10px;">x</button>
            </div>
        `;
        sList.appendChild(div);
    });

    currentVisit.parts.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'service-row';
        div.innerHTML = `
            <span>📦 ${p.name} (x${p.qty})</span>
            <div>
                <strong>${(p.price * p.qty).toFixed(2)}</strong>
                <button class="btn btn-sm btn-danger" onclick="removePart(${idx})" style="margin-left:10px;">x</button>
            </div>
        `;
        pList.appendChild(div);
    });

    calculateTotals();
}

function calculateTotals() {
    let labor = currentVisit.services.reduce((sum, s) => sum + parseFloat(s.cost), 0);
    let parts = currentVisit.parts.reduce((sum, p) => sum + (p.price * p.qty), 0);

    let subtotal = labor + parts;

    // Check if tax is enabled
    const taxEnabled = document.getElementById('enableTax')?.checked || false;
    let tax = taxEnabled ? (subtotal * 0.15) : 0;

    let discount = parseFloat(document.getElementById('visitDiscount').value) || 0;

    let total = subtotal + tax - discount;

    document.getElementById('sumLabor').textContent = labor.toFixed(2);
    document.getElementById('sumParts').textContent = parts.toFixed(2);
    document.getElementById('sumSubtotal').textContent = subtotal.toFixed(2);
    document.getElementById('sumTax').textContent = tax.toFixed(2);
    document.getElementById('sumTotal').textContent = total.toFixed(2);
}

// === ACTIONS ===
function openServiceModal() {
    document.getElementById('newServiceDesc').value = '';
    document.getElementById('newServiceCost').value = '';
    document.getElementById('serviceAddModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('newServiceDesc').focus();
}

function confirmAddService() {
    const name = document.getElementById('newServiceDesc').value.trim();
    const cost = parseFloat(document.getElementById('newServiceCost').value);

    if (name && !isNaN(cost)) {
        currentVisit.services.push({ name, cost });
        renderVisitItems();
        closeModal('serviceAddModal');
    }
}

function removeService(idx) {
    currentVisit.services.splice(idx, 1);
    renderVisitItems();
}

function openPartModal() {
    document.getElementById('partSelectModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
    searchParts();
    document.getElementById('partSearchInput').focus();
}

function searchParts() {
    const term = document.getElementById('partSearchInput').value.toLowerCase();
    const results = document.getElementById('partSearchResults');
    results.innerHTML = '';

    const parts = window.DB.getParts();
    const fragment = document.createDocumentFragment();
    let count = 0;
    const MAX_RESULTS = 50;

    for (const p of parts) {
        if (count >= MAX_RESULTS) break;

        if (!term || p.name.toLowerCase().includes(term) || p.partNumber.toLowerCase().includes(term)) {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.innerHTML = `
                <span>${p.partNumber} - ${p.name}</span>
                <span>Stock: ${p.stock} | Price: ${p.price}</span>
            `;
            div.onclick = () => {
                addPartToVisit(p);
                closeModal('partSelectModal');
            };
            fragment.appendChild(div);
            count++;
        }
    }

    results.appendChild(fragment);

    if (count === 0) {
        results.innerHTML = `<div style="padding:10px;text-align:center;">${t('No match.', 'لم يتم العثور على نتيجة.')}</div>`;
    } else if (count >= MAX_RESULTS) {
        const info = document.createElement('div');
        info.style.textAlign = 'center';
        info.style.padding = '5px';
        info.style.color = '#888';
        info.style.fontSize = '0.8em';
        info.textContent = t('Showing top 50 results. Refine search.', 'إظهار أول ٥٠ نتيجة. ابحث للمزيد.');
        results.appendChild(info);
    }
}

function addPartToVisit(part) {
    // Check stock
    if (part.stock <= 0) {
        alert(t('visit_out_of_stock'));
        return;
    }

    // Check if already in list, if so increment qty
    const existing = currentVisit.parts.find(p => p.partId === part.id);
    if (existing) {
        if (existing.qty + 1 > part.stock) {
            alert(t('visit_stock_limit'));
            return;
        }
        existing.qty++;
    } else {
        currentVisit.parts.push({
            partId: part.id,
            name: part.name,
            price: part.price,
            qty: 1
        });
    }
    renderVisitItems();
}

function removePart(idx) {
    currentVisit.parts.splice(idx, 1);
    renderVisitItems();
}

function saveVisit(isDraft = true) {
    currentVisit.notes = document.getElementById('visitNotes').value;
    currentVisit.discount = parseFloat(document.getElementById('visitDiscount').value) || 0;
    currentVisit.mileage = parseInt(document.getElementById('visitMileage')?.value) || 0;
    currentVisit.technician = document.getElementById('visitTechnician').value; // Save technician

    // Next visit scheduling (optional)
    const scheduleNext = document.getElementById('scheduleNextVisit')?.checked || false;
    if (scheduleNext) {
        currentVisit.nextVisit = {
            date: document.getElementById('nextVisitDate')?.value || '',
            service: document.getElementById('nextVisitService')?.value || '',
            notes: document.getElementById('nextVisitNotes')?.value || ''
        };
        currentVisit.nextVisit = null;
    }

    currentVisit.paymentMethod = document.getElementById('visitPaymentMethod').value || 'cash';

    // Recalculate totals for storage
    let labor = currentVisit.services.reduce((sum, s) => sum + parseFloat(s.cost), 0);
    let parts = currentVisit.parts.reduce((sum, p) => sum + (p.price * p.qty), 0);
    let subtotal = labor + parts;

    const taxEnabled = document.getElementById('enableTax')?.checked || false;
    let tax = taxEnabled ? (subtotal * 0.15) : 0;

    currentVisit.totalCost = subtotal;
    currentVisit.tax = tax;
    currentVisit.taxEnabled = taxEnabled;
    currentVisit.finalTotal = subtotal + tax - currentVisit.discount;

    if (window.DB.saveVisit(currentVisit)) {
        if (isDraft) {
            alert(t('visit_draft_saved') + currentVisit.id);
            closeEditor();
            renderDashboard();
        }
        return currentVisit.id;
    }
    return false;
}

function finishVisit() {
    if (!confirm(t('visit_finish_confirm'))) return;

    currentVisit.status = 'Completed';
    currentVisit.completedAt = new Date().toISOString();

    // Verify stock before finalizing
    const dbParts = window.DB.getParts();
    for (const vp of currentVisit.parts) {
        const stockPart = dbParts.find(p => p.id === vp.partId);
        if (!stockPart || stockPart.stock < vp.qty) {
            alert(t('visit_stock_error') + vp.name);
            return;
        }
    }

    // Save Visit
    const visitId = saveVisit(false);
    if (!visitId) {
        alert(t('visit_save_error'));
        return;
    }

    // Deduct stock
    currentVisit.parts.forEach(vp => {
        window.DB.updateStock(vp.partId, -vp.qty);
    });

    // Show Invoice Summary
    showInvoiceSummary(visitId);
}

function showInvoiceSummary(visitId) {
    const visit = window.DB.getVisit(visitId);
    if (!visit) return;

    const customer = window.DB.getCustomers().find(c => c.id === visit.customerId);
    const vehicle = window.DB.getVehicles().find(v => v.id === visit.vehicleId);

    // Get shop settings from admin panel
    const shopSettings = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const shopName = shopSettings.shopName || localStorage.getItem('shopName') || 'Car Service Center';
    const shopAddress = shopSettings.shopAddress || localStorage.getItem('shopAddress') || '';
    const footerMessage = shopSettings.footerMessage || localStorage.getItem('footerMessage') || 'Thank you for your business!';
    const shopLogo = shopSettings.shopLogo || localStorage.getItem('shopLogo') || '';

    // Get current language for RTL/LTR
    const lang = localStorage.getItem('pos_language') || 'en';
    const isArabic = lang === 'ar';
    const direction = isArabic ? 'rtl' : 'ltr';

    let invoiceHTML = `
        <div style="background:white; padding:30px; max-width:700px; margin:20px auto; border:2px solid #333; border-radius:8px; font-family: Arial, sans-serif; direction:${direction};">
            <!-- Header with Logo and Shop Name -->
            <div style="text-align:center; margin-bottom:20px; border-bottom:3px solid #333; padding-bottom:15px;">
                ${shopLogo ? `<img src="${shopLogo}" alt="Logo" style="max-height:80px; margin-bottom:10px;">` : ''}
                <h1 style="margin:5px 0; font-size:1.8em; color:#2c3e50;">${shopName}</h1>
                ${shopAddress ? `<p style="margin:5px 0; color:#7f8c8d; font-size:0.9em;">${shopAddress}</p>` : ''}
            </div>
            
            <h2 style="text-align:center; margin:0 0 20px 0; color:#e74c3c;">
                🧾 ${t('INVOICE', 'فاتورة')} #${visit.id}
            </h2>
            
            <!-- Customer & Vehicle Info -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px; padding:15px; background:#f8f9fa; border-radius:6px;">
                <div>
                    <p style="margin:5px 0;"><strong>${t('Customer:', 'العميل:')}</strong> ${customer?.name || 'N/A'}</p>
                    <p style="margin:5px 0;"><strong>${t('Mobile:', 'الموبايل:')}</strong> ${customer?.mobile || 'N/A'}</p>
                    <p style="margin:5px 0;"><strong>${t('Date:', 'التاريخ:')}</strong> ${new Date(visit.completedAt).toLocaleString()}</p>
                </div>
                <div>
                    <p style="margin:5px 0;"><strong>${t('Vehicle:', 'المركبة:')}</strong> ${vehicle?.brand} ${vehicle?.model}</p>
                    <p style="margin:5px 0;"><strong>${t('Plate:', 'اللوحة:')}</strong> ${vehicle?.plateNumber}</p>
                    <p style="margin:5px 0;"><strong>${t('Technician:', 'الفني:')}</strong> ${visit.technician || 'N/A'}</p>
                    ${visit.mileage ? `<p style="margin:5px 0;"><strong>${t('Mileage:', 'العداد:')}</strong> ${visit.mileage.toLocaleString()} KM</p>` : ''}
                </div>
            </div>

            <!-- Services Section -->
            ${visit.services.length > 0 ? `
            <div style="margin-bottom:25px;">
                <h3 style="background:#3498db; color:white; padding:12px; margin:0 0 10px 0; border-radius:6px;">🔧 ${t('Services (Labor)', 'الخدمات (مصنعية)')}</h3>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#34495e; color:white;">
                            <th style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'right' : 'left'}; width:50px;">#</th>
                            <th style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'right' : 'left'};">${t('Service', 'الخدمة')}</th>
                            <th style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'left' : 'right'}; width:120px;">${t('Price', 'السعر')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visit.services.map((s, idx) => `
                            <tr>
                                <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'right' : 'left'};">${idx + 1}</td>
                                <td style="border:1px solid #ddd; padding:8px;">${s.name}</td>
                                <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${s.cost.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                        <tr style="background:#ecf0f1; font-weight:bold;">
                            <td colspan="2" style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'left' : 'right'};">${t('Total Services:', 'إجمالي الخدمات:')}</td>
                            <td style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'left' : 'right'}; color:#3498db;">${visit.services.reduce((sum, s) => sum + parseFloat(s.cost), 0).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            ` : ''}

            <!-- Spare Parts Section -->
            ${visit.parts.length > 0 ? `
            <div style="margin-bottom:25px;">
                <h3 style="background:#27ae60; color:white; padding:12px; margin:0 0 10px 0; border-radius:6px;">📦 ${t('Spare Parts', 'قطع الغيار')}</h3>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#34495e; color:white;">
                            <th style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'right' : 'left'}; width:50px;">#</th>
                            <th style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'right' : 'left'};">${t('Part Name', 'اسم القطعة')}</th>
                            <th style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'left' : 'right'}; width:80px;">${t('Qty', 'الكمية')}</th>
                            <th style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'left' : 'right'}; width:100px;">${t('Price', 'السعر')}</th>
                            <th style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'left' : 'right'}; width:120px;">${t('Total', 'الإجمالي')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visit.parts.map((p, idx) => `
                            <tr>
                                <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'right' : 'left'};">${idx + 1}</td>
                                <td style="border:1px solid #ddd; padding:8px;">${p.name}</td>
                                <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${p.qty}</td>
                                <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${p.price.toFixed(2)}</td>
                                <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${(p.price * p.qty).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                        <tr style="background:#ecf0f1; font-weight:bold;">
                            <td colspan="4" style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'left' : 'right'};">${t('Total Spare Parts:', 'إجمالي قطع الغيار:')}</td>
                            <td style="border:1px solid #ddd; padding:10px; text-align:${isArabic ? 'left' : 'right'}; color:#27ae60;">${visit.parts.reduce((sum, p) => sum + (p.price * p.qty), 0).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            ` : ''}

            <!-- Totals Summary -->
            <div style="margin-top:25px; padding:20px; background:#f8f9fa; border-radius:8px;">
                <table style="width:100%; border-collapse:collapse;">
                    <tr>
                        <td style="padding:8px; text-align:${isArabic ? 'left' : 'right'}; font-size:1.1em;"><strong>${t('Subtotal:', 'الإجمالي الفرعي:')}</strong></td>
                        <td style="padding:8px; text-align:${isArabic ? 'left' : 'right'}; font-size:1.1em; width:150px;"><strong>${visit.totalCost.toFixed(2)}</strong></td>
                    </tr>
                    ${visit.taxEnabled ? `
                    <tr>
                        <td style="padding:8px; text-align:${isArabic ? 'left' : 'right'};">${t('Tax (14%):', 'الضريبة (١٤٪):')}</td>
                        <td style="padding:8px; text-align:${isArabic ? 'left' : 'right'}; width:150px;">${visit.tax.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    ${visit.discount > 0 ? `
                    <tr>
                        <td style="padding:8px; text-align:${isArabic ? 'left' : 'right'}; color:#e74c3c;">${t('Discount:', 'الخصم:')}</td>
                        <td style="padding:8px; text-align:${isArabic ? 'left' : 'right'}; width:150px; color:#e74c3c;">-${visit.discount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    <tr style="border-top:3px solid #2c3e50;">
                        <td style="padding:15px; text-align:${isArabic ? 'left' : 'right'}; font-size:1.4em; font-weight:bold;">${t('TOTAL:', 'الإجمالي:')}</td>
                        <td style="padding:15px; text-align:${isArabic ? 'left' : 'right'}; font-size:1.4em; font-weight:bold; color:#27ae60; width:150px;">${visit.finalTotal.toFixed(2)}</td>
                    </tr>
                </table>
            </div>

            <!-- Footer Message -->
            ${footerMessage ? `
            <div style="text-align:center; margin-top:30px; padding:15px; background:#ecf0f1; border-radius:6px;">
                <p style="margin:0; font-style:italic; color:#34495e;">${footerMessage}</p>
            </div>
            ` : ''}

            <!-- Visit Notes -->
            ${visit.notes ? `
            <div style="margin-top:20px; padding:15px; background:#fff3cd; border-left:4px solid #ffc107; border-radius:6px;">
                <h4 style="margin:0 0 10px 0; color:#856404; font-size:1.1em;">📝 ${t('Visit Notes', 'ملاحظات الزيارة')}:</h4>
                <p style="margin:0; color:#856404; white-space:pre-wrap; line-height:1.6; font-size:1em;">${visit.notes}</p>
            </div>
            ` : ''}

            <!-- Company Footer -->
            <div style="margin-top:30px; padding:15px; background:#2c3e50; color:white; border-radius:6px; text-align:center;">
                <h4 style="margin:0 0 8px 0; font-size:1.1em;">Tashgheel Services</h4>
                <p style="margin:0 0 8px 0; font-size:0.85em;">Powered by <strong>itqan solutions</strong></p>
                <div style="margin-top:8px; padding-top:8px; border-top:1px solid #34495e; font-size:0.8em;">
                    <p style="margin:3px 0;">📧 info@itqansolutions.org | 🌐 itqansolutions.org</p>
                    <p style="margin:3px 0;">📱 +201126522373 / +201155253886</p>
                </div>
            </div>

            <!-- Action Buttons -->
            <div style="text-align:center; margin-top:30px;">
                <button class="btn btn-primary" onclick="window.print()" style="padding:10px 20px; font-size:1.1em;">🖨️ ${t('Print Invoice', 'طباعة الفاتورة')}</button>
                <button class="btn btn-secondary" onclick="closeInvoice()" style="padding:10px 20px; font-size:1.1em; margin-left:10px;">${t('Close', 'إغلاق')}</button>
            </div>
        </div>
    `;

    // Create modal for invoice
    const modal = document.createElement('div');
    modal.id = 'invoiceModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; overflow-y:auto; padding:20px;';
    modal.innerHTML = invoiceHTML;
    document.body.appendChild(modal);
}

function closeInvoice() {
    const modal = document.getElementById('invoiceModal');
    if (modal) modal.remove();
    renderDashboard();
}

// Toggle next visit fields
function toggleNextVisitFields() {
    const checkbox = document.getElementById('scheduleNextVisit');
    const fields = document.getElementById('nextVisitFields');
    if (fields && checkbox) {
        fields.style.display = checkbox.checked ? 'block' : 'none';
    }
}

// === UTILS ===
function closeEditor() {
    renderDashboard();
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
}



// Delete a visit (for drafts)
function deleteVisit(visitId) {
    if (!confirm(t('visit_delete_confirm'))) return;

    const visits = window.DB.getVisits();
    const filtered = visits.filter(v => v.id !== visitId);
    localStorage.setItem('visits', JSON.stringify(filtered));

    alert(t('visit_deleted'));
    renderDashboard();
}
