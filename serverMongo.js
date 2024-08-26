const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
//const port = 3000;
const mongoURI = 'mongodb+srv://ysbyapp:HfwCfvgjC6ZwfX4N@cluster0.uort4jd.mongodb.net/yourdbname?retryWrites=true&w=majority';

//const app = express();
const port = 3000;



// Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define a Mongoose schema and model for soldiers
const soldierSchema = new mongoose.Schema({
  fname: String,
  lname: String,
  countrycode: String,
  service_branch: String,
  date_of_birth: Date,
  rank: String,
  date_of_death: Date
});

const Soldier = mongoose.model('Soldier', soldierSchema);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes

// Route for the landing page
app.get('/', (req, res) => {
  res.render('index'); // Render the informative landing page
});

// Route to display the soldier list
app.get('/soldierlist', async (req, res) => {
  try {
    const soldiers = await Soldier.find(); // Fetch all soldiers from MongoDB
    res.render('soldierlist', { soldiers }); // Render the soldier list
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Route to show the form for adding a soldier
app.get('/add', (req, res) => {
  res.render('add'); // Render the form for adding a soldier
});

// Route to handle form submission for adding a soldier
app.post('/add', async (req, res) => {
  const { fname, lname, countrycode, service_branch, date_of_birth, rank, date_of_death } = req.body;
  try {
    const newSoldier = new Soldier({
      fname,
      lname,
      countrycode,
      service_branch,
      date_of_birth,
      rank,
      date_of_death
    });
    await newSoldier.save(); // Save the new soldier to MongoDB
    res.redirect('/soldierlist'); // Redirect to the soldier list after adding
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});




// Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes

// Route for the landing page
app.get('/', (req, res) => {
  res.render('index'); // Render the informative landing page
});

// Route to display the soldier list
app.get('/soldierlist', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM public."SoldierTBL"');
    res.render('soldierlist', { soldiers: result.rows }); // Render the soldier list
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Route to show the form for adding a soldier
app.get('/add', (req, res) => {
  res.render('add'); // Render the form for adding a soldier
});

// Route to handle form submission for adding a soldier
app.post('/add', async (req, res) => {
  //const { name, date_of_birth, rank } = req.body;
  const{fname, lname, countrycode, service_branch, date_of_birth, rank, date_of_death} = req.body;
  try {
    await pool.query('INSERT INTO public."Soldiers" (fname, lname, date_of_birth,countrycode,service_branch date_of_birth, rank, date_of_death) VALUES ($1, $2, $3)', [first_name, last_name,  countrycode,service_branch, date_of_birth, rank, date_of_death]);
    res.redirect('/soldierlist'); // Redirect to the soldier list after adding
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
