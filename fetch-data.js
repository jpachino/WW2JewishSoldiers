// fetch-data.js
const mongoose = require('mongoose');
const Soldier = require('./models/soldier');
const fs = require('fs');
const { format } = require('date-fns'); // Make sure to install date-fns

mongoose.connect('mongodb://localhost:27017/yourDatabaseName', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function fetchAndSaveData() {
  try {
    const soldiers = await Soldier.find();
    
    // Format dates
    const formattedSoldiers = soldiers.map(soldier => ({
      ...soldier._doc,
      date_of_birth: format(new Date(soldier.date_of_birth), 'MM/dd/yyyy'),
      date_of_death: soldier.date_of_death ? format(new Date(soldier.date_of_death), 'MM/dd/yyyy') : 'N/A'
    }));

    fs.writeFileSync('./data/soldiers.json', JSON.stringify(formattedSoldiers, null, 2));
    console.log('Data saved successfully');
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    mongoose.connection.close();
  }
}

fetchAndSaveData();
