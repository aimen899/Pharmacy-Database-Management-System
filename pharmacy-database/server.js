// ============================================
// PHARMACY MANAGEMENT SYSTEM - BACKEND SERVER
// ============================================

const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ============================================
// DATABASE CONFIGURATION
// ============================================

const serverName = process.env.DB_SERVER || 'DESKTOP-6APITTI\\SQLEXPRESS01';
const databaseName = process.env.DB_NAME || 'Pharmacy Database Management System';
const dbPort = parseInt(process.env.DB_PORT) || 50446;

const serverParts = serverName.split('\\');
const hostName = serverParts[0];

const dbConfig = {
    server: hostName,
    database: databaseName,
    port: dbPort,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    connectionTimeout: 30000,
    requestTimeout: 30000
};

console.log(`Connecting to: ${hostName}:${dbPort}`);
console.log(`Database: ${databaseName}`);

let pool;

// ============================================
// DATABASE CONNECTION
// ============================================

async function connectDatabase() {
    try {
        console.log('Attempting to connect to database...');
        pool = new sql.ConnectionPool(dbConfig);
        await pool.connect();
        console.log('✓ Connected to SQL Server successfully!');
        
        const result = await pool.request().query('SELECT 1 as connected');
        console.log('✓ Database connection verified');
        
        return pool;
    } catch (error) {
        console.error('✗ Database connection error:', error.message);
        console.error('\nRetrying connection in 5 seconds...');
        setTimeout(connectDatabase, 5000);
    }
}

// ============================================
// HELPER FUNCTION
// ============================================

async function executeQuery(query, params = {}) {
    try {
        const request = pool.request();
        Object.keys(params).forEach(key => {
            request.input(key, params[key]);
        });
        const result = await request.query(query);
        return result.recordset || result;
    } catch (error) {
        console.error('Query error:', error);
        throw error;
    }
}

// ============================================
// DASHBOARD STATISTICS
// ============================================

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        // Get total products
        const productsResult = await executeQuery('SELECT COUNT(*) as count FROM Product_Info');
        const totalProducts = productsResult[0].count;
        
        // Get total users
        const usersResult = await executeQuery('SELECT COUNT(*) as count FROM Users');
        const totalUsers = usersResult[0].count;
        
        // Get total suppliers
        const suppliersResult = await executeQuery('SELECT COUNT(*) as count FROM Supplier_Info');
        const totalSuppliers = suppliersResult[0].count;
        
        // Get low stock items count
        const lowStockResult = await executeQuery("SELECT COUNT(*) as count FROM Stock WHERE CAST(ISNULL(QTY_available, '0') AS float) < 10");
        const lowStockItems = lowStockResult[0].count;
        
        // Get total sales amount
        const salesResult = await executeQuery("SELECT ISNULL(SUM(CAST(ISNULL(QTY_Sold, '0') AS float) * ISNULL(Sale_Price, 0)), 0) as total FROM Product_Sale_Info");
        const totalSalesAmount = salesResult[0].total;
        
        // Get total inventory value
        const inventoryResult = await executeQuery(`
            SELECT ISNULL(SUM(CAST(ISNULL(s.QTY_available, '0') AS float) * ISNULL(p.Sale_Price, 0)), 0) as total
            FROM Stock s
            JOIN Product_Info p ON s.Prod_ID = p.Prod_ID
        `);
        const inventoryValue = inventoryResult[0].total;
        
        // Get top selling products (for chart)
        const topProductsResult = await executeQuery(`
            SELECT TOP 5 
                p.Prod_Name as name,
                CAST(ISNULL(psi.QTY_Sold, '0') AS float) as sales
            FROM Product_Sale_Info psi
            JOIN Product_Info p ON psi.Prod_ID = p.Prod_ID
            ORDER BY CAST(ISNULL(psi.QTY_Sold, '0') AS float) DESC
        `);
        
        // Get stock distribution (for pie chart)
        const stockDistResult = await executeQuery(`
            SELECT 
                CASE 
                    WHEN CAST(ISNULL(QTY_available, '0') AS float) = 0 THEN 'Out of Stock'
                    WHEN CAST(ISNULL(QTY_available, '0') AS float) < 10 THEN 'Low Stock'
                    WHEN CAST(ISNULL(QTY_available, '0') AS float) < 50 THEN 'Medium Stock'
                    ELSE 'Well Stocked'
                END as category,
                COUNT(*) as count
            FROM Stock
            GROUP BY 
                CASE 
                    WHEN CAST(ISNULL(QTY_available, '0') AS float) = 0 THEN 'Out of Stock'
                    WHEN CAST(ISNULL(QTY_available, '0') AS float) < 10 THEN 'Low Stock'
                    WHEN CAST(ISNULL(QTY_available, '0') AS float) < 50 THEN 'Medium Stock'
                    ELSE 'Well Stocked'
                END
        `);
        
        res.json({
            totalProducts,
            totalUsers,
            totalSuppliers,
            lowStockItems,
            totalSalesAmount,
            inventoryValue,
            topProducts: topProductsResult,
            stockDistribution: stockDistResult
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ message: 'Error fetching dashboard stats', error: error.message });
    }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', async (req, res) => {
    try {
        if (pool && pool.connected) {
            await pool.request().query('SELECT 1');
            res.json({ 
                status: 'healthy', 
                database: 'connected',
                server: dbConfig.server,
                databaseName: dbConfig.database
            });
        } else {
            res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
        }
    } catch (error) {
        res.status(503).json({ status: 'unhealthy', database: 'error', message: error.message });
    }
});

// ============================================
// LOGIN ROUTE
// ============================================

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const query = `
            SELECT UserID, Username, Role FROM Users 
            WHERE Username = @username AND Password = @password
        `;
        
        const result = await executeQuery(query, { username, password });
        
        if (result.length > 0) {
            const user = result[0];
            res.json({ 
                success: true,
                user: {
                    id: user.UserID,
                    name: user.Username,
                    username: user.Username,
                    role: user.Role
                },
                message: 'Login successful' 
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// ============================================
// PRODUCT ROUTES
// ============================================

// Get all products (for dropdown)
app.get('/api/products', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.Prod_ID,
                p.Prod_Name,
                ISNULL(p.Sale_Price, 0) as Sale_Price,
                CAST(ISNULL(s.QTY_available, '0') AS float) as Quantity
            FROM Product_Info p
            LEFT JOIN Stock s ON p.Prod_ID = s.Prod_ID
        `;
        
        const result = await executeQuery(query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
});

// Search products by name - MUST be before /:id to avoid conflict
app.get('/api/products/search', async (req, res) => {
    try {
        const { name } = req.query;
        
        const query = `
            SELECT Prod_ID, Prod_Name, ISNULL(Sale_Price, 0) as Sale_Price
            FROM Product_Info
            WHERE Prod_Name LIKE '%' + @name + '%'
        `;
        
        const result = await executeQuery(query, { name: name || '' });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error searching products', error: error.message });
    }
});

// Get single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                p.Prod_ID,
                p.Prod_Name,
                CAST(ISNULL(s.QTY_available, '0') AS float) as Quantity,
                ISNULL(p.Sale_Price, 0) as Sale_Price
            FROM Product_Info p
            LEFT JOIN Stock s ON p.Prod_ID = s.Prod_ID
            WHERE p.Prod_ID = @id
        `;
        
        const result = await executeQuery(query, { id });
        
        if (result.length > 0) {
            res.json(result[0]);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error fetching product', error: error.message });
    }
});

// Insert product (matching frontend route)
app.post('/api/products/insert', async (req, res) => {
    try {
        const { prodID, prodName, salePrice } = req.body;
        
        // Insert into Product_Info (Sale_Price is in Product_Info)
        // Avg_Price is NOT NULL, so we set it to the same as Sale_Price or 0
        await executeQuery(
            'INSERT INTO Product_Info (Prod_ID, Prod_Name, Sale_Price, Avg_Price) VALUES (@prodID, @prodName, @salePrice, @avgPrice)',
            { prodID, prodName, salePrice: salePrice || 0, avgPrice: salePrice || 0 }
        );
        
        // Insert into Stock - Stock_ID and Prod_ID are required (NOT NULL)
        // Generate a Stock_ID based on Prod_ID
        const stockId = 'STK' + prodID;
        await executeQuery(
            'INSERT INTO Stock (Stock_ID, Prod_ID, QTY_available) VALUES (@stockId, @prodID, @qty)',
            { stockId, prodID, qty: '0' }
        );
        
        res.json({ success: true, message: 'Product inserted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error inserting product', error: error.message });
    }
});

// Update product (matching frontend route)
app.put('/api/products/update', async (req, res) => {
    try {
        const { prodID, prodName, salePrice } = req.body;
        
        // Update Product_Info (Sale_Price is in Product_Info)
        await executeQuery(
            'UPDATE Product_Info SET Prod_Name = @prodName, Sale_Price = @salePrice WHERE Prod_ID = @prodID',
            { prodID, prodName, salePrice: salePrice || 0 }
        );
        
        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating product', error: error.message });
    }
});

// Delete product by ID (matching frontend route)
app.delete('/api/products/delete/:prodID', async (req, res) => {
    try {
        const { prodID } = req.params;
        
        await executeQuery('DELETE FROM Stock WHERE Prod_ID = @prodID', { prodID });
        await executeQuery('DELETE FROM Product_Sale_Info WHERE Prod_ID = @prodID', { prodID });
        await executeQuery('DELETE FROM Product_Sale_ID WHERE Prod_ID = @prodID', { prodID });
        await executeQuery('DELETE FROM Product_Purchase_Info WHERE Prod_ID = @prodID', { prodID });
        await executeQuery('DELETE FROM Product_Info WHERE Prod_ID = @prodID', { prodID });
        
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting product', error: error.message });
    }
});

// Insert new product (alternate route)
app.post('/api/products', async (req, res) => {
    try {
        const { name, quantity, price } = req.body;
        
        // Get next product ID - Prod_ID is nvarchar, so we need to handle it as string
        const maxIdResult = await executeQuery("SELECT ISNULL(MAX(CAST(Prod_ID as bigint)), 0) + 1 as nextId FROM Product_Info WHERE ISNUMERIC(Prod_ID) = 1");
        const prodId = String(maxIdResult[0].nextId || 1);
        
        // Insert product with Sale_Price and Avg_Price (required)
        await executeQuery(
            'INSERT INTO Product_Info (Prod_ID, Prod_Name, Sale_Price, Avg_Price) VALUES (@prodId, @name, @price, @avgPrice)',
            { prodId, name, price: price || 0, avgPrice: price || 0 }
        );
        
        // Insert stock with required Stock_ID
        const stockId = 'STK' + prodId;
        await executeQuery(
            'INSERT INTO Stock (Stock_ID, Prod_ID, QTY_available) VALUES (@stockId, @prodId, @quantity)',
            { stockId, prodId, quantity: String(quantity || 0) }
        );
        
        res.json({ success: true, message: 'Product inserted successfully', productId: prodId });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error inserting product', error: error.message });
    }
});

// Update product (alternate route)
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, quantity, price } = req.body;
        
        // Update product name and price
        await executeQuery(
            'UPDATE Product_Info SET Prod_Name = @name, Sale_Price = @price WHERE Prod_ID = @id',
            { id, name, price: price || 0 }
        );
        
        // Update stock
        const stockExists = await executeQuery('SELECT COUNT(*) as cnt FROM Stock WHERE Prod_ID = @id', { id });
        if (stockExists[0].cnt > 0) {
            await executeQuery('UPDATE Stock SET QTY_available = @quantity WHERE Prod_ID = @id', { id, quantity: String(quantity || 0) });
        } else {
            // Stock table requires Stock_ID
            const stockId = 'STK' + id;
            await executeQuery('INSERT INTO Stock (Stock_ID, Prod_ID, QTY_available) VALUES (@stockId, @id, @quantity)', { stockId, id, quantity: String(quantity || 0) });
        }
        
        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating product', error: error.message });
    }
});

// Delete product (alternate route)
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete from related tables first
        await executeQuery('DELETE FROM Stock WHERE Prod_ID = @id', { id });
        await executeQuery('DELETE FROM Product_Sale_Info WHERE Prod_ID = @id', { id });
        await executeQuery('DELETE FROM Product_Sale_ID WHERE Prod_ID = @id', { id });
        await executeQuery('DELETE FROM Product_Purchase_Info WHERE Prod_ID = @id', { id });
        
        // Delete the product
        await executeQuery('DELETE FROM Product_Info WHERE Prod_ID = @id', { id });
        
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting product', error: error.message });
    }
});

// ============================================
// SALES ROUTES
// ============================================

// Generate invoice (matching frontend route)
app.post('/api/sales/generate-invoice', async (req, res) => {
    try {
        const { saleID, items } = req.body;
        
        for (const item of items) {
            const prodID = item.prodID;
            const qty = item.quantity;
            
            // Get sale price from Product_Info
            const priceResult = await executeQuery(
                'SELECT Sale_Price FROM Product_Info WHERE Prod_ID = @prodID',
                { prodID }
            );
            const salePrice = priceResult.length > 0 ? priceResult[0].Sale_Price : 0;
            
            // Insert into Product_Sale_ID
            await executeQuery(
                'INSERT INTO Product_Sale_ID (Sale_ID, Prod_ID) VALUES (@saleID, @prodID)',
                { saleID, prodID }
            );
            
            // Update or insert Product_Sale_Info
            const saleInfoExists = await executeQuery(
                'SELECT COUNT(*) as cnt FROM Product_Sale_Info WHERE Prod_ID = @prodID',
                { prodID }
            );
            
            if (saleInfoExists[0].cnt > 0) {
                // QTY_Sold is nvarchar, need to CAST for arithmetic (use float for decimal values)
                await executeQuery(
                    'UPDATE Product_Sale_Info SET QTY_Sold = CAST(CAST(ISNULL(QTY_Sold, 0) AS float) + @qty AS nvarchar) WHERE Prod_ID = @prodID',
                    { prodID, qty }
                );
            } else {
                await executeQuery(
                    'INSERT INTO Product_Sale_Info (Prod_ID, QTY_Sold, Sale_Price) VALUES (@prodID, @qty, @salePrice)',
                    { prodID, qty: String(qty), salePrice }
                );
            }
            
            // Update stock - QTY_available is nvarchar, need to CAST (use float for decimal values)
            await executeQuery(
                'UPDATE Stock SET QTY_available = CAST(CAST(ISNULL(QTY_available, 0) AS float) - @qty AS nvarchar) WHERE Prod_ID = @prodID',
                { prodID, qty }
            );
        }
        
        res.json({ success: true, message: 'Invoice generated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error generating invoice', error: error.message });
    }
});

app.post('/api/sales', async (req, res) => {
    try {
        const { items, customerName, soldBy } = req.body;
        
        // Generate sale ID
        const maxSaleResult = await executeQuery('SELECT ISNULL(MAX(Sale_ID), 0) + 1 as nextId FROM Product_Sale_ID');
        const saleId = maxSaleResult[0].nextId;
        
        let totalAmount = 0;
        
        for (const item of items) {
            const prodId = item.productId;
            const qty = item.quantity;
            const price = item.price;
            
            // Insert into Product_Sale_ID
            await executeQuery(
                'INSERT INTO Product_Sale_ID (Sale_ID, Prod_ID) VALUES (@saleId, @prodId)',
                { saleId, prodId }
            );
            
            // Check if product exists in Product_Sale_Info
            const saleInfoExists = await executeQuery(
                'SELECT COUNT(*) as cnt FROM Product_Sale_Info WHERE Prod_ID = @prodId',
                { prodId }
            );
            
            if (saleInfoExists[0].cnt > 0) {
                // Update existing sale info - QTY_Sold is nvarchar (use float for decimal values)
                await executeQuery(
                    'UPDATE Product_Sale_Info SET QTY_Sold = CAST(CAST(ISNULL(QTY_Sold, 0) AS float) + @qty AS nvarchar) WHERE Prod_ID = @prodId',
                    { prodId, qty }
                );
            } else {
                // Insert new sale info
                await executeQuery(
                    'INSERT INTO Product_Sale_Info (Prod_ID, QTY_Sold, Sale_Price) VALUES (@prodId, @qty, @price)',
                    { prodId, qty: String(qty), price }
                );
            }
            
            // Update stock - QTY_available is nvarchar, need to CAST (use float for decimal values)
            await executeQuery(
                'UPDATE Stock SET QTY_available = CAST(CAST(ISNULL(QTY_available, 0) AS float) - @qty AS nvarchar) WHERE Prod_ID = @prodId',
                { prodId, qty }
            );
            
            totalAmount += price * qty;
        }
        
        res.json({ 
            success: true, 
            message: 'Sale completed successfully',
            invoiceId: saleId,
            totalAmount: totalAmount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error processing sale', error: error.message });
    }
});

// ============================================
// SUPPLIER ROUTES
// ============================================

// Get all suppliers
app.get('/api/suppliers', async (req, res) => {
    try {
        const query = 'SELECT Supp_ID, Supp_Name FROM Supplier_Info';
        const result = await executeQuery(query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching suppliers', error: error.message });
    }
});

// Search suppliers by ID or Name
app.get('/api/suppliers/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ message: 'Search query is required' });
        }
        const query = `SELECT Supp_ID, Supp_Name FROM Supplier_Info 
                       WHERE Supp_ID LIKE @search OR Supp_Name LIKE @search`;
        const result = await executeQuery(query, { search: `%${q}%` });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error searching suppliers', error: error.message });
    }
});

// Add supplier (matching frontend route)
app.post('/api/suppliers/add', async (req, res) => {
    try {
        const { suppID, suppName } = req.body;
        
        await executeQuery(
            'INSERT INTO Supplier_Info (Supp_ID, Supp_Name) VALUES (@suppID, @suppName)',
            { suppID, suppName }
        );
        
        res.json({ success: true, message: 'Supplier added successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error adding supplier', error: error.message });
    }
});

// Delete supplier (matching frontend route)
app.delete('/api/suppliers/delete/:suppID', async (req, res) => {
    try {
        const { suppID } = req.params;
        await executeQuery('DELETE FROM Supplier_Info WHERE Supp_ID = @suppID', { suppID });
        res.json({ success: true, message: 'Supplier deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting supplier', error: error.message });
    }
});

// Add supplier (alternate route)
app.post('/api/suppliers', async (req, res) => {
    try {
        const { name, suppID } = req.body;
        
        // If suppID not provided, generate one
        let suppId = suppID;
        if (!suppId) {
            const maxIdResult = await executeQuery("SELECT ISNULL(MAX(CAST(Supp_ID as int)), 0) + 1 as nextId FROM Supplier_Info WHERE ISNUMERIC(Supp_ID) = 1");
            suppId = String(maxIdResult[0].nextId || 1);
        }
        
        await executeQuery(
            'INSERT INTO Supplier_Info (Supp_ID, Supp_Name) VALUES (@suppId, @name)',
            { suppId, name }
        );
        
        res.json({ success: true, message: 'Supplier added successfully', supplierId: suppId });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error adding supplier', error: error.message });
    }
});

// Delete supplier
app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await executeQuery('DELETE FROM Supplier_Info WHERE Supp_ID = @id', { id });
        res.json({ success: true, message: 'Supplier deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting supplier', error: error.message });
    }
});

// ============================================
// USER ROUTES
// ============================================

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const query = 'SELECT UserID, Username, Role FROM Users';
        const result = await executeQuery(query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

// Add user (matching frontend route)
app.post('/api/users/add', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        // Check if username exists
        const existingUser = await executeQuery(
            'SELECT COUNT(*) as cnt FROM Users WHERE Username = @username',
            { username }
        );
        
        if (existingUser[0].cnt > 0) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }
        
        // UserID is an IDENTITY column - don't provide a value
        await executeQuery(
            'INSERT INTO Users (Username, Password, Role) VALUES (@username, @password, @role)',
            { username, password, role }
        );
        
        res.json({ success: true, message: 'User added successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error adding user', error: error.message });
    }
});

// Delete user by username (matching frontend route)
app.delete('/api/users/delete/:username', async (req, res) => {
    try {
        const { username } = req.params;
        await executeQuery('DELETE FROM Users WHERE Username = @username', { username });
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
    }
});

// Add user (alternate route)
app.post('/api/users', async (req, res) => {
    try {
        const { name, username, password, role } = req.body;
        
        // Check if username exists
        const existingUser = await executeQuery(
            'SELECT COUNT(*) as cnt FROM Users WHERE Username = @username',
            { username }
        );
        
        if (existingUser[0].cnt > 0) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }
        
        // UserID is an IDENTITY column - don't provide a value
        await executeQuery(
            'INSERT INTO Users (Username, Password, Role) VALUES (@username, @password, @role)',
            { username, password, role }
        );
        
        // Get the inserted user ID
        const newUser = await executeQuery('SELECT SCOPE_IDENTITY() as userId');
        
        res.json({ success: true, message: 'User added successfully', userId: newUser[0].userId });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error adding user', error: error.message });
    }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await executeQuery('DELETE FROM Users WHERE UserID = @id', { id });
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
    }
});

// ============================================
// REPORT ROUTES
// ============================================

app.get('/api/reports/:reportType', async (req, res) => {
    try {
        const { reportType } = req.params;
        const { startDate, endDate } = req.query;
        let query = '';
        
        switch (reportType) {
            case 'sales':
                query = `
                    SELECT 
                        psi.Prod_ID as Product_ID,
                        pi.Prod_Name as Product_Name,
                        CAST(psi.QTY_Sold AS float) as Quantity_Sold,
                        psi.Sale_Price as Unit_Price,
                        (CAST(psi.QTY_Sold AS float) * psi.Sale_Price) as Total_Amount
                    FROM Product_Sale_Info psi
                    JOIN Product_Info pi ON psi.Prod_ID = pi.Prod_ID
                `;
                break;
            case 'stock':
                query = `
                    SELECT 
                        s.Prod_ID as Product_ID,
                        pi.Prod_Name as Product_Name,
                        CAST(ISNULL(s.QTY_available, '0') AS float) as Quantity_Available,
                        pi.Sale_Price as Price
                    FROM Stock s
                    JOIN Product_Info pi ON s.Prod_ID = pi.Prod_ID
                `;
                break;
            case 'profit':
                query = `
                    SELECT 
                        psi.Prod_ID as Product_ID,
                        pi.Prod_Name as Product_Name,
                        CAST(psi.QTY_Sold AS float) as Quantity_Sold,
                        psi.Sale_Price as Sale_Price,
                        0 as Purchase_Price,
                        (CAST(psi.QTY_Sold AS float) * psi.Sale_Price) as Profit
                    FROM Product_Sale_Info psi
                    JOIN Product_Info pi ON psi.Prod_ID = pi.Prod_ID
                `;
                break;
            case 'inventory-value':
                query = `
                    SELECT 
                        s.Prod_ID as Product_ID,
                        pi.Prod_Name as Product_Name,
                        CAST(ISNULL(s.QTY_available, '0') AS float) as Quantity,
                        pi.Sale_Price as Unit_Price,
                        (CAST(ISNULL(s.QTY_available, '0') AS float) * ISNULL(pi.Sale_Price, 0)) as Total_Value
                    FROM Stock s
                    JOIN Product_Info pi ON s.Prod_ID = pi.Prod_ID
                `;
                break;
            case 'purchase-history':
                query = `
                    SELECT 
                        ppi.Prod_ID as Product_ID,
                        pi.Prod_Name as Product_Name,
                        ppi.QTY_Pur as Quantity,
                        ppi.Pur_Price as Purchase_Price
                    FROM Product_Purchase_Info ppi
                    JOIN Product_Info pi ON ppi.Prod_ID = pi.Prod_ID
                `;
                break;
            case 'low-stock':
                query = `
                    SELECT 
                        s.Prod_ID as Product_ID,
                        pi.Prod_Name as Product_Name,
                        CAST(ISNULL(s.QTY_available, '0') AS float) as Quantity_Available
                    FROM Stock s
                    JOIN Product_Info pi ON s.Prod_ID = pi.Prod_ID
                    WHERE CAST(ISNULL(s.QTY_available, '0') AS float) < 10
                    ORDER BY CAST(ISNULL(s.QTY_available, '0') AS float) ASC
                `;
                break;
            default:
                return res.status(400).json({ message: 'Invalid report type' });
        }
        
        const result = await executeQuery(query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching report', error: error.message });
    }
});

// ============================================
// BACKUP & RESTORE ROUTES
// ============================================

// Backup database (matching frontend route)
app.post('/api/database/backup', async (req, res) => {
    try {
        const { path } = req.body;
        
        await executeQuery(`BACKUP DATABASE [Pharmacy Database Management System] TO DISK = @path`, { path });
        
        res.json({ success: true, message: 'Database backup created successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating backup', error: error.message });
    }
});

// Restore database (matching frontend route)
app.post('/api/database/restore', async (req, res) => {
    try {
        const { path } = req.body;
        
        // Note: Restore requires special handling and may need the database to be in single-user mode
        await executeQuery(`
            ALTER DATABASE [Pharmacy Database Management System] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            RESTORE DATABASE [Pharmacy Database Management System] FROM DISK = @path WITH REPLACE;
            ALTER DATABASE [Pharmacy Database Management System] SET MULTI_USER;
        `, { path });
        
        res.json({ success: true, message: 'Database restored successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error restoring database', error: error.message });
    }
});

app.post('/api/backup', async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `C:\\PharmacyBackups\\pharmacy_backup_${timestamp}.bak`;
        
        // First create the backup directory if it doesn't exist
        await executeQuery(`
            DECLARE @sql NVARCHAR(MAX)
            SET @sql = 'EXEC xp_create_subdir N''C:\\PharmacyBackups'''
            EXEC sp_executesql @sql
        `);
        
        await executeQuery(`
            BACKUP DATABASE [Pharmacy Database Management System] 
            TO DISK = @path
            WITH FORMAT, INIT, NAME = 'Pharmacy Backup'
        `, { path: backupPath });
        
        res.json({ 
            success: true, 
            message: 'Backup created successfully',
            filename: `pharmacy_backup_${timestamp}.bak`,
            path: backupPath
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating backup', error: error.message });
    }
});

app.post('/api/restore', async (req, res) => {
    try {
        const { path } = req.body;
        
        await executeQuery(`
            ALTER DATABASE [Pharmacy Database Management System] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            RESTORE DATABASE [Pharmacy Database Management System] 
            FROM DISK = @path WITH REPLACE;
            ALTER DATABASE [Pharmacy Database Management System] SET MULTI_USER;
        `, { path });
        
        res.json({ success: true, message: 'Database restored successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error restoring database', error: error.message });
    }
});

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await connectDatabase();
        app.listen(PORT, () => {
            console.log(`\n✓ Server running on http://localhost:${PORT}`);
            console.log('✓ Pharmacy Management System Backend Started\n');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

process.on('SIGINT', async () => {
    console.log('\n\nShutting down server...');
    if (pool) await pool.close();
    process.exit(0);
});

module.exports = app;
