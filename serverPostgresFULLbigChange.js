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
          uprising_participant
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
          $82,$83,$84,$85,$86
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
        cleaned.uprising_participant
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
        const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!soldier) {
            return res.status(404).send('Soldier not found');
        }

        const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL" ');
        const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
        const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL" ');
        const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL" ');
        const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL" ');
        const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL" ');
        const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL" ');
        const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL" ');

        const battleHistory = await db.any('SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id', [id]);

        // Render template, dates are now just raw text
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

        // Dates
        let record_complete_date = existingSoldier.record_complete_date;
        if (recordcomplete && !existingSoldier.recordcomplete) {
            record_complete_date = formatDateToDDMMYYYY(new Date());
        } else if (!recordcomplete) {
            record_complete_date = null;
        }

        // Main soldier update object
        const inputData = {
            fname: req.body.fname, fnameen: req.body.fnameen, fnameru: req.body.fnameru,
            lname: req.body.lname, lnameen: req.body.lnameen, lnameru: req.body.lnameru,
            fathername: req.body.fathername, fathernameen: req.body.fathernameen, fathernameru: req.body.fathernameru,
            mothername: req.body.mothername, mothernameen: req.body.mothernameen, mothernameru: req.body.mothernameru,
            dob: req.body.dob, dod: req.body.dod, aliyadate: req.body.aliyadate,
            idf_enlistdate: req.body.idf_enlistdate,
            idf_releasedate: req.body.idf_releasedate,
            admin_approved_date: req.body.admin_approved_date,
            downloaded_date: req.body.downloaded_date,
            recordcomplete,
            record_complete_date,
            uprising_participant,
            metals: req.body.medal,
            corps: req.body.corps,
            category: req.body.category,
            army: req.body.army,
            resistance: req.body.resistance,
            partizan: req.body.partizan,
            participation: req.body.participation
        };

        // Prepare updates
        const updates = [];
        const values = [];
        let i = 1;

        const dateFields = [
            'dob', 'dod', 'aliyadate', 'idf_enlistdate', 'idf_releasedate',
            'record_complete_date', 'admin_approved_date', 'downloaded_date'
        ];

        for (const key in inputData) {
            if (!(key in existingSoldier)) continue;
            const newValue = inputData[key] === '' ? null : inputData[key];
            const oldValue = existingSoldier[key] === '' ? null : existingSoldier[key];

            const same = dateFields.includes(key)
                ? formatDateToDDMMYYYY(newValue) === formatDateToDDMMYYYY(oldValue)
                : newValue == oldValue;

            if (!same) {
                updates.push(`"${key}" = $${i}`);
                values.push(newValue);
                i++;
            }
        }

        await db.tx(async t => {
            // Update soldier table
            if (updates.length > 0) {
                const updateSQL = `UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`;
                values.push(id);
                await t.none(updateSQL, values);
            }

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
                            soldier_id, battleyear,
                            front, fronten, frontru,
                            battle, battleen, battleru,
                            medal, medalen, medalru,
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

            // File uploads
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

        res.redirect('/');
    } catch (error) {
        console.error('Error updating soldier:', error);
        res.status(500).send(`
            <h1>Error Updating Soldier</h1>
            <p>Message: ${error.message}</p>
            <pre>${error.stack || 'No stack trace available'}</pre>
            <a href="/updateSoldier/${id}">Go back to form</a>
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
            `SELECT * FROM ${SOLDIER_TABLE} WHERE recordcomplete = TRUE ORDER BY lname, fname`
        );

        const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL"');
        const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
        const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL"');
        const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL"');
        const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL"');
        const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL"');
        const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL"');
        const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL"');

        const formattedSoldiers = soldiers.map(s => ({
            ...s,
            dob: s.dob ? formatDateToDDMMYYYY(s.dob) : 'N/A',
            dod: s.dod ? formatDateToDDMMYYYY(s.dod) : 'N/A',
            aliyadate: s.aliyadate ? formatDateToDDMMYYYY(s.aliyadate) : 'N/A',
            idf_enlistdate: s.idf_enlistdate ? formatDateToDDMMYYYY(s.idf_enlistdate) : 'N/A',
            idf_releasedate: s.idf_releasedate ? formatDateToDDMMYYYY(s.idf_releasedate) : 'N/A',
            admin_approved_date: s.admin_approved_date ? formatDateToDDMMYYYY(s.admin_approved_date) : 'N/A',
            downloaded_date: s.downloaded_date ? formatDateToDDMMYYYY(s.downloaded_date) : 'N/A',
            record_complete_date: s.record_complete_date ? formatDateToDDMMYYYY(s.record_complete_date) : 'N/A',
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

        // Boolean & calculated date fields
        const admin_ready_for_download = Array.isArray(req.body.admin_ready_for_download)
            ? req.body.admin_ready_for_download.includes('true') || req.body.admin_ready_for_download.includes('on')
            : req.body.admin_ready_for_download === 'true' || req.body.admin_ready_for_download === 'on';

        let admin_approved_date = existingSoldier.admin_approved_date;
        if (admin_ready_for_download && !existingSoldier.admin_ready_for_download) {
            admin_approved_date = formatDateToDDMMYYYY(new Date());
        } else if (!admin_ready_for_download && existingSoldier.admin_ready_for_download) {
            admin_approved_date = null;
        }

        const recordCompleteSubmitted = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
        let recordcomplete = recordCompleteSubmitted;
        let record_complete_date = existingSoldier.record_complete_date;

        if (recordcomplete && !existingSoldier.record_complete_date) {
            record_complete_date = formatDateToDDMMYYYY(new Date());
        } else if (!recordcomplete) {
            record_complete_date = null;
        }

        let downloaded_date = req.body.downloaded_date ? formatDateToDDMMYYYY(req.body.downloaded_date) : existingSoldier.downloaded_date;

        // Main input object
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
            dob: req.body.dob ? formatDateToDDMMYYYY(req.body.dob) : null,
            dod: req.body.dod ? formatDateToDDMMYYYY(req.body.dod) : null,
            shortdesc: req.body.shortdesc,
            armyrole: req.body.armyrole, armyroleen: req.body.armyroleen, armyroleru: req.body.armyroleru,
            releasereason: req.body.releasereason, releasereasonen: req.body.releasereasonen, releasereasonru: req.body.releasereasonru,
            enlistreason: req.body.enlistreason,
            platoonname: req.body.platoonname, platoonnameen: req.body.platoonnameen, platoonnameru: req.body.platoonnameru,
            wounddetails: req.body.wounddetails, wounddetailsen: req.body.wounddetailsen, wounddetailsru: req.body.wounddetailsru,
            gettodesc: req.body.gettodesc, gettodescen: req.body.gettodescen, gettodescru: req.body.gettodescru,
            otherfightingcontext: req.body.otherfightingcontext,
            armyid: req.body.armyid,
            title: req.body.title, titleen: req.body.titleen, titleru: req.body.titleru,
            remarks2: req.body.remarks2, remarksen2: req.body.remarksen2, remarksru2: req.body.remarksru2,
            linkurl: req.body.linkurl,
            remarks: req.body.remarks, remarksen: req.body.remarksen, remarksru: req.body.remarksru,
            recordcomplete,
            other_medal: req.body.other_medal,
            other_medalen: req.body.other_medalen,
            other_medalru: req.body.other_medalru,
            uprising_participant: req.body.uprising_participant,
            metals: req.body.medal,
            corps: req.body.corps,
            category: req.body.category,
            army: req.body.army,
            resistance: req.body.resistance,
            partizan: req.body.partizan,
            participation: req.body.participation,
            aliyadate: req.body.aliyadate ? formatDateToDDMMYYYY(req.body.aliyadate) : null,
            idf_enlistdate: req.body.idf_enlistdate ? formatDateToDDMMYYYY(req.body.idf_enlistdate) : null,
            idf_releasedate: req.body.idf_releasedate ? formatDateToDDMMYYYY(req.body.idf_releasedate) : null,
            admin_ready_for_download,
            admin_approved_date,
            record_complete_date,
            downloaded_date
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

// POST: Update Soldier
app.post('/updateSoldier/:id', upload.array('files'), async (req, res) => {
    const { id } = req.params;

    try {
        const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!existingSoldier) return res.status(404).send('Soldier not found');

        const recordcomplete = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
        let record_complete_date = existingSoldier.record_complete_date;
        if (recordcomplete && !existingSoldier.recordcomplete) {
            record_complete_date = formatDateToDDMMYYYY(new Date());
        } else if (!recordcomplete) {
            record_complete_date = null;
        }

        const cleanData = (data, isDate = false) => {
            if (Array.isArray(data)) return data.length === 0 ? null : data;
            if (isDate) return formatDateToDDMMYYYY(data);
            return data === '' ? null : data;
        };

        const dateFields = ['dob','dod','aliyadate','idf_enlistdate','idf_releasedate','admin_approved_date','downloaded_date'];

        // Build inputData
        const inputData = {};
        for (const key in req.body) {
            inputData[key] = dateFields.includes(key) ? cleanData(req.body[key], true) : cleanData(req.body[key]);
        }
        inputData.recordcomplete = recordcomplete;
        inputData.record_complete_date = record_complete_date;

        await db.tx(async t => {
            // Update soldier
            const updateSQL = pgp.helpers.update(inputData, null, SOLDIER_TABLE) + ` WHERE id = ${id}`;
            await t.none(updateSQL);

            // Battle history (same logic as before)
            const submittedBattles = Array.isArray(req.body.battleyear) ? req.body.battleyear : [req.body.battleyear];
            const battleIds = Array.isArray(req.body.battleId) ? req.body.battleId : [req.body.battleId];
            const existingBattleIds = await t.map(`SELECT id FROM soldier_battle_history WHERE soldier_id = $1`, [id], r => r.id);
            const battlesToKeep = new Set();

            for (let idx = 0; idx < submittedBattles.length; idx++) {
                const hasContent = (submittedBattles[idx] && submittedBattles[idx].trim() !== '') ||
                                   (req.body.front[idx] && req.body.front[idx].trim() !== '') ||
                                   (req.body.battle[idx] && req.body.battle[idx].trim() !== '');
                if (!hasContent) continue;

                const battleData = {
                    soldier_id: id,
                    battleyear: cleanData(submittedBattles[idx]),
                    front: cleanData(req.body.front[idx]),
                    fronten: cleanData(req.body.fronten[idx]),
                    frontru: cleanData(req.body.frontru[idx]),
                    battle: cleanData(req.body.battle[idx]),
                    battleen: cleanData(req.body.battleen[idx]),
                    battleru: cleanData(req.body.battleru[idx]),
                    medal: cleanData(req.body.battle_medal[idx]),
                    medalen: cleanData(req.body.battle_medalen[idx]),
                    medalru: cleanData(req.body.battle_medalru[idx]),
                    details: cleanData(req.body.battle_details[idx]),
                    detailsen: cleanData(req.body.battle_detailsen[idx]),
                    detailsru: cleanData(req.body.battle_detailsru[idx]),
                    degreerank: cleanData(req.body.degreerank[idx]),
                    degreeranken: cleanData(req.body.degreeranken[idx]),
                    degreerankru: cleanData(req.body.degreerankru[idx]),
                    job: cleanData(req.body.job[idx]),
                    joben: cleanData(req.body.joben[idx]),
                    jobru: cleanData(req.body.jobru[idx])
                };

                const currentBattleId = battleIds[idx];
                if (currentBattleId && currentBattleId !== 'null') {
                    const updateBattleSQL = pgp.helpers.update(battleData, null, 'soldier_battle_history') + ` WHERE id = ${currentBattleId}`;
                    await t.none(updateBattleSQL);
                    battlesToKeep.add(parseInt(currentBattleId, 10));
                } else {
                    const insertBattleSQL = pgp.helpers.insert(battleData, null, 'soldier_battle_history');
                    await t.none(insertBattleSQL);
                }
            }

            // Delete old battles
            const battlesToDelete = existingBattleIds.filter(bid => !battlesToKeep.has(bid));
            if (battlesToDelete.length > 0) {
                await t.none(`DELETE FROM soldier_battle_history WHERE id IN ($1:csv)`, [battlesToDelete]);
            }

            // Files
            if (req.files && req.files.length > 0) {
                const fileInserts = req.files.map(file =>
                    t.none(`INSERT INTO uploaded_files (soldier_id, original_name, file_path) VALUES ($1, $2, $3)`, [id, file.originalname, file.path])
                );
                await t.batch(fileInserts);
            }
        });

        res.redirect(`/updateSoldier/${id}?saved=true`);
    } catch (error) {
        console.error('[POST] Error updating soldier and battles:', error);
        res.status(500).send(`
            <h1>Error updating soldier and battles</h1>
            <p>${error.message}</p>
            <pre>${error.stack || 'No stack trace available'}</pre>
            <a href="/updateSoldier/${id}">Go back to form</a>
        `);
    }
});

// Excel Download
app.post('/admin/downloadExcel', async (req, res) => {
    let ids = req.body.selectedIds;
    const BATTLE_HISTORY_TABLE = 'soldier_battle_history';
    const UPLOADED_FILES_TABLE = 'uploaded_files';

    if (!ids) return res.status(400).send('No records selected');
    if (!Array.isArray(ids)) ids = [ids];

    try {
        const now = new Date();
        const downloadDateString = formatDateToDDMMYYYY(now);

        // Soldiers
        const selectedSoldiers = await db.any(`SELECT * FROM ${SOLDIER_TABLE} WHERE id IN ($1:csv)`, [ids]);
        const dateFields = ['dob','dod','aliyadate','idf_enlistdate','idf_releasedate','record_complete_date','admin_approved_date','downloaded_date'];
        selectedSoldiers.forEach(s => {
            dateFields.forEach(f => s[f] = formatDateToDDMMYYYY(s[f]));
        });

        // Battle & files
        const battleHistory = await db.any(`SELECT * FROM ${BATTLE_HISTORY_TABLE} WHERE soldier_id IN ($1:csv)`, [ids]);
        const uploadedFiles = await db.any(`SELECT * FROM ${UPLOADED_FILES_TABLE} WHERE soldier_id IN ($1:csv)`, [ids]);

        const soldierMap = new Map();
        selectedSoldiers.forEach(s => soldierMap.set(s.id, s));

        const mappedBattleHistory = battleHistory.map(b => ({
            download_date: downloadDateString,
            ...soldierMap.get(b.soldier_id),
            ...b
        }));
        const mappedUploadedFiles = uploadedFiles.map(f => ({
            download_date: downloadDateString,
            ...soldierMap.get(f.soldier_id),
            ...f
        }));

        const workbook = new ExcelJS.Workbook();

        // Soldiers worksheet
        const soldierWorksheet = workbook.addWorksheet('Soldiers_Main');
        const mainColumns = [
            { header: 'DOWNLOAD_DATE', key: 'download_date' },
            ...Object.keys(selectedSoldiers[0] || {}).map(k => ({ header: k.toUpperCase(), key: k }))
        ];
        soldierWorksheet.columns = mainColumns;
        selectedSoldiers.forEach(s => soldierWorksheet.addRow({ ...s, download_date: downloadDateString }));

        // Battle worksheet
        if (mappedBattleHistory.length > 0) {
            const battleWorksheet = workbook.addWorksheet('Soldiers_BattleHistory');
            const desiredOrder = ['download_date','soldier_id','fname','fnameen','fnameru','lname','lnameen','lnameru'];
            const allKeys = Object.keys(mappedBattleHistory[0]);
            battleWorksheet.columns = [...desiredOrder, ...allKeys.filter(k => !desiredOrder.includes(k))].map(k => ({ header: k.toUpperCase(), key: k }));
            mappedBattleHistory.forEach(b => battleWorksheet.addRow(b));
        }

        // Files worksheet
        if (mappedUploadedFiles.length > 0) {
            const filesWorksheet = workbook.addWorksheet('Soldiers_UploadedFiles');
            const desiredOrder = ['download_date','soldier_id','fname','fnameen','fnameru','lname','lnameen','lnameru'];
            const allKeys = Object.keys(mappedUploadedFiles[0]);
            filesWorksheet.columns = [...desiredOrder, ...allKeys.filter(k => !desiredOrder.includes(k))].map(k => ({ header: k.toUpperCase(), key: k }));
            mappedUploadedFiles.forEach(f => filesWorksheet.addRow(f));
        }

        // Update downloaded_date
        await db.none(`UPDATE ${SOLDIER_TABLE} SET downloaded_date = $1 WHERE id IN ($2:csv)`, [now, ids]);

        // Send workbook
        res.setHeader('Content-Disposition', 'attachment; filename="completed_records_data.xlsx"');
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
