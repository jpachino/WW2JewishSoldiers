require('dotenv').config(); // Make sure this is at the top

const express = require('express');
const bodyParser = require('body-parser');
const { create } = require('xmlbuilder2');
const path = require('path');
const pgp = require('pg-promise')();

const { format } = require('date-fns');
const i18n = require('i18n');
const app = express();
const port = 3000;
const ExcelJS = require('exceljs'); // Add at top
const cookieParser = require('cookie-parser'); // The key module
const archiver = require('archiver');

// ... db initialization ...

// Ensure this list matches your actual DB column names exactly
const columns = [
    'fname', 'fnameen', 'fnameru', 'lname', 'lnameen', 'lnameru',
    'previouslname', 'previouslnameen', 'previouslnameru',
    'fathername', 'fathernameen', 'fathernameru',
    'mothername', 'mothernameen', 'mothernameru',
    'calledby', 'calledbyen', 'calledbyru',
    'birthcountry', 'birthcountryen', 'birthcountryru',
    'birthcity', 'birthcityen', 'birthcityru',
    'state', 'stateen', 'stateru',
    'gender', 'genderen', 'genderru',
    'placeofdeath', 'placeofdeathen', 'placeofdeathru',
    'deathdetails', 'deathdetailsen', 'deathdetailsru',
    'biography', 
    'otherparticipation', 'otherparticipationen', 'otherparticipationru',
    'otherdecoration', 'otherdecorationen', 'otherdecorationru',
    'fightingdesc', 
    'shortdesc', 'armyrole', 'armyroleen', 'armyroleru',
    'rank', 'ranken', 'rankru',
    'enlistreason', 'enlistreasonen', 'enlistreasonru',
    'platoonname', 'platoonnameen', 'platoonnameru',
    'wounddetails', 'wounddetailsen', 'wounddetailsru',
    'gettodesc', 'gettodescen', 'gettodescru',
    'otherfightingcontext', 'otherfightingcontexten', 'otherfightingcontextru',
    'armyid', 'dob', 'dod', 'aliyadate',
    'title', 'titleen', 'titleru', 'linkurl',
    'category', 'categoryen', 'categoryru',
    'army', 'armyen', 'armyru',
    'resistance', 'resistanceen', 'resistanceru',
    'partizan', 'partizanen', 'partizanru',
    'participation', 'participationen', 'participationru',
    'corps', 'corpsen', 'corpsru',
    'useremail', 'recordcomplete', 'record_complete_date',
    'admin_ready_for_download', 'admin_approved_date', 'downloaded_date',
    'uprising_participant', 'fname_soldier_submitter', 'lname_soldier_submitter',
    'relation_of_soldier_submitter', 'phone_soldier_submitter', 
    'soldier_previously_submitted', 'how_found_us_submitter'
];

// FIX: Changed table name to 'soldierdetails'
const csSoldiers = new pgp.helpers.ColumnSet(
    columns.map(col => ({ name: col, def: null })), 
    { table: 'soldierdetails' } 
);

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
/*const multer = require('multer');


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  cb(null, uniqueSuffix + '-' + file.originalname);
}
});

const upload = multer({ storage });*/

const fs = require('fs');
const multer = require('multer');

// Define where files go the moment they hit the server
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = 'public/pages/soldierUploads/temp';
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // This fix works for Russian, Hebrew, and any other UTF-8 language
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    
    // Use the clean, multilingual name without the Date prefix
    cb(null, decodedName);
  }
});

const upload = multer({ storage: storage });
const multiUpload = upload.fields([
  
  { name: 'm_files[]', maxCount: 12 }
]);

const db = pgp(cn);
//const { format } = require('date-fns'); // Only if you still use date-fns elsewhere

// --- Helper Functions ---
function formatDateToDDMMYYYY(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d)) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

function normalizeDateToDDMMYYYY(val) {
    if (!val) return null;
    if (val instanceof Date) return formatDateToDDMMYYYY(val);
    if (typeof val === 'string') {
        const parts = val.split(/[-\/]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD → DD-MM-YYYY
            if (parts[2].length === 4) return `${parts[0]}-${parts[1]}-${parts[2]}`; // DD-MM-YYYY
        }
    }
    return val;
}
// Define the table name as a constant for consistency
const SOLDIER_TABLE = 'soldierdetails';

// Test connection and log database details
db.connect()
  .then(async obj => {
    console.log('Connected to PostgreSQL successfully');
    
    try {
      // Check database version
      const versionResult = await obj.query('SELECT version()');
      console.log('PostgreSQL version:', versionResult[0].version);
      
      // Check if oldierdetails table exists
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

// ASSUMED: Your required modules (express, body-parser, cookie-parser, i18n, path)
// are defined at the top of your main file (e.g., server.js).

// -----------------------------------------------------
// ⚙️ Core Application & Static Middleware
// -----------------------------------------------------

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// -----------------------------------------------------
// 🍪 Cookie Parser - MUST BE FIRST (Reads existing cookies)
// -----------------------------------------------------
// This line is essential for i18n.init to see req.cookies
app.use(cookieParser());

// -----------------------------------------------------
// 🌍 i18n Configuration
// -----------------------------------------------------
i18n.configure({
  locales: ['he', 'en', 'ru'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'he',
  cookie: 'lang',
  queryParameter: 'lang',
  autoReload: true,
  updateFiles: false,
  objectNotation: true,
});


// -----------------------------------------------------
// 🚀 i18n Initialization - MUST BE AFTER cookieParser()
// -----------------------------------------------------
// This middleware reads the cookie/query parameter and sets req.setLocale()
app.use(i18n.init);


// -----------------------------------------------------
// 🔧 Custom Language Persistence Middleware (Optional but clean)
// -----------------------------------------------------
// This block ensures the language choice is persisted back to the user's browser
// *even if* i18n.init didn't explicitly use the query/cookie this time.
/*app.use((req, res, next) => {
  // i18n.init has already set the locale using the best available data (query, cookie, or default).
  // We use i18n's determined locale to ensure the cookie is always set correctly on the response.
  const lang = req.getLocale();
  
  // Re-set the cookie on the response to maintain the maxAge/httpOnly properties and persist the language.
  // NOTE: I'm adding the maxAge/httpOnly options back here for consistency.
  res.cookie('lang', lang, { maxAge: 900000, httpOnly: true });

  // Expose the translation function to templates (res.locals)
  res.locals.__ = res.__;
  next();
});*/
app.use((req, res, next) => {
    const lang = req.getLocale();
    
    // 1. Keep the cookie alive
    res.cookie('lang', lang, { maxAge: 900000, httpOnly: true });

    // 2. EXPOSE LOCALE TO ALL EJS FILES
    // This allows you to use <%= locale %> in any .ejs file 
    // without passing it manually in res.render
    res.locals.locale = lang;

    // 3. Expose the translation function
    res.locals.__ = res.__;
    
    next();
});

// -----------------------------------------------------
// 🔄 Language Switch Route (Simplified/Corrected)
// -----------------------------------------------------
app.get('/change-lang', (req, res) => {
    // Note: The middleware above will pick up the 'lang' from the 
    // query param automatically because of i18n.configure setting 'queryParameter'
    res.redirect('back');
});


// Set EJS as the templating engine

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Route for the landing page
app.get('/', (req, res) => {
    const saved = req.query.saved === 'true';
    
    // You no longer need to pass 'locale' or '__' here! 
    // res.locals (from the middleware above) handles it.
    res.render('index', { saved });
});
function cleanNulls(obj) {
  const cleaned = {};
  for (const key in obj) {
    cleaned[key] = obj[key] === '' ? null : obj[key];
  }
  return cleaned;
}

app.get('/addFull', async (req, res) => {
  const locale = req.query.lang || req.cookies.lang || 'he'; // fallback to cookie or Hebrew
  // Map locale to the actual column name in your DB
  const langMap = {
    'he': 'title_heb',
    'en': 'title_eng',
    'ru': 'title_rus'
  };

  // Determine which column to sort by (default to title_heb if locale is unknown)
  const sortCol = langMap[locale] || 'title_heb';

  try {
    // Helper to run query with dynamic ORDER BY
    const fetchOrdered = (table) => 
      db.any(`SELECT id, title_heb, title_eng, title_rus FROM "${table}" ORDER BY $(col:name) ASC`, { col: sortCol });
  // Execute queries
    const [
      countries, corps, category, army, resistance, 
      partizan, participation, enlistreason, gender, deathdetails
    ] = await Promise.all([
      fetchOrdered('countries_TBL'),
      fetchOrdered('corps_TBL'),
      fetchOrdered('category_TBL'),
      fetchOrdered('army_TBL'),
      fetchOrdered('resistance_TBL'),
      fetchOrdered('partizan_TBL'),
      fetchOrdered('participation_TBL'),
      fetchOrdered('enlistreason_TBL'),
      fetchOrdered('gender_TBL'),
      fetchOrdered('deathdetails_TBL')
    ]);
    const mTypes = await db.any('SELECT * FROM "multimedia_type_TBL" ORDER BY title_heb');
    const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');

    console.log('Rendering addFULL.ejs form');
   // 1. Find the "Unknown" entry specifically by ID 0
    // We use Number() to ensure type safety if the ID comes back as a string
    const unknownIndex = countries.findIndex(c => Number(c.id) === 0);

    // 2. If it's found and not already at the top (index 0), move it
    if (unknownIndex > 0) {
      const [unknownItem] = countries.splice(unknownIndex, 1);
      countries.unshift(unknownItem);
    }
    res.render('addFULL', {
      locale,
      countries,
      category,
      army,
      resistance,
      partizan,
      participation,
      corps,
      enlistreason,
      gender,
      deathdetails,
      multimedia_type_TBL: mTypes,
      medals,

      // Empty soldier object for a "new" record
      soldier: {
        dob: '',
        dod: '',
        aliyadate: '',
        
        record_complete_date: '',
        admin_approved_date: '',
        downloaded_date: ''
      },

      battles: [],   // empty battle history by default
      req             // pass request if your EJS relies on it
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
app.post('/addFULL', multiUpload, async (req, res) => {
    try {
    // 1. Clean the incoming body (removes empty strings/nulls)
    const cleaned = cleanNulls(req.body);

    // --- VALIDATION BLOCK HERE ---
        const errors = [];
        
        if (!cleaned.armyId && !cleaned.resistanceId && !cleaned.partizanId) errors.push("Service Type missing.");
        if (!cleaned.fname && !cleaned.fnameen && !cleaned.fnameru) errors.push("First Name missing.");
        if (!cleaned.lname && !cleaned.lnameen && !cleaned.lnameru) errors.push("Last Name missing.");
        if (!cleaned.genderId) errors.push("Gender missing.");
        if (!cleaned.birthcountryId) errors.push("Birth Country missing.");
        if (!cleaned.useremail) errors.push("Submitter Email missing.");
        if (!cleaned.fname_soldier_submitter) errors.push("Submitter FName missing.");

        if (errors.length > 0) {
            return res.status(400).send(`<h1>Validation Error</h1><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul><a href="javascript:history.back()">Go Back</a>`);
        }
        // --- END VALIDATION ---
        // 2. DYNAMIC TRANSLATION LOOKUPS
        // Maps form IDs to the corresponding text labels in Hebrew, English, and Russian
        const translations = [
            { id: cleaned.birthcountryId, table: 'countries_TBL', field: 'birthcountry' },
            { id: cleaned.genderId, table: 'gender_TBL', field: 'gender' },
            { id: cleaned.categoryId, table: 'category_TBL', field: 'category' },
            { id: cleaned.armyId, table: 'army_TBL', field: 'army' },
            { id: cleaned.corpsId, table: 'corps_TBL', field: 'corps' },
            { id: cleaned.enlistreasonId, table: 'enlistreason_TBL', field: 'enlistreason' },
            { id: cleaned.resistanceId, table: 'resistance_TBL', field: 'resistance' },
            { id: cleaned.partizanId, table: 'partizan_TBL', field: 'partizan' },
            { id: cleaned.participationId, table: 'participation_TBL', field: 'participation' },
            { id: cleaned.deathdetailsId, table: 'deathdetails_TBL', field: 'deathdetails' }
        ];

        for (const t of translations) {
            if (t.id) {
                const data = await db.oneOrNone(
                    `SELECT title_heb, title_eng, title_rus FROM "${t.table}" WHERE id = $1`, [t.id]
                );
                if (data) {
                    cleaned[t.field] = data.title_heb;
                    cleaned[`${t.field}en`] = data.title_eng;
                    cleaned[`${t.field}ru`] = data.title_rus;
                }
            }
        }

        // 3. LOGIC FOR CHECKBOXES
        const parseCheck = (val) => Array.isArray(val) ? val.includes('true') || val.includes('on') : (val === 'true' || val === 'on');
        cleaned.recordcomplete = parseCheck(cleaned.recordcomplete);
        cleaned.uprising_participant = parseCheck(cleaned.uprising_participant);
        cleaned.record_complete_date = cleaned.recordcomplete ? (cleaned.record_complete_date || new Date().toISOString().split('T')[0]) : '';

        // 4. DATABASE TRANSACTION
        await db.tx(async t => {
            // STEP A: Insert Soldier to get the unique ID
            const query = pgp.helpers.insert(cleaned, csSoldiers) + ' RETURNING id';
            const { id: soldierId } = await t.one(query);

            // STEP B: Create Soldier-Specific Folder A[ID]
            const folderName = `A${soldierId}`;
            const targetDir = path.join(__dirname, 'public', 'pages', 'soldierUploads', folderName);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // STEP C: INSERT BATTLE HISTORY
            const bh = req.body;
            if (bh.battleyear && Array.isArray(bh.battleyear)) {
                for (let i = 0; i < bh.battleyear.length; i++) {
                    const hasData = bh.battleyear[i] || bh.front[i] || bh.battle[i];
                    if (!hasData) continue;

                    await t.none(`
                        INSERT INTO soldier_battle_history
                        (soldier_id, battleyear, front, battle, medal, details, degreerank, job,
                         fronten, battleen, medalen, detailsen, degreeranken, joben,
                         frontru, battleru, medalru, detailsru, degreerankru, jobru)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
                    `, [
                        soldierId, bh.battleyear[i] || null, bh.front[i] || null, bh.battle[i] || null,
                        bh.battle_medal[i] || null, bh.battle_details[i] || null, bh.degreerank[i] || null, bh.job[i] || null,
                        bh.fronten[i] || null, bh.battleen[i] || null, bh.battle_medalen[i] || null, bh.battle_detailsen[i] || null,
                        bh.degreeranken[i] || null, bh.joben[i] || null, bh.frontru[i] || null, bh.battleru[i] || null,
                        bh.battle_medalru[i] || null, bh.battle_detailsru[i] || null, bh.degreerankru[i] || null, bh.jobru[i] || null
                    ]);
                }
            }

// STEP D: HANDLE MULTIMEDIA
console.log('--- STARTING MULTIMEDIA SAVE ---');

// 1. Extract all arrays from the form
const rawDesc = req.body['m_description[]'] || req.body.m_description || [];
const rawTypes = req.body['m_type[]'] || req.body.m_type || [];
const rawLocs = req.body['physical_logical_location[]'] || req.body.physical_logical_location || [];

const descArr = [].concat(rawDesc);
const typeArr = [].concat(rawTypes);
const locArr = [].concat(rawLocs);
const mFiles = (req.files && req.files['m_files[]']) ? [].concat(req.files['m_files[]']) : [];

// 2. Loop based on the number of rows submitted
const maxRows = Math.max(descArr.length, typeArr.length);

for (let i = 0; i < maxRows; i++) {
    let finalDbPath = null;
    let currentType = (typeArr[i] || '').toString().trim();
    let userLocation = (locArr[i] || '').trim();
    let finalLocation = '';

    // LOGIC: Set hardcoded string for Files, or use user input for URLs
    if (
        currentType.includes('PDF') || 
        currentType.includes('JPG') || 
        currentType.includes('תמונה') || 
        currentType.includes('מסמך')
    ) {
       finalLocation = 'מחיצת קבצים לקישור';
                } else if (currentType === 'קישור') {
                    // ⭐ SPECIFIC CONDITION FOR "קישור"
                    finalLocation = 'URL';
                } else {
                    finalLocation = userLocation || 'URL'; 
                }

    // 3. Handle File Upload if it exists for this row
   // 3. Handle File Upload if it exists for this row
if (mFiles[i]) {
    const file = mFiles[i];

    // FIX: Convert filename from latin1 to utf8 to support Hebrew/Russian correctly
    const decodedFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    
    // Use the decoded name (Date prefix is already gone)
    const uniqueFileName = decodedFileName; 
    
    const soldierFolder = `A${soldierId}`;
    const targetDir = path.join(__dirname, 'public', 'pages', 'soldierUploads', soldierFolder);
    
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const finalPath = path.join(targetDir, uniqueFileName);
    
    // Move the file from the temp directory to the soldier's folder
    fs.renameSync(file.path, finalPath);
    
    // This is the clean path that goes into the DB
    finalDbPath = `/pages/soldierUploads/${soldierFolder}/${uniqueFileName}`;
}
    // 4. Save to Database
    // We save if there is a file path OR a user-provided URL/Location
    if (finalDbPath || userLocation || descArr[i]) {
        const dbPathToSave = finalDbPath || userLocation || '';

        await t.none(`
            INSERT INTO "multimedia_TBL" 
            (soldier_id, file_description, file_path, multimedia_type, physical_logical_location, is_profile_pic, uploaded_date)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
            soldierId, 
            descArr[i] || 'No Description', 
            dbPathToSave, 
            currentType,
            finalLocation,
            (i === 0 && finalDbPath !== null) // Auto-set first uploaded file as profile pic
        ]);
    }
}
        });

        res.redirect('/?saved=true');

    } catch (err) {
        console.error('❌ Error saving record:', err);
        res.status(500).send(`
            <h1>Error Saving Record</h1>
            <p>${err.message}</p>
            <pre>${err.stack}</pre>
            <a href="/addFULL">Back to Form</a>
        `);
    }
});

// Route to display the soldier list from soldierdetails
app.get('/soldierlistSoldier', async (req, res) => {
  try {
    console.log(`Fetching soldiers from ${SOLDIER_TABLE}`);
    
    // Test database connection
    const testConnection = await db.one('SELECT 1 as connected');
    console.log('Database connection test:', testConnection);
    
    // List all tables to verify soldierdetails exists
    const tables = await db.any(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Available tables:', tables);
    
    // Fetch soldiers
    const soldiers = await db.any(`SELECT * FROM ${SOLDIER_TABLE}`);
    console.log(`Retrieved ${soldiers.length} soldiers from database`);
    
    // Use text dates directly
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob || 'N/A',
      dod: soldier.dod || 'N/A',
      aliyadate: soldier.aliyadate || 'N/A'
    }));

    console.log('Soldiers formatted, rendering view'); 
    res.render('soldierlistSoldier', { soldiers: formattedSoldiers });
  } catch (err) {
    console.error('Error fetching soldiers:', err);
    res.status(500).send(`
      <h1>Server Error</h1>
      <p>Failed to fetch soldiers:</p>
      <p>${err.message}</p>
      <pre>${err.stack || 'No stack trace available'}</pre>
      <a href="/">Return to home</a>
    `);
  }
});

// Route to display the full soldier list from soldierdetails
app.get('/soldierlistFULL', async (req, res) => {
  try {
    const soldiers = await db.any(`SELECT * FROM ${SOLDIER_TABLE}`);

    // Sort soldiers by last name and then by first name
    soldiers.sort((a, b) => {
      const lnameA = a.lname || '';
      const lnameB = b.lname || '';
      const fnameA = a.fname || '';
      const fnameB = b.fname || '';
      return lnameA === lnameB ? fnameA.localeCompare(fnameB) : lnameA.localeCompare(lnameB);
    });

    // Use text dates directly
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob || 'N/A',
      dod: soldier.dod || 'N/A',
      aliyadate: soldier.aliyadate || 'N/A'
    }));

    console.log('Soldiers fetched:', formattedSoldiers);
    res.render('soldierlistFULL', { soldiers: formattedSoldiers });
  } catch (err) {
    console.error('Error fetching soldiers:', err);
    res.status(500).send(`
      <h1>Server Error at soldierlistFULL</h1>
      <p>Message: ${err.message}</p>
      <pre>${err.stack}</pre>
    `);
  }
});
// ✅ Show soldier detail + battle form
app.get('/soldiers/:id/battles', async (req, res) => {
  const { id } = req.params;
  try {
    const soldierResult = await db.one('SELECT * FROM soldierdetails WHERE id = $1', [id]);
    const battlesResult = await db.manyOrNone(
      'SELECT * FROM soldier_battle_history WHERE soldier_id = $1 ORDER BY id',
      [id]
    );

    res.render('battles', {
      soldier: soldierResult,
      existingBattles: battlesResult,
      locale: 'en',
      __: (key) => key, // simple placeholder
    });
  } catch (err) {
    if (err.name === 'QueryResultError' && err.code === 0) {
      return res.status(404).send('Soldier not found');
    }
    console.error('Error fetching battles:', err);
    res.status(500).send('Server error');
  }
});

// ✅ Add multiple battles
app.post('/soldiers/:id/battles', async (req, res) => {
  const { id } = req.params;
  const { battleyeararray, front, battle, battle_medal, battle_details, degreerank, job } = req.body;

  if (!Array.isArray(battleyeararray)) {
    return res.status(400).send('Invalid form submission');
  }

  try {
    await db.tx(async t => {
      for (let i = 0; i < battleyeararray.length; i++) {
        if (!battleyeararray[i] && !front[i] && !battle[i]) continue;

        const yearText = battleyeararray[i] || null; // Store as text

        await t.none(
          `INSERT INTO soldier_battle_history
           (soldier_id, year, front, battle, medal, details, degreerank, job)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            yearText,
            front[i] || null,
            battle[i] || null,
            battle_medal[i] || null,
            battle_details[i] || null,
            degreerank[i] || null,
            job[i] || null
          ]
        );
      }
    });

    res.redirect(`/soldiers/${id}/battles`);
  } catch (err) {
    console.error('Error inserting battles:', err);
    res.status(500).send('Server error');
  }
});

// ✅ Update battle
app.put('/battles/:battleId', async (req, res) => {
  const { battleId } = req.params;
  let { year, front, battle, medal, details, degreerank, job } = req.body;

  try {
    // Keep year as text
    const yearText = year && year.trim() !== '' ? year : null;

    front = front && front.trim() !== '' ? front : null;
    battle = battle && battle.trim() !== '' ? battle : null;
    medal = medal && medal.trim() !== '' ? medal : null;
    details = details && details.trim() !== '' ? details : null;
    degreerank = degreerank && degreerank.trim() !== '' ? degreerank : null;
    job = job && job.trim() !== '' ? job : null;

    await db.none(
      `UPDATE soldier_battle_history
       SET year = $1, front = $2, battle = $3, medal = $4, details = $5, degreerank = $6, job = $7, updated_at = NOW()
       WHERE id = $8`,
      [yearText, front, battle, medal, details, degreerank, job, battleId]
    );

    res.redirect('back');
  } catch (err) {
    console.error('Error updating battle:', err);
    res.status(500).send('Server error');
  }
});

// ✅ Delete battle
app.delete('/battles/:battleId', async (req, res) => {
  const { battleId } = req.params;
  try {
    await db.none('DELETE FROM soldier_battle_history WHERE id = $1', [battleId]);
    res.redirect('back');
  } catch (err) {
    console.error('Error deleting battle:', err);
    res.status(500).send('Server error');
  }
});

// ✅ Add new battle
app.post('/addNewBattle', async (req, res) => {
  let { year, front, battle, medal, details, degreerank, job } = req.body;
  console.log('New battle data:', req.body);

  try {
    if (!battle || battle.trim() === '') {
      return res.status(400).send('Battle name is required.');
    }

    const yearText = year && year.trim() !== '' ? year : null;
    front = front && front.trim() !== '' ? front : null;
    battle = battle.trim();
    medal = medal && medal.trim() !== '' ? medal : null;
    details = details && details.trim() !== '' ? details : null;
    degreerank = degreerank && degreerank.trim() !== '' ? degreerank : null;
    job = job && job.trim() !== '' ? job : null;

    await db.none(
      `INSERT INTO battle_TBL (year, front, battle, medal, details, degreerank, job)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [yearText, front, battle, medal, details, degreerank, job]
    );

    res.redirect('/addFull?battleAdded=true');
  } catch (err) {
    console.error('Error adding new battle:', err);
    res.status(500).send(`
      <h1>Error</h1>
      <p>Could not add new battle.</p>
      <pre>${err.message}</pre>
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
      dob: soldier.dob || 'N/A',
      dod: soldier.dod || 'N/A',
      aliyadate: soldier.aliyadate || 'N/A',
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

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    
    query += ` ORDER BY id DESC`;

    const soldiers = await db.any(query, values);

    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob || 'N/A',
      dod: soldier.dod || 'N/A',
      aliyadate: soldier.aliyadate || 'N/A',
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
  } catch (err) {
    console.error('Error fetching search results:', err);
    res.status(500).send('Server error at searchResults');
  }
});
// Route to show the form for updating a soldier
app.get('/updateSoldier/:id', async (req, res) => {
  const { id } = req.params;
  // 1. FIX: Define locale first
  const locale = req.query.lang || req.cookies.lang || 'he'; 
  
  console.log('Get /updateSoldier/:id hit for ID:', id);

  const langMap = {
    'he': 'title_heb',
    'en': 'title_eng',
    'ru': 'title_rus'
  };
  const sortCol = langMap[locale] || 'title_heb';

  try {
    const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!soldier) return res.status(404).send('Soldier not found');

    const fetchOrdered = (table) => 
      db.any(`SELECT id, title_heb, title_eng, title_rus FROM "${table}" ORDER BY $(col:name) DESC`, { col: sortCol });

    // 2. FIX: Include medals and mTypes in the parallel fetch
    const [
      countries, gender, corps, category, army, 
      resistance, partizan, participation, enlistreason,
      multimediaList, battleHistory,
      medals, mTypes // Added back here
    ] = await Promise.all([
      fetchOrdered('countries_TBL'),
      fetchOrdered('gender_TBL'),
      fetchOrdered('corps_TBL'),
      fetchOrdered('category_TBL'),
      fetchOrdered('army_TBL'),
      fetchOrdered('resistance_TBL'),
      fetchOrdered('partizan_TBL'),
      fetchOrdered('participation_TBL'),
      fetchOrdered('enlistreason_TBL'),
      db.any('SELECT * FROM "multimedia_TBL" WHERE soldier_id = $1', [id]),
      db.any('SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id', [id]),
      // 3. FIX: Keep these as they were (no dynamic lang sorting)
      db.any('SELECT id, title FROM "medals_TBL"'),
      db.any('SELECT * FROM "multimedia_type_TBL" ORDER BY id')
    ]);
    // --- BUBBLE UP BY ID 0 ---
    const unknownIndex = countries.findIndex(c => Number(c.id) === 0);

    if (unknownIndex > 0) { 
        const [unknownItem] = countries.splice(unknownIndex, 1);
        countries.unshift(unknownItem);
    }
    // -------------------------
    res.render('updateSoldier', {
      soldier,
      countries,
      gender,
      medals,
      corps,
      category,
      army,
      resistance,
      partizan,
      participation,
      battleHistory,
      enlistreason,
      multimedia_type_TBL: mTypes,
      multimedia: multimediaList,
      locale, // Added: your EJS needs this to pick the right column to show
      req    // Added: usually helpful for path/query checks in EJS
    });
  } catch (err) {
    console.error('Error rendering update form:', err);
    res.status(500).send('Server error');
  }
});
// Route to handle form submission for updating a soldier

app.post('/updateSoldier/:id', multiUpload, async (req, res) => {
  const soldierId = req.params.id; 
    const { id } = req.params;
    const adminemail = req.body.adminemail || req.query.adminemail;

    try {
        const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!existingSoldier) return res.status(404).send('Soldier not found');
      // --- NEW LOOKUP LOGIC FOR COUNTRY ---
    let birthcountry = existingSoldier.birthcountry;
    let birthcountryen = existingSoldier.birthcountryen;
    let birthcountryru = existingSoldier.birthcountryru;

    const selectedCountryId = req.body.birthcountry; // This comes from the <select> value

    if (selectedCountryId) {
      // Fetch the full row from the countries table
      const countryRow = await db.oneOrNone(
        'SELECT title_heb, title_eng, title_rus FROM "countries_TBL" WHERE id = $1', 
        [selectedCountryId]
      );

      if (countryRow) {
        birthcountry = countryRow.title_heb;
        birthcountryen = countryRow.title_eng;
        birthcountryru = countryRow.title_rus;
      }
    }
    // ------------------------------------
    // --- CORPS LOOKUP ---
let corps = existingSoldier.corps;
let corpsen = existingSoldier.corpsen;
let corpsru = existingSoldier.corpsru;

if (req.body.corps) {
  const corpsRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "corps_TBL" WHERE id = $1', 
    [req.body.corps]
  );
  if (corpsRow) {
    corps = corpsRow.title_heb;
    corpsen = corpsRow.title_eng;
    corpsru = corpsRow.title_rus;
  }
}

// --- PARTIZAN LOOKUP ---
let partizan = existingSoldier.partizan;
let partizanen = existingSoldier.partizanen;
let partizanru = existingSoldier.partizanru;

if (req.body.partizan) {
  const partizanRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "partizan_TBL" WHERE id = $1', 
    [req.body.partizan]
  );
  if (partizanRow) {
    partizan = partizanRow.title_heb;
    partizanen = partizanRow.title_eng;
    partizanru = partizanRow.title_rus;
  }
}

// --- CATEGORY LOOKUP ---
let category = existingSoldier.category;
let categoryen = existingSoldier.categoryen;
let categoryru = existingSoldier.categoryru;

if (req.body.category) {
  const categoryRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "category_TBL" WHERE id = $1', 
    [req.body.category]
  );
  if (categoryRow) {
    category = categoryRow.title_heb;
    categoryen = categoryRow.title_eng;
    categoryru = categoryRow.title_rus;
  }
}

// --- ARMY LOOKUP ---
let army = existingSoldier.army;
let armyen = existingSoldier.armyen;
let armyru = existingSoldier.armyru;

if (req.body.army) {
  const armyRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "army_TBL" WHERE id = $1', 
    [req.body.army]
  );
  if (armyRow) {
    army = armyRow.title_heb;
    armyen = armyRow.title_eng;
    armyru = armyRow.title_rus;
  }
}

// --- RESISTANCE LOOKUP ---
let resistance = existingSoldier.resistance;
let resistanceen = existingSoldier.resistanceen;
let resistanceru = existingSoldier.resistanceru;

if (req.body.resistance) {
  const resRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "resistance_TBL" WHERE id = $1', 
    [req.body.resistance]
  );
  if (resRow) {
    resistance = resRow.title_heb;
    resistanceen = resRow.title_eng;
    resistanceru = resRow.title_rus;
  }
}

// --- PARTICIPATION LOOKUP ---
let participation = existingSoldier.participation;
let participationen = existingSoldier.participationen;
let participationru = existingSoldier.participationru;

if (req.body.participation) {
  const partRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "participation_TBL" WHERE id = $1', 
    [req.body.participation]
  );
  if (partRow) {
    participation = partRow.title_heb;
    participationen = partRow.title_eng;
    participationru = partRow.title_rus;
  }
}
// --- GENDER LOOKUP ---
let gender = existingSoldier.gender;
let genderen = existingSoldier.genderen;
let genderru = existingSoldier.genderru;

if (req.body.gender) {
  const genderRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "gender_TBL" WHERE id = $1', 
    [req.body.gender]
  );
  if (genderRow) {
    gender = genderRow.title_heb;
    genderen = genderRow.title_eng;
    genderru = genderRow.title_rus;
  }
}
// --- ENLIST REASON LOOKUP ---
let enlistreason = existingSoldier.enlistreason;
let enlistreasonen = existingSoldier.enlistreasonen;
let enlistreasonru = existingSoldier.enlistreasonru;

if (req.body.enlistreason) {
  const enlistRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "enlistreason_TBL" WHERE id = $1', 
    [req.body.enlistreason]
  );
  if (enlistRow) {
    enlistreason = enlistRow.title_heb;
    enlistreasonen = enlistRow.title_eng;
    enlistreasonru = enlistRow.title_rus;
  }
}
        // Extract array fields
        const {
            battleId = [], battleyear = [], front = [], fronten = [], frontru = [],
            battle = [], battleen = [], battleru = [], battle_medal = [],
            battle_medalen = [], battle_medalru = [], battle_details = [],
            battle_detailsen = [], battle_detailsru = [], degreerank = [],
            degreeranken = [], degreerankru = [], job = [], joben = [], jobru = []
        } = req.body;

     //Record complete date
    // Boolean fields
    // 1. Capture the form input
const isCheckingComplete = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
const uprising_participant = req.body.uprising_participant === 'true' || req.body.uprising_participant === 'on';

// 2. Use LET so these variables can be updated
let record_complete_boolean = existingSoldier.recordcomplete; 
let record_complete_date = existingSoldier.record_complete_date;

// 3. Update if the user checked the box
if (isCheckingComplete) {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    
    // Set format to dd-mm-yyyy
    record_complete_date = `${dd}-${mm}-${yyyy}`;
    
    // Use actual boolean true, not the string 'true'
    record_complete_boolean = true; 
}
    

       // Main input object
         const inputData = {
      fname: req.body.fname || existingSoldier.fname,
      fnameen: req.body.fnameen || existingSoldier.fnameen,
      fnameru: req.body.fnameru || existingSoldier.fnameru,
      lname: req.body.lname || existingSoldier.lname,
      lnameen: req.body.lnameen || existingSoldier.lnameen,
      lnameru: req.body.lnameru || existingSoldier.lnameru,
      previouslname: req.body.previouslname || existingSoldier.previouslname,
      previouslnameen: req.body.previouslnameen || existingSoldier.previouslnameen,
      previouslnameru: req.body.previouslnameru || existingSoldier.previouslnameru,
      fathername: req.body.fathername || existingSoldier.fathername,
      fathernameen: req.body.fathernameen || existingSoldier.fathernameen,
      fathernameru: req.body.fathernameru || existingSoldier.fathernameru,
      mothername: req.body.mothername || existingSoldier.mothername,
      mothernameen: req.body.mothernameen || existingSoldier.mothernameen,
      mothernameru: req.body.mothernameru || existingSoldier.mothernameru,
      calledby: req.body.calledby || existingSoldier.calledby,
      calledbyen: req.body.calledbyen || existingSoldier.calledbyen,
      calledbyru: req.body.calledbyru || existingSoldier.calledbyru,
      //birthcountry: req.body.birthcountry || existingSoldier.birthcountry,
      birthcountry,
      birthcountryen,
      birthcountryru,
        
      birthcity: req.body.birthcity || existingSoldier.birthcity,
      birthcityen: req.body.birthcityen || existingSoldier.birthcityen,
      birthcityru: req.body.birthcityru || existingSoldier.birthcityru,
      state: req.body.state || existingSoldier.state,
      stateen: req.body.stateen || existingSoldier.stateen,
      stateru: req.body.stateru || existingSoldier.stateru,
      gender, genderen, genderru,
      placeofdeath: req.body.placeofdeath || existingSoldier.placeofdeath,
      placeofdeathen: req.body.placeofdeathen || existingSoldier.placeofdeathen,
      placeofdeathru: req.body.placeofdeathru || existingSoldier.placeofdeathru,
      deathdetails: req.body.deathdetails || existingSoldier.deathdetails,
      deathdetailsen: req.body.deathdetailsen || existingSoldier.deathdetailsen,
      deathdetailsru: req.body.deathdetailsru || existingSoldier.deathdetailsru,
      biography: req.body.biography || existingSoldier.biography,
      
      otherparticipation: req.body.otherparticipation || existingSoldier.otherparticipation,
      otherparticipationen: req.body.otherparticipationen || existingSoldier.otherparticipationen,
      otherparticipationru: req.body.otherparticipationru || existingSoldier.otherparticipationru,
      otherdecoration: req.body.otherdecoration || existingSoldier.otherdecoration,
      otherdecorationen: req.body.otherdecorationen || existingSoldier.otherdecorationen,
      otherdecorationru: req.body.otherdecorationru || existingSoldier.otherdecorationru,
      fightingdesc: req.body.fightingdesc || existingSoldier.fightingdesc,
      shortdesc: req.body.shortdesc || existingSoldier.shortdesc,
      armyrole: req.body.armyrole || existingSoldier.armyrole,
      armyroleen: req.body.armyroleen || existingSoldier.armyroleen,
      armyroleru: req.body.armyroleru || existingSoldier.armyroleru,
      rank: req.body.rank || existingSoldier.rank,
      ranken: req.body.ranken || existingSoldier.ranken,
      rankru: req.body.rankru || existingSoldier.ranknru,
      
      enlistreason, enlistreasonen, enlistreasonru,
      platoonname: req.body.platoonname || existingSoldier.platoonname,
      platoonnameen: req.body.platoonnameen || existingSoldier.platoonnameen,
      platoonnameru: req.body.platoonnameru || existingSoldier.platoonnameru,
      wounddetails: req.body.wounddetails || existingSoldier.wounddetails,
      wounddetailsen: req.body.wounddetailsen || existingSoldier.wounddetailsen,
      wounddetailsru: req.body.wounddetailsru || existingSoldier.wounddetailsru,
      gettodesc: req.body.gettodesc || existingSoldier.gettodesc,
      gettodescen: req.body.gettodescen || existingSoldier.gettodescen,
      gettodescru: req.body.gettodescru || existingSoldier.gettodescru,
      otherfightingcontext: req.body.otherfightingcontext || existingSoldier.otherfightingcontext,
      otherfightingcontexten: req.body.otherfightingcontexten || existingSoldier.otherfightingcontexten,
      otherfightingcontextru: req.body.otherfightingcontextru || existingSoldier.otherfightingcontextru,
      armyid: req.body.armyid || existingSoldier.armyid,
     
      dob: req.body.dob || existingSoldier.dob,
      dod: req.body.dod || existingSoldier.dod,
      aliyadate: req.body.aliyadate || existingSoldier.aliyadate,
      
      title: req.body.title || existingSoldier.title,
      titleen: req.body.titleen || existingSoldier.titleen,
      titleru: req.body.titleru || existingSoldier.titleru,
      linkurl: req.body.linkurl || existingSoldier.linkurl,
      useremail: req.body.useremail && req.body.useremail.trim() !== '' ? req.body.useremail : existingSoldier.useremail,
      corps, corpsen, corpsru,
      partizan, partizanen, partizanru,
      category, categoryen, categoryru,
      army, armyen, armyru,
      resistance, resistanceen, resistanceru,
      participation, participationen, participationru,  
      recordcomplete: record_complete_boolean,
      
      record_complete_date,
      uprising_participant: req.body.uprising_participant === 'on' || existingSoldier.uprising_participant

    };

        const updates = [];
        const values = [];
        let i = 1;

        const dateFields = [
            'dob', 'dod', 'aliyadate', 
            'record_complete_date', 'admin_approved_date', 'downloaded_date'
        ];

        for (const key in inputData) {
            let newValue = inputData[key] === '' ? null : inputData[key];
            let oldValue = existingSoldier[key] === '' ? null : existingSoldier[key];

            let same;
            if (dateFields.includes(key)) {
                same = normalizeDateToDDMMYYYY(newValue) === normalizeDateToDDMMYYYY(oldValue);
            } else if (typeof newValue === 'boolean') {
                same = newValue === oldValue;
            } else {
                same = String(newValue) === String(oldValue);
            }

            if (!same) {
                updates.push(`"${key}" = $${i}`);
                values.push(newValue);
                i++;
            }
        }

        await db.tx(async t => {
            if (updates.length > 0) {
                const updateSQL = `UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`;
                values.push(id);
                await t.none(updateSQL, values);
            }

            // --- Battle History ---
            for (let j = 0; j < battleyear.length; j++) {
                const hasContent =
                    (battleyear[j] && battleyear[j].trim() !== '') ||
                    (front[j] && front[j].trim() !== '') ||
                    (battle[j] && battle[j].trim() !== '');

                if (hasContent) {
                    if (battleId[j]) {
                        await t.none(
                            `UPDATE soldier_battle_history
                             SET battleyear=$1,
                                 front=$2, fronten=$3, frontru=$4,
                                 battle=$5, battleen=$6, battleru=$7,
                                 medal=$8, medalen=$9, medalru=$10,
                                 details=$11, detailsen=$12, detailsru=$13,
                                 degreerank=$14, degreeranken=$15, degreerankru=$16,
                                 job=$17, joben=$18, jobru=$19,
                                 updated_at=NOW()
                             WHERE id=$20 AND soldier_id=$21`,
                            [
                                battleyear[j] || null,
                                front[j] || null, fronten[j] || null, frontru[j] || null,
                                battle[j] || null, battleen[j] || null, battleru[j] || null,
                                battle_medal[j] || null, battle_medalen[j] || null, battle_medalru[j] || null,
                                battle_details[j] || null, battle_detailsen[j] || null, battle_detailsru[j] || null,
                                degreerank[j] || null, degreeranken[j] || null, degreerankru[j] || null,
                                job[j] || null, joben[j] || null, jobru[j] || null,
                                battleId[j], id
                            ]
                        );
                    } else {
                        await t.none(
                            `INSERT INTO soldier_battle_history (
                                 soldier_id, battleyear,
                                 front, fronten, frontru,
                                 battle, battleen, battleru,
                                 medal, medalen, medalru,
                                 details, detailsen, detailsru,
                                 degreerank, degreeranken, degreerankru,
                                 job, joben, jobru
                               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
                            [
                                id,
                                battleyear[j] || null,
                                front[j] || null, fronten[j] || null, frontru[j] || null,
                                battle[j] || null, battleen[j] || null, battleru[j] || null,
                                battle_medal[j] || null, battle_medalen[j] || null, battle_medalru[j] || null,
                                battle_details[j] || null, battle_detailsen[j] || null, battle_detailsru[j] || null,
                                degreerank[j] || null, degreeranken[j] || null, degreerankru[j] || null,
                                job[j] || null, joben[j] || null, jobru[j] || null
                            ]
                        );
                    }
                }
            }

            // STEP D: HANDLE MULTIMEDIA
console.log('--- DIAGNOSTIC: FULL BODY KEYS ---', Object.keys(req.body));

// This helper finds the field whether it's named "m_description[]" or "m_description"
const getField = (name) => {
    return req.body[name + '[]'] || req.body[name] || [];
};

const descArr = [].concat(getField('m_description'));
const typeArr = [].concat(getField('m_type'));
const locArr  = [].concat(getField('physical_logical_location'));
const mFiles  = (req.files && req.files['m_files[]']) ? req.files['m_files[]'] : [];

console.log(`Verified Data: Descs=${descArr.length}, Files=${mFiles.length}, Types=${typeArr.length}`);
// 1. Check if the soldier ALREADY has a profile picture in the database
const existingProfilePic = await t.oneOrNone(
    'SELECT id FROM "multimedia_TBL" WHERE soldier_id = $1 AND is_profile_pic = true LIMIT 1',
    [soldierId]
);

// 2. Decide the profile pic rule
// If they have one, all new uploads are false. 
// If they don't have one, only the first new file becomes true.
const hasProfilePic = !!existingProfilePic;

const maxRows = Math.max(descArr.length, mFiles.length);

for (let i = 0; i < maxRows; i++) {
    let finalDbPath = null;
    
    if (mFiles[i]) {
        const file = mFiles[i];

        // 1. FIX ENCODING: Convert filename from latin1 to utf8 for Hebrew/Russian
        const decodedFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        
        // 2. REMOVE DATE: We just use the decoded name directly
        const uniqueFileName = decodedFileName;

        const targetDir = path.join(__dirname, 'public', 'pages', 'soldierUploads', `A${soldierId}`);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const finalPath = path.join(targetDir, uniqueFileName);
        
        // Move file from temp to final destination
        fs.renameSync(file.path, finalPath);
        
        // This clean string is what goes into PostgreSQL
        finalDbPath = `/pages/soldierUploads/A${soldierId}/${uniqueFileName}`;
    }

    if (finalDbPath || descArr[i]) {
        // Only set to true if it's the first row AND the soldier doesn't have one yet
        const setToProfile = (!hasProfilePic && i === 0 && finalDbPath !== null);

        await t.none(`
            INSERT INTO "multimedia_TBL" 
            (soldier_id, file_description, file_path, multimedia_type, is_profile_pic, uploaded_date)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
            soldierId, 
            descArr[i] || 'No Description', 
            finalDbPath, 
            typeArr[i] || null,
            setToProfile
        ]);
    }
}
        });

        
   
    // Redirect to index with success message
    res.redirect('/?saved=true');

  } catch (err) {
    console.error('❌ Error updating record:', err);
    res.status(500).send(`
      <h1>Error</h1>
      <p>${err.message}</p>
      <pre>${err.stack}</pre>
      <a href="/updateSoldier/${id}">Back to form</a>
    `);
  }
});


// --- GET /admin/completedRecords ---
app.get('/admin/completedRecords', async (req, res) => {
    const adminemail = req.query.adminemail;
    const saved = req.query.saved === 'true';

    if (!adminemail) {
        return res.redirect(`/admin/completedRecords?adminemail=admin@ww2jewishsoldiers.com`);
    }

    try {
        const soldiers = await db.any(
            `SELECT * FROM ${SOLDIER_TABLE} 
             WHERE recordcomplete = TRUE 
             ORDER BY id DESC`
        );

        const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL"');
        const gender = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "gender_TBL"');
        const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
        const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL"');
        const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL"');
        const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL"');
        const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL"');
        const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL"');
        const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL"');
        const enlistreason = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "enlistreason_TBL"');
        
        // ❗ NO DATE CONVERSION — database now stores formatted text already
        const formattedSoldiers = soldiers.map(s => ({
            ...s,
            dob: s.dob || 'N/A',
            dod: s.dod || 'N/A',
            aliyadate: s.aliyadate || 'N/A',
            
            admin_approved_date: s.admin_approved_date || 'N/A',
            downloaded_date: s.downloaded_date || 'N/A',
            record_complete_date: s.record_complete_date || 'N/A'
        }));

        res.render('completedRecords', {
            soldiers: formattedSoldiers,
            countries,
            gender,
            medals,
            corps,
            category,
            army,
            resistance,
            partizan,
            participation,
            enlistreason,
            //uploadedFiles, await db.any('SELECT * FROM uploaded_files WHERE soldier_id = $1', [id]) || [],
            adminemail,
            saved
        });

    } catch (err) {
        console.error('Error rendering completed records list:', err);
        res.status(500).send('Server error');
    }
});


// --- POST /adminUpdateSoldier/:id ---
app.post('/adminUpdateSoldier/:id', multiUpload, async (req, res) => {
    const soldierId = req.params.id; 
    const { id } = req.params;
    const adminemail = req.body.adminemail || req.query.adminemail;

    try {
        const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!existingSoldier) return res.status(404).send('Soldier not found');
      // --- NEW LOOKUP LOGIC FOR COUNTRY ---
    let birthcountry = existingSoldier.birthcountry;
    let birthcountryen = existingSoldier.birthcountryen;
    let birthcountryru = existingSoldier.birthcountryru;

    const selectedCountryId = req.body.birthcountry; // This comes from the <select> value

    if (selectedCountryId) {
      // Fetch the full row from the countries table
      const countryRow = await db.oneOrNone(
        'SELECT title_heb, title_eng, title_rus FROM "countries_TBL" WHERE id = $1', 
        [selectedCountryId]
      );

      if (countryRow) {
        birthcountry = countryRow.title_heb;
        birthcountryen = countryRow.title_eng;
        birthcountryru = countryRow.title_rus;
      }
    }
    // ------------------------------------
    // --- CORPS LOOKUP ---
let corps = existingSoldier.corps;
let corpsen = existingSoldier.corpsen;
let corpsru = existingSoldier.corpsru;

if (req.body.corps) {
  const corpsRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "corps_TBL" WHERE id = $1', 
    [req.body.corps]
  );
  if (corpsRow) {
    corps = corpsRow.title_heb;
    corpsen = corpsRow.title_eng;
    corpsru = corpsRow.title_rus;
  }
}

// --- PARTIZAN LOOKUP ---
let partizan = existingSoldier.partizan;
let partizanen = existingSoldier.partizanen;
let partizanru = existingSoldier.partizanru;

if (req.body.partizan) {
  const partizanRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "partizan_TBL" WHERE id = $1', 
    [req.body.partizan]
  );
  if (partizanRow) {
    partizan = partizanRow.title_heb;
    partizanen = partizanRow.title_eng;
    partizanru = partizanRow.title_rus;
  }
}

// --- CATEGORY LOOKUP ---
let category = existingSoldier.category;
let categoryen = existingSoldier.categoryen;
let categoryru = existingSoldier.categoryru;

if (req.body.category) {
  const categoryRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "category_TBL" WHERE id = $1', 
    [req.body.category]
  );
  if (categoryRow) {
    category = categoryRow.title_heb;
    categoryen = categoryRow.title_eng;
    categoryru = categoryRow.title_rus;
  }
}

// --- ARMY LOOKUP ---
let army = existingSoldier.army;
let armyen = existingSoldier.armyen;
let armyru = existingSoldier.armyru;

if (req.body.army) {
  const armyRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "army_TBL" WHERE id = $1', 
    [req.body.army]
  );
  if (armyRow) {
    army = armyRow.title_heb;
    armyen = armyRow.title_eng;
    armyru = armyRow.title_rus;
  }
}

// --- RESISTANCE LOOKUP ---
let resistance = existingSoldier.resistance;
let resistanceen = existingSoldier.resistanceen;
let resistanceru = existingSoldier.resistanceru;

if (req.body.resistance) {
  const resRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "resistance_TBL" WHERE id = $1', 
    [req.body.resistance]
  );
  if (resRow) {
    resistance = resRow.title_heb;
    resistanceen = resRow.title_eng;
    resistanceru = resRow.title_rus;
  }
}

// --- PARTICIPATION LOOKUP ---
let participation = existingSoldier.participation;
let participationen = existingSoldier.participationen;
let participationru = existingSoldier.participationru;

if (req.body.participation) {
  const partRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "participation_TBL" WHERE id = $1', 
    [req.body.participation]
  );
  if (partRow) {
    participation = partRow.title_heb;
    participationen = partRow.title_eng;
    participationru = partRow.title_rus;
  }
}
// --- GENDER LOOKUP ---
let gender = existingSoldier.gender;
let genderen = existingSoldier.genderen;
let genderru = existingSoldier.genderru;

if (req.body.gender) {
  const genderRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "gender_TBL" WHERE id = $1', 
    [req.body.gender]
  );
  if (genderRow) {
    gender = genderRow.title_heb;
    genderen = genderRow.title_eng;
    genderru = genderRow.title_rus;
  }
}
// --- ENLIST REASON LOOKUP ---
let enlistreason = existingSoldier.enlistreason;
let enlistreasonen = existingSoldier.enlistreasonen;
let enlistreasonru = existingSoldier.enlistreasonru;

if (req.body.enlistreason) {
  const enlistRow = await db.oneOrNone(
    'SELECT title_heb, title_eng, title_rus FROM "enlistreason_TBL" WHERE id = $1', 
    [req.body.enlistreason]
  );
  if (enlistRow) {
    enlistreason = enlistRow.title_heb;
    enlistreasonen = enlistRow.title_eng;
    enlistreasonru = enlistRow.title_rus;
  }
}
        // Extract array fields
        const {
            battleId = [], battleyear = [], front = [], fronten = [], frontru = [],
            battle = [], battleen = [], battleru = [], battle_medal = [],
            battle_medalen = [], battle_medalru = [], battle_details = [],
            battle_detailsen = [], battle_detailsru = [], degreerank = [],
            degreeranken = [], degreerankru = [], job = [], joben = [], jobru = []
        } = req.body;

// --- ADMIN READY FOR DOWNLOAD (boolean) ---
const admin_ready_for_download = 
  Array.isArray(req.body.admin_ready_for_download)
    ? req.body.admin_ready_for_download.includes('true') || req.body.admin_ready_for_download.includes('on')
    : req.body.admin_ready_for_download === 'true' || req.body.admin_ready_for_download === 'on';

// --- ADMIN APPROVED DATE (stored as TEXT “DD/MM/YYYY”) ---
let admin_approved_date = existingSoldier.admin_approved_date || null;

if (admin_ready_for_download && !existingSoldier.admin_ready_for_download) {
  admin_approved_date = formatDateToDDMMYYYY(new Date());
} 

// Always retain previous value
const record_complete_boolean = existingSoldier.recordcomplete;
const record_complete_date = existingSoldier.record_complete_date;

// --- DOWNLOADED DATE ---
let downloaded_date = existingSoldier.downloaded_date;

if (req.body.downloaded_date) {
    downloaded_date = formatDateToDDMMYYYY(
        new Date(req.body.downloaded_date)   // IMPORTANT FIX
    );
}

        // Main input object
         const inputData = {
      fname: req.body.fname || existingSoldier.fname,
      fnameen: req.body.fnameen || existingSoldier.fnameen,
      fnameru: req.body.fnameru || existingSoldier.fnameru,
      lname: req.body.lname || existingSoldier.lname,
      lnameen: req.body.lnameen || existingSoldier.lnameen,
      lnameru: req.body.lnameru || existingSoldier.lnameru,
      previouslname: req.body.previouslname || existingSoldier.previouslname,
      previouslnameen: req.body.previouslnameen || existingSoldier.previouslnameen,
      previouslnameru: req.body.previouslnameru || existingSoldier.previouslnameru,
      fathername: req.body.fathername || existingSoldier.fathername,
      fathernameen: req.body.fathernameen || existingSoldier.fathernameen,
      fathernameru: req.body.fathernameru || existingSoldier.fathernameru,
      mothername: req.body.mothername || existingSoldier.mothername,
      mothernameen: req.body.mothernameen || existingSoldier.mothernameen,
      mothernameru: req.body.mothernameru || existingSoldier.mothernameru,
      calledby: req.body.calledby || existingSoldier.calledby,
      calledbyen: req.body.calledbyen || existingSoldier.calledbyen,
      calledbyru: req.body.calledbyru || existingSoldier.calledbyru,
      //birthcountry: req.body.birthcountry || existingSoldier.birthcountry,
      birthcountry,
      birthcountryen,
      birthcountryru,
    
      birthcity: req.body.birthcity || existingSoldier.birthcity,
      birthcityen: req.body.birthcityen || existingSoldier.birthcityen,
      birthcityru: req.body.birthcityru || existingSoldier.birthcityru,
      state: req.body.state || existingSoldier.state,
      stateen: req.body.stateen || existingSoldier.stateen,
      stateru: req.body.stateru || existingSoldier.stateru,
      gender, genderen, genderru,
      placeofdeath: req.body.placeofdeath || existingSoldier.placeofdeath,
      placeofdeathen: req.body.placeofdeathen || existingSoldier.placeofdeathen,
      placeofdeathru: req.body.placeofdeathru || existingSoldier.placeofdeathru,
      deathdetails: req.body.deathdetails || existingSoldier.deathdetails,
      deathdetailsen: req.body.deathdetailsen || existingSoldier.deathdetailsen,
      deathdetailsru: req.body.deathdetailsru || existingSoldier.deathdetailsru,
      biography: req.body.biography || existingSoldier.biography,
      
      otherparticipation: req.body.otherparticipation || existingSoldier.otherparticipation,
      otherparticipationen: req.body.otherparticipationen || existingSoldier.otherparticipationen,
      otherparticipationru: req.body.otherparticipationru || existingSoldier.otherparticipationru,
      otherdecoration: req.body.otherdecoration || existingSoldier.otherdecoration,
      otherdecorationen: req.body.otherdecorationen || existingSoldier.otherdecorationen,
      otherdecorationru: req.body.otherdecorationru || existingSoldier.otherdecorationru,
      fightingdesc: req.body.fightingdesc || existingSoldier.fightingdesc,
      
      shortdesc: req.body.shortdesc || existingSoldier.shortdesc,
      armyrole: req.body.armyrole || existingSoldier.armyrole,
      armyroleen: req.body.armyroleen || existingSoldier.armyroleen,
      armyroleru: req.body.armyroleru || existingSoldier.armyroleru,
      rank: req.body.rank || existingSoldier.rank,
      ranken: req.body.ranken || existingSoldier.ranken,
      rankru: req.body.rankru || existingSoldier.rankru,
      
      enlistreason, enlistreasonen, enlistreasonru,
      platoonname: req.body.platoonname || existingSoldier.platoonname,
      platoonnameen: req.body.platoonnameen || existingSoldier.platoonnameen,
      platoonnameru: req.body.platoonnameru || existingSoldier.platoonnameru,
      wounddetails: req.body.wounddetails || existingSoldier.wounddetails,
      wounddetailsen: req.body.wounddetailsen || existingSoldier.wounddetailsen,
      wounddetailsru: req.body.wounddetailsru || existingSoldier.wounddetailsru,
      gettodesc: req.body.gettodesc || existingSoldier.gettodesc,
      gettodescen: req.body.gettodescen || existingSoldier.gettodescen,
      gettodescru: req.body.gettodescru || existingSoldier.gettodescru,
      otherfightingcontext: req.body.otherfightingcontext || existingSoldier.otherfightingcontext,
      otherfightingcontexten: req.body.otherfightingcontexten || existingSoldier.otherfightingcontexten,
      otherfightingcontextru: req.body.otherfightingcontextru || existingSoldier.otherfightingcontextru,
      armyid: req.body.armyid || existingSoldier.armyid,
     
      dob: req.body.dob || existingSoldier.dob,
      dod: req.body.dod || existingSoldier.dod,
      aliyadate: req.body.aliyadate || existingSoldier.aliyadate,
      
      title: req.body.title || existingSoldier.title,
      titleen: req.body.titleen || existingSoldier.titleen,
      titleru: req.body.titleru || existingSoldier.titleru,
      linkurl: req.body.linkurl || existingSoldier.linkurl,
      useremail: req.body.useremail && req.body.useremail.trim() !== '' ? req.body.useremail : existingSoldier.useremail,
      corps, corpsen, corpsru,
      partizan, partizanen, partizanru,
      category, categoryen, categoryru,
      army, armyen, armyru,
      resistance, resistanceen, resistanceru,
      participation, participationen, participationru,  
      recordcomplete: record_complete_boolean,
      record_complete_date,
      admin_ready_for_download,
      admin_approved_date,
      downloaded_date: req.body.downloaded_date || existingSoldier.downloaded_date,
      uprising_participant: req.body.uprising_participant === 'on' || existingSoldier.uprising_participant

    };

        const updates = [];
        const values = [];
        let i = 1;

        const dateFields = [
            'dob', 'dod', 'aliyadate', 
            'record_complete_date', 'admin_approved_date', 'downloaded_date'
        ];

        for (const key in inputData) {
            let newValue = inputData[key] === '' ? null : inputData[key];
            let oldValue = existingSoldier[key] === '' ? null : existingSoldier[key];

            let same;
            if (dateFields.includes(key)) {
                same = normalizeDateToDDMMYYYY(newValue) === normalizeDateToDDMMYYYY(oldValue);
            } else if (typeof newValue === 'boolean') {
                same = newValue === oldValue;
            } else {
                same = String(newValue) === String(oldValue);
            }

            if (!same) {
                updates.push(`"${key}" = $${i}`);
                values.push(newValue);
                i++;
            }
        }

        await db.tx(async t => {
            if (updates.length > 0) {
                const updateSQL = `UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`;
                values.push(id);
                await t.none(updateSQL, values);
            }

            // --- Battle History ---
            for (let j = 0; j < battleyear.length; j++) {
                const hasContent =
                    (battleyear[j] && battleyear[j].trim() !== '') ||
                    (front[j] && front[j].trim() !== '') ||
                    (battle[j] && battle[j].trim() !== '');

                if (hasContent) {
                    if (battleId[j]) {
                        await t.none(
                            `UPDATE soldier_battle_history
                             SET battleyear=$1,
                                 front=$2, fronten=$3, frontru=$4,
                                 battle=$5, battleen=$6, battleru=$7,
                                 medal=$8, medalen=$9, medalru=$10,
                                 details=$11, detailsen=$12, detailsru=$13,
                                 degreerank=$14, degreeranken=$15, degreerankru=$16,
                                 job=$17, joben=$18, jobru=$19,
                                 updated_at=NOW()
                             WHERE id=$20 AND soldier_id=$21`,
                            [
                                battleyear[j] || null,
                                front[j] || null, fronten[j] || null, frontru[j] || null,
                                battle[j] || null, battleen[j] || null, battleru[j] || null,
                                battle_medal[j] || null, battle_medalen[j] || null, battle_medalru[j] || null,
                                battle_details[j] || null, battle_detailsen[j] || null, battle_detailsru[j] || null,
                                degreerank[j] || null, degreeranken[j] || null, degreerankru[j] || null,
                                job[j] || null, joben[j] || null, jobru[j] || null,
                                battleId[j], id
                            ]
                        );
                    } else {
                        await t.none(
                            `INSERT INTO soldier_battle_history (
                                 soldier_id, battleyear,
                                 front, fronten, frontru,
                                 battle, battleen, battleru,
                                 medal, medalen, medalru,
                                 details, detailsen, detailsru,
                                 degreerank, degreeranken, degreerankru,
                                 job, joben, jobru
                               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
                            [
                                id,
                                battleyear[j] || null,
                                front[j] || null, fronten[j] || null, frontru[j] || null,
                                battle[j] || null, battleen[j] || null, battleru[j] || null,
                                battle_medal[j] || null, battle_medalen[j] || null, battle_medalru[j] || null,
                                battle_details[j] || null, battle_detailsen[j] || null, battle_detailsru[j] || null,
                                degreerank[j] || null, degreeranken[j] || null, degreerankru[j] || null,
                                job[j] || null, joben[j] || null, jobru[j] || null
                            ]
                        );
                    }
                }
            }

            // --- STEP D: HANDLE MULTIMEDIA ---
console.log('--- DIAGNOSTIC: FULL BODY KEYS ---', Object.keys(req.body));

// Helper to handle both array and single-value inputs from the form
const getField = (name) => {
    return req.body[name + '[]'] || req.body[name] || [];
};

const descArr = [].concat(getField('m_description'));
const typeArr = [].concat(getField('m_type'));
const locArr  = [].concat(getField('physical_logical_location'));
const mFiles  = (req.files && req.files['m_files[]']) ? req.files['m_files[]'] : [];

// 1. Check for existing profile picture
const existingProfilePic = await t.oneOrNone(
    'SELECT id FROM "multimedia_TBL" WHERE soldier_id = $1 AND is_profile_pic = true LIMIT 1',
    [soldierId]
);

const hasProfilePic = !!existingProfilePic;
const maxRows = Math.max(descArr.length, mFiles.length, locArr.length);

for (let i = 0; i < maxRows; i++) {
    let finalDbPath = null;
    let currentType = (typeArr[i] || '').toString().trim(); 
    let userLocation = (locArr[i] || '').trim();
    
    // DIAGNOSTIC: Look at your terminal when you save to see what 'currentType' actually is
    console.log(`--- MULTIMEDIA ROW ${i} DIAGNOSTIC: Type="${currentType}", UserLoc="${userLocation}" ---`);

    // 2. Logic for physical_logical_location
    let finalLocation = '';
    const normalizedType = currentType.toUpperCase();

    // ⭐ UPDATED CONDITION: Includes the Hebrew string found in your diagnostic
    if (
        normalizedType.includes('PDF') || 
        normalizedType.includes('JPG') || 
        normalizedType.includes('IMAGE') || 
        normalizedType.includes('מסמך') || // Catch Hebrew "Document"
        currentType === '1' || currentType === '2' || currentType === '3'
    ) {
        finalLocation = 'מחיצת קבצים לקישור';
                } else if (currentType === 'קישור') {
                    // ⭐ SPECIFIC CONDITION FOR "קישור"
                    finalLocation = 'URL';
                } else {
                    finalLocation = userLocation || 'URL'; 
                }
                console.log ('final location ',finalLocation)
    // 3. Handle File Upload
    
   if (mFiles[i]) {
        const file = mFiles[i];

        // --- FIX: DECODE HEBREW/RUSSIAN CHARACTERS ---
        // This prevents weird symbols (mojibake) in the filename
        const decodedFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        
        // Use the decoded name (Date prefix is already removed from your logic)
        const uniqueFileName = decodedFileName;
        
        const targetDir = path.join(__dirname, 'public', 'pages', 'soldierUploads', `A${soldierId}`);
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        const finalPath = path.join(targetDir, uniqueFileName);
        
        // Move file from temp to final destination
        fs.renameSync(file.path, finalPath);
        
        // Save this clean, decoded path for the database
        finalDbPath = `/pages/soldierUploads/A${soldierId}/${uniqueFileName}`;
    }

    // 4. Final Insert Logic
    if (finalDbPath || descArr[i] || userLocation) {
        // Prevent NULL error in file_path column
        const dbPathToSave = finalDbPath || userLocation || '';
        
        // Profile pic logic: first file uploaded gets it if none exist
        const setToProfile = (!hasProfilePic && i === 0 && finalDbPath !== null);

        await t.none(`
            INSERT INTO "multimedia_TBL" 
            (soldier_id, file_description, file_path, multimedia_type, physical_logical_location, is_profile_pic, uploaded_date)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
            soldierId, 
            descArr[i] || 'No Description', 
            dbPathToSave, 
            currentType || null,
            finalLocation, 
            setToProfile
        ]);
    }
}
        });

        res.redirect(`/admin/completedRecords?adminemail=${encodeURIComponent(adminemail)}&saved=true`);

    } catch (error) {
        console.error('Error updating soldier:', error);
        res.status(500).send(`
            <h1>Error Updating Soldier</h1>
            <p>Message: ${error.message}</p>
            <pre>${error.stack || 'No stack trace available'}</pre>
            <a href="/adminUpdateSoldier/${id}?adminemail=${encodeURIComponent(adminemail)}">Go back to form</a>
        `);
    }
})
// --- GET /adminUpdateSoldier/:id ---
app.get('/adminUpdateSoldier/:id', async (req, res) => {
    const { id } = req.params;
    const adminemail = req.query.adminemail;
    const soldierId = req.params.id;
    
    // Get locale (using your req.getLocale() or fallback to cookie/query)
    const locale = req.getLocale() || req.query.lang || req.cookies.lang || 'he';

    if (!adminemail) {
        return res.redirect(`/admin/completedRecords?adminemail=admin@ww2jewishsoldiers.com`);
    }

    // Map locale to the specific DB column for sorting
    const langMap = {
        'he': 'title_heb',
        'en': 'title_eng',
        'ru': 'title_rus'
    };
    const sortCol = langMap[locale] || 'title_heb';

    try {
        // 1. Fetch the soldier record first
        const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!soldier) return res.status(404).send('Soldier not found');

        // 2. Helper for tables that need language-based sorting
        const fetchOrdered = (table) => 
            db.any(`SELECT id, title_heb, title_eng, title_rus FROM "${table}" ORDER BY $(col:name) ASC`, { col: sortCol });

        // 3. Execute all lookups in parallel
        const [
            countries, gender, corps, category, army, 
            resistance, partizan, participation, enlistreason,
            multimediaList, battleHistory
        ] = await Promise.all([
            fetchOrdered('countries_TBL'),
            fetchOrdered('gender_TBL'),
            fetchOrdered('corps_TBL'),
            fetchOrdered('category_TBL'),
            fetchOrdered('army_TBL'),
            fetchOrdered('resistance_TBL'),
            fetchOrdered('partizan_TBL'),
            fetchOrdered('participation_TBL'),
            fetchOrdered('enlistreason_TBL'),
            db.any('SELECT * FROM "multimedia_TBL" WHERE soldier_id = $1', [soldierId]),
            db.any('SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id', [id])
        ]);

        // 4. Medals and Multimedia Types kept exactly as requested (no change to order)
        const medals = await db.any('SELECT id, title FROM "medals_TBL"'); 
        const mTypes = await db.any('SELECT * FROM "multimedia_type_TBL" ORDER BY id');
        // --- BUBBLE UP BY ID 0 ---
       const unknownIndex = countries.findIndex(c => Number(c.id) === 0);

        if (unknownIndex > 0) { 
        const [unknownItem] = countries.splice(unknownIndex, 1);
        countries.unshift(unknownItem);
        }
        // -------------------------
        res.render('adminUpdate', {
            soldier,
            countries,
            gender,
            medals,
            corps,
            category,
            army,
            resistance,
            partizan,
            participation,
            battleHistory,
            adminemail,
            enlistreason,
            multimedia_type_TBL: mTypes,
            multimedia: multimediaList, 
            locale,
            req
        });

    } catch (error) {
        console.error('Error loading soldier update form:', error);
        res.status(500).send('Server error');
    }
});

// GET: Completed Records
app.get('/admin/completedRecords', async (req, res) => {
    let { adminemail, saved } = req.query;
    const locale = req.getLocale();

    if (!adminemail || adminemail.trim() === '') {
        return res.status(400).send('Admin email required');
    }

    try {
        let completedSoldiers;

        if (adminemail === "admin@ww2jewishsoldiers.com") {
            completedSoldiers = await db.any(`SELECT * FROM ${SOLDIER_TABLE} WHERE recordcomplete = true`);
        } else {
            completedSoldiers = await db.any(
                `SELECT * FROM ${SOLDIER_TABLE} WHERE recordcomplete = true AND useremail ILIKE $1`,
                [adminemail]
            );
        }

        // Convert all relevant date fields to DD-MM-YYYY
        const dateFields = ['dob','dod','aliyadate','record_complete_date','admin_approved_date','downloaded_date'];
        completedSoldiers = completedSoldiers.map(soldier => {
            dateFields.forEach(field => {
                soldier[field] = formatDateToDDMMYYYY(soldier[field]);
            });
            return soldier;
        });

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




// Excel Download
/*app.post('/admin/downloadExcel', async (req, res) => {
    let ids = req.body.selectedIds;
    const BATTLE_HISTORY_TABLE = 'soldier_battle_history';
    const UPLOADED_FILES_TABLE = 'uploaded_files';

    if (!ids) return res.status(400).send('No records selected');
    if (!Array.isArray(ids)) ids = [ids];

    try {
        const now = new Date();
        const downloadDateString = formatDateToDDMMYYYY(now);

        // --- Helper function for DD-MM-YYYY ---
        function formatDateToDDMMYYYY(date) {
            if (!date) return '';
            const d = new Date(date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        }

        const dateFields = [
            'dob', 'dod', 'aliyadate', 
            'record_complete_date', 'admin_approved_date', 'downloaded_date'
        ];

        // --- Fetch soldiers ---
        const selectedSoldiers = await db.any(`SELECT * FROM ${SOLDIER_TABLE} WHERE id IN ($1:csv)`, [ids]);
        selectedSoldiers.forEach(s => {
            dateFields.forEach(f => {
                if (s[f]) s[f] = formatDateToDDMMYYYY(s[f]);
            });
            s.download_date = downloadDateString; // Add download_date
        });

        // --- Fetch battle history ---
        const battleHistory = await db.any(
            `SELECT * FROM ${BATTLE_HISTORY_TABLE} WHERE soldier_id IN ($1:csv)`,
            [ids]
        );
        battleHistory.forEach(b => {
            dateFields.concat(['download_date']).forEach(f => {
                if (b[f]) b[f] = formatDateToDDMMYYYY(b[f]);
            });
            b.download_date = downloadDateString; // Add download_date
        });

        // --- Fetch uploaded files ---
        const uploadedFiles = await db.any(
            `SELECT * FROM ${UPLOADED_FILES_TABLE} WHERE soldier_id IN ($1:csv)`,
            [ids]
        );
        uploadedFiles.forEach(f => {
            f.download_date = downloadDateString; // Add download_date
        });

        // --- Create workbook ---
        const workbook = new ExcelJS.Workbook();

        // --- Soldiers_Main worksheet ---
        const soldierWorksheet = workbook.addWorksheet('Soldiers_Main');
        if (selectedSoldiers.length > 0) {
            soldierWorksheet.columns = Object.keys(selectedSoldiers[0]).map(k => ({
                header: k.toUpperCase(),
                key: k,
                style: { numFmt: '@' } // text
            }));
            selectedSoldiers.forEach(s => soldierWorksheet.addRow(s));
        }

        // --- Soldiers_BattleHistory worksheet ---
        const battleWorksheet = workbook.addWorksheet('Soldiers_BattleHistory');
        if (battleHistory.length > 0) {
            battleWorksheet.columns = Object.keys(battleHistory[0]).map(k => ({
                header: k.toUpperCase(),
                key: k,
                style: { numFmt: '@' }
            }));
            battleHistory.forEach(b => battleWorksheet.addRow(b));
        }

        // --- Soldiers_UploadedFiles worksheet ---
        const filesWorksheet = workbook.addWorksheet('Soldiers_UploadedFiles');
        if (uploadedFiles.length > 0) {
            filesWorksheet.columns = Object.keys(uploadedFiles[0]).map(k => ({
                header: k.toUpperCase(),
                key: k,
                style: { numFmt: '@' }
            }));
            uploadedFiles.forEach(f => filesWorksheet.addRow(f));
        }

        // --- Update downloaded_date in DB as text ---
        const nowText = downloadDateString;
        await db.none(
            `UPDATE ${SOLDIER_TABLE} SET downloaded_date = $1 WHERE id IN ($2:csv)`,
            [nowText, ids]
        );

        // --- Send workbook ---
        res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="Soldier_Package_${downloadDateString}.zip"`);
        res.setHeader('Content-Disposition', 'attachment; filename="completed_records_data.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('Excel export error:', err);
        res.status(500).send('Error exporting Excel');
    }
});*/
// Ensure you have defined 'db' (your database connection) and 'SOLDIER_TABLE' before this route.
// If you use ExcelJS, make sure it is imported: const ExcelJS = require('exceljs');




app.post('/admin/downloadExcel', async (req, res) => {
    // --- Configuration Constants ---
    const BATTLE_HISTORY_TABLE = 'soldier_battle_history';
    const MULTIMEDIA_TABLE = 'multimedia_TBL';
    const MAX_BATTLES = 5;
    const MAX_FILES = 12;

    const XML_TAG_MAP = {
    'id': 'FormID',
    'fname': 'FirstName_HEB', 'fnameen': 'FirstName_ENG', 'fnameru': 'FirstName_RUS',
    'lname': 'LastName_HEB', 'lnameen': 'LastName_ENG', 'lnameru': 'LastName_RUS',
    'previouslname': 'PreviousLastName_HEB', 'previouslnameen': 'PreviousLastName_ENG', 'previouslnameru': 'PreviousLastName_RUS',
    'calledby': 'Nickname_HEB', 'calledbyen': 'Nickname_ENG', 'calledbyru': 'Nickname_RUS',
    'fathername': 'FatherName_HEB', 'fathernameen': 'FatherName_ENG', 'fathernameru': 'FatherName_RUS',
    'mothername': 'MotherName_HEB', 'mothernameen': 'MotherName_ENG', 'mothernameru': 'MotherName_RUS',
    'gender': 'Gender_HEB', 'genderen': 'Gender_ENG', 'genderru': 'Gender_RUS',
    'birthcountry': 'BirthCountry_HEB', 'birthcountryen': 'BirthCountry_ENG', 'birthcountryru': 'BirthCountry_RUS',
    'birthcity': 'BirthCity_HEB', 'birthcityen': 'BirthCity_ENG', 'birthcityru': 'BirthCity_RUS',
    'state': 'State_HEB', 'stateen': 'State_ENG', 'stateru': 'State_RUS',
    'dob': 'DateOfBirth',
    'armyid': 'ArmyID',
    'category': 'Category_HEB', 'categoryen': 'Category_ENG', 'categoryru': 'Category_RUS',
    'platoonname': 'Platoon_HEB', 'platoonnameen': 'Platoon_ENG', 'platoonnameru': 'Platoon_RUS',
    'armyrole': 'Role_HEB', 'armyroleen': 'Role_ENG', 'armyroleru': 'Role_RUS',
    'wounddetails': 'WoundDetails_HEB', 'wounddetailsen': 'WoundDetails_ENG', 'wounddetailsru': 'WoundDetails_RUS',
    'deathdetails': 'DeathDetails_HEB', 'deathdetailsen': 'DeathDetails_ENG', 'deathdetailsru': 'DeathDetails_RUS',
    'dod': 'DateOfDeath',
    'placeofdeath': 'PlaceOfDeath_HEB', 'placeofdeathen': 'PlaceOfDeath_ENG', 'placeofdeathru': 'PlaceOfDeath_RUS',
    'enlistreason': 'EnlistReason_HEB', 'enlistreasonen': 'EnlistReason_ENG', 'enlistreasonru': 'EnlistReason_RUS',
    'rank': 'ReleaseReason_HEB', 'ranken': 'ReleaseReason_ENG', 'rankru': 'ReleaseReason_RUS',
    'army': 'ArmyAffiliation_HEB', 'armyen': 'ArmyAffiliation_ENG', 'armyru': 'ArmyAffiliation_RUS',
    'resistance': 'ResistanceAffiliation_HEB', 'resistanceen': 'ResistanceAffiliation_ENG', 'resistanceru': 'ResistanceAffiliation_RUS',
    'partizan': 'PartisanAffiliation_HEB', 'partizanen': 'PartisanAffiliation_ENG', 'partizanru': 'PartisanAffiliation_RUS',
    'participation': 'Participation_HEB', 'participationen': 'Participation_ENG', 'participationru': 'Participation_RUS',
    'corps': 'Corps_HEB', 'corpsen': 'Corps_ENG', 'corpsru': 'Corps_RUS',
    'other_medal': 'Medals_HEB', 'other_medalen': 'Medals_ENG', 'other_medalru': 'Medals_RUS',
    'gettodesc': 'GhettoStruggle_HEB', 'gettodescen': 'GhettoStruggle_ENG', 'gettodescru': 'GhettoStruggle_RUS',
    'otherparticipation': 'OtherWarParticipation_HEB', 'otherparticipationen': 'OtherWarParticipation_ENG', 'otherparticipationru': 'OtherWarParticipation_RUS',
    'otherfightingcontext': 'OtherFightingContext_HEB', 'otherfightingcontexten': 'OtherFightingContext_ENG', 'otherfightingcontextru': 'OtherFightingContext_RUS',
    'otherdecoration': 'OtherDecorations_HEB', 'otherdecorationen': 'OtherDecorations_ENG', 'otherdecorationru': 'OtherDecorations_RUS',
    'aliyadate': 'AliyaDate',
    'biography': 'FullBiography',
    'download_date': 'DownloadDate'
};
    // --- Multilingual Header Mapping ---
    const EXCEL_HEADER_MAP = {
        'id': 'Form ID',
        'fname': 'שם פרטי_HEB', 'fnameen': 'שם פרטי_ENG', 'fnameru': 'שם פרטי_RUS',
        'lname': 'שם משפחה_HEB', 'lnameen': 'שם משפחה_ENG', 'lnameru': 'שם משפחה_RUS',
        'previouslname': 'שם משפחה קודם_HEB', 'previouslnameen': 'שם משפחה קודם_ENG', 'previouslnameru': 'שם משפחה קודם_RUS',
        'calledby': 'שם כינוי_HEB', 'calledbyen': 'שם כינוי_ENG', 'calledbyru': 'שם כינוי_RUS',
        'fathername': 'שם האב_HEB', 'fathernameen': 'שם האב_ENG', 'fathernameru': 'שם האב_RUS',
        'mothername': 'שם האם_HEB', 'mothernameen': 'שם האם_ENG', 'mothernameru': 'שם האם_RUS',
        'gender': 'מין_HEB', 'genderen': 'מין_ENG', 'genderru': 'מין_RUS',
        'birthcountry': 'ארץ לידה_HEB', 'birthcountryen': 'ארץ לידה_ENG', 'birthcountryru': 'ארץ לידה_RUS',
        'birthcity': 'עיר לידה_HEB', 'birthcityen': 'עיר לידה_ENG', 'birthcityru': 'עיר לידה_RUS',
        'state': 'מדינה/מחוז_HEB', 'stateen': 'מדינה/מחוז_ENG', 'stateru': 'מדינה/מחוז_RUS',
        'dob': 'תאריך לידה',
        'armyid': 'מ.א. מספר אישי',
        'category': 'קטגוריה_HEB', 'categoryen': 'קטגוריה_ENG', 'categoryru': 'קטגוריה_RUS',
        'platoonname': 'יחידה_HEB', 'platoonnameen': 'יחידה_ENG', 'platoonnameru': 'יחידה_RUS',
        'armyrole': 'תפקיד_HEB', 'armyroleen': 'תפקיד_ENG', 'armyroleru': 'תפקיד_RUS',
        'wounddetails': 'פציעה_HEB', 'wounddetailsen': 'פציעה_ENG', 'wounddetailsru': 'פציעה_RUS',
        'deathdetails': 'פרטי הפטירה_HEB', 'deathdetailsen': 'פרטי הפטירה_ENG', 'deathdetailsru': 'פרטי הפטירה_RUS',
        'dod': 'תאריך פטירה',
        'placeofdeath': 'מקום הפטירה_HEB', 'placeofdeathen': 'מקום הפטירה_ENG', 'placeofdeathru': 'מקום הפטירה_RUS',
        'enlistreason': 'סיבת גיוס_HEB', 'enlistreasonen': 'סיבת גיוס_ENG', 'enlistreasonru': 'סיבת גיוס_RUS',
        'rank': 'סיבת שחרור_HEB', 'ranken': 'סיבת שחרור_ENG', 'rankru': 'סיבת שחרור_RUS',
        'army': 'שיוך לצבא_HEB', 'armyen': 'שיוך לצבא_ENG', 'armyru': 'שיוך לצבא_RUS',
        'resistance': 'שיוך למחתרת_HEB', 'resistanceen': 'שיוך למחתרת_ENG', 'resistanceru': 'שיוך למחתרת_RUS',
        'partizan': 'שיוך לפרטיזנים_HEB', 'partizanen': 'שיוך לפרטיזנים_ENG', 'partizanru': 'שיוך לפרטיזנים_RUS',
        'participation': 'שיוך להשתתפות_HEB', 'participationen': 'שיוך להשתתפות_ENG', 'participationru': 'שיוך להשתתפות_RUS',
        'corps': 'שיוך לחיל_HEB', 'corpsen': 'שיוך לחיל_ENG', 'corpsru': 'שיוך לחיל_RUS',
        'other_medal': 'שיוך לעיטורים_HEB', 'other_medalen': 'שיוך לעיטורים_ENG', 'other_medalru': 'שיוך לעיטורים_RUS',
        'gettodesc': 'מאבק בגטו / מחנה_HEB', 'gettodescen': 'מאבק בגטו / מחנה_ENG', 'gettodescru': 'מאבק בגטו / מחנה_RUS',
        'otherparticipation': 'השתתפות במלחמה - אחר_HEB', 'otherparticipationen': 'השתתפות במלחמה - אחר_ENG', 'otherparticipationru': 'השתתפות במלחמה - אחר_RUS',
        'otherfightingcontext': 'מסגרת לחימה - אחר_HEB', 'otherfightingcontexten': 'מסגרת לחימה - אחר_ENG', 'otherfightingcontextru': 'מסגרת לחימה - אחר_RUS',
        'otherdecoration': 'עיטורים - אחר_HEB', 'otherdecorationen': 'עיטורים - אחר_ENG', 'otherdecorationru': 'עיטורים - אחר_RUS',
        'aliyadate': 'תאריך עליה',
        'biography': 'קורות חיים_סיפור אישי _HEB',
        'download_date': 'תאריך הורדה',

        ...Array.from({ length: MAX_BATTLES }, (_, n) => ({
            [`battle_${n + 1}_year`]: `שנת לחימה ${n + 1}`,
            [`battle_${n + 1}_front`]: `חזית_${n + 1}_HEB`, [`battle_${n + 1}_fronten`]: `חזית_${n + 1}_ENG`, [`battle_${n + 1}_frontru`]: `חזית_${n + 1}_RUS`,
            [`battle_${n + 1}_medal`]: `עיטורים_${n + 1}_HEB`, [`battle_${n + 1}_medalen`]: `עיטורים_${n + 1}_ENG`, [`battle_${n + 1}_medalru`]: `עיטורים_${n + 1}_RUS`,
            [`battle_${n + 1}_job`]: `תפקיד_${n + 1}_HEB`, [`battle_${n + 1}_joben`]: `תפקיד_${n + 1}_ENG`, [`battle_${n + 1}_jobru`]: `תפקיד_${n + 1}_RUS`,
            [`battle_${n + 1}_degreerank`]: `דרגה_${n + 1}_HEB`, [`battle_${n + 1}_degreeranken`]: `דרגה_${n + 1}_ENG`, [`battle_${n + 1}_degreerankru`]: `דרגה_${n + 1}_RUS`,
            [`battle_${n + 1}_battle`]: `קרב_${n + 1}_HEB`, [`battle_${n + 1}_battleen`]: `קרב_${n + 1}_ENG`, [`battle_${n + 1}_battleru`]: `קרב_${n + 1}_RUS`,
            [`battle_${n + 1}_details`]: `הערות_${n + 1}_HEB`, [`battle_${n + 1}_detailsen`]: `הערות_${n + 1}_ENG`, [`battle_${n + 1}_detailsru`]: `הערות_${n + 1}_RUS`,
        })).reduce((acc, curr) => ({ ...acc, ...curr }), {}),

        ...Array.from({ length: MAX_FILES }, (_, n) => ({
            [`file_${n + 1}_desc`]: `מולטימדיה - תיאור ${n + 1}`,
            [`file_${n + 1}_type`]: `סוג מולטימדיה ${n + 1}`,
            [`file_${n + 1}_path`]: `שם קובץ ${n + 1}`,
            [`file_${n + 1}_loc`]: `מיקום לוגי פיזי ${n + 1}`,
        })).reduce((acc, curr) => ({ ...acc, ...curr }), {}),
    };

    let ids = req.body.selectedIds;
    if (!ids) return res.status(400).send('No records selected');
    if (!Array.isArray(ids)) ids = [ids];

    try {
        const now = new Date();
        const formatDateToDDMMYYYY = (value) => {
            if (!value) return '';
            const d = new Date(value);
            if (isNaN(d)) return value; 
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            return `${day}-${month}-${d.getFullYear()}`;
        };

        const downloadDateString = formatDateToDDMMYYYY(now);
        const safeDate = downloadDateString.replace(/\//g, '-');

        const dateFields = ['dob', 'dod', 'aliyadate'];
        const excludeFields = [
            'fightingdesc', 'useremail', 'recordcomplete',
            'admin_ready_for_download', 'record_complete_date', 'admin_approved_date',
            'downloaded_date', 'uprising_participant', 'fname_soldier_submitter',
            'lname_soldier_submitter', 'phone_soldier_submitter', 'relation_of_soldier_submitter',
            'soldier_previously_submitted', 'how_found_us_submitter'
        ];

        // 1. Fetch Data
        const soldiers = await db.any(`SELECT * FROM soldierdetails WHERE id IN ($1:csv)`, [ids]);
        const battleHistory = await db.any(`SELECT * FROM ${BATTLE_HISTORY_TABLE} WHERE soldier_id IN ($1:csv) ORDER BY id`, [ids]);
        const multimediaRecords = await db.any(`SELECT * FROM "${MULTIMEDIA_TABLE}" WHERE soldier_id IN ($1:csv) ORDER BY id`, [ids]);

        // 2. Build Mapping
        const battleMap = {};
        battleHistory.forEach(b => {
            if (!battleMap[b.soldier_id]) battleMap[b.soldier_id] = [];
            battleMap[b.soldier_id].push(b);
        });

        const multiMap = {};
        multimediaRecords.forEach(m => {
            const sId = String(m.soldier_id).trim();
            if (!multiMap[sId]) multiMap[sId] = [];
            multiMap[sId].push(m);
        });

        // 3. Flatten Rows (Reused for Excel & XML)
        const flattenedRows = soldiers.map(s => {
            const row = {};
            for (const key in s) {
                if (!excludeFields.includes(key)) {
                    row[key] = dateFields.includes(key) ? formatDateToDDMMYYYY(s[key]) : s[key];
                }
            }
            const cleanId = String(s.id).trim();
            row.id = `A${cleanId}`;
            row.download_date = downloadDateString;
            row.biography = `Bio: ${s.biography || ''}\n\nStory: ${s.fightingdesc || ''}`;

            const sBattles = battleMap[s.id] || [];
            sBattles.forEach((b, i) => {
                const n = i + 1;
                if (n <= MAX_BATTLES) {
                    row[`battle_${n}_year`] = b.battleyear || '';
                    row[`battle_${n}_front`] = b.front || '';
                    row[`battle_${n}_fronten`] = b.fronten || '';
                    row[`battle_${n}_frontru`] = b.frontru || '';
                    row[`battle_${n}_battle`] = b.battle || '';
                    row[`battle_${n}_battleen`] = b.battleen || '';
                    row[`battle_${n}_battleru`] = b.battleru || '';
                    row[`battle_${n}_medal`] = b.medal || '';
                    row[`battle_${n}_medalen`] = b.medalen || '';
                    row[`battle_${n}_medalru`] = b.medalru || '';
                    row[`battle_${n}_details`] = b.details || '';
                    row[`battle_${n}_detailsen`] = b.detailsen || '';
                    row[`battle_${n}_detailsru`] = b.detailsru || '';
                    row[`battle_${n}_degreerank`] = b.degreerank || '';
                    row[`battle_${n}_degreeranken`] = b.degreeranken || '';
                    row[`battle_${n}_degreerankru`] = b.degreerankru || '';
                    row[`battle_${n}_job`] = b.job || '';
                    row[`battle_${n}_joben`] = b.joben || '';
                    row[`battle_${n}_jobru`] = b.jobru || '';
                }
            });

            const sMedia = multiMap[cleanId] || [];
            sMedia.forEach((m, i) => {
                const n = i + 1;
                if (n <= MAX_FILES) {
                    row[`file_${n}_desc`] = m.file_description || '';
                    row[`file_${n}_type`] = m.multimedia_type || '';
                    row[`file_${n}_loc`] = m.physical_logical_location || '';
                    if (m.file_path) {
                        const baseName = path.basename(m.file_path);
                        const cleanFileName = baseName.includes('-') ? baseName.substring(baseName.indexOf('-') + 1) : baseName;
                        row[`file_${n}_path`] = m.physical_logical_location === "URL" ? m.file_path : `Images\\Warrior Pages\\multimediaFiles\\A${cleanId}\\${cleanFileName}`;
                    }
                }
            });
            return row;
        });

        // 4. Excel Generation
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Soldiers');
        const allKeys = [...new Set(flattenedRows.flatMap(r => Object.keys(r)))];

        sheet.columns = allKeys
            .filter(k => EXCEL_HEADER_MAP.hasOwnProperty(k))
            .map(k => ({
                header: EXCEL_HEADER_MAP[k],
                key: k,
                style: { numFmt: '@', alignment: { horizontal: 'right', vertical: 'top', wrapText: true } }
            }));

        const bioCol = sheet.getColumn('biography');
        if (bioCol) bioCol.width = 60;
        flattenedRows.forEach(row => sheet.addRow(row));
        const excelBuffer = await workbook.xlsx.writeBuffer();

        // 5. XML Generation
const xmlRoot = create({ version: '1.0', encoding: 'UTF-8' }).ele('Soldiers');

flattenedRows.forEach(row => {
    const soldierNode = xmlRoot.ele('Soldier');
    
    for (const key in row) {
        const value = row[key];
        
        // Only add element if value exists
        if (value !== null && value !== undefined && value !== '') {
            
            // 1. Determine the Tag Name
            // Use XML_TAG_MAP if exists, otherwise sanitize the DB key
            let tagName = XML_TAG_MAP[key] || key;
            
            // 2. Safety Check: Ensure the tag name is XML-compliant 
            // (Removes spaces and illegal characters just in case)
            tagName = tagName.replace(/[^a-z0-9_]/gi, '');

            // 3. Append to XML
            soldierNode.ele(tagName).txt(String(value)).up();
        }
    }
    soldierNode.up();
  });


        const xmlString = xmlRoot.end({ prettyPrint: true });

        // 6. ZIP Stream Setup
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=\"Full_Export_${safeDate}.zip\"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        // A. Add Manifest.txt
        let manifest = `Export Summary - ${downloadDateString}\n` + "=".repeat(40) + "\n";
        soldiers.forEach(s => {
            manifest += `[ID: A${s.id}] Name: ${s.fname} ${s.lname} / ${s.fnameen} ${s.lnameen}\n`;
        });
        archive.append(manifest, { name: 'manifest.txt' });

        // B. Add Excel Workbook
        archive.append(excelBuffer, { name: `soldiers_data_${safeDate}.xlsx` });

        // C. Add XML File
        archive.append(xmlString, { name: `soldiers_data_${safeDate}.xml` });

        // D. Add Media Folders
        ids.forEach(id => {
            const cleanId = String(id).trim();
            const folderPath = path.join(__dirname, 'public', 'pages', 'soldierUploads', `A${cleanId}`);
            if (fs.existsSync(folderPath)) {
                archive.directory(folderPath, `Soldier_Files/A${cleanId}`);
            }
        });

        // 7. DB Update and Finish
        await db.none(`UPDATE soldierdetails SET downloaded_date = $1 WHERE id IN ($2:csv)`, [downloadDateString, ids]);
        await archive.finalize();

    } catch (err) {
        console.error('ZIP Export Error:', err);
        if (!res.headersSent) res.status(500).send('Package generation failed');
    }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
