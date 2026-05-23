# Source Asia - Backend Assignment

## Overview
This is a Node.js/Express API built to fulfill the requirements of the Source Asia backend assignment. It includes a rate-limited endpoint (Part 1) and a high-performance product catalog (Part 2).

## How to Run

1. Make sure Node.js is installed.
2. Clone/extract this repository and navigate to the folder in your terminal.
3. Install dependencies:
   `npm install express`
4. Start the server:
   `node server.js`
5. The server will run on `http://localhost:3000`.

## Part 1: Rate Limiting Design
* **Approach:** I used a "Fixed 1-minute window" approach. It tracks the start time of the window. If a new request arrives and 60 seconds have passed, the accepted count resets.
* **Storage:** In-memory using a JavaScript `Map`. Node.js is single-threaded, so this is naturally safe from concurrent race conditions. 
* **Statistics:** The `/stats` endpoint reports `accepted_current_window` and `rejected_cumulative`.
* **Production Limitations:** Because state is held in-memory, restarting the server loses all rate-limit data. If deployed with multiple instances (e.g., load balanced), each server would track its own isolated limits. In production, I would use Redis to store rate-limit counters to synchronize across multiple instances.

## Part 2: Product Catalog Data Model & Performance
* **Storage:** Products are stored in an in-memory `Map` keyed by the product `id` for $O(1)$ lookup time. SKUs are tracked in a `Set` for instant duplicate detection.
* **List vs Detail Design:** * `GET /products/{id}` returns the full object (including arrays of URLs).
  * `GET /products` returns a mapped "summary view". It counts the lengths of the URL arrays and plucks the first image as a thumbnail. It **never** serializes the large URL arrays, ensuring that even with 10,000 URLs, the memory and network payload remains tiny and fast.
* **Validation Rules:**
  * Maximum 20 URLs can be submitted per request.
  * URLs must be valid HTTP/HTTPS and under 2048 characters.
* **Production Changes:** In production, I would migrate to PostgreSQL. The `products` would be a table, and `media` would be a related table (1-to-many). The list endpoint query would use a SQL `COUNT()` aggregation or read from cached summary columns, rather than loading data into memory to parse it.

## Testing with cURL

### Part 1 Testing
**1. Send a valid request:**
curl -X POST http://localhost:3000/request -H "Content-Type: application/json" -d "{\"user_id\": \"user1\", \"payload\": {\"data\": 123}}"
*(Run this 6 times quickly to see the 429 Too Many Requests error).*

**2. Check stats:**
curl http://localhost:3000/stats

### Part 2 Testing
**1. Create a product:**
curl -X POST http://localhost:3000/products -H "Content-Type: application/json" -d "{\"name\": \"Widget A\", \"sku\": \"SKU-001\", \"image_urls\": [\"https://example.com/img1.jpg\"]}"

**2. Append media:**
curl -X POST http://localhost:3000/products/1/media -H "Content-Type: application/json" -d "{\"video_urls\": [\"https://example.com/vid1.mp4\"]}"

**3. Get the list (Fast view):**
curl "http://localhost:3000/products?limit=10&offset=0"

**4. Get the detail (Full view):**
curl http://localhost:3000/products/1
