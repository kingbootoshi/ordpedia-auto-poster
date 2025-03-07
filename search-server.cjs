const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');
const http = require('http');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = 4444;

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON request bodies
app.use(express.json());

// Add CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Root route - redirect to search.html
app.get('/', (req, res) => {
  res.redirect('/search.html');
});

// API endpoint to get pages for dropdown
app.get('/api/pages', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pages')
      .select('id, title, slug')
      .eq('is_approved', true)
      .order('title', { ascending: true });
    
    if (error) throw error;
    
    res.json({ status: 'success', pages: data });
  } catch (err) {
    console.error('Error fetching pages:', err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch pages',
      error: err.message
    });
  }
});

// API endpoint to get page details by ID
app.get('/api/pages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('pages')
      .select('id, title, slug')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'Page not found' });
    }
    
    res.json({ status: 'success', page: data });
  } catch (err) {
    console.error(`Error fetching page ${req.params.id}:`, err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch page details',
      error: err.message
    });
  }
});

// API endpoint to proxy search requests to the Python server
app.post('/api/search', async (req, res) => {
  try {
    const { query, run_id, limit } = req.body;
    
    // Forward the request to the Python API
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const pythonReq = http.request(options, (pythonRes) => {
      let data = '';
      
      pythonRes.on('data', (chunk) => {
        data += chunk;
      });
      
      pythonRes.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          res.json(parsedData);
        } catch (parseError) {
          console.error('Error parsing response from Python API:', parseError);
          res.status(500).json({ 
            status: 'error', 
            message: 'Error parsing response from memory service'
          });
        }
      });
    });
    
    pythonReq.on('error', (error) => {
      console.error('Error forwarding request to Python API:', error);
      res.status(502).json({ 
        status: 'error', 
        message: 'Failed to communicate with memory service',
        error: error.message
      });
    });
    
    pythonReq.write(JSON.stringify({ query, run_id, limit }));
    pythonReq.end();
    
  } catch (err) {
    console.error('Error in search proxy:', err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Search interface server running at http://localhost:${PORT}/`);
  console.log(`API endpoints available at http://localhost:${PORT}/api/`);
});