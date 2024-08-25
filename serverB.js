const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 3000;

// Configure PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'WW2JewishSoldiers',
  password: 'YehudaWW2',
  port: 5432,
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/index', (req, res) => {
  res.render('index');
});
app.get('/soldierlist', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM public."SoldierTBL"');
    res.render('index', { soldiers: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/add', (req, res) => {
  res.render('add');
});

app.post('/add', async (req, res) => {
  const { name, date_of_birth, rank } = req.body;
  try {
    await pool.query('INSERT INTO public."SoldierTBL" (name, date_of_birth, rank) VALUES ($1, $2, $3)', [name, date_of_birth, rank]);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
