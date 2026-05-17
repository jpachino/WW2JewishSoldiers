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
const session = require('express-session');

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
    'soldier_previously_submitted', 'how_found_us_submitter',
    "cat1", "cat2", "cat3", "cat4", "cat5", "cat6", "cat7", "cat8",
    "cat1en", "cat2en", "cat3en", "cat4en", "cat5en", "cat6en", "cat7en", "cat8en",
    "cat1ru", "cat2ru", "cat3ru", "cat4ru", "cat5ru", "cat6ru", "cat7ru", "cat8ru"
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


// 1. Define Persistent Paths
const PERSISTENT_ROOT = '/var/data/soldierUploads';
const TEMP_DIR = path.join(PERSISTENT_ROOT, 'temp');

// 2. Ensure directories exist on server start
[PERSISTENT_ROOT, TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// 3. Configure Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_DIR);
    },
    filename: (req, file, cb) => {
        // Fix for UTF-8 filenames (Russian, Hebrew, etc.)
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, decodedName);
    }
});

const upload = multer({ storage: storage });
// This will accept m_file_row_0, m_file_row_1, and your profile pic all at once
const multiUpload = upload.any();
/*const multiUpload = upload.fields([
    { name: 'm_files[]', maxCount: 12 }
]);*/
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
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// -----------------------------------------------------
// 🍪 Cookie Parser - MUST BE FIRST (Reads existing cookies)
// -----------------------------------------------------
// This line is essential for i18n.init to see req.cookies
app.use(cookieParser());
app.use('/soldierUploads', express.static(PERSISTENT_ROOT));

// 2. SESSION MUST BE BEFORE ROUTES
app.use(session({
    secret: 'some-random-string',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if on Render/HTTPS
}));

// 3. NOW YOUR ROUTES
app.post('/admin/login-submit', (req, res) => {
    console.log("LOGIN ATTEMPT - Body is:", req.body); // Check your terminal/logs for this!
    const { password } = req.body;
    const ADMIN_PASS = 'G5*s9@z2Yh';

    if (password === ADMIN_PASS) {
        req.session.isAdmin = true;
        return res.json({ success: true });
    }
    res.status(401).json({ success: false });
});
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
   //res.redirect('back'); this has been deprecated by express 04/26
    res.redirect(req.get('Referrer') || '/');
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
app.get('/test-new', (req, res) => {
  // Use 'he' as default for testing, or grab from query/session
  const locale = req.query.lang || req.session.locale || 'he'; 
  
  res.render('indexnew', { 
    locale: locale,
    // Add any other variables your header/footer might expect
    saved: req.query.saved === 'true' 
  });
});
app.get('/donations', (req, res) => {
    res.render('donations', { locale: req.locale || 'he' });
});
app.get('/booking', (req, res) => {
    res.render('booking', { locale: req.locale || 'he' });
});
// Route to display the About Museum page
app.get('/aboutMuseum', (req, res) => {
      res.render('aboutMuseum' , { locale: req.locale || 'he' }); 
});
// A. Show the Login Page
app.get('/admin-login', (req, res) => {
    // If they are already logged in, skip the login page and go straight to records
    if (req.session && req.session.isAdmin) {
        return res.redirect('/admin/completedRecords');
    }
    res.render('adminLogin', { locale: req.getLocale() || 'he' });
});

// B. Handle the Login Logic
app.post('/admin/login-submit', (req, res) => {
    const { password } = req.body;
    const ADMIN_PASS = 'G5*s9@z2Yh'; 

    if (password === ADMIN_PASS) {
        req.session.isAdmin = true; // Store in session
        return res.json({ success: true });
    }
    res.status(401).json({ success: false });
});

// C. The Protection Middleware
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    // If not logged in, redirect them to the login page
    res.redirect('/admin-login');
};

/* D. Protect the Completed Records Route
app.get('/admin/completedRecords', requireAdmin, async (req, res) => {
    try {
        const records = await db.any('SELECT * FROM soldierdetails WHERE recordcomplete = true ORDER BY id DESC');
      
        res.render('completedRecords', { 
            soldiers: records, 
            locale: req.getLocale() 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
});*/
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
            return res.redirect('/');
        }
        res.clearCookie('connect.sid'); // Clears the session cookie in the browser
        res.redirect('/'); // Send them back to the home page
    });
});
app.get('/addFull', async (req, res) => {
    const locale = req.query.lang || req.cookies.lang || 'he';
    const langMap = { 'he': 'title_heb', 'en': 'title_eng', 'ru': 'title_rus' };
    const sortCol = langMap[locale] || 'title_heb';

    try {
        const fetchOrdered = (table) =>
            db.any(`SELECT id, title_heb, title_eng, title_rus FROM "${table}" ORDER BY $(col:name) ASC`, { col: sortCol });

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

        // Move "Unknown" (ID 0) to top of countries
        const unknownIndex = countries.findIndex(c => Number(c.id) === 0);
        if (unknownIndex > 0) {
            const [unknownItem] = countries.splice(unknownIndex, 1);
            countries.unshift(unknownItem);
        }

        res.render('addFULL', {
            locale,
            countries,
            category, // This contains the 8 rows from your category_TBL
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
            soldier: {
                dob: '', dod: '', aliyadate: '',
                record_complete_date: '', admin_approved_date: '', downloaded_date: '',
                // NEW: Initialize the 8 category fields
                cat1: '', cat2: '', cat3: '', cat4: '',
                cat5: '', cat6: '', cat7: '', cat8: '',
                 cat1en: '', cat2en: '', cat3en: '', cat4en: '',
                cat5en: '', cat6en: '', cat7en: '', cat8en: '',
                 cat1ru: '', cat2ru: '', cat3ru: '', cat4ru: '',
                cat5ru: '', cat6ru: '', cat7ru: '', cat8ru: ''
            },
            battles: [],
            req
        });
    } catch (err) {
        console.error('Error rendering addFULL template:', err);
        res.status(500).send(`<h1>Error</h1><pre>${err.message}</pre>`);
    }
});

  app.post('/addFULL', upload.any(), async (req, res) => {
    try {
        // 1. Clean the incoming body
        const cleaned = cleanNulls(req.body);

        // --- VALIDATION BLOCK ---
        const errors = [];
        if (!cleaned.armyId && !cleaned.resistanceId && !cleaned.partizanId) errors.push("Service Type missing.");
        if (!cleaned.fname && !cleaned.fnameen && !cleaned.fnameru) errors.push("First Name missing.");
        if (!cleaned.lname && !cleaned.lnameen && !cleaned.lnameru) errors.push("Last Name missing.");
        if (!cleaned.genderId) errors.push("Gender missing.");
        if (!cleaned.birthcountryId) errors.push("Birth Country missing.");
        if (!cleaned.useremail) errors.push("Submitter Email missing.");
        if (!cleaned.fname_soldier_submitter) errors.push("Submitter FName missing.");
        if (!cleaned.biography) errors.push("Biography missing.");

        if (errors.length > 0) {
            return res.status(400).send(`<h1>Validation Error</h1><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul><a href="javascript:history.back()">Go Back</a>`);
        }

        // 2. CATEGORY CHECKBOX LOGIC
        for (let i = 1; i <= 8; i++) {
            cleaned[`cat${i}`] = req.body[`cat${i}`] || ''; 
            cleaned[`cat${i}en`] = req.body[`cat${i}en`] || ''; 
            cleaned[`cat${i}ru`] = req.body[`cat${i}ru`] || '';
        }

        // 3. DYNAMIC TRANSLATION LOOKUPS
        const translations = [
            { id: cleaned.birthcountryId, table: 'countries_TBL', field: 'birthcountry' },
            { id: cleaned.genderId, table: 'gender_TBL', field: 'gender' },
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
                const data = await db.oneOrNone(`SELECT title_heb, title_eng, title_rus FROM "${t.table}" WHERE id = $1`, [t.id]);
                if (data) {
                    cleaned[t.field] = data.title_heb;
                    cleaned[`${t.field}en`] = data.title_eng;
                    cleaned[`${t.field}ru`] = data.title_rus;
                }
            }
        }

        // 4. LOGIC FOR OTHER CHECKBOXES
        const parseCheck = (val) => Array.isArray(val) ? val.includes('true') || val.includes('on') : (val === 'true' || val === 'on');
        cleaned.recordcomplete = parseCheck(cleaned.recordcomplete);
        cleaned.uprising_participant = parseCheck(cleaned.uprising_participant);
        cleaned.record_complete_date = cleaned.recordcomplete ? (cleaned.record_complete_date || new Date().toISOString().split('T')[0]) : '';

        // 5. DATABASE TRANSACTION
        await db.tx(async t => {
            // STEP A: Insert Soldier
            const query = pgp.helpers.insert(cleaned, csSoldiers) + ' RETURNING id';
            const { id: soldierId } = await t.one(query);

            // STEP B: Create Folder
            const folderName = `A${soldierId}`;
            const targetDir = path.join(PERSISTENT_ROOT, folderName); 
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

            // STEP C: INSERT BATTLE HISTORY
            const bh = req.body;
            if (bh.battleyear && Array.isArray(bh.battleyear)) {
                for (let i = 0; i < bh.battleyear.length; i++) {
                    const hasData = bh.battleyear[i] || bh.front[i] || bh.battle[i];
                    if (!hasData) continue;
                    await t.none(`INSERT INTO soldier_battle_history (soldier_id, battleyear, front, battle, medal, details, degreerank, job, fronten, battleen, medalen, detailsen, degreeranken, joben, frontru, battleru, medalru, detailsru, degreerankru, jobru) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, 
                    [soldierId, bh.battleyear[i] || null, bh.front[i] || null, bh.battle[i] || null, bh.battle_medal[i] || null, bh.battle_details[i] || null, bh.degreerank[i] || null, bh.job[i] || null, bh.fronten[i] || null, bh.battleen[i] || null, bh.battle_medalen[i] || null, bh.battle_detailsen[i] || null, bh.degreeranken[i] || null, bh.joben[i] || null, bh.frontru[i] || null, bh.battleru[i] || null, bh.battle_medalru[i] || null, bh.battle_detailsru[i] || null, bh.degreerankru[i] || null, bh.jobru[i] || null]);
                }
            }

 // --- STEP D: HANDLE MULTIMEDIA (ARRAY-BASED LOGIC) ---
console.log('--- STARTING MULTIMEDIA SAVE ---');

const descriptions = [].concat(req.body.m_description || []);
const types = [].concat(req.body.m_type || []);
const locations = [].concat(req.body.physical_logical_location || []);
const multimediaFiles = (req.files || []).filter(f => f.fieldname === 'm_files[]');

const MAX_ALLOWED = 15;
if (types.length > MAX_ALLOWED || multimediaFiles.length > MAX_ALLOWED) {
    throw new Error("<%= __('form.max_attachments_error') %>");
}
// 1. Initialize Tracker: We haven't assigned a profile pic yet
let profilePicAssigned = false;

for (let i = 0; i < types.length; i++) {
    let currentType = (types[i] || '').toString().trim();
    let desc = (descriptions[i] || '').trim();
    let userLocation = (locations[i] || '').trim();
    const file = multimediaFiles[i]; 

    if (!currentType && !userLocation && !file) continue;

    let finalDbPath = null;
    let finalLocationLabel = '';

    // Determine Label Logic
    if (currentType.match(/PDF|JPG|תמונה|מסמך|Picture|Document/i)) {
        finalLocationLabel = 'מחיצת קבצים לקישור';
    } else if (currentType.includes('קישור') || currentType.toLowerCase().includes('url')) {
        finalLocationLabel = 'URL';
    } else {
        finalLocationLabel = userLocation || 'URL'; 
    }

    // --- UPDATED FILE RENAME BLOCK (PREVENTS ENOENT) ---
    if (file) {
        // Only try to move it if the file path actually exists in temp
        if (file.path && fs.existsSync(file.path)) {
            try {
                const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/\s+/g, '_');
                const finalPath = path.join(targetDir, safeName);
                
                // Move the file
                fs.renameSync(file.path, finalPath);
                finalDbPath = `/soldierUploads/${folderName}/${safeName}`;
            } catch (moveErr) {
                console.error(`❌ Move failed for ${file.originalname}:`, moveErr.message);
                // By catching the error here, the loop continues and saves the rest of the record
            }
        } else {
            console.warn(`⚠️ Skipping missing file: ${file.originalname || 'Unknown'}`);
        }
    }

    // 2. NEW PROFILE PIC LOGIC
    let isProfilePic = false;
    
    // Check if this row is a "Picture/Image" type using English, Hebrew, or Russian keywords
    const isImageType = /Picture|Image|תמונה|фото/i.test(currentType);

    // If it's an image, and it has a file, and we haven't picked a profile pic yet...
    if (isImageType && finalDbPath && !profilePicAssigned) {
        isProfilePic = true;
        profilePicAssigned = true; // Mark as done so no other row in this loop gets it
    }

    // Insert into DB
    if (finalDbPath || userLocation || desc) {
        const dbPathToSave = finalDbPath || userLocation || '';
        
        await t.none(`
            INSERT INTO "multimedia_TBL" 
            (soldier_id, file_description, file_path, multimedia_type, physical_logical_location, is_profile_pic, uploaded_date)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
            soldierId, 
            desc || 'No Description', 
            dbPathToSave, 
            currentType,
            finalLocationLabel,
            isProfilePic // <--- Now uses our calculated boolean
        ]);
    }
}
        });

        res.redirect('/?saved=true');

    } catch (err) {
        console.error('❌ Error saving record:', err);
        res.status(500).send(`<h1>Error Saving Record</h1><p>${err.message}</p><a href="/addFULL">Back to Form</a>`);
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
    req,
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
     req, 
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
      useremail,
      req
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
  // CHECK ADMIN STATUS HERE
  const isAdmin = !!(req.session && req.session.isAdmin);
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
      resistance, partizan, participation, enlistreason,deathdetails,
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
      fetchOrdered('deathdetails_TBL'),
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
    const existingFilenames = multimediaList
        .filter(m => m.file_path && !m.file_path.startsWith('http')) // Only local files, skip URLs
        .map(m => {
            // Get the last part of the path (e.g., "photo.jpg")
            return m.file_path.split('/').pop();
        });
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
      deathdetails,
      multimedia_types: mTypes,
      multimedia: multimediaList,
      existingFiles: existingFilenames,
      locale, // Added: your EJS needs this to pick the right column to show
      isAdmin, // <--- PASS THIS TO THE EJS
      req    // Added: usually helpful for path/query checks in EJS
    });
  } catch (err) {
    console.error('Error rendering update form:', err);
    res.status(500).send('Server error');
  }
});
// Route to handle form submission for updating a soldier
app.post('/updateSoldier/:id', upload.any(), async (req, res) => {
    console.log("========================================");
    console.log("1. RECEIVED REQ.BODY:", JSON.stringify(req.body, null, 2));
    console.log("2. RECEIVED REQ.FILES:", req.files);
    console.log("========================================");
   
    const { id } = req.params;
    const isAdmin = !!(req.session && req.session.isAdmin);

    try {
        // 1. Fetch existing data
        const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!existingSoldier) return res.status(404).send('Soldier not found');

        // --- LOOKUP LOGIC (Standard Field Mappings) ---
        // Helper to handle lookup tables
        const getLookup = async (table, bodyVal, existingHeb, existingEng, existingRus) => {
            if (bodyVal) {
                const row = await db.oneOrNone(`SELECT title_heb, title_eng, title_rus FROM "${table}" WHERE id = $1`, [bodyVal]);
                return row ? { heb: row.title_heb, eng: row.title_eng, rus: row.title_rus } : { heb: existingHeb, eng: existingEng, rus: existingRus };
            }
            return { heb: existingHeb, eng: existingEng, rus: existingRus };
        };

        const bCountry = await getLookup('countries_TBL', req.body.birthcountry, existingSoldier.birthcountry, existingSoldier.birthcountryen, existingSoldier.birthcountryru);
        const sCorps = await getLookup('corps_TBL', req.body.corps, existingSoldier.corps, existingSoldier.corpsen, existingSoldier.corpsru);
        const sPartizan = await getLookup('partizan_TBL', req.body.partizan, existingSoldier.partizan, existingSoldier.partizanen, existingSoldier.partizanru);
        const sArmy = await getLookup('army_TBL', req.body.army, existingSoldier.army, existingSoldier.armyen, existingSoldier.armyru);
        const sResistance = await getLookup('resistance_TBL', req.body.resistance, existingSoldier.resistance, existingSoldier.resistanceen, existingSoldier.resistanceru);
        const sParticipation = await getLookup('participation_TBL', req.body.participation, existingSoldier.participation, existingSoldier.participationen, existingSoldier.participationru);
        const sGender = await getLookup('gender_TBL', req.body.gender, existingSoldier.gender, existingSoldier.genderen, existingSoldier.genderru);
        const sEnlist = await getLookup('enlistreason_TBL', req.body.enlistreason, existingSoldier.enlistreason, existingSoldier.enlistreasonen, existingSoldier.enlistreasonru);
        const sDeathDetails = await getLookup('deathdetails_TBL', req.body.deathdetails, existingSoldier.deathdetails, existingSoldier.deathdetailsen, existingSoldier.deathdetailsru);
        // --- CATEGORY CHECKBOXES ---
        const catUpdate = {};
        for (let i = 1; i <= 8; i++) {
            catUpdate[`cat${i}`] = req.body[`cat${i}`] || ''; 
            catUpdate[`cat${i}en`] = req.body[`cat${i}en`] || ''; 
            catUpdate[`cat${i}ru`] = req.body[`cat${i}ru`] || ''; 
        }

        // --- BOOLEANS & DATES ---
        const isCheckingComplete = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
        let record_complete_boolean = existingSoldier.recordcomplete; 
        let record_complete_date = existingSoldier.record_complete_date;

        if (isCheckingComplete && !existingSoldier.recordcomplete) {
            const today = new Date();
            record_complete_date = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
            record_complete_boolean = true; 
        }

        const adminApprovedVal = req.body.admin_ready_for_download === 'true' || req.body.admin_ready_for_download === 'on';
        let admin_approved_date = existingSoldier.admin_approved_date;
        if (adminApprovedVal && !existingSoldier.admin_ready_for_download) {
            const today = new Date();
            admin_approved_date = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
        }

        // --- PREPARE UPDATE DATA ---
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
            birthcountry: bCountry.heb, birthcountryen: bCountry.eng, birthcountryru: bCountry.rus,
            birthcity: req.body.birthcity || existingSoldier.birthcity,
            birthcityen: req.body.birthcityen || existingSoldier.birthcityen,
            birthcityru: req.body.birthcityru || existingSoldier.birthcityru,
            state: req.body.state || existingSoldier.state,
            stateen: req.body.stateen || existingSoldier.stateen,
            stateru: req.body.stateru || existingSoldier.stateru,
            gender: sGender.heb, genderen: sGender.eng, genderru: sGender.rus,
            placeofdeath: req.body.placeofdeath || existingSoldier.placeofdeath,
            placeofdeathen: req.body.placeofdeathen || existingSoldier.placeofdeathen,
            placeofdeathru: req.body.placeofdeathru || existingSoldier.placeofdeathru,
            //deathdetails: req.body.deathdetails || existingSoldier.deathdetails,
            //deathdetailsen: req.body.deathdetailsen || existingSoldier.deathdetailsen,
            // deathdetailsru: req.body.deathdetailsru || existingSoldier.deathdetailsru,
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
            enlistreason: sEnlist.heb, enlistreasonen: sEnlist.eng, enlistreasonru: sEnlist.rus,
            deathdetails: sDeathDetails.heb, deathdetailsen: sDeathDetails.eng, deathdetailsru: sDeathDetails.rus,
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
            corps: sCorps.heb, corpsen: sCorps.eng, corpsru: sCorps.rus,
            partizan: sPartizan.heb, partizanen: sPartizan.eng, partizanru: sPartizan.rus,
            ...catUpdate,
            army: sArmy.heb, armyen: sArmy.eng, armyru: sArmy.rus,
            resistance: sResistance.heb, resistanceen: sResistance.eng, resistanceru: sResistance.rus,
            participation: sParticipation.heb, participationen: sParticipation.eng, participationru: sParticipation.rus,  
            recordcomplete: record_complete_boolean,
            record_complete_date,
            admin_ready_for_download: adminApprovedVal,
            admin_approved_date,
            uprising_participant: req.body.uprising_participant === 'on' || req.body.uprising_participant === 'true' || existingSoldier.uprising_participant
        };

        const updates = [];
        const values = [];
        let pIndex = 1;

        for (const key in inputData) {
            if (String(inputData[key]) !== String(existingSoldier[key])) {
                updates.push(`"${key}" = $${pIndex}`);
                values.push(inputData[key] === '' ? null : inputData[key]);
                pIndex++;
            }
        }

        // --- MULTIMEDIA PRE-CHECK ---
        const currentDbCountRow = await db.one('SELECT COUNT(*) FROM "multimedia_TBL" WHERE soldier_id = $1', [id]);
        const currentDbCount = parseInt(currentDbCountRow.count);

        const deleteIds = Array.isArray(req.body.delete_multimedia) ? req.body.delete_multimedia : (req.body.delete_multimedia ? [req.body.delete_multimedia] : []);
        const m_descriptions = Array.isArray(req.body.m_description) ? req.body.m_description : (req.body.m_description ? [req.body.m_description] : []);
        const multimediaFiles = req.files ? req.files.filter(f => f.fieldname === 'm_files[]') : [];
        const m_locations = Array.isArray(req.body.physical_logical_location) ? req.body.physical_logical_location : (req.body.physical_logical_location ? [req.body.physical_logical_location] : []);
        const m_types = Array.isArray(req.body.m_type) ? req.body.m_type : (req.body.m_type ? [req.body.m_type] : []);

        let newUploadCount = 0;
        let checkFilePointer = 0;

        for (let k = 0; k < m_descriptions.length; k++) {
            const type = m_types[k];
            const isUrlType = /link|קישור|url|ссылка/i.test(type || "");
            const hasUrl = m_locations[k] && m_locations[k].trim() !== "";
            const hasFile = !isUrlType && multimediaFiles[checkFilePointer];
            
            if (hasFile || hasUrl) {
                newUploadCount++;
                if (hasFile) checkFilePointer++;
            }
        }

        const totalAfterUpdate = (currentDbCount - deleteIds.length) + newUploadCount;
        if (totalAfterUpdate > 15) {
           
            throw new Error("<%= __('form.max_attachments_error') %>");
        }

    // --- START TRANSACTION ---
await db.tx(async t => {
    if (updates.length > 0) {
        const updateSQL = `UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${pIndex}`;
        values.push(id);
        await t.none(updateSQL, values);
    }

    // 1. Delete Multimedia (Existing logic)
    if (deleteIds.length > 0) {
        const filesToDelete = await t.any('SELECT file_path FROM "multimedia_TBL" WHERE id IN ($1:list)', [deleteIds]);
        for (const f of filesToDelete) {
            if (f.file_path && !f.file_path.startsWith('http')) {
                const fullPath = path.join(process.cwd(), 'public', f.file_path);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            }
        }
        await t.none('DELETE FROM "multimedia_TBL" WHERE id IN ($1:list)', [deleteIds]);
    }
    // 2. UPDATE PROFILE PIC SELECTION (ADMIN ONLY)
    // We do this AFTER deletions to ensure the selected ID wasn't just deleted
    if (isAdmin && req.body.profile_pic_id) {
        const selectedPicId = req.body.profile_pic_id;
        
        // Only proceed if the selected ID is NOT in the deletion list
        if (!deleteIds.includes(selectedPicId.toString())) {
            // First, reset all images for this soldier to false
            await t.none('UPDATE "multimedia_TBL" SET is_profile_pic = false WHERE soldier_id = $1', [id]);
            
            // Then, set the chosen one to true
            await t.none('UPDATE "multimedia_TBL" SET is_profile_pic = true WHERE id = $1 AND soldier_id = $2', [selectedPicId, id]);
        }
    }
    // 3. Insert New Multimedia (UPDATED LOGIC)
    
    // Check if the soldier ALREADY has a profile pic in the DB (after deletions)
    const existingPic = await t.oneOrNone('SELECT id FROM "multimedia_TBL" WHERE soldier_id = $1 AND is_profile_pic = true', [id]);
    
    // Tracker: if one exists, we shouldn't assign another one
    const isDeletingProfilePic = deleteIds.includes(existingPic?.id?.toString());
    let profilePicAssigned = !!existingPic && !isDeletingProfilePic;
    let filePointer = 0;

    for (let j = 0; j < m_descriptions.length; j++) {
        const desc = m_descriptions[j].trim();
        const type = m_types[j] || "";
        const loc = m_locations[j] ? m_locations[j].trim() : null;
        const isUrlType = /link|קישור|url|ссылка/i.test(type);

        let finalDbPath = null;
        let currentFile = null;
        let finalLocationLabel = ''; 

        // Handle File Logic
        if (!isUrlType && multimediaFiles[filePointer]) {
            currentFile = multimediaFiles[filePointer];
            filePointer++; 
        }

        // Label Assignment
        if (type.match(/PDF|JPG|תמונה|מסמך|Picture|Document/i)) {
            finalLocationLabel = 'מחיצת קבצים לקישור';
        } else if (isUrlType) {
            finalLocationLabel = 'URL';
        } else {
            finalLocationLabel = loc || 'URL'; 
        }

        if (currentFile || (isUrlType && loc && loc !== "")) {
            const folderName = `A${id}`;
            const targetDir = path.join(PERSISTENT_ROOT, folderName);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

            if (currentFile) {
                const decodedName = Buffer.from(currentFile.originalname, 'latin1').toString('utf8').replace(/\s+/g, '_');
                const finalPath = path.join(targetDir, decodedName);
                fs.renameSync(currentFile.path, finalPath);
                finalDbPath = `/soldierUploads/${folderName}/${decodedName}`;
            } else {
                finalDbPath = loc;
            }

            // --- REFINED PROFILE PIC LOGIC ---
            let setToProfile = false;
            // Check if this row is a picture/image file upload
            const isImageType = /Picture|Image|תמונה|фото/i.test(type);

            // Set to true ONLY if it's an image file AND nothing else is the profile pic yet
            if (isImageType && currentFile && !profilePicAssigned) {
                setToProfile = true;
                profilePicAssigned = true; // Stop any subsequent loops from picking a pic
            }

            await t.none(`
                INSERT INTO "multimedia_TBL" 
                (soldier_id, file_description, file_path, physical_logical_location, multimedia_type, is_profile_pic, uploaded_date) 
                VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [id, desc || ' ', finalDbPath, finalLocationLabel, type, setToProfile]
            );
        }
    }
});

        if (isAdmin) {
            res.redirect('/admin/completedRecords/?saved=true');
        } else {
            res.redirect('/searchResults?saved=true');
        }

    } catch (err) {
        console.error('❌ Update Error:', err);
        res.status(500).send(`<h1>Update Failed</h1><p>${err.message}</p><a href="/updateSoldier/${id}">Go Back</a>`);
    }
});
app.post('/admin/deleteSoldier/:id', async (req, res) => {
    const { id } = req.params;
    const isAdmin = !!(req.session && req.session.isAdmin);

    if (!isAdmin) {
        return res.status(403).send('Unauthorized');
    }

    try {
        await db.tx(async t => {
            // 1. Delete linked multimedia
            await t.none('DELETE FROM "multimedia_TBL" WHERE soldier_id = $1', [id]);
            
            // 2. Delete battle history
            await t.none('DELETE FROM "soldier_battle_history" WHERE soldier_id = $1', [id]);
            
            // 3. Delete the soldier (Using literal table name to avoid 'undefined' error)
            await t.none('DELETE FROM "soldierdetails" WHERE id = $1', [id]);
        });

        // 4. Delete the physical folder
        // Using the "A" prefix as per your table display
        const folderPath = path.join(PERSISTENT_ROOT, `A${id}`);
        if (fs.existsSync(folderPath)) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`Successfully deleted folder: ${folderPath}`);
        }

        res.redirect('/admin/completedRecords?deleted=true');
    } catch (err) {
        console.error('❌ Delete Error:', err);
        res.status(500).send(`Delete failed: ${err.message}`);
    }
});
app.post('/delete-multimedia/:id', async (req, res) => {
    const multimediaId = req.params.id;
    try {
        // 1. Get the file info from DB first
        const item = await db.oneOrNone('SELECT * FROM "multimedia_TBL" WHERE id = $1', [multimediaId]);
        
        if (!item) return res.status(404).send('File not found');

        const soldierId = item.soldier_id;

        // 2. If it's a physical file (not a URL), delete it from the disk
        if (item.file_path) {
            // Convert the DB path (/soldierUploads/A26/file.jpg) to a full system path
            // We replace the virtual prefix with the real disk root
            const absolutePath = item.file_path.replace('/soldierUploads', PERSISTENT_ROOT);
            
            if (fs.existsSync(absolutePath)) {
                fs.unlinkSync(absolutePath);
                console.log(`Successfully deleted file: ${absolutePath}`);
            }
        }

        // 3. Delete from Database
        await db.none('DELETE FROM "multimedia_TBL" WHERE id = $1', [multimediaId]);

        // 4. Redirect back to the update page
        res.redirect(`/updateSoldier/${soldierId}?deleted=true`);

    } catch (err) {
        console.error('Error deleting file:', err);
        res.status(500).send('Error deleting file');
    }
});

// --- GET /admin/completedRecords ---
// --- GET /admin/completedRecords ---
app.get('/admin/completedRecords', requireAdmin, async (req, res) => {
    
    // 1. DEFINE LOCALE (This was missing)
    const locale = req.getLocale() || 'he';
    const saved = req.query.saved === 'true';

    try {
        const soldiers = await db.any(
            `SELECT * FROM ${SOLDIER_TABLE} 
             WHERE recordcomplete = TRUE 
             ORDER BY id DESC`
        );

        // Fetching lookup tables (Keep these so headers/filters work if needed)
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
         const deathdetails = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "deathdetails_TBL"');
        
        // 2. Format the soldiers
        const formattedSoldiers = soldiers.map(s => {
            const isReady = s.admin_ready_for_download === true || String(s.admin_ready_for_download) === 'true';

            return {
                ...s, 
                record_complete_date: s.record_complete_date || 'N/A',
                uploaded_date: s.uploaded_date ? new Date(s.uploaded_date).toLocaleDateString('en-CA') : 'N/A',
                admin_approved_date: s.admin_approved_date || 'N/A',
                ready_status: isReady ? '✅' : '❌', 
                downloaded_date: s.downloaded_date || 'N/A'
            };
        });

        // 3. Render with ALL needed variables
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

            locale,   // Added this
            saved,    // Cleaned this up
            req
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
    const getField = (name) => req.body[name + '[]'] || req.body[name] || [];
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
/*let category = existingSoldier.category;
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
}*/
// --- CATEGORY CHECKBOXES LOOKUP ---
// Put this right before your "const inputData = {" line
const categoryCheckboxes = {};
for (let i = 1; i <= 8; i++) {
    const key = `cat${i}`;
    categoryCheckboxes[key] = req.body[key] || ''; 
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
            battle_detailsen = [], battle_detailsru = [], degreeranadmin_readyk = [],
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
  // --- Updated Category Logic for all 3 languages ---
  const catUpdate = {};
  for (let i = 1; i <= 8; i++) {
    const base = `cat${i}`;
    const baseEn = `cat${i}en`;
    const baseRu = `cat${i}ru`;

    // Grabbing the hidden fields from req.body (populated by the JS sync function)
    catUpdate[base] = req.body[base] || ''; 
    catUpdate[baseEn] = req.body[baseEn] || ''; 
    catUpdate[baseRu] = req.body[baseRu] || ''; 
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
      //category, categoryen, categoryru,
      /*cat1: catUpdate.cat1,
      cat2: catUpdate.cat2,
      cat3: catUpdate.cat3,
      cat4: catUpdate.cat4,
      cat5: catUpdate.cat5,
      cat6: catUpdate.cat6,
      cat7: catUpdate.cat7,
      cat8: catUpdate.cat8,*/
      ...catUpdate, // This magic line injects all 24 cat fields into inputData automatically
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

// --- STEP D: HANDLE MULTIMEDIA (ADMIN SYNCHRONIZED) ---

// 1. Extract Arrays
const descArr = [].concat(getField('m_description'));
const typeArr = [].concat(getField('m_type'));
const locArr  = [].concat(getField('physical_logical_location')); 
const mFiles  = (req.files && req.files['m_files[]']) ? [].concat(req.files['m_files[]']) : [];

// 2. Profile Pic & Directory Setup
const existingProfilePic = await t.oneOrNone(
    'SELECT id FROM "multimedia_TBL" WHERE soldier_id = $1 AND is_profile_pic = true LIMIT 1',
    [soldierId]
);
let hasProfilePic = !!existingProfilePic;

const folderName = `A${soldierId}`;
const targetDir = path.join(PERSISTENT_ROOT, folderName);
if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

// 3. The File Pointer logic
let filePtr = 0; 

for (let i = 0; i < descArr.length; i++) {
    let finalDbPath = null;
    let finalLocationLabel = '';
    const currentType = (typeArr[i] || '').toString().trim();
    
    // Check if this row is a URL/Link
    const isUrlType = currentType.toLowerCase().includes('url') || 
                      currentType.toLowerCase().includes('link') || 
                      currentType.includes('קישור') || 
                      currentType.includes('ссылка');

    if (isUrlType) {
        // CASE A: URL Link - Use the text input, ignore the file array
        finalDbPath = (locArr[i] || '').trim();
        finalLocationLabel = 'URL';
    } else {
        // CASE B: File Upload - Use the file array
        if (mFiles[filePtr]) {
            const file = mFiles[filePtr];

            // SERVER-SIDE TYPE VALIDATION (Optional)
            // If user selected 'Photo' but uploaded a PDF, you could throw an error here
            // if (currentType.includes('תמונה') && file.mimetype === 'application/pdf') { ... }

            const decodedFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            const finalPath = path.join(targetDir, decodedFileName);
            
            fs.renameSync(file.path, finalPath);
            
            finalDbPath = `/soldierUploads/${folderName}/${decodedFileName}`;
            finalLocationLabel = 'מחיצת קבצים לקישור';
            
            filePtr++; // Only increment when a file is actually used
        }
    }

    // 4. Save to Database
    if (finalDbPath || descArr[i]) {
        // Rules: No profile pic for URL links, and only for the first new file in this batch
        const setToProfile = (!hasProfilePic && i === 0 && !isUrlType && finalDbPath !== null);
        if (setToProfile) hasProfilePic = true; 

        await t.none(`
            INSERT INTO "multimedia_TBL" 
            (soldier_id, file_description, file_path, multimedia_type, physical_logical_location, is_profile_pic, uploaded_date)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
            soldierId, 
            descArr[i] || 'No Description', 
            finalDbPath, 
            currentType || null,
            finalLocationLabel, 
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
//app.get('/adminUpdateSoldier/:id', async (req, res) => {
  app.get('/adminUpdateSoldier/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const locale = req.getLocale() || 'he';

    // Map locale to the specific DB column for sorting
    const langMap = { 'he': 'title_heb', 'en': 'title_eng', 'ru': 'title_rus' };
    const sortCol = langMap[locale] || 'title_heb';

    try {
        const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!soldier) return res.status(404).send('Soldier not found');

        const fetchOrdered = (table) => 
            db.any(`SELECT id, title_heb, title_eng, title_rus FROM "${table}" ORDER BY $(col:name) ASC`, { col: sortCol });

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
            db.any('SELECT * FROM "multimedia_TBL" WHERE soldier_id = $1', [id]),
            db.any('SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id', [id])
        ]);

        const medals = await db.any('SELECT id, title FROM "medals_TBL"'); 
        const mTypes = await db.any('SELECT * FROM "multimedia_type_TBL" ORDER BY id');

        const unknownIndex = countries.findIndex(c => Number(c.id) === 0);
        if (unknownIndex > 0) { 
            const [unknownItem] = countries.splice(unknownIndex, 1);
            countries.unshift(unknownItem);
        }

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

app.post('/admin/downloadExcel', requireAdmin, async (req, res) => {
    const BATTLE_HISTORY_TABLE = 'soldier_battle_history';
    const MULTIMEDIA_TABLE = 'multimedia_TBL';
    const MAX_FILES = 15; 
    const MAX_BATTLES = 5; // Future-proofing for Battle History slots

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

        // 1. Fetch Data
        const soldiers = await db.any(`SELECT * FROM soldierdetails WHERE id IN ($1:csv)`, [ids]);
       // const multimediaRecords = await db.any(`SELECT * FROM "${MULTIMEDIA_TABLE}" WHERE soldier_id IN ($1:csv) ORDER BY id`, [ids]);
        const multimediaRecords = await db.any(`
            SELECT * FROM "${MULTIMEDIA_TABLE}" 
            WHERE soldier_id IN ($1:csv) 
            ORDER BY soldier_id, is_profile_pic DESC, id ASC
            `, [ids]);
        // --- Fetch Battle History (Fetched for XML, even if skipped in Excel) ---
        const battleHistory = await db.any(`SELECT * FROM ${BATTLE_HISTORY_TABLE} WHERE soldier_id IN ($1:csv) ORDER BY id`, [ids]);
        const battleMap = {};
        battleHistory.forEach(b => {
            const sId = String(b.soldier_id).trim();
            if (!battleMap[sId]) battleMap[sId] = [];
            battleMap[sId].push(b);
        });

        // 2. Map Multimedia and Calculate Max for Excel
        const multiMap = {};
        let maxFilesFoundInBatch = 0;
        multimediaRecords.forEach(m => {
            const sId = String(m.soldier_id).trim();
            if (!multiMap[sId]) multiMap[sId] = [];
            multiMap[sId].push(m);
            if (multiMap[sId].length > maxFilesFoundInBatch) maxFilesFoundInBatch = multiMap[sId].length;
        });

        const excelFileColumnCount = Math.min(maxFilesFoundInBatch, MAX_FILES);

        // 3. Generate Header/Tag Maps
        const catXmlTags = {};
        const catHeaders = {};
        for (let i = 1; i <= 8; i++) {
            catXmlTags[`cat${i}`] = `Category_${i}_HEB`;
            catXmlTags[`cat${i}en`] = `Category_${i}_ENG`;
            catXmlTags[`cat${i}ru`] = `Category_${i}_RUS`;
            catHeaders[`cat${i}`] = `קטגוריה_${i}_HEB`;
            catHeaders[`cat${i}en`] = `קטגוריה_${i}_ENG`;
            catHeaders[`cat${i}ru`] = `קטגוריה_${i}_RUS`;
        }
        
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

        ...catXmlTags, // Dynamic XML Tags injected here

        'platoonname': 'Platoon_HEB', 'platoonnameen': 'Platoon_ENG', 'platoonnameru': 'Platoon_RUS',
        'armyrole': 'Role_HEB', 'armyroleen': 'Role_ENG', 'armyroleru': 'Role_RUS',
        'wounddetails': 'WoundDetails_HEB', 'wounddetailsen': 'WoundDetails_ENG', 'wounddetailsru': 'WoundDetails_RUS',
        'deathdetails': 'DeathDetails_HEB', 'deathdetailsen': 'DeathDetails_ENG', 'deathdetailsru': 'DeathDetails_RUS',
        'dod': 'DateOfDeath',
        'placeofdeath': 'PlaceOfDeath_HEB', 'placeofdeathen': 'PlaceOfDeath_ENG', 'placeofdeathru': 'PlaceOfDeath_RUS',
        'enlistreason': 'EnlistReason_HEB', 'enlistreasonen': 'EnlistReason_ENG', 'enlistreasonru': 'EnlistReason_RUS',
        'rank': 'Rank_HEB', 'ranken': 'Rank_ENG', 'rankru': 'Rank_RUS',
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
        'download_date': 'DownloadDate',
        'fname_submitter_name': 'FirstName_Submitter', 
        'lname_submitter_name': 'LastName_Submitter',
        'phone_soldier_submitter': 'Submitter_PhoneNumber',
        'useremail': 'Submitter_EMail',
        'relation_of_soldier_submitter': 'Relation_to_Submitter',
        'how_found_us_submitter' : 'HowFoundUs_Submitter',
        };

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
        // Added cat1-cat8 headers
        //'cat1': 'קטגוריה_1', 'cat2': 'קטגוריה_2', 'cat3': 'קטגוריה 3', 'cat4': 'קטגוריה 4',
        //'cat5': 'קטגוריה 5', 'cat6': 'קטגוריה 6', 'cat7': 'קטגוריה 7', 'cat8': 'קטגוריה 8',
           ...catHeaders, // Spread the TITLES here, not the data
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
        'name_soldier_submitter': 'איש קשר',
        "phone_soldier_submitter" : 'טלפון קשר',
        "useremail" : 'אימייל קשר',
        "relation_of_soldier_submitter" : 'קרבה ללוחם',
        "how_found_us_submitter" : 'כיצד הגעת',
        
            ...Array.from({ length: excelFileColumnCount }, (_, n) => ({
                [`file_${n + 1}_path`]: `שם קובץ ${n + 1}`,
                [`file_${n + 1}_desc`]: `מולטימדיה - תיאור ${n + 1}`,
                [`file_${n + 1}_type`]: `סוג מולטימדיה ${n + 1}`, 
                [`file_${n + 1}_loc`]: `מיקום לוגי פיזי ${n + 1}`, 
            })).reduce((acc, curr) => ({ ...acc, ...curr }), {}),
        };

        // 4. Flatten Rows & Prepare Manifest
        const dateFields = ['dob', 'dod', 'aliyadate'];
        const excludeFields = ['fightingdesc', 'recordcomplete', 'admin_ready_for_download', 'record_complete_date', 'admin_approved_date', 'downloaded_date', 'uprising_participant', 'soldier_previously_submitted', 'category', 'categoryen', 'categoryru'];

        // Initialize Manifest String
        let manifestContent = `EXPORT MANIFEST\nGenerated on: ${downloadDateString}\nTotal Soldiers: ${soldiers.length}\n`;
        manifestContent += `--------------------------------------------------\n\n`;

        const flattenedRows = soldiers.map(s => {
            const row = {};
            const cleanId = String(s.id).trim();

            for (const key in s) {
                if (!excludeFields.includes(key)) {
                    row[key] = dateFields.includes(key) ? formatDateToDDMMYYYY(s[key]) : s[key];
                }
            }
            row.name_soldier_submitter = `${s.fname_soldier_submitter || ''} ${s.lname_soldier_submitter || ''}`.trim();
           
    
    
            row.phone_soldier_submitter = s.phone_soldier_submitter || '';
            row.useremail = s.useremail || '';
            row.relation_of_soldier_submitter = s.relation_of_soldier_submitter || '';
            row.id = `A${cleanId}`;
            row.download_date = downloadDateString;
            row.biography_plain = `${s.biography || ''}\n\n${s.fightingdesc || ''}`;
            row.biography = {
                richText: [
                    { font: { bold: true, size: 14 }, text: 'קורות חיים'  },
                    { font: { size: 12 }, text: `\n${s.biography || ''}\n\n` },
                    { font: { bold: true, size: 14 }, text: 'סיפור אישי:' },
                    { font: { size: 12 }, text: `\n${s.fightingdesc || ''}` }
                ]
            };

            // Manifest Soldier Header
            manifestContent += `Soldier: ${row.id} | Name: ${s.fname || ''} ${s.lname || ''}\n`;

            // Multimedia Prep
const sMedia = multiMap[cleanId] || [];
    for (let n = 1; n <= MAX_FILES; n++) {
    const m = sMedia[n - 1];
    row[`file_${n}_desc`] = m ? (m.file_description || '') : '';
    row[`file_${n}_type`] = m ? (m.multimedia_type || '') : '';
    row[`file_${n}_loc`] = m ? (m.physical_logical_location || '') : '';
    
    if (m && m.file_path) {
        // 1. Get just the filename (e.g., "56-69.pdf")
        const fileNameOnly = path.basename(m.file_path);
        let cleanFileName = fileNameOnly;

        // 2. Only strip if it's a real timestamp (long number at the start)
        const parts = fileNameOnly.split('-');
        if (parts.length > 1 && /^\d{10,15}$/.test(parts[0])) {
            cleanFileName = fileNameOnly.substring(fileNameOnly.indexOf('-') + 1);
        }

        // 3. Construct the final display path
        row[`file_${n}_path`] = m.physical_logical_location === "URL" 
            ? m.file_path 
            : `Images\\Warrior Pages\\multimediaFiles\\A${cleanId}\\${cleanFileName}`;
        
        // 4. Add to manifest (using the protected name)
        manifestContent += `   [File ${n}] ${cleanFileName} (${m.multimedia_type || 'Unknown'})\n`;
    } else { 
        row[`file_${n}_path`] = ''; 
    }
}

            // Battle History Prep (For XML)
            const sBattles = battleMap[cleanId] || [];
            for (let n = 1; n <= MAX_BATTLES; n++) {
                const b = sBattles[n - 1];
                row[`battle_${n}_year`] = b ? (b.battleyear || '') : '';
                row[`battle_${n}_front`] = b ? (b.front || '') : '';
                row[`battle_${n}_battle`] = b ? (b.battle || '') : '';
                row[`battle_${n}_medal`] = b ? (b.medal || '') : '';
                row[`battle_${n}_rank`] = b ? (b.degreerank || '') : '';
            }

            manifestContent += `--------------------------------------------------\n`;
            return row;
        });

        // 5. Excel Generation
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Soldiers');
        const allKeys = Object.keys(EXCEL_HEADER_MAP);
        sheet.columns = allKeys.map(k => ({
            header: EXCEL_HEADER_MAP[k],
            key: k,
            width: k === 'biography' ? 40 : 20,
            style: { numFmt: '@', alignment: { vertical: 'top', wrapText: true } }
        }));
        flattenedRows.forEach(row => sheet.addRow(row));
        const excelBuffer = await workbook.xlsx.writeBuffer();

        // 6. XML Generation (Forcing all tags)
        const xmlRoot = create({ version: '1.0', encoding: 'UTF-8' }).ele('Soldiers');
        flattenedRows.forEach(row => {
            const soldierNode = xmlRoot.ele('Soldier');
            
            // Standard Tags
            Object.keys(XML_TAG_MAP).forEach(key => {
                const tagName = XML_TAG_MAP[key];
                let val = (key === 'biography') ? row.biography_plain : row[key];
                soldierNode.ele(tagName).txt(String(val || '')).up();
            });

            // Battle History Blocks (Future Usage)
            for (let n = 1; n <= MAX_BATTLES; n++) {
                const battleBlock = soldierNode.ele(`Battle_Record_${n}`);
                battleBlock.ele(`Year`).txt(row[`battle_${n}_year`]).up();
                battleBlock.ele(`Front`).txt(row[`battle_${n}_front`]).up();
                battleBlock.ele(`Battle`).txt(row[`battle_${n}_battle`]).up();
                battleBlock.ele(`Medal`).txt(row[`battle_${n}_medal`]).up();
                battleBlock.ele(`Rank`).txt(row[`battle_${n}_rank`]).up();
                battleBlock.up();
            }

            // Multimedia Blocks
            for (let n = 1; n <= MAX_FILES; n++) {
                const fileBlock = soldierNode.ele(`Multimedia_Record_${n}`);
                fileBlock.ele(`Description`).txt(row[`file_${n}_desc`]).up();
                fileBlock.ele(`Type`).txt(row[`file_${n}_type`]).up();
                fileBlock.ele(`Path`).txt(row[`file_${n}_path`]).up();
                fileBlock.ele(`Location`).txt(row[`file_${n}_loc`]).up();
                fileBlock.up();
            }
            soldierNode.up();
        });
        const xmlString = xmlRoot.end({ prettyPrint: true });

        // 7. ZIP and Send
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="Full_Export_${safeDate}.zip"`);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        // Add Excel, XML, and Manifest
        archive.append(excelBuffer, { name: `soldiers_data_${safeDate}.xlsx` });
        archive.append(xmlString, { name: `soldiers_data_${safeDate}.xml` });
        archive.append(manifestContent, { name: `manifest_${safeDate}.txt` });

        // Add Multimedia Folders
        ids.forEach(id => {
            const cleanId = String(id).trim();
            const folderPath = path.join(PERSISTENT_ROOT, `A${cleanId}`);
            if (fs.existsSync(folderPath)) archive.directory(folderPath, `multimediaFiles/A${cleanId}`);
        });

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