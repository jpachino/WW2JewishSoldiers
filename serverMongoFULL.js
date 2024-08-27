const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const { format } = require('date-fns'); // Import date formatting library

const app = express();
const mongoURI = 'mongodb+srv://ysbyapp:HfwCfvgjC6ZwfX4N@cluster0.uort4jd.mongodb.net/soldiersDB?retryWrites=true&w=majority';
const port = 3000;
const Soldier = require('./models/soldier');

// Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Route for the landing page
app.get('/', (req, res) => {
  res.render('index'); // Render the informative landing page
});

// Route to display the soldier list
app.get('/soldierlistSoldier', async (req, res) => {
  try {
    const soldiers = await Soldier.find(); // Fetch all soldiers from MongoDB
    
    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier._doc,
      date_of_birth: format(new Date(soldier.date_of_birth), 'MM/dd/yyyy'),
      date_of_death: soldier.date_of_death ? format(new Date(soldier.date_of_death), 'MM/dd/yyyy') : 'N/A'
    }));
    
    console.log('Soldiers fetched:', formattedSoldiers); // Log fetched soldiers
    res.render('soldierlistSoldier', { soldiers: formattedSoldiers }); // Render the 'soldierlistSoldier.ejs' view
  } catch (err) {
    console.error('Error fetching soldiers:', err); // Log the error
    res.status(500).send('Server error at soldierlistSoldier'); // Send a generic server error response
  }
});

// Route to display the soldier list
app.get('/soldierlistFULL', async (req, res) => {
  try {
    const soldiers = await Soldier.find(); // Fetch all soldiers from MongoDB
     // Sort soldiers by last name and then by first name
     soldiers.sort((a, b) => {
        if (a.lastname === b.lastname) {
          return a.firstname.localeCompare(b.firstname);
        }
        return a.lastname.localeCompare(b.lastname);
      });
  
    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier._doc,
      date_of_birth: format(new Date(soldier.date_of_birth), 'MM/dd/yyyy'),
      date_of_death: soldier.date_of_death ? format(new Date(soldier.date_of_death), 'MM/dd/yyyy') : 'N/A'
    }));
    
    console.log('Soldiers fetched:', formattedSoldiers); // Log fetched soldiers
    res.render('soldierlistFULL', { soldiers: formattedSoldiers }); // Render the 'soldierlistFULL.ejs' view
  } catch (err) {
    console.error('Error fetching soldiers:', err); // Log the error
    res.status(500).send('Server error at soldierlistFULL'); // Send a generic server error response
  }
});

// Route to display the form for adding a new soldier
app.get('/addFULL', (req, res) => {
  res.render('addFULL'); // Ensure you have an 'addFULL.ejs' template in your 'views' directory
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
// Route to display the search form
app.get('/search', (req, res) => {
    res.render('search'); // Ensure you have a 'search.ejs' template in your 'views' directory
  });
  // Route to handle search results
 app.get('/searchResults', async (req, res) => {
    const { firstname, lastname } = req.query; // Extract first name and last name from the URL
    try {
      // Build search query object
      const query = {};
      if (firstname) {
        query.firstname = new RegExp(firstname, 'i'); // Case-insensitive search for first name
      }
      if (lastname) {
        query.lastname = new RegExp(lastname, 'i'); // Case-insensitive search for last name
      }
  
  
      // Find soldiers matching the query
    const soldiers = await Soldier.find(query);

    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier._doc,
      date_of_birth: soldier.date_of_birth instanceof Date
        ? format(soldier.date_of_birth, 'MM/dd/yyyy')
        : 'Invalid date',
      date_of_death: soldier.date_of_death instanceof Date
        ? format(soldier.date_of_death, 'MM/dd/yyyy')
        : 'N/A'
    }));

  
      // Render the search results view with the found soldiers
      res.render('searchResults', { soldiers: formattedSoldiers });
    } catch (err) {
      console.error('Error fetching soldiers:', err);
      res.status(500).send('Server error at searchResults');
    }
  });
  app.get('/updateSoldier/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const soldier = await Soldier.findById(id);
      if (!soldier) {
        return res.status(404).send('Soldier not found');
      }
      res.render('updateSoldier', { soldier });
    } catch (err) {
      console.error('Error fetching soldier:', err);
      res.status(500).send('Server error');
    }
  });
  app.post('/updateSoldier/:id', async (req, res) => {
    const { id } = req.params;
    const { firstname, lastname, countrycode, servicebranch, date_of_birth, rank, date_of_death } = req.body;
    const dob = new Date(date_of_birth);
    const dod = date_of_death ? new Date(date_of_death) : null;
  
    try {
      const updatedSoldier = await Soldier.findByIdAndUpdate(id, {
        firstname,
        lastname,
        countrycode,
        servicebranch,
        date_of_birth: dob,
        rank,
        date_of_death: dod
      }, { new: true });
      
      if (!updatedSoldier) {
        return res.status(404).send('Soldier not found');
      }
  
      // Redirect to the soldier list after updating
      res.redirect('/soldierlistFULL');
    } catch (error) {
      console.error('Error updating soldier:', error);
      res.status(500).json({ message: 'Error updating soldier', error });
    }
  });
  
  
// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
