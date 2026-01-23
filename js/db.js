/**
 * Car Service Center - Data Access Layer
 * Wraps EnhancedSecurity to provide structured access to entities.
 */

window.DB = window.DB || {
    // === CUSTOMERS ===
    getCustomers: function () {
        return window.EnhancedSecurity.getSecureData('customers') || [];
    },

    saveCustomer: function (customer) {
        const customers = this.getCustomers();
        const index = customers.findIndex(c => c.id === customer.id);

        if (index >= 0) {
            customers[index] = { ...customers[index], ...customer, updatedAt: new Date().toISOString() };
        } else {
            // New customer
            customer.id = customer.id || Date.now();
            customer.createdAt = new Date().toISOString();
            customers.push(customer);
        }

        return window.EnhancedSecurity.storeSecureData('customers', customers);
    },

    deleteCustomer: function (id) {
        const customers = this.getCustomers();
        const filtered = customers.filter(c => c.id !== id);
        return window.EnhancedSecurity.storeSecureData('customers', filtered);
    },

    // === VEHICLES ===
    getVehicles: function (customerId = null) {
        const vehicles = window.EnhancedSecurity.getSecureData('vehicles') || [];
        if (customerId) {
            return vehicles.filter(v => v.customerId === customerId);
        }
        return vehicles;
    },

    saveVehicle: function (vehicle) {
        const vehicles = this.getVehicles();
        const index = vehicles.findIndex(v => v.id === vehicle.id);

        if (index >= 0) {
            vehicles[index] = { ...vehicles[index], ...vehicle, updatedAt: new Date().toISOString() };
        } else {
            vehicle.id = vehicle.id || Date.now(); // Using timestamp as ID for simplicity
            vehicle.createdAt = new Date().toISOString();
            vehicles.push(vehicle);
        }

        return window.EnhancedSecurity.storeSecureData('vehicles', vehicles);
    },

    deleteVehicle: function (id) {
        const vehicles = this.getVehicles();
        const filtered = vehicles.filter(v => v.id !== id);
        return window.EnhancedSecurity.storeSecureData('vehicles', filtered);
    },

    // === SPARE PARTS (Inventory) ===
    _partsCache: null, // In-memory cache

    getParts: function () {
        if (!this._partsCache) {
            this._partsCache = window.EnhancedSecurity.getSecureData('spare_parts') || [];
        }
        return this._partsCache;
    },

    getPart: function (id) {
        const parts = this.getParts();
        return parts.find(p => p.id == id);
    },

    savePart: function (part) {
        const parts = this.getParts();
        const index = parts.findIndex(p => p.id == part.id);

        if (index >= 0) {
            parts[index] = { ...parts[index], ...part, updatedAt: new Date().toISOString() };
        } else {
            // Generate simple ID if not present (try to be sequential if possible, or timestamp)
            part.id = part.id || (parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1);
            part.createdAt = new Date().toISOString();
            parts.push(part);
        }

        const success = window.EnhancedSecurity.storeSecureData('spare_parts', parts);
        if (success) this._partsCache = parts; // Update cache on success
        return success;
    },

    deletePart: function (id) {
        let parts = this.getParts();
        parts = parts.filter(p => p.id !== id);
        const success = window.EnhancedSecurity.storeSecureData('spare_parts', parts);
        if (success) this._partsCache = parts;
        return success;
    },

    updateStock: function (partId, qtyChange) {
        const parts = this.getParts();
        const index = parts.findIndex(p => p.id == partId);
        if (index >= 0) {
            parts[index].stock = (parseInt(parts[index].stock) || 0) + parseInt(qtyChange);
            const success = window.EnhancedSecurity.storeSecureData('spare_parts', parts);
            if (success) this._partsCache = parts;
            return success;
        }
        return false;
    },

    // === VISITS (Service Jobs) ===
    getVisits: function () {
        return window.EnhancedSecurity.getSecureData('visits') || [];
    },

    saveVisit: function (visit) {
        const visits = this.getVisits();
        const index = visits.findIndex(v => v.id === visit.id);

        if (index >= 0) {
            visits[index] = { ...visits[index], ...visit, updatedAt: new Date().toISOString() };
        } else {
            // Generate Invoice ID Format: 00001
            if (!visit.id) {
                const maxId = visits.reduce((max, v) => {
                    const num = parseInt(v.id) || 0;
                    return num > max ? num : max;
                }, 0);
                visit.id = String(maxId + 1).padStart(5, '0');
            }
            visit.createdAt = new Date().toISOString();
            visits.push(visit);
        }

        return window.EnhancedSecurity.storeSecureData('visits', visits);
    },

    getVisit: function (id) {
        const visits = this.getVisits();
        return visits.find(v => v.id === id);
    },

    // === VENDORS ===
    getVendors: function () {
        return window.EnhancedSecurity.getSecureData('vendors') || [];
    },

    saveVendor: function (vendor) {
        const vendors = this.getVendors();
        const index = vendors.findIndex(v => v.id === vendor.id);

        if (index >= 0) {
            vendors[index] = { ...vendors[index], ...vendor, updatedAt: new Date().toISOString() };
        } else {
            vendor.id = vendor.id || Date.now();
            vendor.credit = vendor.credit || 0; // Outstanding balance
            vendor.createdAt = new Date().toISOString();
            vendors.push(vendor);
        }

        return window.EnhancedSecurity.storeSecureData('vendors', vendors);
    },

    deleteVendor: function (id) {
        const vendors = this.getVendors();
        const filtered = vendors.filter(v => v.id !== id);
        return window.EnhancedSecurity.storeSecureData('vendors', filtered);
    },

    // Update vendor credit (add to debt when purchasing parts)
    updateVendorCredit: function (vendorId, amount) {
        const vendors = this.getVendors();
        const index = vendors.findIndex(v => v.id == vendorId);
        if (index >= 0) {
            vendors[index].credit = (parseFloat(vendors[index].credit) || 0) + parseFloat(amount);
            vendors[index].updatedAt = new Date().toISOString();
            return window.EnhancedSecurity.storeSecureData('vendors', vendors);
        }
        return false;
    },

    // Record vendor payment
    recordVendorPayment: function (vendorId, amount, notes) {
        const payments = window.EnhancedSecurity.getSecureData('vendor_payments') || [];
        payments.push({
            id: Date.now(),
            vendorId: vendorId,
            amount: parseFloat(amount),
            notes: notes || '',
            date: new Date().toISOString()
        });

        // Reduce vendor credit
        this.updateVendorCredit(vendorId, -amount);

        return window.EnhancedSecurity.storeSecureData('vendor_payments', payments);
    },

    getVendorPayments: function (vendorId = null) {
        const payments = window.EnhancedSecurity.getSecureData('vendor_payments') || [];
        if (vendorId) {
            return payments.filter(p => p.vendorId == vendorId);
        }
        return payments;
    },

    // Get single vendor by ID
    getVendor: function (vendorId) {
        const vendors = this.getVendors();
        return vendors.find(v => v.id == vendorId);
    },

    // === MAINTENANCE REMINDERS ===
    getMaintenanceReminders: function () {
        const visits = this.getVisits().filter(v => v.status === 'Completed');
        const vehicles = this.getVehicles();
        const customers = this.getCustomers();
        const reminders = [];

        // Group visits by vehicle
        const vehicleVisits = {};
        visits.forEach(v => {
            if (!vehicleVisits[v.vehicleId]) vehicleVisits[v.vehicleId] = [];
            vehicleVisits[v.vehicleId].push(v);
        });

        // Check each vehicle for upcoming maintenance
        vehicles.forEach(vehicle => {
            const vVisits = vehicleVisits[vehicle.id] || [];
            if (vVisits.length === 0) return;

            // Sort by date desc
            vVisits.sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
            const lastVisit = vVisits[0];
            const lastDate = new Date(lastVisit.completedAt || lastVisit.createdAt);
            const daysSince = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

            // Simple rule: Remind if > 90 days since last service
            if (daysSince > 90) {
                const customer = customers.find(c => c.id === vehicle.customerId);
                reminders.push({
                    vehicleId: vehicle.id,
                    customerId: vehicle.customerId,
                    customerName: customer?.name || 'Unknown',
                    mobile: customer?.mobile || '',
                    vehicle: `${vehicle.brand} ${vehicle.model} (${vehicle.plateNumber})`,
                    lastServiceDate: lastDate.toISOString().split('T')[0],
                    daysSince: daysSince,
                    message: `${daysSince} days since last service`
                });
            }
        });

        return reminders;
    }
};

// Expose globally
window.DB = DB;
