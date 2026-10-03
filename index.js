require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const dbConnect = require('./Config/dbConnect');
const corsOptions = require('./Config/corsOptions');
const { notFound, errorHandler } = require('./Middlewares/errorHandler');

const productRoutes = require('./Routes/productRoutes');
const contentRoutes = require('./Routes/contentRoutes');
const orderRoutes = require('./Routes/orderRoutes');
const authRoutes = require('./Routes/authRoutes');
const adminRoutes = require('./Routes/adminRoutes');
const tenantRoutes = require('./Routes/tenantRoutes');
const platformRoutes = require('./Routes/platformRoutes');
const siteRoutes = require('./Routes/siteRoutes');
const { ensureOwnerAccount, validateOwnerBootstrapConfig } = require('./Utils/adminBootstrap');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(cors(corsOptions));

app.get('/', (req, res) => res.json({ status: 'Client API is running' }));

app.use('/api/auth', authRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/site', siteRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/products', productRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/orders', orderRoutes);

app.use(notFound);
app.use(errorHandler);

const start = async () => {
  validateOwnerBootstrapConfig();
  await dbConnect();
  await ensureOwnerAccount();
  app.listen(PORT, () => console.log(`Client-Backend API running on port ${PORT}`));
};

if (require.main === module) {
  start().catch((error) => {
    console.error('Client-Backend API startup failed:', error.message);
    process.exitCode = 1;
  });
} else {
  try {
    validateOwnerBootstrapConfig();
  } catch (error) {
    console.error('Client-Backend API initialization failed:', error.message);
    throw error;
  }
  dbConnect()
    .then(ensureOwnerAccount)
    .catch((error) => console.error('Client-Backend API initialization failed:', error.message));
}

module.exports = app; // exported so Vercel's serverless function can use it
