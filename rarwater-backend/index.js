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

const app = express();
const PORT = process.env.PORT || 5000;

dbConnect();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(cors(corsOptions));

app.get('/', (req, res) => res.json({ status: 'Rar Water API is running' }));

app.use('/api/products', productRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/orders', orderRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => console.log(`Rar Water API running on port ${PORT}`));

module.exports = app; // exported so Vercel's serverless function can use it
