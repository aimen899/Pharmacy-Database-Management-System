// ==========================================
// Pharmacy Management System - Frontend Script
// ==========================================

const API_BASE = 'http://localhost:3000/api';

// Current user session
let currentUser = null;
let invoiceItems = [];

// ==========================================
// DOM Ready
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in (session storage)
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showForm('dashboard');
    } else {
        showForm('loginForm');
    }
    
    // Check server health
    checkServerHealth();
});

// ==========================================
// Server Health Check
// ==========================================
async function checkServerHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        if (data.database === 'connected') {
            console.log('✅ Database connected successfully');
        } else {
            console.warn('⚠️ Database not connected');
            showNotification('Database connection issue. Some features may not work.', 'error');
        }
    } catch (error) {
        console.error('❌ Server not reachable:', error);
        showNotification('Cannot connect to server. Please ensure the server is running.', 'error');
    }
}

// ==========================================
// Dashboard Statistics & Charts
// ==========================================
let topProductsChart = null;
let stockDistChart = null;

async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/dashboard/stats`);
        const data = await response.json();
        
        // Update statistics cards
        document.getElementById('statProducts').textContent = formatNumber(data.totalProducts);
        document.getElementById('statUsers').textContent = formatNumber(data.totalUsers);
        document.getElementById('statSuppliers').textContent = formatNumber(data.totalSuppliers);
        document.getElementById('statLowStock').textContent = formatNumber(data.lowStockItems);
        document.getElementById('statSales').textContent = 'Rs. ' + formatNumber(Math.round(data.totalSalesAmount));
        document.getElementById('statInventory').textContent = 'Rs. ' + formatNumber(Math.round(data.inventoryValue));
        
        // Render charts
        renderTopProductsChart(data.topProducts);
        renderStockDistChart(data.stockDistribution);
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}

function renderTopProductsChart(products) {
    const ctx = document.getElementById('topProductsChart');
    if (!ctx) return;
    
    // Destroy existing chart if any
    if (topProductsChart) {
        topProductsChart.destroy();
    }
    
    const labels = products.map(p => p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name);
    const salesData = products.map(p => p.sales);
    
    topProductsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Units Sold',
                data: salesData,
                backgroundColor: [
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    'rgb(34, 197, 94)',
                    'rgb(59, 130, 246)',
                    'rgb(139, 92, 246)',
                    'rgb(245, 158, 11)',
                    'rgb(239, 68, 68)'
                ],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

function renderStockDistChart(distribution) {
    const ctx = document.getElementById('stockDistChart');
    if (!ctx) return;
    
    // Destroy existing chart if any
    if (stockDistChart) {
        stockDistChart.destroy();
    }
    
    const labels = distribution.map(d => d.category);
    const counts = distribution.map(d => d.count);
    
    const colors = {
        'Out of Stock': 'rgba(239, 68, 68, 0.8)',
        'Low Stock': 'rgba(245, 158, 11, 0.8)',
        'Medium Stock': 'rgba(59, 130, 246, 0.8)',
        'Well Stocked': 'rgba(34, 197, 94, 0.8)'
    };
    
    const bgColors = labels.map(l => colors[l] || 'rgba(107, 114, 128, 0.8)');
    
    stockDistChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: bgColors,
                borderWidth: 3,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

// ==========================================
// Navigation - Show/Hide Forms
// ==========================================
function showForm(formId) {
    // Hide all form containers
    const allForms = document.querySelectorAll('.form-container');
    allForms.forEach(form => {
        form.classList.remove('active');
    });
    
    // Show the requested form
    const targetForm = document.getElementById(formId);
    if (targetForm) {
        targetForm.classList.add('active');
    }
    
    // Update navigation based on login state
    if (formId === 'dashboard' && currentUser) {
        document.getElementById('userDisplay').textContent = `${currentUser.username} (${currentUser.role})`;
        document.getElementById('logoutBtn').style.display = 'inline-block';
        document.getElementById('roleDisplay').textContent = `Welcome, ${currentUser.username}! Role: ${currentUser.role}`;
        setPermissions();
        loadProducts(); // Load products when showing dashboard
        loadDashboardStats(); // Load dashboard statistics and charts
    }
    
    if (formId === 'loginForm') {
        document.getElementById('userDisplay').textContent = 'Guest';
        document.getElementById('logoutBtn').style.display = 'none';
    }
    
    // Load data for specific forms
    if (formId === 'sellForm') loadProducts();
    if (formId === 'manageSuppliers') loadSuppliers();
    if (formId === 'manageUsers') loadUsers();
    if (formId === 'reports') loadReportOptions();
}

// ==========================================
// Role-Based Permissions
// ==========================================
function setPermissions() {
    const role = currentUser?.role?.toLowerCase();
    
    const btnInsert = document.getElementById('btnInsertProduct');
    const btnUpdate = document.getElementById('btnUpdateProduct');
    const btnDelete = document.getElementById('btnDeleteProduct');
    const btnSearch = document.getElementById('btnSearchProducts');
    const btnSell = document.getElementById('btnSellProducts');
    const btnUsers = document.getElementById('btnManageUsers');
    const btnSuppliers = document.getElementById('btnManageSuppliers');
    const btnFullReports = document.getElementById('btnFullReports');
    const btnLimitedReports = document.getElementById('btnLimitedReports');
    const btnBackup = document.getElementById('btnBackupDatabase');
    
    if (role === 'pharmacist') {
        // Pharmacist: Only Search, Sell, Limited Reports
        if (btnInsert) { btnInsert.disabled = true; btnInsert.classList.add('disabled'); }
        if (btnUpdate) { btnUpdate.disabled = true; btnUpdate.classList.add('disabled'); }
        if (btnDelete) { btnDelete.disabled = true; btnDelete.classList.add('disabled'); }
        if (btnSearch) { btnSearch.disabled = false; btnSearch.classList.remove('disabled'); }
        if (btnSell) { btnSell.disabled = false; btnSell.classList.remove('disabled'); }
        if (btnUsers) { btnUsers.disabled = true; btnUsers.classList.add('disabled'); }
        if (btnSuppliers) { btnSuppliers.disabled = true; btnSuppliers.classList.add('disabled'); }
        if (btnFullReports) { btnFullReports.disabled = true; btnFullReports.classList.add('disabled'); }
        if (btnLimitedReports) { btnLimitedReports.disabled = false; btnLimitedReports.classList.remove('disabled'); }
        if (btnBackup) { btnBackup.disabled = true; btnBackup.classList.add('disabled'); }
    } else if (role === 'admin') {
        // Admin: All except Sell (including both Full and Limited Reports)
        if (btnInsert) { btnInsert.disabled = false; btnInsert.classList.remove('disabled'); }
        if (btnUpdate) { btnUpdate.disabled = false; btnUpdate.classList.remove('disabled'); }
        if (btnDelete) { btnDelete.disabled = false; btnDelete.classList.remove('disabled'); }
        if (btnSearch) { btnSearch.disabled = false; btnSearch.classList.remove('disabled'); }
        if (btnSell) { btnSell.disabled = true; btnSell.classList.add('disabled'); }
        if (btnUsers) { btnUsers.disabled = false; btnUsers.classList.remove('disabled'); }
        if (btnSuppliers) { btnSuppliers.disabled = false; btnSuppliers.classList.remove('disabled'); }
        if (btnFullReports) { btnFullReports.disabled = false; btnFullReports.classList.remove('disabled'); }
        if (btnLimitedReports) { btnLimitedReports.disabled = false; btnLimitedReports.classList.remove('disabled'); }
        if (btnBackup) { btnBackup.disabled = false; btnBackup.classList.remove('disabled'); }
    }
}

// ==========================================
// LOGIN / LOGOUT
// ==========================================
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showNotification('Please enter both username and password', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentUser = data.user;
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            showNotification(`Welcome, ${currentUser.username}!`, 'success');
            showForm('dashboard');
        } else {
            showNotification(data.message || 'Invalid username or password', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Server error. Please check if server is running.', 'error');
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    showForm('loginForm');
    showNotification('Logged out successfully', 'success');
}

// ==========================================
// PRODUCTS - CRUD
// ==========================================
async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE}/products`);
        const products = await response.json();
        
        // Update the sell form dropdown
        const select = document.getElementById('selectProduct');
        if (select) {
            select.innerHTML = '<option value="">-- Select a product --</option>';
            products.forEach(p => {
                const option = document.createElement('option');
                option.value = p.Prod_ID;
                option.textContent = `${p.Prod_Name} - Rs. ${p.Sale_Price || 0}`;
                option.dataset.name = p.Prod_Name;
                option.dataset.price = p.Sale_Price || 0;
                select.appendChild(option);
            });
        }
        return products;
    } catch (error) {
        console.error('Error loading products:', error);
        showNotification('Failed to load products', 'error');
        return [];
    }
}

async function handleInsertProduct(event) {
    event.preventDefault();
    
    const prodID = document.getElementById('prodID').value.trim();
    const prodName = document.getElementById('prodName').value.trim();
    const salePrice = parseFloat(document.getElementById('salePrice').value);
    
    if (!prodID || !prodName) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/products/insert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prodID, prodName, salePrice })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Product inserted successfully!', 'success');
            document.getElementById('prodID').value = '';
            document.getElementById('prodName').value = '';
            document.getElementById('salePrice').value = '';
        } else {
            showNotification(data.message || 'Failed to insert product', 'error');
        }
    } catch (error) {
        console.error('Insert error:', error);
        showNotification('Server error while inserting product', 'error');
    }
}

async function handleUpdateProduct(event) {
    event.preventDefault();
    
    const prodID = document.getElementById('updateProdID').value.trim();
    const prodName = document.getElementById('updateProdName').value.trim();
    const salePrice = parseFloat(document.getElementById('updateSalePrice').value);
    
    if (!prodID || !prodName) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/products/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prodID, prodName, salePrice })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Product updated successfully!', 'success');
        } else {
            showNotification(data.message || 'Failed to update product', 'error');
        }
    } catch (error) {
        console.error('Update error:', error);
        showNotification('Server error while updating product', 'error');
    }
}

async function handleDeleteProduct(event) {
    event.preventDefault();
    
    const prodID = document.getElementById('deleteProdID').value.trim();
    
    if (!prodID) {
        showNotification('Please enter a Product ID', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this product?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/products/delete/${prodID}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Product deleted successfully!', 'success');
            document.getElementById('deleteProdID').value = '';
        } else {
            showNotification(data.message || 'Failed to delete product', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Server error while deleting product', 'error');
    }
}

async function handleSearchProducts(event) {
    event.preventDefault();
    
    const searchName = document.getElementById('searchProdName').value.trim();
    
    try {
        const response = await fetch(`${API_BASE}/products/search?name=${encodeURIComponent(searchName)}`);
        const products = await response.json();
        
        const tbody = document.getElementById('searchResultsBody');
        const resultsDiv = document.getElementById('searchResults');
        
        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">No products found</td></tr>';
        } else {
            tbody.innerHTML = products.map(p => `
                <tr>
                    <td>${p.Prod_ID}</td>
                    <td>${p.Prod_Name}</td>
                    <td>Rs. ${(p.Sale_Price || 0).toFixed(2)}</td>
                </tr>
            `).join('');
        }
        resultsDiv.style.display = 'block';
    } catch (error) {
        console.error('Search error:', error);
        showNotification('Server error while searching products', 'error');
    }
}

// ==========================================
// SELL PRODUCTS - Invoice System
// ==========================================
function addToCart() {
    const select = document.getElementById('selectProduct');
    const quantity = parseInt(document.getElementById('quantityInput').value);
    const saleID = document.getElementById('saleID').value.trim();
    
    if (!select.value) {
        showNotification('Please select a product', 'error');
        return;
    }
    if (!quantity || quantity < 1) {
        showNotification('Please enter a valid quantity', 'error');
        return;
    }
    if (!saleID) {
        showNotification('Please enter a Sale ID', 'error');
        return;
    }
    
    const option = select.options[select.selectedIndex];
    
    invoiceItems.push({
        product: option.dataset.name,
        prodID: select.value,
        quantity: quantity,
        saleID: saleID,
        price: parseFloat(option.dataset.price)
    });
    
    updateInvoiceTable();
    document.getElementById('quantityInput').value = '';
    showNotification('Item added to cart', 'success');
}

function updateInvoiceTable() {
    const tbody = document.getElementById('invoiceBody');
    tbody.innerHTML = invoiceItems.map((item, index) => `
        <tr>
            <td>${item.product}</td>
            <td>${item.quantity}</td>
            <td>${item.saleID}</td>
            <td><button class="btn-danger" onclick="removeFromCart(${index})">Remove</button></td>
        </tr>
    `).join('');
}

function removeFromCart(index) {
    invoiceItems.splice(index, 1);
    updateInvoiceTable();
}

async function generateInvoice() {
    if (invoiceItems.length === 0) {
        showNotification('Cart is empty. Add items first.', 'error');
        return;
    }
    
    const saleID = document.getElementById('saleID').value.trim();
    
    try {
        const response = await fetch(`${API_BASE}/sales/generate-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saleID, items: invoiceItems })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Invoice generated successfully!', 'success');
            invoiceItems = [];
            updateInvoiceTable();
            document.getElementById('saleID').value = '';
            loadProducts(); // Refresh stock
        } else {
            showNotification(data.message || 'Failed to generate invoice', 'error');
        }
    } catch (error) {
        console.error('Invoice error:', error);
        showNotification('Server error while generating invoice', 'error');
    }
}

// ==========================================
// SUPPLIERS
// ==========================================
async function loadSuppliers() {
    try {
        const response = await fetch(`${API_BASE}/suppliers`);
        const suppliers = await response.json();
        
        const tbody = document.getElementById('suppliersBody');
        if (suppliers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2">No suppliers found</td></tr>';
        } else {
            tbody.innerHTML = suppliers.map(s => `
                <tr>
                    <td>${s.Supp_ID}</td>
                    <td>${s.Supp_Name}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

async function addSupplier() {
    const suppID = document.getElementById('suppID').value.trim();
    const suppName = document.getElementById('suppName').value.trim();
    
    if (!suppID || !suppName) {
        showNotification('Please enter both Supplier ID and Name', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/suppliers/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suppID, suppName })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Supplier added successfully!', 'success');
            document.getElementById('suppID').value = '';
            document.getElementById('suppName').value = '';
            loadSuppliers();
        } else {
            showNotification(data.message || 'Failed to add supplier', 'error');
        }
    } catch (error) {
        console.error('Add supplier error:', error);
        showNotification('Server error', 'error');
    }
}

async function deleteSupplier() {
    const suppID = document.getElementById('suppID').value.trim();
    
    if (!suppID) {
        showNotification('Please enter a Supplier ID to delete', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/suppliers/delete/${suppID}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Supplier deleted successfully!', 'success');
            document.getElementById('suppID').value = '';
            document.getElementById('suppName').value = '';
            loadSuppliers();
        } else {
            showNotification('Failed to delete supplier', 'error');
        }
    } catch (error) {
        console.error('Delete supplier error:', error);
        showNotification('Server error', 'error');
    }
}

async function searchSupplier() {
    const searchQuery = document.getElementById('searchSupplierInput').value.trim();
    
    if (!searchQuery) {
        showNotification('Please enter a Supplier ID or Name to search', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/suppliers/search?q=${encodeURIComponent(searchQuery)}`);
        const suppliers = await response.json();
        
        const tbody = document.getElementById('suppliersBody');
        if (suppliers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2">No suppliers found matching your search</td></tr>';
            showNotification('No suppliers found', 'info');
        } else {
            tbody.innerHTML = suppliers.map(s => `
                <tr>
                    <td>${s.Supp_ID}</td>
                    <td>${s.Supp_Name}</td>
                </tr>
            `).join('');
            showNotification(`Found ${suppliers.length} supplier(s)`, 'success');
        }
    } catch (error) {
        console.error('Search supplier error:', error);
        showNotification('Error searching suppliers', 'error');
    }
}

function clearSupplierSearch() {
    document.getElementById('searchSupplierInput').value = '';
    loadSuppliers();
    showNotification('Search cleared - showing all suppliers', 'info');
}

// ==========================================
// USERS
// ==========================================
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`);
        const users = await response.json();
        
        const tbody = document.getElementById('usersBody');
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2">No users found</td></tr>';
        } else {
            tbody.innerHTML = users.map(u => `
                <tr>
                    <td>${u.Username}</td>
                    <td>${u.Role}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function addUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newUserRole').value;
    
    if (!username || !password || !role) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('User added successfully!', 'success');
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('newUserRole').value = '';
            loadUsers();
        } else {
            showNotification(data.message || 'Failed to add user', 'error');
        }
    } catch (error) {
        console.error('Add user error:', error);
        showNotification('Server error', 'error');
    }
}

async function deleteUser() {
    const username = document.getElementById('newUsername').value.trim();
    
    if (!username) {
        showNotification('Please enter a username to delete', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/users/delete/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('User deleted successfully!', 'success');
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            loadUsers();
        } else {
            showNotification('Failed to delete user', 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showNotification('Server error', 'error');
    }
}

async function searchUser() {
    showNotification('Search shows all users in the table below', 'info');
    loadUsers();
}

// ==========================================
// REPORTS
// ==========================================
let currentReportData = [];
let currentReportType = '';

function loadReportOptions() {
    const role = currentUser?.role?.toLowerCase();
    const select = document.getElementById('reportType');
    
    select.innerHTML = '<option value="">-- Select Report --</option>';
    
    if (role === 'admin') {
        select.innerHTML += `
            <option value="sales">📊 Sales Report</option>
            <option value="stock">📦 Stock Report</option>
            <option value="profit">💰 Profit Report</option>
            <option value="inventory-value">📈 Inventory Value</option>
            <option value="purchase-history">🛒 Purchase History</option>
            <option value="low-stock">⚠️ Low Stock Alert</option>
        `;
    } else {
        // Pharmacist - limited reports
        select.innerHTML += `
            <option value="sales">📊 Sales Report</option>
            <option value="stock">📦 Stock Report</option>
            <option value="low-stock">⚠️ Low Stock Alert</option>
        `;
    }
}

async function loadReport() {
    const reportType = document.getElementById('reportType').value;
    
    if (!reportType) {
        showNotification('Please select a report type', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/reports/${reportType}`);
        const data = await response.json();
        
        currentReportData = data;
        currentReportType = reportType;
        
        const container = document.getElementById('reportContainer');
        const title = document.getElementById('reportTitle');
        const dateEl = document.getElementById('reportDate');
        const summaryEl = document.getElementById('reportSummary');
        const thead = document.getElementById('reportHead');
        const tbody = document.getElementById('reportBody');
        
        // Report titles mapping
        const reportTitles = {
            'sales': '📊 Sales Report',
            'stock': '📦 Stock Report',
            'profit': '💰 Profit Report',
            'inventory-value': '📈 Inventory Value Report',
            'purchase-history': '🛒 Purchase History Report',
            'low-stock': '⚠️ Low Stock Alert Report'
        };
        
        title.textContent = reportTitles[reportType] || `${reportType} Report`;
        dateEl.textContent = `Generated: ${new Date().toLocaleString()}`;
        
        if (data.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;">No data available for this report</td></tr>';
            summaryEl.textContent = 'No records found';
        } else {
            // Build headers from first item keys with formatted names
            const keys = Object.keys(data[0]);
            const formatHeader = (key) => key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
            
            thead.innerHTML = '<tr>' + keys.map(k => `<th>${formatHeader(k)}</th>`).join('') + '</tr>';
            
            // Build rows with formatted values
            tbody.innerHTML = data.map(row => 
                '<tr>' + keys.map(k => {
                    let value = row[k];
                    // Format numbers with 2 decimals if they are floats
                    if (typeof value === 'number') {
                        value = value % 1 !== 0 ? value.toFixed(2) : value.toLocaleString();
                    }
                    return `<td>${value ?? 'N/A'}</td>`;
                }).join('') + '</tr>'
            ).join('');
            
            // Generate summary
            summaryEl.textContent = `Total Records: ${data.length}`;
            
            // Add totals for specific reports
            if (reportType === 'sales' && data[0]?.Total_Amount !== undefined) {
                const total = data.reduce((sum, r) => sum + (parseFloat(r.Total_Amount) || 0), 0);
                summaryEl.textContent += ` | Total Sales: Rs. ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            }
            if (reportType === 'inventory-value' && data[0]?.Total_Value !== undefined) {
                const total = data.reduce((sum, r) => sum + (parseFloat(r.Total_Value) || 0), 0);
                summaryEl.textContent += ` | Total Value: Rs. ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            }
            if (reportType === 'profit' && data[0]?.Profit !== undefined) {
                const total = data.reduce((sum, r) => sum + (parseFloat(r.Profit) || 0), 0);
                summaryEl.textContent += ` | Total Profit: Rs. ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            }
        }
        
        container.style.display = 'block';
        
        // Show export buttons
        document.getElementById('btnExportCSV').style.display = 'inline-block';
        document.getElementById('btnPrint').style.display = 'inline-block';
        
    } catch (error) {
        console.error('Report error:', error);
        showNotification('Failed to load report', 'error');
    }
}

function exportReportCSV() {
    if (!currentReportData || currentReportData.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }
    
    const keys = Object.keys(currentReportData[0]);
    const csvRows = [];
    
    // Add headers
    csvRows.push(keys.join(','));
    
    // Add data rows
    currentReportData.forEach(row => {
        const values = keys.map(k => {
            let val = row[k] ?? '';
            // Escape commas and quotes
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                val = `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        });
        csvRows.push(values.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${currentReportType}_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Report exported successfully!', 'success');
}

function printReport() {
    const reportContainer = document.getElementById('reportContainer');
    if (!reportContainer) return;
    
    const printWindow = window.open('', '_blank');
    const reportTitle = document.getElementById('reportTitle').textContent;
    const reportDate = document.getElementById('reportDate').textContent;
    const reportSummary = document.getElementById('reportSummary').textContent;
    const tableHTML = document.getElementById('reportTable').outerHTML;
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${reportTitle} - PharmaCare</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #16a34a; border-bottom: 2px solid #16a34a; padding-bottom: 10px; }
                .info { color: #666; margin: 10px 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #16a34a; color: white; padding: 12px 8px; text-align: left; }
                td { padding: 10px 8px; border-bottom: 1px solid #ddd; }
                tr:nth-child(even) { background: #f9fafb; }
                .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; }
            </style>
        </head>
        <body>
            <h1>🏥 PharmaCare - ${reportTitle}</h1>
            <p class="info">${reportDate}</p>
            <p class="info"><strong>${reportSummary}</strong></p>
            ${tableHTML}
            <div class="footer">
                <p>Generated by PharmaCare Management System</p>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}

// ==========================================
// BACKUP & RESTORE
// ==========================================
async function backupDatabase() {
    const path = document.getElementById('backupPath').value.trim();
    
    if (!path) {
        showNotification('Please enter a backup file path', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/database/backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Database backup created successfully!', 'success');
        } else {
            showNotification(data.message || 'Backup failed', 'error');
        }
    } catch (error) {
        console.error('Backup error:', error);
        showNotification('Server error during backup', 'error');
    }
}

async function restoreDatabase() {
    const path = document.getElementById('restorePath').value.trim();
    
    if (!path) {
        showNotification('Please enter a backup file path', 'error');
        return;
    }
    
    if (!confirm('WARNING: This will overwrite all current data. Are you sure?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/database/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Database restored successfully!', 'success');
        } else {
            showNotification(data.message || 'Restore failed', 'error');
        }
    } catch (error) {
        console.error('Restore error:', error);
        showNotification('Server error during restore', 'error');
    }
}

// ==========================================
// NOTIFICATION SYSTEM
// ==========================================
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(el => el.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    
    // Add styles if not already present
    if (!document.getElementById('notificationStyles')) {
        const style = document.createElement('style');
        style.id = 'notificationStyles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 15px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideIn 0.3s ease;
                max-width: 400px;
            }
            .notification-success { background: #22c55e; color: white; }
            .notification-error { background: #ef4444; color: white; }
            .notification-warning { background: #f59e0b; color: white; }
            .notification-info { background: #3b82f6; color: white; }
            .notification button {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 16px;
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}
