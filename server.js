const cluster = require('cluster');
const os = require('os');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

require('dotenv').config(); // Load environment variables

const placesRouter = require('./routes/places');

// Number of CPU cores
const numCPUs = os.cpus().length;

if (cluster.isPrimary) {  // Note: Using isPrimary instead of isMaster (isMaster is deprecated)
    console.log(`Primary process ${process.pid} is running`);
    console.log(`Setting up ${numCPUs} workers...`);

    // Fork workers for each CPU core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Handle worker crashes
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
        cluster.fork();
    });

    // Log when a worker comes online
    cluster.on('online', (worker) => {
        console.log(`Worker ${worker.process.pid} is online`);
    });

} else {
    // Worker process - run the Express app
    const app = express();
    const port = process.env.PORT || 3000;

    // Custom logging middleware
    const requestLogger = (req, res, next) => {
        const timestamp = new Date().toISOString();
        const requestId = Math.random().toString(36).substring(7);
        
        console.log('\n=== Incoming Request ===');
        console.log(`[${timestamp}] Request ID: ${requestId}`);
        console.log(`Worker: ${process.pid}`);
        console.log(`Method: ${req.method}`);
        console.log(`URL: ${req.url}`);
        console.log('Headers:', JSON.stringify(req.headers, null, 2));
        
        if (req.method === 'POST') {
            console.log('Body:', JSON.stringify(req.body, null, 2));
        }
        
        if (Object.keys(req.query).length > 0) {
            console.log('Query Parameters:', JSON.stringify(req.query, null, 2));
        }
        
        res.locals.requestId = requestId;
        res.locals.timestamp = timestamp;
        
        // Log response
        const originalSend = res.send;
        res.send = function(body) {
            console.log('\n=== Response ===');
            console.log(`[${timestamp}] Request ID: ${requestId}`);
            console.log(`Worker: ${process.pid}`);
            console.log('Status:', res.statusCode);
            console.log('=== End ===\n');
            return originalSend.call(this, body);
        };
        
        next();
    };

    // Add HTTP request logger
    app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

    // Add body-parser middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Add CORS
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    }));

    // Add custom request logger
    app.use(requestLogger);

    // Places routes
    app.use('/api/places', placesRouter);

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('\n=== Error ===');
        console.error(`[${res.locals.timestamp}] Request ID: ${res.locals.requestId}`);
        console.error(`Worker: ${process.pid}`);
        console.error('Error:', err.stack);
        res.status(500).send({
            error: 'Internal Server Error',
            message: err.message,
            requestId: res.locals.requestId,
            worker: process.pid
        });
    });

    app.listen(port, () => {
        console.log(`Worker ${process.pid} is running on port ${port}`);
    });
}