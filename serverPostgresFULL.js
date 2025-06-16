require('dotenv').config(); // Make sure this is at the top

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const pgp = require('pg-promise')();
const { format } = require('date-fns');
const i18n = require('i18n');
const app = express();
const port = 3000;
const cookieParser = require('cookie-parser');



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
//app.use(express.static(path.join(__dirname, 'views')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
// Middleware to switch language using query or cookie
app.use((req, res, next) => {
  const lang = req.query.lang || req.cookies.lang || 'he';
  res.cookie('lang', lang); // persist language in cookie
  req.setLocale(lang);
  res.locals.__ = res.__;
  next();
});
app.get('/change-lang', (req, res) => {
  const lang = req.query.lang;
  res.cookie('lang', lang, { maxAge: 900000, httpOnly: true });
  res.redirect('back');
});

// i18n configuration
i18n.configure({
  locales: ['he', 'en', 'ru'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'he',
  cookie: 'lang',
  queryParameter: 'lang', // optional: allow ?lang=en to switch
  autoReload: true,
  updateFiles: false,
  objectNotation: true,
});

app.use(cookieParser());
app.use(i18n.init);




// Set EJS as the templating engine

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Route for the landing page
app.get('/', (req, res) => {
  console.log('Rendering index.ejs for route /');
  
  res.render('index', {
    locale: req.getLocale(),
    __: res.__.bind(res)
  });
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
app.get('/addFull', async (req, res) => {
  const locale = req.query.lang || req.cookies.lang || 'he'; // fallback to cookie or Hebrew

  try {
    // Use db.any from pg-promise
  const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');


    console.log('Rendering addFULL.ejs form');
    res.render('addFULL', {
      locale: locale,
      medals: medals
      // other template variables as needed
    });
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
app.get('/change-lang', (req, res) => {
  const lang = req.query.lang;
  res.cookie('i18n', lang, { maxAge: 900000, httpOnly: true });
  res.redirect('back');
});

// Route to display the search form
app.get('/search', (req, res) => {
    const locale = req.query.lang || req.cookies.lang || 'he'; // fallback to cookie or Hebrew
res.render('search', {
      locale: locale,
      
      // other template variables as needed
    });
 
 // res.render('search'); // Ensure you have a 'search.ejs' template in your 'views' directory
});

// Route to handle search results - FIXED for map_soldierdetails
app.get('/searchResults', async (req, res) => {
  let { firstname, lastname, lang } = req.query; // include lang param

  // Set locale from lang, assuming you have i18n middleware setup
  if (lang) {
    req.setLocale(lang);
  }

  try {
    let query = `SELECT * FROM ${SOLDIER_TABLE} WHERE 1=1`;
    const values = [];

    if (firstname) {
      query += ` AND (fname ILIKE $${values.push(`%${firstname}%`)} OR fnameen ILIKE $${values.length} OR fnameru ILIKE $${values.length})`;
    }

    if (lastname) {
      query += ` AND (lname ILIKE $${values.push(`%${lastname}%`)} OR lnameen ILIKE $${values.length} OR lnameru ILIKE $${values.length})`;
    }

    const soldiers = await db.any(query, values);

    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob ? format(new Date(soldier.dob), 'dd/MM/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'dd/MM/yyyy') : 'N/A',
      // You can add language-specific first names here, example:
      translatedFname:
        lang === 'he' ? soldier.fname :
        lang === 'en' ? soldier.fnameen :
        lang === 'ru' ? soldier.fnameru :
        soldier.fname,
      translatedLname:
        lang === 'he' ? soldier.lname :
        lang === 'en' ? soldier.lnameen :
        lang === 'ru' ? soldier.lnameru :
        soldier.lname
    }));

    // Pass variables to the EJS view so dropdown and inputs keep their values
    res.render('searchResults', {
      soldiers: formattedSoldiers,
      locale: req.getLocale(),
      lang,
      firstname,
      lastname
    });
  } catch (err) {
    console.error('Error fetching soldiers:', err);
    res.status(500).send('Server error at searchResults');
  }
});




/*app.get('/searchResults', async (req, res) => {
  const { firstname, lastname, lang = 'he' } = req.query;

  try {
    let query = `SELECT * FROM ${SOLDIER_TABLE} WHERE 1=1`;
    const values = [];

    if (firstname) {
      query += ` AND (fname ILIKE $${values.push(`%${firstname}%`)} OR fnameen ILIKE $${values.length} OR fnameru ILIKE $${values.length})`;
      // Note: Using the same placeholder for all 3 fields, so you can use the same value multiple times
    }

    if (lastname) {
      query += ` AND (lname ILIKE $${values.push(`%${lastname}%`)} OR lnameen ILIKE $${values.length} OR lnameru ILIKE $${values.length})`;
    }

    console.log('Search query:', query, 'with values:', values);

    const soldiers = await db.any(query, values);

    // Format dates and pick translated names
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob ? format(new Date(soldier.dob), 'dd/MM/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'dd/MM/yyyy') : 'N/A',
      translatedFname: soldier[`fname_${lang}`] || soldier.fname,
      translatedLname: soldier[`lname_${lang}`] || soldier.lname,
    }));

    res.render('search', { soldiers: formattedSoldiers, locale: lang });
  } catch (err) {
    console.error('Error fetching soldiers:', err);
    res.status(500).send('Server error at searchResults');
  }
});*/


function formatIfDate(date) {
  return date ? format(new Date(date), 'dd/MM/yyyy') : 'N/A';
}

// Route to display the form for updating a soldier

app.get('/updateSoldier/:id', async (req, res) => {
  const { id } = req.params;
  console.log('here')
  try {
    const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!soldier) {
      return res.status(404).send('Soldier not found');''
    }
    // Fetch all countries from countries_TBL
    const countries = await db.any('SELECT id, title FROM "countries_TBL" ORDER BY title');
    // Fetch medals list
    const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
    // Render the template passing soldier and countries
    res.render('updateSoldier', { soldier, countries, medals });
  } catch (err) {
    console.error('Error rendering update form:', err);
    res.status(500).send('Server error');
  }
});
 

// FIXED: Route to handle form submission for updating a soldier


app.post('/updateSoldier/:id', async (req, res) => {
  console.log("Update route hit with id:", req.params.id);  // Debug log
  const { id } = req.params;
  const { 
    // Extract only the fields that are present in the form
    fname, fnameen, fnameru,
    lname, lnameen, lnameru,
    previouslname, previouslnameen, previouslnameru,
    fathername, fathernameen, fathernameru,
    mothername, mothernameen, mothernameru,
    calledby, calledbyen, calledbyru,
    birthcountry, otherbirthcountry,
    birthcity, birthcityen, birthcityru,
    gender,
    placeofdeath, placeofdeathen, placeofdeathru,
    deathdetails, deathdetailsen, deathdetailsru,
    biography, biographyen, biographyru,
    otherparticipation,
    otherdecoration, otherdecorationen, otherdecorationru,
    fightingdesc, fightingdescen, fightingdescru,
    idf_otherforce, idf_otherrank,
    idf_desc, idf_descen, idf_descru,
    idf_serviceplace, idf_platoonname,
    shortdesc,
    armyrole, armyroleen, armyroleru,
    releasereason, releasereasonen, releasereasonru,
    enlistreason,
    platoonname, platoonnameen, platoonnameru,
    wounddetails, wounddetailsen, wounddetailsru,
    gettodesc, gettodescen, gettodescru,
    otherfightingcontext,
    armyid,
    datebreaker,
    dob, dod, aliyadate,
    idf_enlistdate, idf_releasedate,
    tablebreaker,
    medal, medalen, medalru,
    degree, degreeen, degreeru,
    front, fronten, frontru,
    battle, battleen, battleru,
    battleyear,
    tablebreaker2,
    battleyear2,
    front2, fronten2, frontru2,
    battle2, battleen2, battleru2,
    medal2, medalen2, medalru2,
    remarks, remarksen, remarksru,
    tablebreaker3,
    title, titleen, titleru,
    remarks2, remarksen2, remarksru2,
    linkurl
  } = req.body;
  
  try {
    // Parse dates
    const parsedDob = dob ? new Date(dob) : null;
    const parsedDod = dod ? new Date(dod) : null;
    const parsedAliyaDate = aliyadate ? new Date(aliyadate) : null;
    const parsedIdfEnlistDate = idf_enlistdate ? new Date(idf_enlistdate) : null;
    const parsedIdfReleaseDate = idf_releasedate ? new Date(idf_releasedate) : null;

    console.log(`Updating soldier ID ${id}`);
    console.log('Parsed dates:', { parsedDob, parsedDod, parsedAliyaDate, parsedIdfEnlistDate, parsedIdfReleaseDate });

    // Fixed SQL update statement - removed comments and fixed column names to match form fields
    await db.none(`UPDATE ${SOLDIER_TABLE} SET 
      fname = $1,
      fnameen = $2,
      fnameru = $3,
      lname = $4,
      lnameen = $5, 
      lnameru = $6,
      previouslname = $7,
      previouslnameen = $8,
      previouslnameru = $9,
      
      fathername = $10,
      fathernameen = $11,
      fathernameru = $12,
      mothername = $13,
      mothernameen = $14,
      mothernameru = $15,
      calledby = $16,
      calledbyen = $17,
      calledbyru = $18,
      
      birthcountry = $19,
      otherbirthcountry = $20,
      birthcity = $21,
      birthcityen = $22,
      birthcityru = $23,
      gender = $24,
      placeofdeath = $25,
      placeofdeathen = $26,
      placeofdeathru = $27,
      deathdetails = $28,
      deathdetailsen = $29,
      deathdetailsru = $30,
      
      biography = $31,
      biographyen = $32,
      biographyru = $33,
      otherparticipation = $34,
      otherdecoration = $35,
      otherdecorationen = $36,
      otherdecorationru = $37,
      
      fightingdesc = $38,
      fightingdescen = $39,
      fightingdescru = $40,
      idf_otherforce = $41,
      idf_otherrank = $42,
      idf_desc = $43,
      idf_descen = $44,
      idf_descru = $45,
      idf_serviceplace = $46,
      idf_platoonname = $47,
      shortdesc = $48,
      armyrole = $49,
      armyroleen = $50,
      armyroleru = $51,
      releasereason = $52,
      releasereasonen = $53,
      releasereasonru = $54,
      enlistreason = $55,
      platoonname = $56,
      platoonnameen = $57,
      platoonnameru = $58,
      wounddetails = $59,
      wounddetailsen = $60,
      wounddetailsru = $61,
      gettodesc = $62,
      gettodescen = $63,
      gettodescru = $64,
      otherfightingcontext = $65,
      armyid = $66,
      
      datebreaker = $67,
      dob = $68,
      dod = $69,
      aliyadate = $70,
      idf_enlistdate = $71,
      idf_releasedate = $72,
      
      tablebreaker = $73,
      medal = $74,
      medalen = $75,
      medalru = $76,
      degree = $77,
      degreeen = $78,
      degreeru = $79,
      front = $80,
      fronten = $81,
      frontru = $82,
      battle = $83,
      battleen = $84,
      battleru = $85,
      battleyear = $86,
      
      tablebreaker2 = $87,
      battleyear2 = $88,
      front2 = $89,
      fronten2 = $90,
      frontru2 = $91,
      battle2 = $92,
      battleen2 = $93,
      battleru2 = $94,
      medal2 = $95,
      medalen2 = $96,
      medalru2 = $97,
      
      remarks = $98,
      remarksen = $99,
      remarksru = $100,
      tablebreaker3 = $101,
      title = $102,
      titleen = $103,
      titleru = $104,
      remarks2 = $105,
      remarksen2 = $106,
      remarksru2 = $107,
      linkurl = $108
      
      WHERE id = $109`,
      [
        // Basic Information
        fname || null, fnameen || null, fnameru || null, 
        lname || null, lnameen || null, lnameru || null,
        previouslname || null, previouslnameen || null, previouslnameru || null,
        
        // Family
        fathername || null, fathernameen || null, fathernameru || null,
        mothername || null, mothernameen || null, mothernameru || null,
        calledby || null, calledbyen || null, calledbyru || null,
        
        // Birth & Death
        birthcountry || null, otherbirthcountry || null,
        birthcity || null, birthcityen || null, birthcityru || null,
        gender || null,
        placeofdeath || null, placeofdeathen || null, placeofdeathru || null,
        deathdetails || null, deathdetailsen || null, deathdetailsru || null,
        
        // Biography & Participation
        biography || null, biographyen || null, biographyru || null,
        otherparticipation || null,
        otherdecoration || null, otherdecorationen || null, otherdecorationru || null,
        
        // IDF & Army Service
        fightingdesc || null, fightingdescen || null, fightingdescru || null,
        idf_otherforce || null, idf_otherrank || null,
        idf_desc || null, idf_descen || null, idf_descru || null,
        idf_serviceplace || null, idf_platoonname || null,
        shortdesc || null,
        armyrole || null, armyroleen || null, armyroleru || null,
        releasereason || null, releasereasonen || null, releasereasonru || null,
        enlistreason || null,
        platoonname || null, platoonnameen || null, platoonnameru || null,
        wounddetails || null, wounddetailsen || null, wounddetailsru || null,
        gettodesc || null, gettodescen || null, gettodescru || null,
        otherfightingcontext || null,
        armyid || null,
        
        // Dates
        datebreaker || null,
        parsedDob, parsedDod,
        parsedAliyaDate,
        parsedIdfEnlistDate, parsedIdfReleaseDate,
        
        // Medals and battles
        tablebreaker || null,
        medal || null, medalen || null, medalru || null,
        degree || null, degreeen || null, degreeru || null,
        front || null, fronten || null, frontru || null,
        battle || null, battleen || null, battleru || null,
        battleyear || null,
        
        // Additional battles
        tablebreaker2 || null,
        battleyear2 || null,
        front2 || null, fronten2 || null, frontru2 || null,
        battle2 || null, battleen2 || null, battleru2 || null,
        medal2 || null, medalen2 || null, medalru2 || null,
        
        // Remarks and additional info
        remarks || null, remarksen || null, remarksru || null,
        tablebreaker3 || null,
        title || null, titleen || null, titleru || null,
        remarks2 || null, remarksen2 || null, remarksru2 || null,
        linkurl || null,
        
        // Where clause
        id
      ]
    );
    
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
