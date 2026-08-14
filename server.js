const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE      = path.join(__dirname, 'shops.json');
const PRODUCTS_FILE  = path.join(__dirname, 'products.json');
const ORDERS_FILE    = path.join(__dirname, 'orders.json');
const CUSTOMERS_FILE = path.join(__dirname, 'customers.json');

// ===== CLOUDINARY (persistent image storage) =====
// Reads credentials from environment variables — set these in Render's
// dashboard under your service's "Environment" tab. Never hardcode them here.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// multer now keeps the file in memory instead of writing to disk,
// so nothing touches Render's local (ephemeral) filesystem.
const upload       = multer({ storage: multer.memoryStorage() });
const uploadQR     = multer({ storage: multer.memoryStorage() });
const uploadAvatar = multer({ storage: multer.memoryStorage() });

// Uploads a file buffer to Cloudinary and resolves with its public URL.
function uploadToCloudinary(fileBuffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
}

function readJSON(file, fallback = '[]') {
  if (!fs.existsSync(file)) fs.writeFileSync(file, fallback);
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const readShops     = () => readJSON(DATA_FILE, '[]');
const saveShops     = (d) => writeJSON(DATA_FILE, d);
const readProducts  = () => readJSON(PRODUCTS_FILE);
const saveProducts  = (d) => writeJSON(PRODUCTS_FILE, d);
const readOrders    = () => readJSON(ORDERS_FILE);
const saveOrders    = (d) => writeJSON(ORDERS_FILE, d);
const readCustomers = () => readJSON(CUSTOMERS_FILE);
const saveCustomers = (d) => writeJSON(CUSTOMERS_FILE, d);

// ===== SHOP ROUTES =====

app.get('/api/shops', (req, res) => {
  const shops = readShops();
  const active = shops
    .filter(s => s.active === true)
    .map(s => ({
      id: s.id, name: s.name, owner: s.owner,
      active: s.active,
      qrImage: s.qrImage || null,
      avatar: s.avatar || null
    }));
  res.json(active);
});

app.post('/api/shops', uploadAvatar.single('avatar'), async (req, res) => {
  try {
    const shops = readShops();
    const avatarUrl = req.file
      ? await uploadToCloudinary(req.file.buffer, 'shop-platform/avatars')
      : null;
    const newShop = {
      id: Date.now(),
      name: req.body.name,
      owner: req.body.owner,
      password: req.body.password,
      active: true,
      qrImage: null,
      avatar: avatarUrl
    };
    shops.push(newShop);
    saveShops(shops);
    res.json({ message: 'Shop registered!', shop: { id: newShop.id, name: newShop.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

app.post('/api/login', (req, res) => {
  const shops = readShops();
  const { name, password } = req.body;
  const shop = shops.find(s => s.name === name && s.password === password && s.active === true);
  if (!shop) return res.status(401).json({ success: false, message: 'Invalid shop name or password' });
  res.json({ success: true, shop: { id: shop.id, name: shop.name, owner: shop.owner, qrImage: shop.qrImage || null, avatar: shop.avatar || null } });
});

app.patch('/api/shops/:id', (req, res) => {
  const shops = readShops();
  const shop = shops.find(s => s.id === parseInt(req.params.id));
  if (!shop) return res.status(404).json({ message: 'Shop not found' });
  shop.active = false;
  saveShops(shops);
  res.json({ message: 'Shop deactivated', shop });
});

app.post('/api/shops/:id/qr', uploadQR.single('qrImage'), async (req, res) => {
  try {
    const shops = readShops();
    const shop = shops.find(s => s.id === parseInt(req.params.id));
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    if (req.file) {
      shop.qrImage = await uploadToCloudinary(req.file.buffer, 'shop-platform/qr');
    }
    saveShops(shops);
    res.json({ message: 'QR uploaded!', shop });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

app.post('/api/shops/:id/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  try {
    const shops = readShops();
    const shop = shops.find(s => s.id === parseInt(req.params.id));
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    if (req.file) {
      shop.avatar = await uploadToCloudinary(req.file.buffer, 'shop-platform/avatars');
    }
    saveShops(shops);
    res.json({ message: 'Avatar updated!', shop });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// ===== PRODUCT ROUTES =====

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const products = readProducts();
    const imageUrl = req.file
      ? await uploadToCloudinary(req.file.buffer, 'shop-platform/products')
      : '';
    const newProduct = {
      id: Date.now(),
      shopId: parseInt(req.body.shopId),
      name: req.body.name,
      price: req.body.price,
      quantity: req.body.quantity,
      image: imageUrl
    };
    products.push(newProduct);
    saveProducts(products);
    res.json({ message: 'Product added!', product: newProduct });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

app.get('/api/products/:shopId', (req, res) => {
  const products = readProducts();
  res.json(products.filter(p => p.shopId === parseInt(req.params.shopId)));
});

// ===== CUSTOMER ROUTES =====

app.post('/api/customer/register', (req, res) => {
  const customers = readCustomers();
  const { name, phone, password, address } = req.body;
  if (customers.find(c => c.phone === phone)) {
    return res.status(400).json({ success: false, message: 'Account with this phone already exists.' });
  }
  const newCustomer = { id: Date.now(), name, phone, password, address };
  customers.push(newCustomer);
  saveCustomers(customers);
  res.json({ success: true, message: 'Account created!', customer: { id: newCustomer.id, name, phone, address } });
});

app.post('/api/customer/login', (req, res) => {
  const customers = readCustomers();
  const { phone, password } = req.body;
  const customer = customers.find(c => c.phone === phone && c.password === password);
  if (!customer) return res.status(401).json({ success: false, message: 'Invalid phone or password' });
  res.json({ success: true, customer: { id: customer.id, name: customer.name, phone: customer.phone, address: customer.address } });
});

// ===== ORDER ROUTES =====

app.post('/api/orders', (req, res) => {
  const orders = readOrders();
  const price    = parseFloat(req.body.price)  || 0;
  const quantity = parseInt(req.body.quantity) || 1;
  const newOrder = {
    id: Date.now(),
    shopId: parseInt(req.body.shopId),
    customerId: req.body.customerId || null,
    productId: parseInt(req.body.productId),
    productName: req.body.productName,
    price, quantity,
    total: price * quantity,
    customerName: req.body.customerName,
    customerPhone: req.body.customerPhone,
    customerAddress: req.body.customerAddress,
    status: 'Pending',
    createdAt: new Date().toLocaleString()
  };
  orders.push(newOrder);
  saveOrders(orders);
  res.json({ message: 'Order placed!', order: newOrder });
});

app.get('/api/orders/:shopId', (req, res) => {
  const orders = readOrders();
  res.json(orders.filter(o => o.shopId === parseInt(req.params.shopId)));
});

app.get('/api/customer-orders/:customerId', (req, res) => {
  const orders = readOrders();
  res.json(orders.filter(o => o.customerId === parseInt(req.params.customerId)));
});

app.get('/api/orders/:id/receipt', (req, res) => {
  const orders = readOrders();
  const order  = orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ message: 'Order not found' });

  const shops    = readShops();
  const shop     = shops.find(s => s.id === order.shopId);
  const shopName = shop ? shop.name : 'Shop';

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=receipt-' + order.id + '.pdf');
  doc.pipe(res);

  doc.fontSize(22).font('Helvetica-Bold').text('ORDER RECEIPT', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#555').text('Thank you for your order!', { align: 'center' });
  doc.moveDown(1);

  doc.fillColor('#000').fontSize(12).font('Helvetica-Bold').text('Shop: ', { continued: true }).font('Helvetica').text(shopName);
  doc.font('Helvetica-Bold').text('Order ID: ', { continued: true }).font('Helvetica').text(String(order.id));
  doc.font('Helvetica-Bold').text('Date: ', { continued: true }).font('Helvetica').text(order.createdAt);
  doc.moveDown(1);

  doc.fontSize(13).font('Helvetica-Bold').text('Product Details');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica').text('Product: ' + order.productName);
  doc.text('Unit Price: Rs. ' + order.price);
  doc.text('Quantity: ' + order.quantity);
  doc.moveDown(0.3);
  doc.fontSize(14).font('Helvetica-Bold').text('TOTAL: Rs. ' + order.total);
  doc.moveDown(1);

  doc.fontSize(13).font('Helvetica-Bold').text('Delivery Details');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica').text('Name: ' + order.customerName);
  doc.text('Phone: ' + order.customerPhone);
  doc.text('Address: ' + order.customerAddress);
  doc.moveDown(1);

  doc.fontSize(11).fillColor('#888').text('Status: ' + order.status, { align: 'right' });
  doc.end();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
