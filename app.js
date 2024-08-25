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

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes

app.get('/', (req, res) => {
  res.render('index'); // Render the informative landing page
});

app.get('/soldierlist', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM public."SoldierTBL"');
    res.render('soldierlist', { soldiers: result.rows }); // Render the soldier list
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/add', (req, res) => {
  res.send(`
    <h1>Add Soldier</h1>
    <form action="/add" method="post">
      <label for="name">Name:</label>
      <input type="text" id="name" name="name" required>
      <br>
      <label for="date_of_birth">Date of Birth:</label>
      <input type="date" id="date_of_birth" name="date_of_birth">
      <br>
      <label for="rank">Rank:</label>
      <input type="text" id="rank" name="rank">
      <br>
      <input type="submit" value="Add Soldier">
    </form>
    <a href="/">Back to Home</a>
  `);
});

app.post('/add', async (req, res) => {
  const { name, date_of_birth, rank } = req.body;
  try {
    await pool.query('INSERT INTO public."SoldierTBL" (name, date_of_birth, rank) VALUES ($1, $2, $3)', [name, date_of_birth, rank]);
    res.redirect('/soldierlist'); // Redirect to the soldier list after adding
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
