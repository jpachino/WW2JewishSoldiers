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
function cleanNulls(obj) {
  const cleaned = {};
  for (const key in obj) {
    cleaned[key] = obj[key] === '' ? null : obj[key];
  }
  return cleaned;
}

app.get('/addFull', async (req, res) => {
  const locale = req.query.lang || req.cookies.lang || 'he'; // fallback to cookie or Hebrew

  try {
    // Use db.any from pg-promise
    const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL"');
    const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL"');
    const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL"');
    const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL"');
    const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL"');
    const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL"');
    const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL"');
    const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');

    console.log('Rendering addFULL.ejs form');

    res.render('addFULL', {
      locale,
      countries,
      category,
      army,
      resistance,
      partizan,
      participation,
      corps,
      medals,

      // Empty soldier object for a "new" record
      soldier: {
        dob: '',
        dod: '',
        aliyadate: '',
        idf_enlistdate: '',
        idf_releasedate: '',
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
// Route to handle form submission for adding a soldier
app.post('/addFULL', upload.array('files'), async (req, res) => {
  try {
    const cleaned = cleanNulls(req.body);

    // Handle record complete checkbox
    cleaned.recordcomplete = Array.isArray(cleaned.recordcomplete)
      ? cleaned.recordcomplete.includes('true') || cleaned.recordcomplete.includes('on')
      : cleaned.recordcomplete === 'true' || cleaned.recordcomplete === 'on';

    // Store user-provided record_complete_date as TEXT
    const recordCompleteDate = cleaned.recordcomplete
      ? cleaned.record_complete_date || ''
      : '';

    // Handle uprising participant checkbox
    cleaned.uprising_participant = Array.isArray(cleaned.uprising_participant)
      ? cleaned.uprising_participant.includes('true') || cleaned.uprising_participant.includes('on')
      : cleaned.uprising_participant === 'true' || cleaned.uprising_participant === 'on';

    // Extract battle history arrays
    const {
      battleyear = [], front = [], battle = [], battle_medal = [], battle_details = [],
      degreerank = [], job = [],
      fronten = [], battleen = [], battle_medalen = [], battle_detailsen = [],
      degreeranken = [], joben = [],
      frontru = [], battleru = [], battle_medalru = [], battle_detailsru = [],
      degreerankru = [], jobru = []
    } = req.body;

    await db.tx(async t => {

      // === INSERT SOLDIER (TEXT DATES, NO PARSING) ===
      const insertedSoldier = await t.one(`
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
          degree, degreeen, degreeru,
          title, titleen, titleru,
          linkurl,
          category, army, resistance,
          partizan, participation, corps,
          useremail,
          recordcomplete, record_complete_date,
          admin_ready_for_download, admin_approved_date, downloaded_date,
          other_medal, other_medalen, other_medalru,
          uprising_participant, fname_soldier_submitter, lname_soldier_submitter, 
          relation_of_soldier_submitter, phone_soldier_submitter, soldier_previously_submitted
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          $10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,
          $28,$29,$30,$31,$32,$33,$34,$35,$36,
          $37,$38,$39,$40,$41,$42,$43,$44,$45,
          $46,$47,$48,$49,$50,$51,$52,$53,$54,
          $55,$56,$57,$58,$59,$60,$61,$62,$63,
          $64,$65,$66,$67,$68,$69,$70,$71,$72,
          $73,$74,$75,$76,$77,$78,$79,$80,$81,
          $82,$83,$84,$85,$86,$87,$88,$89,$90,
          $91
        ) RETURNING id
      `, [
        cleaned.fname, cleaned.fnameen, cleaned.fnameru,
        cleaned.lname, cleaned.lnameen, cleaned.lnameru,
        cleaned.previouslname, cleaned.previouslnameen, cleaned.previouslnameru,
        cleaned.fathername, cleaned.fathernameen, cleaned.fathernameru,
        cleaned.mothername, cleaned.mothernameen, cleaned.mothernameru,
        cleaned.calledby, cleaned.calledbyen, cleaned.calledbyru,
        cleaned.birthcountry, cleaned.otherbirthcountry,
        cleaned.birthcity, cleaned.birthcityen, cleaned.birthcityru,
        cleaned.gender,
        cleaned.placeofdeath, cleaned.placeofdeathen, cleaned.placeofdeathru,
        cleaned.deathdetails, cleaned.deathdetailsen, cleaned.deathdetailsru,
        cleaned.biography, cleaned.biographyen, cleaned.biographyru,
        cleaned.otherparticipation,
        cleaned.otherdecoration, cleaned.otherdecorationen, cleaned.otherdecorationru,
        cleaned.fightingdesc, cleaned.fightingdescen, cleaned.fightingdescru,
        cleaned.shortdesc,
        cleaned.armyrole, cleaned.armyroleen, cleaned.armyroleru,
        cleaned.releasereason, cleaned.releasereasonen, cleaned.releasereasonru,
        cleaned.enlistreason,
        cleaned.platoonname, cleaned.platoonnameen, cleaned.platoonnameru,
        cleaned.wounddetails, cleaned.wounddetailsen, cleaned.wounddetailsru,
        cleaned.gettodesc, cleaned.gettodescen, cleaned.gettodescru,
        cleaned.otherfightingcontext,
        cleaned.armyid,
        cleaned.datebreaker,
        cleaned.dob, cleaned.dod, cleaned.aliyadate,   // TEXT
        cleaned.degree, cleaned.degreeen, cleaned.degreeru,
        cleaned.title, cleaned.titleen, cleaned.titleru,
        cleaned.linkurl,
        cleaned.category, cleaned.army, cleaned.resistance,
        cleaned.partizan, cleaned.participation, cleaned.corps,
        cleaned.useremail,
        cleaned.recordcomplete, recordCompleteDate,     // TEXT
        cleaned.admin_ready_for_download,
        cleaned.admin_approved_date,                   // TEXT
        cleaned.downloaded_date,                       // TEXT
        cleaned.other_medal, cleaned.other_medalen, cleaned.other_medalru,
        cleaned.uprising_participant,
        cleaned.fname_soldier_submitter,
        cleaned.lname_soldier_submitter,
        cleaned.phone_soldier_submitter,
        cleaned.relation_of_soldier_submitter,
        cleaned.soldier_previously_submitted
      ]);

      const soldierId = insertedSoldier.id;

      // === INSERT BATTLE HISTORY ===
      for (let i = 0; i < battleyear.length; i++) {
        const hasContent =
          (battleyear[i] && battleyear[i].trim() !== '') ||
          (front[i] && front[i].trim() !== '') ||
          (battle[i] && battle[i].trim() !== '') ||
          (battle_medal[i] && battle_medal[i].trim() !== '') ||
          (battle_details[i] && battle_details[i].trim() !== '') ||
          (degreerank[i] && degreerank[i].trim() !== '') ||
          (job[i] && job[i].trim() !== '') ||
          (fronten[i] && fronten[i].trim() !== '') ||
          (battleen[i] && battleen[i].trim() !== '') ||
          (battle_medalen[i] && battle_medalen[i].trim() !== '') ||
          (battle_detailsen[i] && battle_detailsen[i].trim() !== '') ||
          (degreeranken[i] && degreeranken[i].trim() !== '') ||
          (joben[i] && joben[i].trim() !== '') ||
          (frontru[i] && frontru[i].trim() !== '') ||
          (battleru[i] && battleru[i].trim() !== '') ||
          (battle_medalru[i] && battle_medalru[i].trim() !== '') ||
          (battle_detailsru[i] && battle_detailsru[i].trim() !== '') ||
          (degreerankru[i] && degreerankru[i].trim() !== '') ||
          (jobru[i] && jobru[i].trim() !== '');

        if (!hasContent) continue;

        await t.none(`
          INSERT INTO soldier_battle_history
            (soldier_id, battleyear, front, battle, medal, details, degreerank, job,
             fronten, battleen, medalen, detailsen, degreeranken, joben,
             frontru, battleru, medalru, detailsru, degreerankru, jobru)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        `, [
          soldierId,
          battleyear[i] || null,
          front[i] || null,
          battle[i] || null,
          battle_medal[i] || null,
          battle_details[i] || null,
          degreerank[i] || null,
          job[i] || null,
          fronten[i] || null,
          battleen[i] || null,
          battle_medalen[i] || null,
          battle_detailsen[i] || null,
          degreeranken[i] || null,
          joben[i] || null,
          frontru[i] || null,
          battleru[i] || null,
          battle_medalru[i] || null,
          battle_detailsru[i] || null,
          degreerankru[i] || null,
          jobru[i] || null
        ]);
      }

      // === FILE UPLOADS ===
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await t.none(`
            INSERT INTO uploaded_files (soldier_id, original_name, file_path)
            VALUES ($1, $2, $3)
          `, [soldierId, file.originalname, file.path]);
        }
      }
    });

    res.redirect('/?saved=true');

  } catch (err) {
    console.error('❌ Error inserting record:', err);
    res.status(500).send(`
      <h1>Error</h1>
      <p>${err.message}</p>
      <pre>${err.stack}</pre>
      <a href="/addFull">Back to form</a>
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
  console.log('Get /updateSoldier/:id hit for ID:', id);

  try {
    // Fetch soldier with all fields
    const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!soldier) return res.status(404).send('Soldier not found');

    // Lookup tables
    const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL"');
    const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
    const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL"');
    const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL"');
    const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL"');
    const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL"');
    const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL"');
    const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL"');

    // Battle history
    const battleHistory = await db.any('SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id', [id]);

    // Render update form with all soldier fields
    res.render('updateSoldier', {
      soldier,
      countries,
      medals,
      corps,
      category,
      army,
      resistance,
      partizan,
      participation,
      battleHistory: battleHistory || [],
      // Optional: you can include empty arrays for file uploads if needed
      uploadedFiles: await db.any('SELECT * FROM uploaded_files WHERE soldier_id = $1', [id]) || []
    });

  } catch (err) {
    console.error('Error rendering update form:', err);
    res.status(500).send('Server error');
  }
});

// Route to handle form submission for updating a soldier

app.post('/updateSoldier/:id', upload.array('files'), async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch existing soldier
    const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
    if (!existingSoldier) return res.status(404).send('Soldier not found');

    // Extract battle history arrays
    const {
      battleId = [], battleyear = [], front = [], fronten = [], frontru = [],
      battle = [], battleen = [], battleru = [],
      battle_medal = [], battle_medalen = [], battle_medalru = [],
      battle_details = [], battle_detailsen = [], battle_detailsru = [],
      degreerank = [], degreeranken = [], degreerankru = [],
      job = [], joben = [], jobru = []
    } = req.body;

    // Boolean fields
    const recordcomplete = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
    const uprising_participant = req.body.uprising_participant === 'true' || req.body.uprising_participant === 'on';

    // Record complete date
    let record_complete_date = existingSoldier.record_complete_date;
    if (recordcomplete && !existingSoldier.recordcomplete) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      record_complete_date = `${dd}/${mm}/${yyyy}`;
    } else if (!recordcomplete) {
      record_complete_date = null;
    }

    // Build update object
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
      birthcountry: req.body.birthcountry || existingSoldier.birthcountry,
      otherbirthcountry: req.body.otherbirthcountry || existingSoldier.otherbirthcountry,
      birthcity: req.body.birthcity || existingSoldier.birthcity,
      birthcityen: req.body.birthcityen || existingSoldier.birthcityen,
      birthcityru: req.body.birthcityru || existingSoldier.birthcityru,
      gender: req.body.gender || existingSoldier.gender,
      placeofdeath: req.body.placeofdeath || existingSoldier.placeofdeath,
      placeofdeathen: req.body.placeofdeathen || existingSoldier.placeofdeathen,
      placeofdeathru: req.body.placeofdeathru || existingSoldier.placeofdeathru,
      deathdetails: req.body.deathdetails || existingSoldier.deathdetails,
      deathdetailsen: req.body.deathdetailsen || existingSoldier.deathdetailsen,
      deathdetailsru: req.body.deathdetailsru || existingSoldier.deathdetailsru,
      biography: req.body.biography || existingSoldier.biography,
      biographyen: req.body.biographyen || existingSoldier.biographyen,
      biographyru: req.body.biographyru || existingSoldier.biographyru,
      otherparticipation: req.body.otherparticipation || existingSoldier.otherparticipation,
      otherdecoration: req.body.otherdecoration || existingSoldier.otherdecoration,
      otherdecorationen: req.body.otherdecorationen || existingSoldier.otherdecorationen,
      otherdecorationru: req.body.otherdecorationru || existingSoldier.otherdecorationru,
      fightingdesc: req.body.fightingdesc || existingSoldier.fightingdesc,
      fightingdescen: req.body.fightingdescen || existingSoldier.fightingdescen,
      fightingdescru: req.body.fightingdescru || existingSoldier.fightingdescru,
      shortdesc: req.body.shortdesc || existingSoldier.shortdesc,
      armyrole: req.body.armyrole || existingSoldier.armyrole,
      armyroleen: req.body.armyroleen || existingSoldier.armyroleen,
      armyroleru: req.body.armyroleru || existingSoldier.armyroleru,
      releasereason: req.body.releasereason || existingSoldier.releasereason,
      releasereasonen: req.body.releasereasonen || existingSoldier.releasereasonen,
      releasereasonru: req.body.releasereasonru || existingSoldier.releasereasonru,
      enlistreason: req.body.enlistreason || existingSoldier.enlistreason,
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
      armyid: req.body.armyid || existingSoldier.armyid,
      datebreaker: req.body.datebreaker || existingSoldier.datebreaker,
      dob: req.body.dob || existingSoldier.dob,
      dod: req.body.dod || existingSoldier.dod,
      aliyadate: req.body.aliyadate || existingSoldier.aliyadate,
      idf_enlistdate: req.body.idf_enlistdate || existingSoldier.idf_enlistdate,
      idf_releasedate: req.body.idf_releasedate || existingSoldier.idf_releasedate,
      medal: req.body.medal || existingSoldier.medal,
      medalen: req.body.medalen || existingSoldier.medalen,
      medalru: req.body.medalru || existingSoldier.medalru,
      degree: req.body.degree || existingSoldier.degree,
      degreeen: req.body.degreeen || existingSoldier.degreeen,
      degreeru: req.body.degreeru || existingSoldier.degreeru,
      title: req.body.title || existingSoldier.title,
      titleen: req.body.titleen || existingSoldier.titleen,
      titleru: req.body.titleru || existingSoldier.titleru,
      linkurl: req.body.linkurl || existingSoldier.linkurl,
      useremail: req.body.useremail && req.body.useremail.trim() !== '' ? req.body.useremail : existingSoldier.useremail,
      category: req.body.category || existingSoldier.category,
      army: req.body.army || existingSoldier.army,
      resistance: req.body.resistance || existingSoldier.resistance,
      partizan: req.body.partizan || existingSoldier.partizan,
      participation: req.body.participation || existingSoldier.participation,
      corps: req.body.corps || existingSoldier.corps,
      recordcomplete,
      record_complete_date,
      admin_ready_for_download: req.body.admin_ready_for_download === 'on' || existingSoldier.admin_ready_for_download,
      admin_approved_date: req.body.admin_approved_date || existingSoldier.admin_approved_date,
      downloaded_date: req.body.downloaded_date || existingSoldier.downloaded_date,
      other_medal: req.body.other_medal || existingSoldier.other_medal,
      other_medalen: req.body.other_medalen || existingSoldier.other_medalen,
      other_medalru: req.body.other_medalru || existingSoldier.other_medalru,
      uprising_participant
    };

    // Prepare SQL update
    const updates = [];
    const values = [];
    let i = 1;
    for (const key in inputData) {
      updates.push(`"${key}" = $${i}`);
      values.push(inputData[key]);
      i++;
    }
    values.push(id); // For WHERE clause

    await db.tx(async t => {
      // Update soldier
      await t.none(`UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`, values);

      // Update/insert battle history
      for (let j = 0; j < battleyear.length; j++) {
        const hasContent =
          (battleyear[j] && battleyear[j].trim()) ||
          (front[j] && front[j].trim()) ||
          (battle[j] && battle[j].trim());

        if (!hasContent) continue;

        if (battleId[j]) {
          // Update existing
          await t.none(
            `UPDATE soldier_battle_history
             SET battleyear=$1, front=$2, fronten=$3, frontru=$4,
                 battle=$5, battleen=$6, battleru=$7,
                 medal=$8, medalen=$9, medalru=$10,
                 details=$11, detailsen=$12, detailsru=$13,
                 degreerank=$14, degreeranken=$15, degreerankru=$16,
                 job=$17, joben=$18, jobru=$19, updated_at=NOW()
             WHERE id=$20 AND soldier_id=$21`,
            [
              battleyear[j] || null, front[j] || null, fronten[j] || null, frontru[j] || null,
              battle[j] || null, battleen[j] || null, battleru[j] || null,
              battle_medal[j] || null, battle_medalen[j] || null, battle_medalru[j] || null,
              battle_details[j] || null, battle_detailsen[j] || null, battle_detailsru[j] || null,
              degreerank[j] || null, degreeranken[j] || null, degreerankru[j] || null,
              job[j] || null, joben[j] || null, jobru[j] || null,
              battleId[j], id
            ]
          );
        } else {
          // Insert new
          await t.none(
            `INSERT INTO soldier_battle_history (
                soldier_id, battleyear, front, fronten, frontru,
                battle, battleen, battleru, medal, medalen, medalru,
                details, detailsen, detailsru,
                degreerank, degreeranken, degreerankru,
                job, joben, jobru
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
            [
              id, battleyear[j] || null, front[j] || null, fronten[j] || null, frontru[j] || null,
              battle[j] || null, battleen[j] || null, battleru[j] || null,
              battle_medal[j] || null, battle_medalen[j] || null, battle_medalru[j] || null,
              battle_details[j] || null, battle_detailsen[j] || null, battle_detailsru[j] || null,
              degreerank[j] || null, degreeranken[j] || null, degreerankru[j] || null,
              job[j] || null, joben[j] || null, jobru[j] || null
            ]
          );
        }
      }

      // Handle file uploads
      if (req.files && req.files.length > 0) {
        const fileInserts = req.files.map(file =>
          t.none(
            `INSERT INTO uploaded_files (soldier_id, original_name, file_path) VALUES ($1,$2,$3)`,
            [id, file.originalname, file.path]
          )
        );
        await t.batch(fileInserts);
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
             ORDER BY lname, fname`
        );

        const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL"');
        const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
        const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL"');
        const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL"');
        const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL"');
        const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL"');
        const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL"');
        const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL"');

        // ❗ NO DATE CONVERSION — database now stores formatted text already
        const formattedSoldiers = soldiers.map(s => ({
            ...s,
            dob: s.dob || 'N/A',
            dod: s.dod || 'N/A',
            aliyadate: s.aliyadate || 'N/A',
            idf_enlistdate: s.idf_enlistdate || 'N/A',
            idf_releasedate: s.idf_releasedate || 'N/A',
            admin_approved_date: s.admin_approved_date || 'N/A',
            downloaded_date: s.downloaded_date || 'N/A',
            record_complete_date: s.record_complete_date || 'N/A'
        }));

        res.render('completedRecords', {
            soldiers: formattedSoldiers,
            countries,
            medals,
            corps,
            category,
            army,
            resistance,
            partizan,
            participation,
            adminemail,
            saved
        });

    } catch (err) {
        console.error('Error rendering completed records list:', err);
        res.status(500).send('Server error');
    }
});


// --- POST /adminUpdateSoldier/:id ---
app.post('/adminUpdateSoldier/:id', upload.array('files'), async (req, res) => {
    const { id } = req.params;
    const adminemail = req.body.adminemail || req.query.adminemail;

    try {
        const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!existingSoldier) return res.status(404).send('Soldier not found');

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
      birthcountry: req.body.birthcountry || existingSoldier.birthcountry,
      otherbirthcountry: req.body.otherbirthcountry || existingSoldier.otherbirthcountry,
      birthcity: req.body.birthcity || existingSoldier.birthcity,
      birthcityen: req.body.birthcityen || existingSoldier.birthcityen,
      birthcityru: req.body.birthcityru || existingSoldier.birthcityru,
      gender: req.body.gender || existingSoldier.gender,
      placeofdeath: req.body.placeofdeath || existingSoldier.placeofdeath,
      placeofdeathen: req.body.placeofdeathen || existingSoldier.placeofdeathen,
      placeofdeathru: req.body.placeofdeathru || existingSoldier.placeofdeathru,
      deathdetails: req.body.deathdetails || existingSoldier.deathdetails,
      deathdetailsen: req.body.deathdetailsen || existingSoldier.deathdetailsen,
      deathdetailsru: req.body.deathdetailsru || existingSoldier.deathdetailsru,
      biography: req.body.biography || existingSoldier.biography,
      biographyen: req.body.biographyen || existingSoldier.biographyen,
      biographyru: req.body.biographyru || existingSoldier.biographyru,
      otherparticipation: req.body.otherparticipation || existingSoldier.otherparticipation,
      otherdecoration: req.body.otherdecoration || existingSoldier.otherdecoration,
      otherdecorationen: req.body.otherdecorationen || existingSoldier.otherdecorationen,
      otherdecorationru: req.body.otherdecorationru || existingSoldier.otherdecorationru,
      fightingdesc: req.body.fightingdesc || existingSoldier.fightingdesc,
      fightingdescen: req.body.fightingdescen || existingSoldier.fightingdescen,
      fightingdescru: req.body.fightingdescru || existingSoldier.fightingdescru,
      shortdesc: req.body.shortdesc || existingSoldier.shortdesc,
      armyrole: req.body.armyrole || existingSoldier.armyrole,
      armyroleen: req.body.armyroleen || existingSoldier.armyroleen,
      armyroleru: req.body.armyroleru || existingSoldier.armyroleru,
      releasereason: req.body.releasereason || existingSoldier.releasereason,
      releasereasonen: req.body.releasereasonen || existingSoldier.releasereasonen,
      releasereasonru: req.body.releasereasonru || existingSoldier.releasereasonru,
      enlistreason: req.body.enlistreason || existingSoldier.enlistreason,
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
      armyid: req.body.armyid || existingSoldier.armyid,
      datebreaker: req.body.datebreaker || existingSoldier.datebreaker,
      dob: req.body.dob || existingSoldier.dob,
      dod: req.body.dod || existingSoldier.dod,
      aliyadate: req.body.aliyadate || existingSoldier.aliyadate,
      idf_enlistdate: req.body.idf_enlistdate || existingSoldier.idf_enlistdate,
      idf_releasedate: req.body.idf_releasedate || existingSoldier.idf_releasedate,
      medal: req.body.medal || existingSoldier.medal,
      medalen: req.body.medalen || existingSoldier.medalen,
      medalru: req.body.medalru || existingSoldier.medalru,
      degree: req.body.degree || existingSoldier.degree,
      degreeen: req.body.degreeen || existingSoldier.degreeen,
      degreeru: req.body.degreeru || existingSoldier.degreeru,
      title: req.body.title || existingSoldier.title,
      titleen: req.body.titleen || existingSoldier.titleen,
      titleru: req.body.titleru || existingSoldier.titleru,
      linkurl: req.body.linkurl || existingSoldier.linkurl,
      useremail: req.body.useremail && req.body.useremail.trim() !== '' ? req.body.useremail : existingSoldier.useremail,
      category: req.body.category || existingSoldier.category,
      army: req.body.army || existingSoldier.army,
      resistance: req.body.resistance || existingSoldier.resistance,
      partizan: req.body.partizan || existingSoldier.partizan,
      participation: req.body.participation || existingSoldier.participation,
      corps: req.body.corps || existingSoldier.corps,
      recordcomplete: record_complete_boolean,
      record_complete_date,
      admin_ready_for_download,
      admin_approved_date,
      downloaded_date: req.body.downloaded_date || existingSoldier.downloaded_date,
      other_medal: req.body.other_medal || existingSoldier.other_medal,
      other_medalen: req.body.other_medalen || existingSoldier.other_medalen,
      other_medalru: req.body.other_medalru || existingSoldier.other_medalru,
      uprising_participant: req.body.uprising_participant === 'on' || existingSoldier.uprising_participant

    };

        const updates = [];
        const values = [];
        let i = 1;

        const dateFields = [
            'dob', 'dod', 'aliyadate', 'idf_enlistdate', 'idf_releasedate',
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

            // --- File Uploads ---
            if (req.files && req.files.length > 0) {
                const fileInserts = req.files.map(file =>
                    t.none(
                        `INSERT INTO uploaded_files (soldier_id, original_name, file_path)
                         VALUES ($1, $2, $3)`,
                        [id, file.originalname, file.path]
                    )
                );
                await Promise.all(fileInserts);
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
});

// --- GET /adminUpdateSoldier/:id ---
app.get('/adminUpdateSoldier/:id', async (req, res) => {
    const { id } = req.params;
    const adminemail = req.query.adminemail;
    const locale = req.getLocale();

    if (!adminemail) {
        return res.redirect(`/admin/completedRecords?adminemail=admin@ww2jewishsoldiers.com`);
    }

    try {
        const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!soldier) return res.status(404).send('Soldier not found');

        const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL"');
        const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
        const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL"');
        const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL"');
        const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL"');
        const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL"');
        const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL"');
        const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL"');

        const battleHistory = await db.any(
            'SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id',
            [id]
        );

        res.render('adminUpdate', {
            soldier,
            countries,
            medals,
            corps,
            category,
            army,
            resistance,
            partizan,
            participation,
            battleHistory,
            adminemail,
            locale
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
        const dateFields = ['dob','dod','aliyadate','idf_enlistdate','idf_releasedate','record_complete_date','admin_approved_date','downloaded_date'];
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
            'dob', 'dod', 'aliyadate', 'idf_enlistdate', 'idf_releasedate',
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
        res.setHeader('Content-Disposition', 'attachment; filename="completed_records_data.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('Excel export error:', err);
        res.status(500).send('Error exporting Excel');
    }
});*/
// Excel Download - Flattened Single Row per Soldier
app.post('/admin/downloadExcel', async (req, res) => {
    let ids = req.body.selectedIds;
    const BATTLE_HISTORY_TABLE = 'soldier_battle_history';
    const UPLOADED_FILES_TABLE = 'uploaded_files';

    if (!ids) return res.status(400).send('No records selected');
    if (!Array.isArray(ids)) ids = [ids];

    try {
        const now = new Date();

        function formatDateToDDMMYYYY(date) {
            if (!date) return '';
            const d = new Date(date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        }

        const downloadDateString = formatDateToDDMMYYYY(now);

        const dateFields = [
            'dob', 'dod', 'aliyadate', 'idf_enlistdate', 'idf_releasedate',
            'record_complete_date', 'admin_approved_date', 'downloaded_date'
        ];

        // --- 1. Fetch soldiers ---
        const soldiers = await db.any(
            `SELECT * FROM ${SOLDIER_TABLE} WHERE id IN ($1:csv)`,
            [ids]
        );

        soldiers.forEach(s => {
            dateFields.forEach(f => {
                if (s[f]) s[f] = formatDateToDDMMYYYY(s[f]);
            });
        });

        // --- 2. Fetch and group battle history ---
        const battleHistory = await db.any(
            `SELECT * FROM ${BATTLE_HISTORY_TABLE} WHERE soldier_id IN ($1:csv) ORDER BY id`,
            [ids]
        );

        const battleMap = {};
        battleHistory.forEach(b => {
            if (!battleMap[b.soldier_id]) battleMap[b.soldier_id] = [];
            battleMap[b.soldier_id].push(b);
        });

        // --- 3. Fetch and group uploaded files ---
        const uploadedFiles = await db.any(
            `SELECT * FROM ${UPLOADED_FILES_TABLE} WHERE soldier_id IN ($1:csv) ORDER BY id`,
            [ids]
        );

        const fileMap = {};
        uploadedFiles.forEach(f => {
            if (!fileMap[f.soldier_id]) fileMap[f.soldier_id] = [];
            fileMap[f.soldier_id].push(f);
        });

        // --- 4. Flatten into single row per soldier ---
        const flattenedRows = soldiers.map(s => {
            const row = { ...s };
            row.download_date = downloadDateString;

            const sBattles = battleMap[s.id] || [];
            const sFiles = fileMap[s.id] || [];

            // Add battle info
            sBattles.forEach((b, index) => {
                const n = index + 1;
                row[`battle_${n}_year`] = b.battleyear || '';
                row[`battle_${n}_front`] = b.front || '';
                row[`battle_${n}_fronten`] = b.fronten || '';
                row[`battle_${n}_frontru`] = b.frontru || '';
                row[`battle_${n}_battle`] = b.battle || '';
                row[`battle_${n}_battleen`] = b.battleen || '';
                row[`battle_${n}_battleru`] = b.battleru || '';
                row[`battle_${n}_medal`] = b.medal || '';
                row[`battle_${n}_details`] = b.details || '';
            });

            // Add file info
            sFiles.forEach((f, index) => {
                const n = index + 1;
                row[`file_${n}_name`] = f.original_name;
                row[`file_${n}_path`] = f.file_path;
            });

            return row;
        });

        // --- 5. Build Excel File ---
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Flattened_Soldiers');

        // Collect all columns dynamically
        const allKeys = [...new Set(flattenedRows.flatMap(r => Object.keys(r)))];

        sheet.columns = allKeys.map(k => ({
            header: k.toUpperCase(),
            key: k,
            style: { numFmt: '@' } // Force text
        }));

        flattenedRows.forEach(row => sheet.addRow(row));

        // --- 6. Update downloaded_date in DB as DD-MM-YYYY TEXT ---
        await db.none(
            `UPDATE ${SOLDIER_TABLE} SET downloaded_date = $1 WHERE id IN ($2:csv)`,
            [downloadDateString, ids]
        );

        // --- 7. Send Excel file ---
        res.setHeader('Content-Disposition', 'attachment; filename="combined_soldiers_flat.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('Excel export error:', err);
        res.status(500).send('Error exporting Excel');
    }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
