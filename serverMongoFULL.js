const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const { format, parseISO } = require('date-fns'); // Import date formatting and parsing functions


const app = express();
const mongoURI = 'mongodb+srv://ysbyapp:HfwCfvgjC6ZwfX4N@cluster0.uort4jd.mongodb.net/soldiersDB?retryWrites=true&w=majority';
const port = 10000;

const Soldier = require('./models/soldier');

const BritishSoldier = require('./models/Britishsoldier');

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
app.get('/soldierlistFULL', async (req, res) => {
  try {
    const soldiers = await Soldier.find(); // Fetch all soldiers from MongoDB


    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier._doc,
      date_of_birth: soldier.date_of_birth ? format(new Date(soldier.date_of_birth), 'yyyy-MM-dd') : 'N/A',
      date_of_death: soldier.date_of_death ? format(new Date(soldier.date_of_death), 'yyyy-MM-dd') : 'N/A'
      
    }));


    console.log('Soldiers fetched:', formattedSoldiers); // Log fetched soldiers
    res.render('soldierlistFULL', { soldiers: formattedSoldiers }); // Render the 'soldierlistSoldier.ejs' view
  } catch (err) {
    console.error('Error fetching soldiers:', err); // Log the error
    res.status(500).send('Server error at soldierlistFULL'); // Send a generic server error response
  }
});
app.get('/britishsoldierlistFULL', async (req, res) => {
  try {
    const soldiers = await BritishSoldier.find(); // Fetch all soldiers from MongoDB

    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier._doc,
     // date_of_birth: soldier.date_of_birth ? format(new Date(soldier.date_of_birth), 'yyyy-MM-dd') : 'N/A',
     // date_of_death: soldier.date_of_death ? format(new Date(soldier.date_of_death), 'yyyy-MM-dd') : 'N/A'
    }));

    console.log('British Soldiers fetched:', formattedSoldiers); // Log fetched soldiers
    res.render('britishsoldierlistFULL', { britishsoldiers: formattedSoldiers }); // Render the 'soldierlistSoldier.ejs' view
  } catch (err) {
    console.error('Error fetching British soldiers:', err); // Log the error
    res.status(500).send('Server error at britishsoldierlistFULL'); // Send a generic server error response
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
      date_of_birth: soldier.date_of_birth ? format(new Date(soldier.date_of_birth), 'yyyy-MM-dd') : 'N/A',
      date_of_death: soldier.date_of_death ? format(new Date(soldier.date_of_death), 'yyyy-MM-dd') : 'N/A'
      
    }));


    console.log('Soldiers fetched:', formattedSoldiers); // Log fetched soldiers
    res.render('soldierlistFULL', { soldiers: formattedSoldiers }); // Render the 'soldierlistFULL.ejs' view
  } catch (err) {
    console.error('Error fetching soldiers:', err); // Log the error
    res.status(500).send('Server error at soldierlistFULL'); // Send a generic server error response
  }
});
// Route to display the BRITISHsoldier list
app.get('/britishsoldierlistFULL', async (req, res) => {
  try {
    const britishsoldiers = await BritishSoldier.find(); // Fetch all soldiers from MongoDB

    // Sort soldiers by last name and then by first name
    britishsoldierssoldiers.sort((a, b) => {
      if (a.surname === b.surname) {
        return a.firstname.localeCompare(b.firstname);
      }
      return a.surname.localeCompare(b.surname);
    });

    // Format dates
    //const formattedSoldiers = soldiers.map(BritishSoldier => ({
      //...Britishsoldier._doc,
     // date_of_birth: soldier.date_of_birth ? format(new Date(soldier.date_of_birth), 'yyyy-MM-dd') : 'N/A',
     // date_of_death: soldier.date_of_death ? format(new Date(soldier.date_of_death), 'yyyy-MM-dd') : 'N/A'
   // })
  //)
  ;

    console.log('British Soldiers fetched:', britishsoldiers); // Log fetched soldiers
    res.render('BritishsoldierlistFULL', { britishsoldiers }); // Render the 'soldierlistFULL.ejs' view

  } catch (err) {
    console.error('Error fetching soldiers:', err); // Log the error
    res.status(500).send('Server error at BritishsoldierlistFULL'); // Send a generic server error response
  }
});
// Route to display the form for adding a new soldier
app.get('/addFULL', (req, res) => {
  res.render('addFULL'); // Ensure you have an 'addFULL.ejs' template in your 'views' directory
});

// Route to handle form submission for adding a soldier
app.post('/addFULL', async (req, res) => {
  const { firstname, lastname, country, servicebranch, date_of_birth, rank, date_of_death } = req.body;

  // Log incoming request data
  console.log('Request Body:', req.body);

  // Convert and format dates
  const dob = date_of_birth ? format(parseISO(date_of_birth), 'yyyy-MM-dd') : null;
  const dod = date_of_death ? format(parseISO(date_of_death), 'yyyy-MM-dd') : null;

  console.log('Formatted Date of Birth:', dob);
  console.log('Formatted Date of Death:', dod);

  try {
    // Create a new record
    const newRecord = new Soldier({
      firstname,
      lastname,
      country,
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
      date_of_birth: soldier.date_of_birth ? format(new Date(soldier.date_of_birth), 'yyyy-MM-dd') : 'Invalid date',
      date_of_death: soldier.date_of_death ? format(new Date(soldier.date_of_death), 'yyyy-MM-dd') : 'N/A'
      
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

    // Format dates for the form input
    const formatDateForInput = (date) => {
      return date ? format(new Date(date), 'yyyy-MM-dd') : '';
    }

    res.render('updateSoldier', {
      soldier: {
        ...soldier._doc,
        date_of_birth: formatDateForInput(soldier.date_of_birth),
        date_of_death: formatDateForInput(soldier.date_of_death)
      }
    });
  } catch (err) {
    console.error('Error fetching soldier:', err);
    res.status(500).send('Server error');
  }
});

app.post('/updateSoldier/:id', async (req, res) => {
  const { id } = req.params;
  const { firstname, lastname, country, servicebranch, date_of_birth, rank, date_of_death } = req.body;
  const dob = date_of_birth ? format(parseISO(date_of_birth), 'yyyy-MM-dd') : null;
  const dod = date_of_death ? format(parseISO(date_of_death), 'yyyy-MM-dd') : null;

  try {
    const updatedSoldier = await Soldier.findByIdAndUpdate(id, {
      firstname,
      lastname,
      country,
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
// Route to display the search form BRITISH
app.get('/searchBritish', (req, res) => {
  res.render('searchBritish'); // Ensure you have a 'searchBritish.ejs' template in your 'views' directory
 
});

// Route to handle search results for BRITISH

app.get('/searchBritishResults', async (req, res) => {
  const { firstName, surname } = req.query;

  try {
    // Build search query object
    const query = {};
    if (firstName) {
      query.firstName = new RegExp(firstName, 'i'); // Case-insensitive search for first name
    }
    if (surname) {
      query.surname = new RegExp(surname, 'i'); // Case-insensitive search for surname
    }
    console.log(query);
    // Find soldiers matching the query
    const britishsoldiers = await BritishSoldier.find(query);
    

    // Format dates if necessary
    const formattedSoldiers = britishsoldiers.map(soldier => ({
      ...soldier._doc
    }));

    // Render the search results view with the found soldiers
    res.render('searchBritishResults', { britishsoldiers: formattedSoldiers });

  } catch (err) {
    console.error('Error fetching soldiers:', err);
    res.status(500).send('Server error at searchBritishResults');
  }
});


// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
