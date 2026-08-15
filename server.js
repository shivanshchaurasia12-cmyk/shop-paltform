const express = require('express');
const multer = require('multer');
const path = require('path');
const PDFDocument = require('pdfkit');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== DATABASE (MongoDB Atlas — persistent, survives restarts) =====
// Reads the connection string from an environment variable — set this in
// Render's dashboard under your service's "Environment" tab.
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const shopSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  owner: String,
  password: String,
  active: { type: Boolean, default: true },
  qrImage: { type: String, default: null },
  avatar: { type: String, default: null }
});

const productSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  shopId: Number,
  name: String,
  price: String,
  quantity: String,
  image: { type: String, default: '' }
});

const orderSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  shopId: Number,
  customerId: { type: Number, default: null },
  productId: Number,
  productName: String,
  price: Number,
  quantity: Number,
  total: Number,
  customerName: String,
  customerPhone: String,
  customerAddress: String,
  status: { type: String, default: 'Pending' },
  createdAt: String
});

const customerSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  phone: { type: String, unique: true },
  password: String,
  address: String
});

const Shop = mongoose.model('Shop', shopSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Customer = mongoose.model('Customer', customerSchema);

// ===== CLOUDINARY (persistent image storage) =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload       = multer({ storage: multer.memoryStorage() });
const uploadQR     = multer({ storage: multer.memoryStorage() });
const uploadAvatar = multer({ storage: multer.memoryStorage() });

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

// ===== SHOP ROUTES =====

app.get('/api/shops', async (req, res) => {
  try {
    const shops = await Shop.find({ active: true }, 'id name owner active qrImage avatar -_id');
    res.json(shops);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load shops', error: err.message });
  }
});

app.post('/api/shops', uploadAvatar.single('avatar'), async (req, res) => {
  try {
    const avatarUrl = req.file
      ? await uploadToCloudinary(req.file.buffer, 'shop-platform/avatars')
      : null;
    const newShop = new Shop({
      id: Date.now(),
      name: req.body.name,
      owner: req.body.owner,
      password: req.body.password,
      active: true,
      qrImage: null,
      avatar: avatarUrl
    });
    await newShop.save();
    res.json({ message: 'Shop registered!', shop: { id: newShop.id, name: newShop.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    const shop = await Shop.findOne({ name, password, active: true });
    if (!shop) return res.status(401).json({ success: false, message: 'Invalid shop name or password' });
    res.json({ success: true, shop: { id: shop.id, name: shop.name, owner: shop.owner, qrImage: shop.qrImage || null, avatar: shop.avatar || null } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

app.patch('/api/shops/:id', async (req, res) => {
  try {
    const shop = await Shop.findOneAndUpdate(
      { id: parseInt(req.params.id) },
      { active: false },
      { new: true }
    );
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    res.json({ message: 'Shop deactivated', shop });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Update failed', error: err.message });
  }
});

app.post('/api/shops/:id/qr', uploadQR.single('qrImage'), async (req, res) => {
  try {
    let qrUrl;
    if (req.file) {
      qrUrl = await uploadToCloudinary(req.file.buffer, 'shop-platform/qr');
    }
    const shop = await Shop.findOneAndUpdate(
      { id: parseInt(req.params.id) },
      req.file ? { qrImage: qrUrl } : {},
      { new: true }
    );
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    res.json({ message: 'QR uploaded!', shop });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

app.post('/api/shops/:id/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  try {
    let avatarUrl;
    if (req.file) {
      avatarUrl = await uploadToCloudinary(req.file.buffer, 'shop-platform/avatars');
    }
    const shop = await Shop.findOneAndUpdate(
      { id: parseInt(req.params.id) },
      req.file ? { avatar: avatarUrl } : {},
      { new: true }
    );
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    res.json({ message: 'Avatar updated!', shop });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// ===== PRODUCT ROUTES =====

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const imageUrl = req.file
      ? await uploadToCloudinary(req.file.buffer, 'shop-platform/products')
      : '';
    const newProduct = new Product({
      id: Date.now(),
      shopId: parseInt(req.body.shopId),
      name: req.body.name,
      price: req.body.price,
      quantity: req.body.quantity,
      image: imageUrl
    });
    await newProduct.save();
    res.json({ message: 'Product added!', product: newProduct });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

app.get('/api/products/:shopId', async (req, res) => {
  try {
    const products = await Product.find({ shopId: parseInt(req.params.shopId) }, '-_id -__v');
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load products', error: err.message });
  }
});

// ===== CUSTOMER ROUTES =====

app.post('/api/customer/register', async (req, res) => {
  try {
    const { name, phone, password, address } = req.body;
    const existing = await Customer.findOne({ phone });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Account with this phone already exists.' });
    }
    const newCustomer = new Customer({ id: Date.now(), name, phone, password, address });
    await newCustomer.save();
    res.json({ success: true, message: 'Account created!', customer: { id: newCustomer.id, name, phone, address } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

app.post('/api/customer/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const customer = await Customer.findOne({ phone, password });
    if (!customer) return res.status(401).json({ success: false, message: 'Invalid phone or password' });
    res.json({ success: true, customer: { id: customer.id, name: customer.name, phone: customer.phone, address: customer.address } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// ===== ORDER ROUTES =====

app.post('/api/orders', async (req, res) => {
  try {
    const price    = parseFloat(req.body.price)  || 0;
    const quantity = parseInt(req.body.quantity) || 1;
    const newOrder = new Order({
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
    });
    await newOrder.save();
    res.json({ message: 'Order placed!', order: newOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Order failed', error: err.message });
  }
});

app.get('/api/orders/:shopId', async (req, res) => {
  try {
    const orders = await Order.find({ shopId: parseInt(req.params.shopId) }, '-_id -__v');
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load orders', error: err.message });
  }
});

app.get('/api/customer-orders/:customerId', async (req, res) => {
  try {
    const orders = await Order.find({ customerId: parseInt(req.params.customerId) }, '-_id -__v');
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load orders', error: err.message });
  }
});

app.get('/api/orders/:id/receipt', async (req, res) => {
  try {
    const order = await Order.findOne({ id: parseInt(req.params.id) });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const shop = await Shop.findOne({ id: order.shopId });
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to generate receipt', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
