const express = require('express');

const app = express();
// Middleware to parse incoming JSON [cite: 12, 64]
app.use(express.json());

// ==========================================
// DATA STORAGE (In-Memory) 
// ==========================================

// Part 1: Rate Limiter Data
const userStats = new Map();

// Part 2: Product Data
const products = new Map();
const existingSkus = new Set();
let nextProductId = 1;

// ==========================================
// PART 1: RATE-LIMITED API
// ==========================================

const WINDOW_SIZE_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5; // [cite: 27]

app.post('/request', (req, res) => {
    const { user_id, payload } = req.body;

    // Validation [cite: 15, 16, 33]
    if (!user_id || typeof user_id !== 'string' || user_id.trim() === '') {
        return res.status(400).json({ error: 'user_id is required and must be a non-empty string' });
    }
    if (payload === undefined) {
        return res.status(400).json({ error: 'payload is required' });
    }

    const now = Date.now();

    // Initialize user stats if they don't exist
    if (!userStats.has(user_id)) {
        userStats.set(user_id, { windowStart: now, accepted: 0, rejected: 0 });
    }

    const stats = userStats.get(user_id);

    // Fixed window logic: Reset if 1 minute has passed [cite: 27]
    if (now - stats.windowStart >= WINDOW_SIZE_MS) {
        stats.windowStart = now;
        stats.accepted = 0;
        // Keeping rejected count cumulative as documented in README
    }

    // Check limits [cite: 27]
    if (stats.accepted < MAX_REQUESTS) {
        stats.accepted += 1;
        return res.status(201).json({ message: 'Request accepted', user_id }); // [cite: 17, 18]
    } else {
        stats.rejected += 1;
        return res.status(429).json({ error: 'Too Many Requests. Maximum 5 requests per minute allowed.' }); // [cite: 28, 29]
    }
});

app.get('/stats', (req, res) => { // [cite: 19]
    // Convert Map to an object for JSON response
    const statsObj = {};
    userStats.forEach((value, key) => {
        statsObj[key] = {
            accepted_current_window: value.accepted, // [cite: 23]
            rejected_cumulative: value.rejected // [cite: 24]
        };
    });
    res.json(statsObj); // [cite: 25]
});

// ==========================================
// PART 2: PRODUCT CATALOG WITH MEDIA
// ==========================================

// Helper function to validate URLs [cite: 93]
function isValidUrl(urlStr) {
    if (typeof urlStr !== 'string' || urlStr.length > 2048) return false;
    try {
        const url = new URL(urlStr);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

app.post('/products', (req, res) => { // [cite: 63]
    const { name, sku, image_urls = [], video_urls = [] } = req.body;

    // Validation [cite: 67, 68, 92]
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'name is required and cannot be empty' });
    }
    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
        return res.status(400).json({ error: 'sku is required and cannot be empty' });
    }
    if (existingSkus.has(sku)) {
        return res.status(409).json({ error: 'Product with this sku already exists' }); // [cite: 72, 95]
    }

    // URL Validation limits [cite: 94]
    if (image_urls.length > 20 || video_urls.length > 20) {
        return res.status(400).json({ error: 'Maximum 20 URLs allowed per array' });
    }
    if (!image_urls.every(isValidUrl) || !video_urls.every(isValidUrl)) {
        return res.status(400).json({ error: 'All URLs must be valid HTTP/HTTPS strings' }); // [cite: 93]
    }

    const newProduct = {
        id: String(nextProductId++),
        name,
        sku,
        image_urls,
        video_urls,
        created_at: new Date().toISOString()
    };

    products.set(newProduct.id, newProduct);
    existingSkus.add(sku);

    res.status(201).json(newProduct); // [cite: 71]
});

app.get('/products', (req, res) => { // [cite: 74]
    const limit = parseInt(req.query.limit) || 10; // Default limit 10 [cite: 79]
    const offset = parseInt(req.query.offset) || 0; // Default offset 0 [cite: 79]

    // Convert products Map to an array
    const allProducts = Array.from(products.values());
    
    // Pagination slicing
    const paginatedProducts = allProducts.slice(offset, offset + limit);

    // Map to summary view for performance (omitting full URL arrays) [cite: 75, 76, 77, 97, 98]
    const summaryView = paginatedProducts.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        image_count: p.image_urls.length,
        video_count: p.video_urls.length,
        thumbnail_url: p.image_urls[0] || null,
        created_at: p.created_at
    }));

    res.json({
        data: summaryView,
        limit,
        offset,
        total: allProducts.length
    });
});

app.get('/products/:id', (req, res) => { // [cite: 80]
    const product = products.get(req.params.id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' }); // [cite: 82]
    }
    res.json(product); // Returns full product [cite: 82]
});

app.post('/products/:id/media', (req, res) => { // [cite: 83]
    const product = products.get(req.params.id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' }); // [cite: 89]
    }

    const { image_urls = [], video_urls = [] } = req.body;

    // Validation [cite: 87, 90]
    if (image_urls.length === 0 && video_urls.length === 0) {
        return res.status(400).json({ error: 'At least one image_urls or video_urls required' }); 
    }
    if (image_urls.length > 20 || video_urls.length > 20) {
        return res.status(400).json({ error: 'Maximum 20 URLs allowed per request' }); // [cite: 94]
    }
    if (!image_urls.every(isValidUrl) || !video_urls.every(isValidUrl)) {
        return res.status(400).json({ error: 'All URLs must be valid HTTP/HTTPS strings' }); // [cite: 93]
    }

    // Append URLs [cite: 88]
    product.image_urls.push(...image_urls);
    product.video_urls.push(...video_urls);

    res.json(product);
});

// Middleware to handle invalid JSON syntax errors automatically [cite: 33]
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).send({ error: 'Invalid JSON payload' });
    }
    next();
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});