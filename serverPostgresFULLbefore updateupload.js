require('dotenv').config(); // Make sure this is at the top

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const pgp = require('pg-promise')();

const { format } = require('date-fns');
const i18n = require('i18n');
const app = express();
const port = 3000;
const ExcelJS = require('exceljs'); // Add at top



// Use pg-promise and load DATABASE_URL from .env
const postgresURI = process.env.DATABASE_URL;
//const db = pgp(postgresURI);

const isRender = process.env.RENDER === 'true'; // or use any other custom env var

const cn = isRender
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    }
  : process.env.DATABASE_URL;
const multer = require('multer');


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  cb(null, uniqueSuffix + '-' + file.originalname);
}
});

const upload = multer({ storage });

const db = pgp(cn);


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
;

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


app.use(i18n.init);
const cookieParser = require('cookie-parser');
app.use(cookieParser()); 
 //Middleware to switch language using query or cookie
app.use((req, res, next) => {
  const lang = req.query.lang || req.cookies.lang || 'he';
  res.cookie('lang', lang); // persist language in cookie
  req.setLocale(lang);
  res.locals.__ = res.__;
  next();
});



// Set EJS as the templating engine

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Route for the landing page
app.get('/', (req, res) => {
  console.log('Rendering index.ejs for route /');
  const saved = req.query.saved === 'true';
  res.render('index', {
    locale: req.getLocale(),
    __: res.__.bind(res), 
    saved
  
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


function cleanNulls(obj) {
  const cleaned = {};
  for (const key in obj) {
    if (obj[key] === '') {
      cleaned[key] = null;
    } else {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}


// Route to handle form submission for adding a soldier
// Route to handle form submission for adding a soldier
app.post('/addFULL', upload.array('files'), async (req, res) => {
  console.log('🧾 Uploaded files:', req.files);

  try {
    // Convert empty strings to null
    const cleaned = cleanNulls(req.body);

    // Convert checkbox string to boolean
    cleaned.recordcomplete = Array.isArray(cleaned.recordcomplete)
      ? cleaned.recordcomplete.includes('true') || cleaned.recordcomplete.includes('on')
      : cleaned.recordcomplete === 'true' || cleaned.recordcomplete === 'on';

    // Destructure from cleaned body
    const {
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
      battleyear2,
      front2, fronten2, frontru2,
      battle2, battleen2, battleru2,
      medal2, medalen2, medalru2,
      remarks, remarksen, remarksru,
      title, titleen, titleru,
      remarks2, remarksen2, remarksru2,
      linkurl, useremail, recordcomplete
    } = cleaned;

    // Convert date strings to Date objects or null
    const parsedDob = dob ? new Date(dob) : null;
    const parsedDod = dod ? new Date(dod) : null;
    const parsedAliyaDate = aliyadate ? new Date(aliyadate) : null;
    const parsedIdfEnlistDate = idf_enlistdate ? new Date(idf_enlistdate) : null;
    const parsedIdfReleaseDate = idf_releasedate ? new Date(idf_releasedate) : null;

    // Insert into the main soldier table
    const insertedSoldier = await db.one(`
      INSERT INTO ${SOLDIER_TABLE} (
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
        medal, medalen, medalru,
        degree, degreeen, degreeru,
        front, fronten, frontru,
        battle, battleen, battleru,
        battleyear,
        battleyear2,
        front2, fronten2, frontru2,
        battle2, battleen2, battleru2,
        medal2, medalen2, medalru2,
        remarks, remarksen, remarksru,
        title, titleen, titleru,
        remarks2, remarksen2, remarksru2,
        linkurl, useremail, recordcomplete
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27,
        $28, $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44, $45,
        $46, $47, $48, $49, $50, $51, $52, $53, $54,
        $55, $56, $57, $58, $59, $60, $61, $62, $63,
        $64, $65, $66, $67, $68, $69, $70, $71, $72,
        $73, $74, $75, $76, $77, $78, $79, $80, $81,
        $82, $83, $84, $85, $86, $87, $88, $89, $90,
        $91, $92, $93, $94, $95, $96, $97, $98
      ) RETURNING id
    `, [
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
      parsedDob, parsedDod, parsedAliyaDate,
      medal, medalen, medalru,
      degree, degreeen, degreeru,
      front, fronten, frontru,
      battle, battleen, battleru,
      battleyear,
      battleyear2,
      front2, fronten2, frontru2,
      battle2, battleen2, battleru2,
      medal2, medalen2, medalru2,
      remarks, remarksen, remarksru,
      title, titleen, titleru,
      remarks2, remarksen2, remarksru2,
      linkurl, useremail, recordcomplete
    ]);

    const soldierId = insertedSoldier.id;

    // Save uploaded file metadata if any
    if (req.files && req.files.length > 0) {
  const fileInserts = req.files.map(file =>
    db.none(
      `INSERT INTO uploaded_files (soldier_id, original_name, file_path)
       VALUES ($1, $2, $3)`,
      [soldierId, file.originalname, file.path]
    )
  );
  await Promise.all(fileInserts);
}


    res.redirect('/?saved=true');

  } catch (error) {
    console.error('❌ Error inserting record:', error.message);
    res.status(500).send(`
      <h1>Error</h1>
      <p>${error.message}</p>
      <pre>${error.stack}</pre>
      <a href="/addFull">Back to form</a>
    `);
  }
});


// Route to search by email (exact match or partial, case-insensitive)
app.get('/searchByEmail', async (req, res) => {
  const { useremail, lang } = req.query;

  if (lang) req.setLocale(lang);
  const locale = req.getLocale();

  try {
    if (!useremail) {
      return res.status(400).send('Email is required');
    }

    const query = `
      SELECT * FROM ${SOLDIER_TABLE}
      WHERE useremail ILIKE $1
    `;
    const values = [useremail];

    const soldiers = await db.any(query, values);

    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob ? format(new Date(soldier.dob), 'dd/MM/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'dd/MM/yyyy') : 'N/A',
      translatedFname: lang === 'he' ? soldier.fname : lang === 'en' ? soldier.fnameen : soldier.fnameru,
      translatedLname: lang === 'he' ? soldier.lname : lang === 'en' ? soldier.lnameen : soldier.lnameru
    }));

    res.render('searchResults', {
      soldiers: formattedSoldiers,
      locale,
      lang,
      useremail
    });

    console.log(`Email search results for: ${useremail}`);
  } catch (err) {
    console.error('Error searching by email:', err);
    res.status(500).send('Server error at searchByEmail');
  }
});
// Route to display the multilingual search form

app.get('/search', (req, res) => {
  console.log('✅ /search route hit');
  const lang = req.query.lang || req.cookies.lang || 'he';
  req.setLocale(lang);
  const locale = req.getLocale();

  res.render('search', {
    locale,
    firstname: '',
    lastname: '',
    useremail: '',
    error: null
  });
});



// Route to handle general search (first name, last name, email)
app.get('/searchResults', async (req, res) => {
  let { firstname, lastname, useremail, lang } = req.query;

  if (lang) req.setLocale(lang);
  const locale = req.getLocale();

  // Email validation regex (simple but effective)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // If email is missing or invalid, return to the search form with an error
  if (!useremail || !emailRegex.test(useremail)) {
    return res.render('search', {
      locale,
      firstname,
      lastname,
      useremail,
      error: req.__('error.invalidEmail') || 'Please enter a valid email address.'
    });
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

    if (useremail) {
      query += ` AND useremail ILIKE $${values.push(`%${useremail}%`)}`;
    }

    query += ` AND (recordcomplete IS NULL OR recordcomplete = FALSE)`;

    const soldiers = await db.any(query, values);

    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob ? format(new Date(soldier.dob), 'dd/MM/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'dd/MM/yyyy') : 'N/A',
      translatedFname: lang === 'he' ? soldier.fname : lang === 'en' ? soldier.fnameen : soldier.fnameru,
      translatedLname: lang === 'he' ? soldier.lname : lang === 'en' ? soldier.lnameen : soldier.lnameru
    }));

    res.render('searchResults', {
      soldiers: formattedSoldiers,
      locale,
      lang,
      firstname,
      lastname,
      useremail
    });

    console.log('Search results returned successfully');
  } catch (err) {
    console.error('Error fetching search results:', err);
    res.status(500).send('Server error at searchResults');
  }
});


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
  console.log("Update route hit with id:", req.params.id);
  const { id } = req.params;
  const { 
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
    linkurl, recordcomplete
  } = req.body;

  try {
    // Parse dates or set null
    const parsedDob = dob ? new Date(dob) : null;
    const parsedDod = dod ? new Date(dod) : null;
    const parsedAliyaDate = aliyadate ? new Date(aliyadate) : null;
    const parsedIdfEnlistDate = idf_enlistdate ? new Date(idf_enlistdate) : null;
    const parsedIdfReleaseDate = idf_releasedate ? new Date(idf_releasedate) : null;

    console.log(`Updating soldier ID ${id}`);
    console.log('Parsed dates:', { parsedDob, parsedDod, parsedAliyaDate, parsedIdfEnlistDate, parsedIdfReleaseDate });

    await db.none(
      `UPDATE ${SOLDIER_TABLE} SET
        fname = $1, fnameen = $2, fnameru = $3,
        lname = $4, lnameen = $5, lnameru = $6,
        previouslname = $7, previouslnameen = $8, previouslnameru = $9,
        fathername = $10, fathernameen = $11, fathernameru = $12,
        mothername = $13, mothernameen = $14, mothernameru = $15,
        calledby = $16, calledbyen = $17, calledbyru = $18,
        birthcountry = $19, otherbirthcountry = $20,
        birthcity = $21, birthcityen = $22, birthcityru = $23,
        gender = $24,
        placeofdeath = $25, placeofdeathen = $26, placeofdeathru = $27,
        deathdetails = $28, deathdetailsen = $29, deathdetailsru = $30,
        biography = $31, biographyen = $32, biographyru = $33,
        otherparticipation = $34,
        otherdecoration = $35, otherdecorationen = $36, otherdecorationru = $37,
        fightingdesc = $38, fightingdescen = $39, fightingdescru = $40,
        idf_otherforce = $41, idf_otherrank = $42,
        idf_desc = $43, idf_descen = $44, idf_descru = $45,
        idf_serviceplace = $46, idf_platoonname = $47,
        shortdesc = $48,
        armyrole = $49, armyroleen = $50, armyroleru = $51,
        releasereason = $52, releasereasonen = $53, releasereasonru = $54,
        enlistreason = $55,
        platoonname = $56, platoonnameen = $57, platoonnameru = $58,
        wounddetails = $59, wounddetailsen = $60, wounddetailsru = $61,
        gettodesc = $62, gettodescen = $63, gettodescru = $64,
        otherfightingcontext = $65,
        armyid = $66,
        datebreaker = $67,
        dob = $68, dod = $69, aliyadate = $70,
        idf_enlistdate = $71, idf_releasedate = $72,
        tablebreaker = $73,
        medal = $74, medalen = $75, medalru = $76,
        degree = $77, degreeen = $78, degreeru = $79,
        front = $80, fronten = $81, frontru = $82,
        battle = $83, battleen = $84, battleru = $85,
        battleyear = $86,
        tablebreaker2 = $87,
        battleyear2 = $88,
        front2 = $89, fronten2 = $90, frontru2 = $91,
        battle2 = $92, battleen2 = $93, battleru2 = $94,
        medal2 = $95, medalen2 = $96, medalru2 = $97,
        remarks = $98, remarksen = $99, remarksru = $100,
        tablebreaker3 = $101,
        title = $102, titleen = $103, titleru = $104,
        remarks2 = $105, remarksen2 = $106, remarksru2 = $107,
        linkurl = $108, recordcomplete = $109
      WHERE id = $110`,
      [
        fname || null, fnameen || null, fnameru || null,
        lname || null, lnameen || null, lnameru || null,
        previouslname || null, previouslnameen || null, previouslnameru || null,
        fathername || null, fathernameen || null, fathernameru || null,
        mothername || null, mothernameen || null, mothernameru || null,
        calledby || null, calledbyen || null, calledbyru || null,
        birthcountry || null, otherbirthcountry || null,
        birthcity || null, birthcityen || null, birthcityru || null,
        gender || null,
        placeofdeath || null, placeofdeathen || null, placeofdeathru || null,
        deathdetails || null, deathdetailsen || null, deathdetailsru || null,
        biography || null, biographyen || null, biographyru || null,
        otherparticipation || null,
        otherdecoration || null, otherdecorationen || null, otherdecorationru || null,
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
        datebreaker || null,
        parsedDob, parsedDod, parsedAliyaDate,
        parsedIdfEnlistDate, parsedIdfReleaseDate,
        tablebreaker || null,
        medal || null, medalen || null, medalru || null,
        degree || null, degreeen || null, degreeru || null,
        front || null, fronten || null, frontru || null,
        battle || null, battleen || null, battleru || null,
        battleyear || null,
        tablebreaker2 || null,
        battleyear2 || null,
        front2 || null, fronten2 || null, frontru2 || null,
        battle2 || null, battleen2 || null, battleru2 || null,
        medal2 || null, medalen2 || null, medalru2 || null,
        remarks || null, remarksen || null, remarksru || null,
        tablebreaker3 || null,
        title || null, titleen || null, titleru || null,
        remarks2 || null, remarksen2 || null, remarksru2 || null,
        linkurl || null, recordcomplete,
        id
      ]
    );

    console.log(`Successfully updated soldier with ID ${id}`);

    // Redirect after success
    res.redirect('/search');

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


// Route: Show completed records for a given admin
app.get('/admin/completedRecords', async (req, res) => {
  let { adminemail } = req.query;
  const locale = req.getLocale();

  console.log('✅ /admin/completedRecords route hit');

  // Validate adminemail presence
  if (!adminemail || adminemail.trim() === '') {
    return res.status(400).send('Admin email required');
  }

  try {
    let completedSoldiers;

    if (adminemail === "admin@ww2jewishsoldiers.com") {
      // Show ALL completed records if admin email is the joint admin
      completedSoldiers = await db.any(`
        SELECT * FROM ${SOLDIER_TABLE}
        WHERE recordcomplete = true
      `);
    } else {
      // Otherwise show only completed records for the specific adminemail
      completedSoldiers = await db.any(`
        SELECT * FROM ${SOLDIER_TABLE}
        WHERE recordcomplete = true AND useremail ILIKE $1
      `, [adminemail]);
    }

    res.render('completedRecords', {
      locale,
      adminemail,
      soldiers: completedSoldiers
    });
  } catch (err) {
    console.error('❌ Error fetching completed records:', err);
    res.status(500).send('Error fetching completed records');
  }
});


// Route: Download selected completed records as Excel
app.post('/admin/downloadExcel', async (req, res) => {
  let ids = req.body.selectedIds;

  // If only one checkbox was selected, it'll be a string; convert it to an array
  if (!ids) {
    return res.status(400).send('No records selected');
  }

  if (!Array.isArray(ids)) {
    ids = [ids]; // convert single value to array
  }

  console.log('📥 Final ID array:', ids);

  try {
    const selectedSoldiers = await db.any(`
      SELECT * FROM ${SOLDIER_TABLE}
      WHERE id IN ($1:csv)
    `, [ids]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Completed Soldiers');

    worksheet.columns = Object.keys(selectedSoldiers[0] || {}).map(key => ({
      header: key,
      key: key,
    }));

    selectedSoldiers.forEach(soldier => {
      worksheet.addRow(soldier);
    });

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="completed_records.xlsx"'
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).send('Error exporting Excel');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
