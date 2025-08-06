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
  const countries = await db.any('SELECT id, title FROM "countries_TBL" ORDER BY title');
  const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');


    console.log('Rendering addFULL.ejs form');
    res.render('addFULL', {
      locale: locale,
      countries:countries,
      medals: medals,
      soldier: {},
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
    
      if (cleaned.recordcomplete) {
          cleaned.record_complete_date = new Date();
    } else {
          cleaned.record_complete_date = null;
    }

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
      linkurl, useremail, recordcomplete, record_complete_date, admin_ready_for_download, admin_approved_date, downloaded_date,
      other_medal, other_medalen, other_medalru
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
        linkurl, useremail, recordcomplete, record_complete_date, 
        admin_ready_for_download, admin_approved_date, downloaded_date,
        other_medal, other_medalen, other_medalru
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
        $91, $92, $93, $94, $95, $96, $97, $98, $99, $100,$101, $102, 
        $103, $104, $105
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
      linkurl, useremail, recordcomplete,
      record_complete_date, admin_ready_for_download, 
      admin_approved_date, downloaded_date,other_medal, other_medalen, other_medalru
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
    // Format all date fields to neutralize timezone shifts
    
    console.log (soldier.dob, "dob");

    
    console.log(soldier.dod , "dod")
    //soldier.aliyadate = formatDate(soldier.aliyadate);
    //soldier.idf_enlistdate = formatDate(soldier.idf_enlistdate);
    //soldier.idf_releasedate = formatDate(soldier.idf_releasedate);
    // Add any other date fields here
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




app.post('/updateSoldier/:id', upload.array('files'), async (req, res) => {
  console.log('Update route hit:', req.params.id);
  const { id } = req.params;

  try {
    const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!existingSoldier) {
      return res.status(404).send('Soldier not found');
    }

    // Parse date fields
    //const parsedDob = req.body.dob ? new Date(req.body.dob) : null;
    //const parsedDod = req.body.dod ? new Date(req.body.dod) : null;
    const parsedAliyaDate = req.body.aliyadate ? new Date(req.body.aliyadate) : null;
    const parsedIdfEnlistDate = req.body.idf_enlistdate ? new Date(req.body.idf_enlistdate) : null;
    const parsedIdfReleaseDate = req.body.idf_releasedate ? new Date(req.body.idf_releasedate) : null;
    const parsedRecordCompleteDate = req.body.record_complete_date ? new Date(req.body.record_complete_date) : null;
    const parsedAdminApprovedDate = req.body.admin_approved_date ? new Date(req.body.admin_approved_date) : null;
    const parsedDownloadedDate = req.body.downloaded_date ? new Date(req.body.downloaded_date) : null;
    // ✅ Determine if recordcomplete is checked (convert string to boolean)
const recordcomplete = Array.isArray(req.body.recordcomplete)
  ? req.body.recordcomplete.includes('true') || req.body.recordcomplete.includes('on')
  : req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';

// ✅ Automatically set record_complete_date only if newly marked complete
  let record_complete_date = null;
  if (recordcomplete && !existingSoldier.recordcomplete) {
    record_complete_date = new Date(); // mark now
  } else if (!recordcomplete) {
    record_complete_date = null; // clear if unchecked
  }

    const inputData = {
      fname: req.body.fname, fnameen: req.body.fnameen, fnameru: req.body.fnameru,
      lname: req.body.lname, lnameen: req.body.lnameen, lnameru: req.body.lnameru,
      previouslname: req.body.previouslname, previouslnameen: req.body.previouslnameen, previouslnameru: req.body.previouslnameru,
      fathername: req.body.fathername, fathernameen: req.body.fathernameen, fathernameru: req.body.fathernameru,
      mothername: req.body.mothername, mothernameen: req.body.mothernameen, mothernameru: req.body.mothernameru,
      calledby: req.body.calledby, calledbyen: req.body.calledbyen, calledbyru: req.body.calledbyru,
      birthcountry: req.body.birthcountry, otherbirthcountry: req.body.otherbirthcountry,
      birthcity: req.body.birthcity, birthcityen: req.body.birthcityen, birthcityru: req.body.birthcityru,
      gender: req.body.gender,
      placeofdeath: req.body.placeofdeath, placeofdeathen: req.body.placeofdeathen, placeofdeathru: req.body.placeofdeathru,
      deathdetails: req.body.deathdetails, deathdetailsen: req.body.deathdetailsen, deathdetailsru: req.body.deathdetailsru,
      biography: req.body.biography, biographyen: req.body.biographyen, biographyru: req.body.biographyru,
      otherparticipation: req.body.otherparticipation,
      otherdecoration: req.body.otherdecoration, otherdecorationen: req.body.otherdecorationen, otherdecorationru: req.body.otherdecorationru,
      fightingdesc: req.body.fightingdesc, fightingdescen: req.body.fightingdescen, fightingdescru: req.body.fightingdescru,
      idf_otherforce: req.body.idf_otherforce, idf_otherrank: req.body.idf_otherrank,
      idf_desc: req.body.idf_desc, idf_descen: req.body.idf_descen, idf_descru: req.body.idf_descru,
      idf_serviceplace: req.body.idf_serviceplace, idf_platoonname: req.body.idf_platoonname,
      shortdesc: req.body.shortdesc,
      armyrole: req.body.armyrole, armyroleen: req.body.armyroleen, armyroleru: req.body.armyroleru,
      releasereason: req.body.releasereason, releasereasonen: req.body.releasereasonen, releasereasonru: req.body.releasereasonru,
      enlistreason: req.body.enlistreason,
      platoonname: req.body.platoonname, platoonnameen: req.body.platoonnameen, platoonnameru: req.body.platoonnameru,
      wounddetails: req.body.wounddetails, wounddetailsen: req.body.wounddetailsen, wounddetailsru: req.body.wounddetailsru,
      gettodesc: req.body.gettodesc, gettodescen: req.body.gettodescen, gettodescru: req.body.gettodescru,
      otherfightingcontext: req.body.otherfightingcontext,
      armyid: req.body.armyid,
      datebreaker: req.body.datebreaker,
      dob: req.body.dob, dod: req.body.dod, aliyadate: parsedAliyaDate,
      idf_enlistdate: parsedIdfEnlistDate, idf_releasedate: parsedIdfReleaseDate,
      tablebreaker: req.body.tablebreaker,
      medal: req.body.medal, medalen: req.body.medalen, medalru: req.body.medalru,
      degree: req.body.degree, degreeen: req.body.degreeen, degreeru: req.body.degreeru,
      front: req.body.front, fronten: req.body.fronten, frontru: req.body.frontru,
      battle: req.body.battle, battleen: req.body.battleen, battleru: req.body.battleru,
      battleyear: req.body.battleyear,
      tablebreaker2: req.body.tablebreaker2,
      battleyear2: req.body.battleyear2,
      front2: req.body.front2, fronten2: req.body.fronten2, frontru2: req.body.frontru2,
      battle2: req.body.battle2, battleen2: req.body.battleen2, battleru2: req.body.battleru2,
      medal2: req.body.medal2, medalen2: req.body.medalen2, medalru2: req.body.medalru2,
      remarks: req.body.remarks, remarksen: req.body.remarksen, remarksru: req.body.remarksru,
      tablebreaker3: req.body.tablebreaker3,
      title: req.body.title, titleen: req.body.titleen, titleru: req.body.titleru,
      remarks2: req.body.remarks2, remarksen2: req.body.remarksen2, remarksru2: req.body.remarksru2,
      linkurl: req.body.linkurl,
      recordcomplete,
      record_complete_date, 
      admin_ready_for_download: req.body.admin_ready_for_download, 
      admin_approved_date: parsedAdminApprovedDate,
      downloaded_date:  parsedDownloadedDate,
      other_medal: req.body.other_medal,
      other_medalen: req.body.other_medalen,
      other_medalru: req.body.other_medalru
    };

    const updates = [];
    const values = [];
    let i = 1;

   const normalizeDate = val =>
      val instanceof Date
        ? val.toISOString().slice(0, 10)
        : typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)
        ? val
        : null;

const dateFields = [
  'dob', 'dod', 'aliyadate', 'idf_enlistdate', 'idf_releasedate', 
  'record_complete_date', 'admin_approved_date', 'downloaded_date'
];

for (const key in inputData) {
  const newValue = inputData[key] === '' ? null : inputData[key];
  const oldValue = existingSoldier[key] === '' ? null : existingSoldier[key];

  const same = dateFields.includes(key)
    ? normalizeDate(newValue) === normalizeDate(oldValue)
    : newValue == oldValue;

  if (!same) {
    console.log(`Field changed: ${key} old: ${oldValue} new: ${newValue}`);
    updates.push(`"${key}" = $${i}`);
    values.push(newValue);
    i++;
  }
}


    if (updates.length === 0) {
      console.log("No changes detected, skipping update.");
      return res.redirect('/search');
    }

    const updateSQL = `UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`;
    values.push(id);

    await db.none(updateSQL, values);
    console.log(`Successfully updated soldier with ID ${id}`);
    if (req.files && req.files.length > 0) {
      const fileInserts = req.files.map(file =>
        db.none(
          `INSERT INTO uploaded_files (soldier_id, original_name, file_path)
           VALUES ($1, $2, $3)`,
          [id, file.originalname, file.path]
        )
      );
      await Promise.all(fileInserts);
      console.log(`Stored ${req.files.length} uploaded files for soldier ID ${id}`);
    }
    //res.redirect('/search');
     res.redirect('/?saved=true');

  } catch (error) {
    console.error('Error updating soldier:', error);
    res.status(500).send(`
      <h1>Error Updating Soldier</h1>
      <p>Message: ${error.message}</p>
      <pre>${error.stack || 'No stack trace available'}</pre>
      ${error.query ? `<p>Query: ${error.query}</p>` : ''}
      <a href="/updateSoldier/${id}">Go back to form</a>
    `);
  }
});

app.get('/adminUpdateSoldier/:id', async (req, res) => {
  const { id } = req.params;
  const adminemail = req.query.adminemail;

  // If adminemail is missing, redirect with default value
  if (!adminemail) {
    return res.redirect(`/adminUpdateSoldier/${id}?adminemail=admin@ww2jewishsoldiers.com`);
  }

  try {
    const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!soldier) {
      return res.status(404).send('Soldier not found');
    }

    const countries = await db.any('SELECT id, title FROM "countries_TBL" ORDER BY title');
    const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');

    res.render('adminUpdate', { soldier, countries, medals, adminemail });
  } catch (err) {
    console.error('Error rendering update form:', err);
    res.status(500).send('Server error');
  }
});


 

// FIXED: Route to handle form submission for updating a soldier

// Route: Show completed records for a given admin
app.get('/admin/completedRecords', async (req, res) => {
  let { adminemail, saved } = req.query;
  const locale = req.getLocale();

  console.log('✅ /admin/completedRecords route hit');
  console.log(adminemail);

  if (!adminemail || adminemail.trim() === '') {
    return res.status(400).send('Admin email required');
  }

  try {
    let completedSoldiers;

    if (adminemail === "admin@ww2jewishsoldiers.com") {
      completedSoldiers = await db.any(`
        SELECT * FROM ${SOLDIER_TABLE}
        WHERE recordcomplete = true
      `);
    } else {
      completedSoldiers = await db.any(`
        SELECT * FROM ${SOLDIER_TABLE}
        WHERE recordcomplete = true AND useremail ILIKE $1
      `, [adminemail]);
    }

    res.render('completedRecords', {
      locale,
      adminemail,
      saved: saved === 'true',
      soldiers: completedSoldiers
    });
  } catch (err) {
    console.error('❌ Error fetching completed records:', err);
    res.status(500).send('Error fetching completed records');
  }
});


app.post('/adminUpdateSoldier/:id', upload.array('files'), async (req, res) => {
  console.log('Update Admin Update route hit:', req.params.id);
  const { id } = req.params;
  const adminemail = req.body.adminemail || req.query.adminemail;

  try {
    const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!existingSoldier) {
      return res.status(404).send('Soldier not found');
    }

    const admin_ready_for_download = Array.isArray(req.body.admin_ready_for_download)
      ? req.body.admin_ready_for_download.includes('true') || req.body.admin_ready_for_download.includes('on')
      : req.body.admin_ready_for_download === 'true' || req.body.admin_ready_for_download === 'on';

    let admin_approved_date = existingSoldier.admin_approved_date;
    let record_complete_date = existingSoldier.record_complete_date;
    let downloaded_date = existingSoldier.downloaded_date;

    //if (admin_ready_for_download && !existingSoldier.admin_ready_for_download) {
     // admin_approved_date = new Date();
    //} else if (!admin_ready_for_download) {
    //  admin_approved_date = null;
    //}
if ('admin_ready_for_download' in req.body) {
  if (admin_ready_for_download && !existingSoldier.admin_ready_for_download) {
    admin_approved_date = new Date();
  } else if (!admin_ready_for_download && existingSoldier.admin_ready_for_download) {
    admin_approved_date = null;
  }
}

    if (!existingSoldier.record_complete_date && req.body.recordcomplete) {
      record_complete_date = new Date();
    }

    if (req.body.downloaded_date) {
      downloaded_date = new Date(req.body.downloaded_date);
    }


    const inputData = {
      fname: req.body.fname, fnameen: req.body.fnameen, fnameru: req.body.fnameru,
      lname: req.body.lname, lnameen: req.body.lnameen, lnameru: req.body.lnameru,
      previouslname: req.body.previouslname, previouslnameen: req.body.previouslnameen, previouslnameru: req.body.previouslnameru,
      fathername: req.body.fathername, fathernameen: req.body.fathernameen, fathernameru: req.body.fathernameru,
      mothername: req.body.mothername, mothernameen: req.body.mothernameen, mothernameru: req.body.mothernameru,
      calledby: req.body.calledby, calledbyen: req.body.calledbyen, calledbyru: req.body.calledbyru,
      birthcountry: req.body.birthcountry, otherbirthcountry: req.body.otherbirthcountry,
      birthcity: req.body.birthcity, birthcityen: req.body.birthcityen, birthcityru: req.body.birthcityru,
      gender: req.body.gender,
      placeofdeath: req.body.placeofdeath, placeofdeathen: req.body.placeofdeathen, placeofdeathru: req.body.placeofdeathru,
      deathdetails: req.body.deathdetails, deathdetailsen: req.body.deathdetailsen, deathdetailsru: req.body.deathdetailsru,
      biography: req.body.biography, biographyen: req.body.biographyen, biographyru: req.body.biographyru,
      otherparticipation: req.body.otherparticipation,
      otherdecoration: req.body.otherdecoration, otherdecorationen: req.body.otherdecorationen, otherdecorationru: req.body.otherdecorationru,
      fightingdesc: req.body.fightingdesc, fightingdescen: req.body.fightingdescen, fightingdescru: req.body.fightingdescru,
      idf_otherforce: req.body.idf_otherforce, idf_otherrank: req.body.idf_otherrank,
      idf_desc: req.body.idf_desc, idf_descen: req.body.idf_descen, idf_descru: req.body.idf_descru,
      idf_serviceplace: req.body.idf_serviceplace, idf_platoonname: req.body.idf_platoonname,
      shortdesc: req.body.shortdesc,
      armyrole: req.body.armyrole, armyroleen: req.body.armyroleen, armyroleru: req.body.armyroleru,
      releasereason: req.body.releasereason, releasereasonen: req.body.releasereasonen, releasereasonru: req.body.releasereasonru,
      enlistreason: req.body.enlistreason,
      platoonname: req.body.platoonname, platoonnameen: req.body.platoonnameen, platoonnameru: req.body.platoonnameru,
      wounddetails: req.body.wounddetails, wounddetailsen: req.body.wounddetailsen, wounddetailsru: req.body.wounddetailsru,
      gettodesc: req.body.gettodesc, gettodescen: req.body.gettodescen, gettodescru: req.body.gettodescru,
      otherfightingcontext: req.body.otherfightingcontext,
      armyid: req.body.armyid,
      datebreaker: req.body.datebreaker,
      dob:req.body.dob, 
      dod:req.body.dod, 
      //aliyadate: req.body.aliyadate,
      //idf_enlistdate: req.body.idf_enlistdate,
      //idf_releasedate: req.body.idf_releasedate,
      //idf_enlistdate, idf_releasedate,
      tablebreaker: req.body.tablebreaker,
      medal: req.body.medal, medalen: req.body.medalen, medalru: req.body.medalru,
      degree: req.body.degree, degreeen: req.body.degreeen, degreeru: req.body.degreeru,
      front: req.body.front, fronten: req.body.fronten, frontru: req.body.frontru,
      battle: req.body.battle, battleen: req.body.battleen, battleru: req.body.battleru,
      battleyear: req.body.battleyear,
      tablebreaker2: req.body.tablebreaker2,
      battleyear2: req.body.battleyear2,
      front2: req.body.front2, fronten2: req.body.fronten2, frontru2: req.body.frontru2,
      battle2: req.body.battle2, battleen2: req.body.battleen2, battleru2: req.body.battleru2,
      medal2: req.body.medal2, medalen2: req.body.medalen2, medalru2: req.body.medalru2,
      remarks: req.body.remarks, remarksen: req.body.remarksen, remarksru: req.body.remarksru,
      tablebreaker3: req.body.tablebreaker3,
      title: req.body.title, titleen: req.body.titleen, titleru: req.body.titleru,
      remarks2: req.body.remarks2, remarksen2: req.body.remarksen2, remarksru2: req.body.remarksru2,
      linkurl: req.body.linkurl,
      recordcomplete: existingSoldier.recordcomplete,
      record_complete_date: existingSoldier.record_complete_date,
      admin_ready_for_download: ('admin_ready_for_download' in req.body)
      ? admin_ready_for_download
      :   existingSoldier.admin_ready_for_download,
      admin_approved_date: admin_approved_date,
      downloaded_date: downloaded_date,
      other_medal: req.body.other_medal,
      other_medalen: req.body.other_medalen,
      other_medalru: req.body.other_medalru,



      
     
    };

  const updates = [];
  const values = [];
  let i = 1;

  // Normalize DATE fields to string for accurate comparison
  const normalizeDate = val =>
  val instanceof Date
    ? val.toISOString().slice(0, 10)
    : typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)
      ? val
      : null;

const dateFields = [
  'dob', 'dod', 'aliyadate', 'idf_enlistdate', 'idf_releasedate', 
  'record_complete_date', 'admin_approved_date', 'downloaded_date'
];

for (const key in inputData) {
  let newValue = inputData[key] === '' ? null : inputData[key];
  let oldValue = existingSoldier[key] === '' ? null : existingSoldier[key];

  let same;
  if (dateFields.includes(key)) {
    same = normalizeDate(newValue) === normalizeDate(oldValue);
  } else {
    same = newValue == oldValue;
  }

  if (!same) {
    console.log(`Field changed: ${key}, old: ${oldValue}, new: ${newValue}`);
    updates.push(`"${key}" = $${i}`);
    values.push(newValue);
    i++;
  }
}


    if (updates.length === 0) {
      console.log("No changes detected, skipping update.");
      return res.redirect(`/admin/completedRecords?adminemail=${encodeURIComponent(adminemail)}`);

    }

    const updateSQL = `UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`;
    values.push(id);

    await db.none(updateSQL, values);
    console.log(`Successfully updated soldier with ID ${id}`);
    if (req.files && req.files.length > 0) {
      const fileInserts = req.files.map(file =>
        db.none(
          `INSERT INTO uploaded_files (soldier_id, original_name, file_path)
           VALUES ($1, $2, $3)`,
          [id, file.originalname, file.path]
        )
      );
      await Promise.all(fileInserts);
      console.log(`Stored ${req.files.length} uploaded files for soldier ID ${id}`);
    }
    
    res.redirect(`/admin/completedRecords?adminemail=${encodeURIComponent(adminemail)}&saved=true`);
    
     //res.redirect('/?saved=true');

  } catch (error) {
    console.error('Error updating soldier:', error);
    res.status(500).send(`
      <h1>Error Updating Soldier</h1>
      <p>Message: ${error.message}</p>
      <pre>${error.stack || 'No stack trace available'}</pre>
      ${error.query ? `<p>Query: ${error.query}</p>` : ''}
      <a href="/adminUpdateSoldier/${id}?adminemail=${encodeURIComponent('admin@ww2jewishsoldiers.com')}">Go back to form</a>
    `);
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

  //selectedSoldiers.forEach(soldier => {
  //worksheet.addRow(soldier);
  //});
  selectedSoldiers.forEach(soldier => {
  const modifiedSoldier = { ...soldier, id: `A${soldier.id}` };
  worksheet.addRow(modifiedSoldier);
});

    // ✅ Update downloaded_date for each selected record
const now = new Date();
  await db.none(`
    UPDATE ${SOLDIER_TABLE}
    SET downloaded_date = $1
    WHERE id IN ($2:csv)
  `, [now, ids]);

console.log(`✅ Updated downloaded_date for ${ids.length} records`);

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
