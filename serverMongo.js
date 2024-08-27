const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
//const port = 3000;
const mongoURI = 'mongodb+srv://ysbyapp:HfwCfvgjC6ZwfX4N@cluster0.uort4jd.mongodb.net/soldiersDB?retryWrites=true&w=majority';

//const app = express();
const port = 3000;
const Soldier = require('./models/soldier');


module.exports = Soldier;


// Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));
  

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));



 
app.get('/soldierlistSoldier', async (req, res) => {
    try {
      const soldiers = await Soldier.find(); // Fetch all soldiers from MongoDB
      console.log('Soldiers fetched:', soldiers); // Log fetched soldiers
      res.render('soldierlistSoldier', { soldiers }); // Render the 'soldierlistFULL.ejs' view
    } catch (err) {
      console.error('Error fetching soldiers:', err); // Log the error
      res.status(500).send('Server error at soldierlistSoldier'); // Send a generic server error response
    }
  });
  

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes

// Route for the landing page
app.get('/', (req, res) => {
  res.render('index'); // Render the informative landing page
});
// Import the Soldier model
//const Soldier = require('./models/Soldier');

// Route to display the soldier list

app.get('/soldierlistFULL', async (req, res) => {
    try {
      const soldiers = await Soldier.find(); // Fetch all soldiers from MongoDB
      console.log('Soldiers fetched:', soldiers); // Log fetched soldiers
      res.render('soldierlistFULL', { soldiers }); // Render the 'soldierlistFULL.ejs' view
    } catch (err) {
      console.error('Error fetching soldiers:', err); // Log the error
      res.status(500).send('Server error at soldierlistFULL'); // Send a generic server error response
    }
  });
  
  
// Route to display the soldier list
app.get('/addFULL', async(req, res) => {
    res.render('addFULL'); // Ensure you have an 'add.ejs' template in your 'views' directory
  });
  
  // Route to handle form submission for adding a soldier
  
  app.post('/addFULL', async (req, res) => {
    const { firstname, lastname, countrycode, servicebranch, date_of_birth, rank, date_of_death } = req.body;
    const dob = new Date(date_of_birth);
    const dod = date_of_death ? new Date(date_of_death) : null;

    try {
        // Create a new record
        const newRecord = new Soldier({
            firstname,
            lastname,
            countrycode,
            servicebranch,
            date_of_birth: dob,
            rank,
            date_of_death: dod
        });

        // Save the record to the database
        await newRecord.save();

        // Redirect to the soldier list after adding
        res.redirect('/soldierlistFULL');
    } catch (error) {
        // Handle any errors
        console.error('Error adding record:', error);
        res.status(500).json({ message: 'Error adding record', error });
    }
});
// Route to show the update form

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});



