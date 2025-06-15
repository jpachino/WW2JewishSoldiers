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
const medals_TBL = 'medals_TBL'; // or whatever your actual table name is
const countries_TBL = 'countries_TBL';

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
      const lnameA = a.lname || '';
      const lnameB = b.lname || '';
      const fnameA = a.fname || '';
      const fnameB = b.fname || '';
    
      if (lnameA === lnameB) {
        return fnameA.localeCompare(fnameB);
      }
      return lnameA.localeCompare(lnameB);
    });
    

    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
     dob: soldier.dob ? format(new Date(soldier.dob), 'MM/dd/yyyy') : 'N/A',
     dod: soldier.dod ? format(new Date(soldier.dod), 'MM/dd/yyyy') : 'N/A'
    }));

    console.log('Soldiers fetched:', formattedSoldiers); // Log fetched soldiers
    res.render('soldierlistFULL', { soldiers:formattedSoldiers }); // Render the 'soldierlistFULL.ejs' view
  } catch (err) {
    console.error('Error fetching soldiers:', err);
    res.status(500).send(`
      <h1>Server Error at soldierlistFULL</h1>
      <p>Message: ${err.message}</p>
      <pre>${err.stack}</pre>
    `);
  }
});

// Route to display the form for adding a new soldier
app.get('/addFull', (req, res) => {
  try {
    console.log('Rendering addFULL.ejs form');
    res.render('addFULL'); // Ensure you have an 'addFULL.ejs' template in your 'views' directory
  } catch (err) {
    console.error('Error rendering addFULL template:', err);
    res.status(500).send(`
      <h1>Error Rendering Form</h1>
      <p>There was a problem with the form template:</p>
      <pre>${err.message}</pre>
      <a href="/">Return to home</a>
    `);
  }
});

// Route to handle form submission for adding a soldier
app.post('/addFULL', async (req, res) => {
  try {
    console.log('Form data received:', req.body);
    
    // Extract basic fields from form data
    const {
      fname, lname, birthCountry, armyroleen, dob, dod
    } = req.body;
    
    console.log('Extracted basic fields:', { fname, lname, birthCountry, armyroleen, dob, dod });
    
    // Parse dates - compatible with your original form names
    const dobA = dob ? new Date(dob) : null;
    const dodA = dod ? new Date(dod) : null;
    
    console.log('Parsed dates:', { dob, dod });
    
    // Create a basic record using the simpler fields from your original form
    // Ensure we're using the SOLDIER_TABLE constant
    await db.none(`
      INSERT INTO ${SOLDIER_TABLE} (
        fname, lname, birthCountry, armyroleen, DOB, DOD
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      );
    `, [fname || null, lname || null, birthCountry || null, armyroleen || null, dobA, dodA]);
    
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
      <a href="/addFull">Go back to form</a>
    `);
  }
});

// Route to display the search form
app.get('/search', (req, res) => {
  res.render('search'); // Ensure you have a 'search.ejs' template in your 'views' directory
});

// Route to handle search results - FIXED for map_soldierdetails
app.get('/searchResults', async (req, res) => {
  const { firstname, lastname } = req.query; // Extract first name and last name from the URL
  try {
    // Build search query for map_soldierdetails table using the constant
    let query = `SELECT * FROM ${SOLDIER_TABLE} WHERE 1=1`;
    const values = [];
    
    // Fixed: using 'firstname' instead of 'fname'
    if (firstname) {
      query += ` AND fname ILIKE $${values.push(`%${firstname}%`)}`;
    }
    
    // Fixed: using 'lastname' instead of 'lname'
    if (lastname) {
      query += ` AND lname ILIKE $${values.push(`%${lastname}%`)}`;
    }

    console.log('Search query:', query, 'with values:', values);
    
    const soldiers = await db.any(query, values);
    console.log(`Found ${soldiers.length} soldiers matching search criteria`);

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
    const medals = await db.any('SELECT id, title FROM public."medals_TBL" ORDER BY title');
    const countries = await db.any('SELECT id, title, title_en from public."countries_TBL" ORDER BY  title')


    try {
      const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
      if (!soldier) {
        return res.status(404).send('Soldier not found');
      }
      res.render('updateSoldier', { soldier, medals, countries }); // This passes soldier data to the EJS template
    } catch (err) {
      console.error('Error fetching soldier:', err);
      res.status(500).send('Server error');
    }
  });
  

// FIXED: Route to handle form submission for updating a soldier


app.post('/updateSoldier/:id', async (req, res) => {
  const { id } = req.params;
  const formData = req.body;

  try {
    // Fetch current soldier from DB
    const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!existingSoldier) {
      return res.status(404).send('Soldier not found');
    }

    // Parse and normalize dates from form
    const dateFields = ['dob', 'dod', 'aliyadate', 'idf_enlistdate', 'idf_releasedate'];
    for (const field of dateFields) {
      if (formData[field]) {
        formData[field] = new Date(formData[field]);
      } else {
        formData[field] = null;
      }
    }

    const fieldsToUpdate = [];
    const values = [];
    let paramIndex = 1;

    for (const key in formData) {
      // Skip if not a valid DB field
      if (!existingSoldier.hasOwnProperty(key)) continue;

      const oldVal = existingSoldier[key];
      const newVal = formData[key] === '' ? null : formData[key];

      // Normalize values for comparison
      const oldNormalized = oldVal instanceof Date ? oldVal.toISOString() : oldVal;
      const newNormalized = newVal instanceof Date ? newVal.toISOString() : newVal;

      if (oldNormalized !== newNormalized) {
        fieldsToUpdate.push(`${key} = $${paramIndex}`);
        values.push(newVal);
        paramIndex++;
      }
    }

    if (fieldsToUpdate.length === 0) {
      console.log(`No changes detected for soldier ID ${id}`);
      return res.redirect('/soldierlistFULL'); // Or back to the same page if you prefer
    }

    // Finalize and run the update query
    const updateQuery = `UPDATE ${SOLDIER_TABLE} SET ${fieldsToUpdate.join(', ')} WHERE id = $${paramIndex}`;
    values.push(id);

    await db.none(updateQuery, values);
    console.log(`Successfully updated soldier ID ${id}. Fields updated:`, fieldsToUpdate);

    

    console.log(`Successfully updated soldier with ID ${id}`);
    
    // Redirect to the soldier list after updating
    res.redirect('/soldierlistFULL');
  } catch (error) {
    console.error('Error updating soldier:', error);
    console.error('Error details:', error.message);
    if (error.stack) console.error('Stack trace:', error.stack);
    if (error.query) console.error('Failed query:', error.query);
    
    res.status(500).send(`
      <h1>Error Updating Soldier</h1>
      <p>Message: ${error.message}</p>
      <pre>${error.stack || 'No stack trace available'}</pre>
      ${error.query ? `<p>Query: ${error.query}</p>` : ''}
      <a href="/updateSoldier/${id}">Go back to form</a>
    `);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});