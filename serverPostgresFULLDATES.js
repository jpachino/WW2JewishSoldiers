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




// Route to display the soldier list from oldierdetails
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
    
    // Try to fetch soldiers
    const soldiers = await db.any(`SELECT * FROM ${SOLDIER_TABLE}`);
    console.log(`Retrieved ${soldiers.length} soldiers from database`);
    
    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
      dob: soldier.dob ? format(new Date(soldier.dob), 'MM/dd/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'MM/dd/yyyy') : 'N/A',
      aliyadate: soldier.aliyadate ? format(new Date(soldier.aliyadate), 'MM/dd/yyyy') : 'N/A'
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
    
      if (lnameA === lnameB) {
        return fnameA.localeCompare(fnameB);
      }
      return lnameA.localeCompare(lnameB);
    });
    

    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier,
     dob: soldier.dob ? format(new Date(soldier.dob), 'MM/dd/yyyy') : 'N/A',
     dod: soldier.dod ? format(new Date(soldier.dod), 'MM/dd/yyyy') : 'N/A',
     aliyadate: soldier.aliyadate ? format(new Date(soldier.aliyadate), 'MM/dd/yyyy') : 'N/A'
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
  const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL" ');
  const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL" ');
  const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL" ');
  const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL" ');
  const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL" ');
  const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL" ');
  const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL" ');
  const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
  


    console.log('Rendering addFULL.ejs form');
    res.render('addFULL', {
      locale: locale,
      countries:countries,
      category: category,
      army: army,
      resistance: resistance,
      partizan: partizan,
      participation: participation,
      corps:corps,
      medals: medals,
      soldier: {},
      battles: [],
      req: req // ⬅️ Add this line // Add this line to pass an empty battles array
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
  try {
    const cleaned = cleanNulls(req.body);

    // Handle record complete
    cleaned.recordcomplete = Array.isArray(cleaned.recordcomplete)
      ? cleaned.recordcomplete.includes('true') || cleaned.recordcomplete.includes('on')
      : cleaned.recordcomplete === 'true' || cleaned.recordcomplete === 'on';
    const recordCompleteDate = cleaned.recordcomplete ? new Date() : null;
// Handle uprising participant
    cleaned.uprising_participant = Array.isArray(cleaned.uprising_participant)
      ? cleaned.uprising_participant.includes('true') || cleaned.uprising_participant.includes('on')
      : cleaned.uprising_participant === 'true' || cleaned.uprising_participant === 'on';
    // Safe date parser
    function parseDateSafe(dateString) {
      if (!dateString) return null;
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? null : d;
    }

    const parsedDob = parseDateSafe(cleaned.dob);
    const parsedDod = parseDateSafe(cleaned.dod);
    const parsedAliyaDate = parseDateSafe(cleaned.aliyadate);
    const parsedIdfEnlistDate = parseDateSafe(cleaned.idf_enlistdate);
    const parsedIdfReleaseDate = parseDateSafe(cleaned.idf_releasedate);

    const {
      battleyear = [],
      front = [],
      battle = [],
      battle_medal = [],
      battle_details = [],
      degreerank  = [],
      job = [],
      fronten = [],
      battleen = [],
      battle_medalen = [],
      battle_detailsen = [],
      degreeranken  = [],
      joben = [],
      frontru = [],
      battleru = [],
      battle_medalru = [],
      battle_detailsru = [],
      degreerankru  = [],
      jobru = [],

    } = req.body;

    await db.tx(async t => {
      // === Insert soldier ===
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
          other_medal, other_medalen, other_medalru,uprising_participant
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
        parsedDob, parsedDod, parsedAliyaDate,
        cleaned.degree, cleaned.degreeen, cleaned.degreeru,
        cleaned.title, cleaned.titleen, cleaned.titleru,
        cleaned.linkurl,
        cleaned.category, cleaned.army, cleaned.resistance,
        cleaned.partizan, cleaned.participation, cleaned.corps,
        cleaned.useremail,
        cleaned.recordcomplete, recordCompleteDate,
        cleaned.admin_ready_for_download, cleaned.admin_approved_date, cleaned.downloaded_date,
        cleaned.other_medal, cleaned.other_medalen, cleaned.other_medalru, cleaned.uprising_participant
      ]);

      const soldierId = insertedSoldier.id;

      
      // === Insert battle history ===
  for (let i = 0; i < battleyear.length; i++) {
  const hasContent = (battleyear[i] && battleyear[i].trim() !== '') ||
                     (front[i] && front[i].trim() !== '') ||
                     (battle[i] && battle[i].trim() !== '') ||
                     (battle_medal[i] && battle_medal[i].trim() !== '') ||
                     (battle_details[i] && battle_details[i].trim() !== '')||
                     (degreerank[i] && degreerank[i].trim() !== '')||
                     (job[i] && job[i].trim() !== '') ||
                     (fronten[i] && fronten[i].trim() !== '') ||
                     (battleen[i] && battleen[i].trim() !== '') ||
                     (battle_medalen[i] && battle_medalen[i].trim() !== '') ||
                     (battle_detailsen[i] && battle_detailsen[i].trim() !== '')||
                     (degreeranken[i] && degreeranken[i].trim() !== '')||
                     (joben[i] && joben[i].trim() !== '') ||
                     (frontru[i] && frontru[i].trim() !== '') ||
                     (battleru[i] && battleru[i].trim() !== '') ||
                     (battle_medalru[i] && battle_medalru[i].trim() !== '') ||
                     (battle_detailsru[i] && battle_detailsru[i].trim() !== '')||
                     (degreerankru[i] && degreerankru[i].trim() !== '')||
                     (jobru[i] && jobru[i].trim() !== '');
                 
  
  if (!hasContent) continue; // Skip empty rows
    console.log("at insert")
  await t.none(`
    INSERT INTO soldier_battle_history
      (soldier_id, battleyear, front, battle, medal, details, degreerank, job,
      fronten, battleen, medalen, detailsen, degreeranken, joben,
      frontru, battleru, medalru, detailsru, degreerankru, jobru)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
    $9, $10, $11, $12, $13, $14,
    $15, $16, $17, $18, $19, $20)
  `, [
    soldierId,
    battleyear[i] ? parseInt(battleyear[i], 10) : null,
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

      // === Insert uploaded files ===
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

// ✅ Show soldier detail + battle form
app.get('/soldiers/:id/battles', async (req, res) => {
  const { id } = req.params;
  try {
    // Corrected lines: using db.one() for single soldier and db.manyOrNone() for battles
    // db.one() will throw an error if no soldier is found, so we don't need a separate check.
    const soldierResult = await db.one('SELECT * FROM soldierdetails WHERE id = $1', [id]);
    const battlesResult = await db.manyOrNone('SELECT * FROM soldier_battle_history WHERE soldier_id = $1 ORDER BY year', [id]);
    // ✅ Fetch related battle history
    const battleHistory = await db.any(
      `SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id`,
      [id]
    );
    res.render('battles', {
      soldier: soldierResult,
      existingBattles: battlesResult,
      locale: 'en', // or your i18n locale
      __: (key) => key ,// simple placeholder if not using i18n
      battleHistory
    });
  } catch (err) {
    if (err.name === 'QueryResultError' && err.code === 0) {
      // This error code means no rows were returned by db.one(), i.e., soldier not found.
      return res.status(404).send('Soldier not found');
    }
    console.error('Error fetching battles:', err);
    res.status(500).send('Server error');
  }
});
// ✅ Add multiple battles
app.post('/soldiers/:id/battles', async (req, res) => {
  const { id } = req.params;
  const {year, front, battle, battle_medal, battle_details,degreerank, job } = req.body;

  // The code correctly checks if 'battleyeararray' is an array.
  if (!Array.isArray(battleyeararray)) {
    return res.status(400).send('Invalid form submission');
  }

  try {
    // The transaction ensures atomicity.
    await db.tx(async t => {
      // Loop through each submitted battle entry.
      for (let i = 0; i < battleyeararray.length; i++) {
        // Skip empty rows.
        if (!year[i] && !front[i] && !battle[i]) {
          continue;
        }

        // Convert the string to an integer before inserting it.
        const year = parseInt(battleyeararray[i], 10) || null;

        // Insert a single record for the current battle entry.
        await t.none(
          `INSERT INTO soldier_battle_history (soldier_id, year, front, battle, medal, details,degreerank,job)
           VALUES ($1, $2, $3, $4, $5, $6,$7, $8)`,
          [
            id,
            year,
            front[i] || null,
            battle[i] || null,
            battle_medal[i] || null,
            battle_details[i] || null,
            degreerank[i] || null,
            job[i] || null,
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
  let { year, front, battle, medal, details } = req.body;

  try {
    // Convert year to integer or null
    const yearInt = year ? parseInt(year, 10) : null;

    // Clean up empty strings to null for optional fields
    front = front && front.trim() !== '' ? front : null;
    battle = battle && battle.trim() !== '' ? battle : null;
    medal = medal && medal.trim() !== '' ? medal : null;
    details = details && details.trim() !== '' ? details : null;
    degreerank = degreerank && degreerank.trim() !== '' ? degreerank : null;
    job = job && job.trim() !== '' ? job : null;

    await db.none(
      `UPDATE soldier_battle_history
       SET year = $1, front = $2, battle = $3, medal = $4, details = $5,  degreerank= $6, job=$7, updated_at = NOW()
       WHERE id = $8`,
      [yearInt, front, battle, medal, details, ,degreerank, job,battleId]
    );

    res.redirect('back'); // You can change this to redirect to the soldier page
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

// Add this new route to your server.js file
app.post('/addNewBattle', async (req, res) => {
  let { year, front, battle, medal, details } = req.body;
  console.log('New battle data:', req.body);

  try {
    if (!battle || battle.trim() === '') {
      return res.status(400).send('Battle name is required.');
    }

    // Convert year to integer or null
    const yearInt = year ? parseInt(year, 10) : null;

    // Clean up empty strings to null
    front = front && front.trim() !== '' ? front : null;
    battle = battle && battle.trim() !== '' ? battle : null;
    medal = medal && medal.trim() !== '' ? medal : null;
    details = details && details.trim() !== '' ? details : null;
    degreerank = degreerank && degreerank.trim() !== '' ? degreerank : null;
    job = job && job.trim() !== '' ? job : null;

    // Insert the new battle into the database
    await db.none(`
      INSERT INTO "battle_TBL" (year, front, battle, medal, details, degreerank, job)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [yearInt, front, battle, medal, details, degreerank, job]);

    // Redirect back to the form page with a success message
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
      dob: soldier.dob ? format(new Date(soldier.dob), 'dd/MM/yyyy') : 'N/A',
      dod: soldier.dod ? format(new Date(soldier.dod), 'dd/MM/yyyy') : 'N/A',
      aliyadate: soldier.aliyadate ? format(new Date(soldier.aliyadate), 'MM/dd/yyyy') : 'N/A',
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
      aliyadate: soldier.aliyadate ? format(new Date(soldier.aliyadate), 'MM/dd/yyyy') : 'N/A',
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

    //console.log('Search results returned successfully');
  } catch (err) {
    console.error('Error fetching search results:', err);
    res.status(500).send('Server error at searchResults');
  }
});


// Route to display the form for updating a soldier

// NOTE: This file assumes 'db' (pg-promise instance), 'SOLDIER_TABLE', and 'upload' (multer instance) are defined elsewhere.
// You will need to insert this code back into your existing server.js file.

// Route to show the form for updating a soldier
app.get('/updateSoldier/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Get /updateSoldier/:id hit for ID:', id);

    try {
        const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!soldier) {
            // FIX: Removed extraneous single quotes ('') which would cause a syntax error
            return res.status(404).send('Soldier not found');
        }

        const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL" ');
        // Fetch medals list
        const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
        // Fetch all lookup tables
        const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL" ');
        const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL" ');
        const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL" ');
        const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL" ');
        const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL" ');
        const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL" ');
        

        // Fetch existing battles for this soldier
        const battleHistory = await db.any('SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id', [id]);

        // Render the template passing soldier and lookup data
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
        const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!existingSoldier) {
            return res.status(404).send('Soldier not found');
        }

        // Extract all battle-related arrays and IDs for update logic
        const {
            battleId = [],
            battleyear = [],
            front = [], fronten = [], frontru = [],
            battle = [], battleen = [], battleru = [],
            battle_medal = [], battle_medalen = [], battle_medalru = [],
            battle_details = [], battle_detailsen = [], battle_detailsru = [],
            degreerank = [], degreeranken = [], degreerankru = [],
            job = [], joben = [], jobru = []
        } = req.body;

        // Checkbox to boolean
        const recordcomplete = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
        const uprising_participant = req.body.uprising_participant === 'true' || req.body.uprising_participant === 'on';

        // Set record complete date
        let record_complete_date = existingSoldier.record_complete_date;
        if (recordcomplete && !existingSoldier.recordcomplete) {
            record_complete_date = new Date();
        } else if (!recordcomplete) {
            record_complete_date = null;
        }

        // Main soldier update fields
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
            dob: req.body.dob, dod: req.body.dod,
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
            record_complete_date,
            other_medal: req.body.other_medal,
            other_medalen: req.body.other_medalen,
            other_medalru: req.body.other_medalru,
            uprising_participant: req.body.uprising_participant,
            
            
            //medal_id: req.body.medal_id, 
            //corps_id: req.body.corps_id,
            //category_id: req.body.category_id,
            //resistance_id: req.body.resistance_id,
            //partizan_id: req.body.partizan_id,
            //participation_id: req.body.participation_id,
            metals: req.body.medal,
            corps: req.body.corps,         // ⬅️ Keep: This already works
            category: req.body.category,   // ⬅️ Keep: This already works
            army: req.body.army,           // ⬅️ NEW: Saves the army title string
            resistance: req.body.resistance, // ⬅️ NEW: Saves the resistance title string
            partizan: req.body.partizan,   // ⬅️ NEW: Saves the partizan title string
            participation: req.body.participation, // ⬅️ NEW: Saves the participation title string
            
            // Assuming these are also IDs from lookup tables/dates that need to be in inputData
            aliyadate: req.body.aliyadate,
            idf_enlistdate: req.body.idf_enlistdate,
            idf_releasedate: req.body.idf_releasedate,
            admin_approved_date: req.body.admin_approved_date,
            downloaded_date: req.body.downloaded_date,
        };

        // Build dynamic update query for soldier details
        const updates = [];
        const values = [];
        let i = 1;

        const normalizeDate = val =>
            val instanceof Date ? val.toISOString().slice(0, 10) : typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;

        // FIX: Expanded dateFields list to include all potential date fields in inputData
        const dateFields = [
            'dob', 'dod', 'aliyadate', 'idf_enlistdate', 'idf_releasedate',
            'record_complete_date', 'admin_approved_date', 'downloaded_date'
        ];

        for (const key in inputData) {
            // Check if the property is defined in existingSoldier to avoid comparison errors on undefined keys
            if (!(key in existingSoldier)) {
                 // Log a warning if a key in inputData doesn't exist in the database model
                 console.warn(`Warning: Input key '${key}' does not exist in ${SOLDIER_TABLE} model and will be skipped in update logic.`);
                 continue; 
            }

            const newValue = inputData[key] === '' ? null : inputData[key];
            const oldValue = existingSoldier[key] === '' ? null : existingSoldier[key];

            // Normalize and compare dates, otherwise compare value
            const same = dateFields.includes(key)
                ? normalizeDate(newValue) === normalizeDate(oldValue)
                : newValue == oldValue;

            if (!same) {
                updates.push(`"${key}" = $${i}`);
                values.push(newValue);
                i++;
            }
        }

        await db.tx(async t => {
            // ✅ Update soldier details only if needed
            if (updates.length > 0) {
                const updateSQL = `UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`;
                values.push(id);
                await t.none(updateSQL, values);
                console.log(`Updated soldier ID ${id}. Changed fields: ${updates.length}`);
            } else {
                console.log(`No changes in main soldier details for ID ${id}`);
            }

            // --- BATTLE HISTORY UPDATE/INSERT LOGIC ---
            // This logic correctly handles updating existing records (if battleId[j] exists)
            // and inserting new records (if battleId[j] is null/empty).
            for (let j = 0; j < battleyear.length; j++) {
                const hasContent =
                    (battleyear[j] && battleyear[j].trim() !== '') ||
                    (front[j] && front[j].trim() !== '') ||
                    (battle[j] && battle[j].trim() !== '');

                if (hasContent) {
                    if (battleId[j]) {
                        // ✅ Update existing battle record
                        console.log("Updating existing battle record:", battleId[j]);
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
                        // ✅ Insert new battle record
                        console.log("Inserting new battle history record.");
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
            
            // ✅ Handle file uploads
            if (req.files && req.files.length > 0) {
                const fileInserts = req.files.map(file =>
                    t.none(
                        `INSERT INTO uploaded_files (soldier_id, original_name, file_path)
                         VALUES ($1, $2, $3)`,
                        [id, file.originalname, file.path]
                    )
                );
                await t.batch(fileInserts);
                console.log(`Stored ${req.files.length} files for soldier ID ${id}`);
            }
        });

        res.redirect ('/');
        //res.redirect(`/updateSoldier/${id}?saved=true`);
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


app.get('/admin/completedRecords', async (req, res) => {
    const { id } = req.params; // NOTE: :id is not needed for a list view, only for an update view.
    const adminemail = req.query.adminemail;
    const saved = req.query.saved === 'true'; // Check for success message

    // Redirect if adminemail is missing (Good practice)
    if (!adminemail) {
        // Redirect to a safe page or back to the list with a default admin email
        return res.redirect(`/admin/completedRecords?adminemail=admin@ww2jewishsoldiers.com`);
    }

    try {
        // 1. Fetch all soldier records where recordcomplete is TRUE
        const soldiers = await db.any(
            `SELECT * FROM ${SOLDIER_TABLE} 
             WHERE recordcomplete = TRUE 
             ORDER BY lname, fname`
        );
        
        // 2. Fetch all lookup tables (You'll need these if you display details)
        const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL" ');
        const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
        const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL" ');
        const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL" ');
        const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL" ');
        const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL" ');
        const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL" ');
        const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL" ');
        
        // 3. Format dates (if your EJS template needs them formatted)
        const formattedSoldiers = soldiers.map(soldier => ({
            ...soldier,
            dob: soldier.dob ? format(new Date(soldier.dob), 'MM/dd/yyyy') : 'N/A',
            dod: soldier.dod ? format(new Date(soldier.dod), 'MM/dd/yyyy') : 'N/A',
            aliyadate: soldier.aliyadate ? format(new Date(soldier.aliyadate), 'MM/dd/yyyy') : 'N/A'
        }));


        // 4. Render the template
        res.render('completedRecords', { // Assuming your template is named 'completedRecords'
            soldiers: formattedSoldiers,
            countries,
            medals,
            corps,
            category,
            army,
            resistance,
            partizan,
            participation,
            adminemail: adminemail, // ⬅️ **FIX: Passing adminemail is critical here**
            saved: saved
        });
    } catch (err) {
        console.error('Error rendering completed records list:', err);
        res.status(500).send('Server error');
    }
});
app.post('/adminUpdateSoldier/:id', upload.array('files'), async (req, res) => {
    console.log('Update Admin Update route hit:', req.params.id);
    const { id } = req.params;
    const adminemail = req.body.adminemail || req.query.adminemail;

    try {
        // 1. Fetch existing soldier data
        const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!existingSoldier) {
            return res.status(404).send('Soldier not found');
        }

        // 2. Extract array fields (Same as original)
        const {
            battleId = [], battleyear = [], front = [], fronten = [], frontru = [],
            battle = [], battleen = [], battleru = [], battle_medal = [], 
            battle_medalen = [], battle_medalru = [], battle_details = [], 
            battle_detailsen = [], battle_detailsru = [], degreerank = [], 
            degreeranken = [], degreerankru = [], job = [], joben = [], jobru = []
        } = req.body;

        // 3. Calculate/Determine Soldier Date/Status Fields (FIXED LOGIC)
        
        // --- ADMIN READY FOR DOWNLOAD ---
        // Determines boolean status: true if submitted (checked), false otherwise.
        const admin_ready_for_download = Array.isArray(req.body.admin_ready_for_download)
            ? req.body.admin_ready_for_download.includes('true') || req.body.admin_ready_for_download.includes('on')
            : req.body.admin_ready_for_download === 'true' || req.body.admin_ready_for_download === 'on';

        let admin_approved_date = existingSoldier.admin_approved_date;
        if (admin_ready_for_download && !existingSoldier.admin_ready_for_download) {
            admin_approved_date = new Date(); // Set date on activation
        } else if (!admin_ready_for_download && existingSoldier.admin_ready_for_download) {
            admin_approved_date = null; // Clear date on deactivation
        }

        // --- RECORD COMPLETE (THE CORE FIX) ---
        // A checkbox is ONLY present in req.body if checked.
        const recordCompleteSubmitted = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
        
        // This is the variable that will go to the DB
        let recordcomplete = recordCompleteSubmitted; 
        let record_complete_date = existingSoldier.record_complete_date;
        
        if (recordcomplete) {
            // Set date only if it's the first time completing
            if (!existingSoldier.record_complete_date) {
                record_complete_date = new Date();
            }
        } else {
            // If the admin explicitly unchecked it (i.e., it wasn't submitted), clear the date
            record_complete_date = null;
        }
        
        // --- DOWNLOADED DATE ---
        let downloaded_date = existingSoldier.downloaded_date;
        if (req.body.downloaded_date) {
            downloaded_date = new Date(req.body.downloaded_date);
        }      // 4. Create main input data object for soldier table update
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
            dob: req.body.dob, dod: req.body.dod,
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
            recordcomplete: existingSoldier.recordcomplete,
            
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
            aliyadate: req.body.aliyadate,
            idf_enlistdate: req.body.idf_enlistdate,
            idf_releasedate: req.body.idf_releasedate,
            admin_ready_for_download, // Add the calculated boolean field
            // Use the calculated date fields from step 3
            admin_approved_date,
           record_complete_date: existingSoldier.record_complete_date,
            downloaded_date
        };

        // 5. Prepare SQL updates for soldier table
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
        
        // This is to correctly handle the boolean field from the calculation above
        existingSoldier.admin_ready_for_download = !!existingSoldier.admin_ready_for_download; 

        for (const key in inputData) {
            let newValue = inputData[key] === '' ? null : inputData[key];
            let oldValue = existingSoldier[key] === '' ? null : existingSoldier[key];

            let same;
            if (dateFields.includes(key)) {
                same = normalizeDate(newValue) === normalizeDate(oldValue);
            } else if (typeof newValue === 'boolean') {
                // Special check for boolean fields
                same = newValue === oldValue; 
            } else {
                // Coerce to string for comparison to handle potential differences in data types (e.g., number vs string)
                same = String(newValue) === String(oldValue);
            }

            if (!same) {
                console.log(`Field changed: ${key}, old: ${oldValue}, new: ${newValue}`);
                updates.push(`"${key}" = $${i}`);
                values.push(newValue);
                i++;
            }
        }

        // 6. Execute updates in a transaction (Soldier details, Battle History, Files)
        await db.tx(async t => {
            // ✅ Update soldier details only if needed
            if (updates.length > 0) {
                const updateSQL = `UPDATE ${SOLDIER_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`;
                values.push(id);
                await t.none(updateSQL, values);
                console.log(`Updated soldier ID ${id} details.`);
         // This logic ensures `admin_ready_for_download` is a proper boolean
        const admin_ready_for_download = Array.isArray(req.body.admin_ready_for_download)
            ? req.body.admin_ready_for_download.includes('true') || req.body.admin_ready_for_download.includes('on')
            : req.body.admin_ready_for_download === 'true' || req.body.admin_ready_for_download === 'on';
        //const recordCompleteSubmitted = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
        let admin_approved_date = existingSoldier.admin_approved_date;
          } else {
                console.log(`No changes in soldier details for ID ${id}.`);
            }

            // --- BATTLE HISTORY UPDATE/INSERT LOGIC ---
            for (let j = 0; j < battleyear.length; j++) {
                const hasContent =
                    (battleyear[j] && battleyear[j].trim() !== '') ||
                    (front[j] && front[j].trim() !== '') ||
                    (battle[j] && battle[j].trim() !== '');

                if (hasContent) {
                    if (battleId[j]) {
                        // ✅ Update existing battle record
                        console.log("Updating existing battle record:", battleId[j]);
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
                        // ✅ Insert new battle record
                        console.log("Inserting new battle history record.");
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

            // --- FILE UPLOAD LOGIC ---
            if (req.files && req.files.length > 0) {
                const fileInserts = req.files.map(file =>
                    t.none( // Use 't' (transaction object) for file inserts
                        `INSERT INTO uploaded_files (soldier_id, original_name, file_path)
                         VALUES ($1, $2, $3)`,
                        [id, file.originalname, file.path]
                    )
                );
                await Promise.all(fileInserts);
                console.log(`Stored ${req.files.length} uploaded files for soldier ID ${id}`);
            }

            console.log(`Transaction complete for soldier ID ${id}`);
        }); // End of db.tx

        // 7. Final redirect after ALL database operations and file uploads are complete
        res.redirect(`/admin/completedRecords?adminemail=${encodeURIComponent(adminemail)}&saved=true`);

    } catch (error) {
        console.error('Error updating soldier:', error);
        res.status(500).send(`
            <h1>Error Updating Soldier</h1>
            <p>Message: ${error.message}</p>
            <pre>${error.stack || 'No stack trace available'}</pre>
            ${error.query ? `<p>Query: ${error.query}</p>` : ''}
            <a href="/adminUpdateSoldier/${id}?adminemail=${encodeURIComponent(adminemail)}">Go back to form</a>
        `);
    }
});
// FIXED: Route to handle form submission for updating a soldier
// ⭐ FIX: Missing GET Route to DISPLAY the admin update form ⭐
app.get('/adminUpdateSoldier/:id', async (req, res) => {
    const { id } = req.params;
    const adminemail = req.query.adminemail;
    const locale = req.getLocale(); // Assuming you have locale/i18n setup

    console.log('Get /adminUpdateSoldier/:id hit for ID:', id, 'by:', adminemail);

    if (!adminemail) {
        // If admin email is missing, redirect back to the completed records list
        return res.redirect(`/admin/completedRecords?adminemail=admin@ww2jewishsoldiers.com`);
    }

    try {
        // 1. Fetch the main soldier record
        const soldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        
        if (!soldier) {
            return res.status(404).send('Soldier not found');
        }

        // 2. Fetch all lookup tables (Needed for dropdowns/select fields)
        const countries = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "countries_TBL" ');
        const medals = await db.any('SELECT id, title FROM "medals_TBL" ORDER BY title');
        const corps = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "corps_TBL" ');
        const category = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "category_TBL" ');
        const army = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "army_TBL" ');
        const resistance = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "resistance_TBL" ');
        const partizan = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "partizan_TBL" ');
        const participation = await db.any('SELECT id, title_heb, title_eng, title_rus FROM "participation_TBL" ');
        
        // 3. Fetch existing battles for this soldier
        const battleHistory = await db.any(
            'SELECT * FROM "soldier_battle_history" WHERE soldier_id = $1 ORDER BY id', 
            [id]
        );

        // 4. Render the admin-specific template
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
            battleHistory: battleHistory || [],
            adminemail: adminemail, // Passed to ensure form actions work correctly
            locale: locale, // Pass locale for i18n
        });
    } catch (err) {
        console.error('Error rendering admin update form for ID:', id, err);
        res.status(500).send('Server error');
    }
});
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
app.post('/updateSoldier/:id', upload.array('files'), async (req, res) => {
    const { id } = req.params;
    console.log('POST request received for updateSoldier/:id');

    try {
        const existingSoldier = await db.oneOrNone(`SELECT * FROM ${SOLDIER_TABLE} WHERE id = $1`, [id]);
        if (!existingSoldier) {
            return res.status(404).send('Soldier not found');
        }

        const recordcomplete = req.body.recordcomplete === 'true' || req.body.recordcomplete === 'on';
        let record_complete_date = existingSoldier.record_complete_date;
        if (recordcomplete && !existingSoldier.recordcomplete) {
            record_complete_date = new Date();
        } else if (!recordcomplete) {
            record_complete_date = null;
        }

        // Helper function to handle empty strings/arrays to null
        const cleanData = (data) => {
            if (Array.isArray(data)) {
                return data.length === 0 ? null : data;
            }
            return data === '' ? null : data;
        };
        
        // Build a complete data object from the request body
        const inputData = {
            fname: cleanData(req.body.fname), fnameen: cleanData(req.body.fnameen), fnameru: cleanData(req.body.fnameru),
            lname: cleanData(req.body.lname), lnameen: cleanData(req.body.lnameen), lnameru: cleanData(req.body.lnameru),
            previouslname: cleanData(req.body.previouslname), previouslnameen: cleanData(req.body.previouslnameen), previouslnameru: cleanData(req.body.previouslnameru),
            fathername: cleanData(req.body.fathername), fathernameen: cleanData(req.body.fathernameen), fathernameru: cleanData(req.body.fathernameru),
            mothername: cleanData(req.body.mothername), mothernameen: cleanData(req.body.mothernameen), mothernameru: cleanData(req.body.mothernameru),
            calledby: cleanData(req.body.calledby), calledbyen: cleanData(req.body.calledbyen), calledbyru: cleanData(req.body.calledbyru),
            birthcountry: cleanData(req.body.birthcountry), otherbirthcountry: cleanData(req.body.otherbirthcountry),
            birthcity: cleanData(req.body.birthcity), birthcityen: cleanData(req.body.birthcityen), birthcityru: cleanData(req.body.birthcityru),
            gender: cleanData(req.body.gender),
            placeofdeath: cleanData(req.body.placeofdeath), placeofdeathen: cleanData(req.body.placeofdeathen), placeofdeathru: cleanData(req.body.placeofdeathru),
            deathdetails: cleanData(req.body.deathdetails), deathdetailsen: cleanData(req.body.deathdetailsen), deathdetailsru: cleanData(req.body.deathdetailsru),
            biography: cleanData(req.body.biography), biographyen: cleanData(req.body.biographyen), biographyru: cleanData(req.body.biographyru),
            otherparticipation: cleanData(req.body.otherparticipation),
            otherdecoration: cleanData(req.body.otherdecoration), otherdecorationen: cleanData(req.body.otherdecorationen), otherdecorationru: cleanData(req.body.otherdecorationru),
            fightingdesc: cleanData(req.body.fightingdesc), fightingdescen: cleanData(req.body.fightingdescen), fightingdescru: cleanData(req.body.fightingdescru),
            shortdesc: cleanData(req.body.shortdesc),
            armyrole: cleanData(req.body.armyrole), armyroleen: cleanData(req.body.armyroleen), armyroleru: cleanData(req.body.armyroleru),
            releasereason: cleanData(req.body.releasereason), releasereasonen: cleanData(req.body.releasereasonen), releasereasonru: cleanData(req.body.releasereasonru),
            enlistreason: cleanData(req.body.enlistreason),
            platoonname: cleanData(req.body.platoonname), platoonnameen: cleanData(req.body.platoonnameen), platoonnameru: cleanData(req.body.platoonnameru),
            wounddetails: cleanData(req.body.wounddetails), wounddetailsen: cleanData(req.body.wounddetailsen), wounddetailsru: cleanData(req.body.wounddetailsru),
            gettodesc: cleanData(req.body.gettodesc), gettodescen: cleanData(req.body.gettodescen), gettodescru: cleanData(req.body.gettodescru),
            otherfightingcontext: cleanData(req.body.otherfightingcontext),
            armyid: cleanData(req.body.armyid),
            datebreaker: cleanData(req.body.datebreaker),
            dob: cleanData(req.body.dob) || null, dod: cleanData(req.body.dod) || null,
            aliyadate: cleanData(req.body.aliyadate) || null, idf_enlistdate: cleanData(req.body.idf_enlistdate) || null, idf_releasedate: cleanData(req.body.idf_releasedate) || null,
            degree: cleanData(req.body.degree), degreeen: cleanData(req.body.degreeen), degreeru: cleanData(req.body.degreeru),
            title: cleanData(req.body.title), titleen: cleanData(req.body.titleen), titleru: cleanData(req.body.titleru),
            linkurl: cleanData(req.body.linkurl),
            category: cleanData(req.body.category), army: cleanData(req.body.army), resistance: cleanData(req.body.resistance),
            partizan: cleanData(req.body.partizan), participation: cleanData(req.body.participation), corps: cleanData(req.body.corps),
            useremail: cleanData(req.body.useremail),
            recordcomplete, record_complete_date,
            admin_ready_for_download: cleanData(req.body.admin_ready_for_download),
            admin_approved_date: cleanData(req.body.admin_approved_date) || null,
            downloaded_date: cleanData(req.body.downloaded_date) || null,
            other_medal: cleanData(req.body.other_medal), other_medalen: cleanData(req.body.other_medalen), other_medalru: cleanData(req.body.other_medalru),
            uprising_participant: cleanData(req.body.uprising_participant)
        };

        await db.tx(async t => {
            // Step 1: Update the main soldier record
            const updateSQL = pgp.helpers.update(inputData, null, SOLDIER_TABLE) + ` WHERE id = ${id}`;
            await t.none(updateSQL);
            console.log('✅ Soldier details updated.');

            // Step 2: Handle battle history records
            const submittedBattles = Array.isArray(req.body.battleyear) ? req.body.battleyear : [req.body.battleyear];
            const battleIds = Array.isArray(req.body.battleId) ? req.body.battleId : [req.body.battleId];
            
            const existingBattleIds = await t.map(`SELECT id FROM soldier_battle_history WHERE soldier_id = $1`, [id], r => r.id);
            const battlesToKeep = new Set();
            
            for (let idx = 0; idx < submittedBattles.length; idx++) {
                const hasContent = (submittedBattles[idx] && submittedBattles[idx].trim() !== '') ||
                                   (req.body.front[idx] && req.body.front[idx].trim() !== '') ||
                                   (req.body.battle[idx] && req.body.battle[idx].trim() !== '');

                if (hasContent) {
                    const battleData = {
                        soldier_id: id,
                        battleyear: cleanData(submittedBattles[idx]),
                        front: cleanData(req.body.front[idx]), fronten: cleanData(req.body.fronten[idx]), frontru: cleanData(req.body.frontru[idx]),
                        battle: cleanData(req.body.battle[idx]), battleen: cleanData(req.body.battleen[idx]), battleru: cleanData(req.body.battleru[idx]),
                        medal: cleanData(req.body.battle_medal[idx]), medalen: cleanData(req.body.battle_medalen[idx]), medalru: cleanData(req.body.battle_medalru[idx]),
                        details: cleanData(req.body.battle_details[idx]), detailsen: cleanData(req.body.battle_detailsen[idx]), detailsru: cleanData(req.body.battle_detailsru[idx]),
                        degreerank: cleanData(req.body.degreerank[idx]), degreeranken: cleanData(req.body.degreeranken[idx]), degreerankru: cleanData(req.body.degreerankru[idx]),
                        job: cleanData(req.body.job[idx]), joben: cleanData(req.body.joben[idx]), jobru: cleanData(req.body.jobru[idx])
                    };
                    const currentBattleId = battleIds[idx];

                    if (currentBattleId && currentBattleId !== 'null') {
                        const updateBattleSQL = pgp.helpers.update(battleData, null, 'soldier_battle_history') + ` WHERE id = ${currentBattleId}`;
                        await t.none(updateBattleSQL);
                        battlesToKeep.add(parseInt(currentBattleId, 10)); // Mark this battle as one to keep
                    } else {
                        const insertBattleSQL = pgp.helpers.insert(battleData, null, 'soldier_battle_history');
                        await t.none(insertBattleSQL);
                    }
                }
            }
            
            // This is the delete portion:
            const battlesToDelete = existingBattleIds.filter(bid => !battlesToKeep.has(bid));
            if (battlesToDelete.length > 0) {
                console.log(`[POST] Attempting to delete battles with IDs: ${battlesToDelete.join(', ')}`);
                await t.none(`DELETE FROM soldier_battle_history WHERE id IN ($1:csv)`, [battlesToDelete]);
                console.log(`✅ Successfully deleted ${battlesToDelete.length} old battle history records.`);
            } else {
                console.log('✅ No battles to delete.');
            }

            // Step 3: Handle file uploads
            if (req.files && req.files.length > 0) {
                const fileInserts = req.files.map(file =>
                    t.none(`INSERT INTO uploaded_files (soldier_id, original_name, file_path) VALUES ($1, $2, $3)`, [id, file.originalname, file.path])
                );
                await t.batch(fileInserts);
                console.log(`✅ Successfully inserted ${req.files.length} file records.`);
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
// Route: Download selected completed records as Excel
app.post('/admin/downloadExcel', async (req, res) => {
    let ids = req.body.selectedIds;
    // Assuming table constants are defined
    const BATTLE_HISTORY_TABLE = 'soldier_battle_history'; 
    const UPLOADED_FILES_TABLE = 'uploaded_files'; 

    if (!ids) {
        return res.status(400).send('No records selected');
    }
    if (!Array.isArray(ids)) {
        ids = [ids]; 
    }

    console.log('📥 Final ID array:', ids);

    try {
        // --- 1. PREPARE DOWNLOAD METADATA ---
        const now = new Date();
        const downloadDateString = now.toISOString(); // Use ISO string for precision and sorting
        
        // 2. Fetch main soldier data (including names)
        const selectedSoldiers = await db.any(`
            SELECT id, fname, fnameen, fnameru, lname, lnameen, lnameru, * FROM ${SOLDIER_TABLE}
            WHERE id IN ($1:csv)
        `, [ids]);
        
        // Create a fast lookup map for soldier names
        const soldierMap = new Map();
        selectedSoldiers.forEach(s => {
            soldierMap.set(s.id, {
                fname: s.fname || '', fnameen: s.fnameen || '', fnameru: s.fnameru || '',
                lname: s.lname || '', lnameen: s.lnameen || '', lnameru: s.lnameru || '',
            });
        });

        // 3. Fetch associated data
        const battleHistory = await db.any(`
            SELECT * FROM ${BATTLE_HISTORY_TABLE}
            WHERE soldier_id IN ($1:csv)
        `, [ids]);
        const uploadedFiles = await db.any(`
            SELECT * FROM ${UPLOADED_FILES_TABLE}
            WHERE soldier_id IN ($1:csv)
        `, [ids]);
        
        // --- 4. MAP DATA STRUCTURES & INJECT DOWNLOAD DATE ---
        
        // Map names and download date onto Battle History
        const mappedBattleHistory = battleHistory.map(battle => {
            const names = soldierMap.get(battle.soldier_id) || {};
            return {
                download_date: downloadDateString, // New field injected
                soldier_id: battle.soldier_id,
                ...names,
                ...battle
            };
        });

        // Map names and download date onto Uploaded Files
        const mappedUploadedFiles = uploadedFiles.map(file => {
            const names = soldierMap.get(file.soldier_id) || {};
            return {
                download_date: downloadDateString, // New field injected
                soldier_id: file.soldier_id,
                ...names,
                ...file
            };
        });

        const workbook = new ExcelJS.Workbook();
        
        // --- Worksheet 1: Completed Soldiers (Main Data) ---
        const soldierWorksheet = workbook.addWorksheet('Soldiers_Main');
        
        // Add download_date column definition at the start
        const mainColumns = [
            { header: 'DOWNLOAD_DATE', key: 'download_date' },
            ...Object.keys(selectedSoldiers[0] || {}).map(key => ({
                header: key.toUpperCase(), 
                key: key,
            }))
        ];
        soldierWorksheet.columns = mainColumns;

        // Inject download_date into each row
        selectedSoldiers.forEach(soldier => {
            const modifiedSoldier = { 
                ...soldier, 
                id: `A${soldier.id}`,
                download_date: downloadDateString // Inject date here
            };
            soldierWorksheet.addRow(modifiedSoldier);
        });
        
        // --- Worksheet 2: Battle History (Including Names and Date) ---
        if (mappedBattleHistory.length > 0) {
            const battleWorksheet = workbook.addWorksheet('Soldiers_BattleHistory');
            
            // Define the desired order for better readability
            const desiredOrder = ['download_date', 'soldier_id', 'fname', 'fnameen', 'fnameru', 'lname', 'lnameen', 'lnameru'];
            const allBattleKeys = Object.keys(mappedBattleHistory[0]);
            const sortedBattleKeys = [...desiredOrder, ...allBattleKeys.filter(k => !desiredOrder.includes(k))];

            battleWorksheet.columns = sortedBattleKeys.map(key => ({
                header: key.toUpperCase(),
                key: key,
            }));

            mappedBattleHistory.forEach(battle => {
                battleWorksheet.addRow(battle);
            });
        }
        
        // --- Worksheet 3: Uploaded Files (Including Names and Date) ---
        if (mappedUploadedFiles.length > 0) {
            const filesWorksheet = workbook.addWorksheet('Soldiers_UploadedFiles');
            
            // Define the desired order for better readability
            const desiredOrder = ['download_date', 'soldier_id', 'fname', 'fnameen', 'fnameru', 'lname', 'lnameen', 'lnameru'];
            const allFileKeys = Object.keys(mappedUploadedFiles[0]);
            const sortedFileKeys = [...desiredOrder, ...allFileKeys.filter(k => !desiredOrder.includes(k))];

            filesWorksheet.columns = sortedFileKeys.map(key => ({
                header: key.toUpperCase(),
                key: key,
            }));

            mappedUploadedFiles.forEach(file => {
                filesWorksheet.addRow(file);
            });
        }

        // 5. Update downloaded_date in the database
        await db.none(`
            UPDATE ${SOLDIER_TABLE}
            SET downloaded_date = $1
            WHERE id IN ($2:csv)
        `, [now, ids]);

        console.log(`✅ Updated downloaded_date for ${ids.length} records`);

        // 6. Send the workbook as a response
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="completed_records_data.xlsx"'
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
