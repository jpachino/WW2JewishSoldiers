require('dotenv').config(); // Make sure this is at the top

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const pgp = require('pg-promise')();
const { format } = require('date-fns');

const app = express();
const port = 3000;

// Use pg-promise and load DATABASE_URL from .env
const postgresURI = process.env.DATABASE_URL;
const db = pgp(postgresURI);

// Define the table name as a constant for consistency
const SOLDIER_TABLE = 'map_soldierdetails';

// Test connection and log database details
db.connect()
  .then(async obj => {
    console.log('Connected to PostgreSQL successfully');
    
    try {
      // Check database version
      const versionResult = await obj.query('SELECT version()');
      console.log('PostgreSQL version:', versionResult[0].version);
      
      // Check if map_soldierdetails table exists
      const tableCheck = await obj.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [SOLDIER_TABLE]);  // Use the constant here
      console.log(`${SOLDIER_TABLE} table exists:`, tableCheck[0].exists);
      
      // If table exists, check its structure
      if (tableCheck[0].exists) {
        const columns = await obj.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1
        `, [SOLDIER_TABLE]);  // Use the constant here
        console.log('Table columns:', columns.map(col => `${col.column_name} (${col.data_type})`));
      }
    } catch (error) {
      console.error('Error checking database:', error);
    } finally {
      obj.done(); // release the connection
    }
  })
  .catch(error => {
    console.error('Error connecting to PostgreSQL:', error.message || error);
    console.error('Check your DATABASE_URL environment variable in .env file');
  });

// Middleware
app.use(express.static(path.join(__dirname, 'views')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Route for the landing page
app.get('/', (req, res) => {
  res.render('index'); // Render the informative landing page
});

// Route to display the soldier list from map_soldierdetails
app.get('/soldierlistSoldier', async (req, res) => {
  try {
    console.log(`Fetching soldiers from ${SOLDIER_TABLE}`);
    
    // Test database connection
    const testConnection = await db.one('SELECT 1 as connected');
    console.log('Database connection test:', testConnection);
    
    // List all tables to verify map_soldierdetails exists
    const tables = await db.any(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Available tables:', tables);
    
    // Try to fetch soldiers
    const soldiers = await db.any(`SELECT * FROM ${SOLDIER_TABLE}`);
    console.log(`Retrieved ${soldiers.length} soldiers from database`);
    
    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob ? format(new Date(soldier.dob), 'MM/dd/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'MM/dd/yyyy') : 'N/A'
    }));

    console.log('Soldiers formatted, rendering view'); 
    res.render('soldierlistSoldier', { soldiers: formattedSoldiers });
  } catch (err) {
    console.error('Error fetching soldiers:', err);
    console.error('Error details:', err.message);
    if (err.stack) console.error('Stack trace:', err.stack);
    
    res.status(500).send(`
      <h1>Server Error</h1>
      <p>Failed to fetch soldiers:</p>
      <p>${err.message}</p>
      <pre>${err.stack || 'No stack trace available'}</pre>
      <a href="/">Return to home</a>
    `);
  }
});

// Route to display the full soldier list from map_soldierdetails
app.get('/soldierlistFULL', async (req, res) => {
  try {
    const soldiers = await db.any(`SELECT * FROM ${SOLDIER_TABLE}`);

    // Sort soldiers by last name and then by first name
    soldiers.sort((a, b) => {
      if (a.lname === b.lname) {
        return a.fname.localeCompare(b.fname);
      }
      return a.lname.localeCompare(b.lname);
    });

    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob ? format(new Date(soldier.dob), 'MM/dd/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'MM/dd/yyyy') : 'N/A'
    }));

    console.log('Soldiers fetched:', formattedSoldiers); // Log fetched soldiers
    res.render('soldierlistFULL', { soldiers: formattedSoldiers }); // Render the 'soldierlistFULL.ejs' view
  } catch (err) {
    console.error('Error fetching soldiers:', err); // Log the error
    res.status(500).send('Server error at soldierlistFULL'); // Send a generic server error response
  }
});

// Route to display the form for adding a new soldier
app.get('/addFullmapsoldiers', (req, res) => {
  try {
    console.log('Rendering addFULLmapsoldiers.ejs form');
    res.render('addFULLmapsoldiers'); // Ensure you have an 'addFULL.ejs' template in your 'views' directory
  } catch (err) {
    console.error('Error rendering addFULLmapsoldiers template:', err);
    res.status(500).send(`
      <h1>Error Rendering Form</h1>
      <p>There was a problem with the form template:</p>
      <pre>${err.message}</pre>
      <a href="/">Return to home</a>
    `);
  }
});

// Route to handle form submission for adding a soldier
app.post('/addFULLmapsoldiers', async (req, res) => {
  try {
    console.log('Form data received:', req.body);
    
    // For testing with minimal data
    // This simplified version only uses the basic fields that might be in your form
    const { 
      firstname, lastname, countrycode, servicebranch, date_of_birth, rank, date_of_death 
    } = req.body;
    
    console.log('Extracted basic fields:', { firstname, lastname, countrycode, servicebranch, date_of_birth, rank, date_of_death });
    
    // Parse dates - compatible with your original form names
    const dob = date_of_birth ? new Date(date_of_birth) : null;
    const dod = date_of_death ? new Date(date_of_death) : null;
    
    console.log('Parsed dates:', { dob, dod });
    
    // Create a basic record using the simpler fields from your original form
    // Ensure we're using the SOLDIER_TABLE constant
    await db.none(`
      INSERT INTO ${SOLDIER_TABLE} (
        FName, LName, BirthCountry, Gender, DOB, DOD
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      );
    `, [firstname || null, lastname || null, countrycode || null, servicebranch || null, dob, dod]);
    
    console.log(`Record inserted successfully into ${SOLDIER_TABLE} with basic fields`);
    
    // Redirect to the soldier list after adding
    res.redirect('/soldierlistFULL');
  } catch (error) {
    // Provide detailed error information
    console.error('Error adding record:', error);
    console.error('Error details:', error.message);
    if (error.stack) console.error('Stack trace:', error.stack);
    if (error.query) console.error('Failed query:', error.query);
    
    // Return detailed error to help with debugging
    res.status(500).send(`
      <h1>Error Adding Record</h1>
      <p>Message: ${error.message}</p>
      <pre>${error.stack || 'No stack trace available'}</pre>
      ${error.query ? `<p>Query: ${error.query}</p>` : ''}
      <a href="/addFullmapsoldiers">Go back to form</a>
    `);
  }
});

// Route to display the search form
app.get('/search', (req, res) => {
  res.render('search'); // Ensure you have a 'search.ejs' template in your 'views' directory
});

// Route to handle search results - updated for map_soldierdetails
app.get('/searchResults', async (req, res) => {
  const { firstname, lastname } = req.query; // Extract first name and last name from the URL
  try {
    // Build search query for map_soldierdetails table using the constant
    let query = `SELECT * FROM ${SOLDIER_TABLE} WHERE 1=1`;
    const values = [];
    if (firstname) {
      query += ` AND fname ILIKE $${values.push(`%${firstname}%`)}`;
    }
    if (lastname) {
      query += ` AND lname ILIKE $${values.push(`%${lastname}%`)}`;
    }

    const soldiers = await db.any(query, values);

    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob ? format(new Date(soldier.dob), 'MM/dd/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'MM/dd/yyyy') : 'N/A'
    }));

    // Render the search results view with the found soldiers
    res.render('searchResults', { soldiers: formattedSoldiers });
  } catch (err) {
    console.error('Error fetching soldiers:', err);
    res.status(500).send('Server error at searchResults');
  }
});

// Route to display the form for updating a soldier
app.get('/updateSoldier/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!soldier) {
      return res.status(404).send('Soldier not found');
    }
    res.render('updateSoldier', { soldier });
  } catch (err) {
    console.error('Error fetching soldier:', err);
    res.status(500).send('Server error');
  }
});

// Route to handle form submission for updating a soldier in map_soldierdetails
app.post('/updateSoldier/:id', async (req, res) => {
  const { id } = req.params;
  // Extract relevant fields from the form for the update
  const { 
    fname, lname, birthCountry, gender, dob, dod 
  } = req.body;
  
  const parsedDob = dob ? new Date(dob) : null;
  const parsedDod = dod ? new Date(dod) : null;

  try {
    // Update only basic fields - expand as needed
    await db.none(`UPDATE ${SOLDIER_TABLE} SET FName = $1, LName = $2, BirthCountry = $3, Gender = $4, DOB = $5, DOD = $6 WHERE id = $7`,
      [fname, lname, birthCountry, gender, parsedDob, parsedDod, id]);

    // Redirect to the soldier list after updating
    res.redirect('/soldierlistFULL');
  } catch (error) {
    console.error('Error updating soldier:', error);
    res.status(500).json({ message: 'Error updating soldier', error });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});