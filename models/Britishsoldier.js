const mongoose = require('mongoose');

// Define the schema for British soldiers
const BritishSoldierSchema = new mongoose.Schema({
  titleID: {
    type: String,
    required: false
  },
  firstName: {
    type: String,
    required: false
  },
  middleName: {
    type: String,
    required: false
  },
  surname: {
    type: String,
    required: true
  },
  serviceID: {
    type: String,
    required: false
  },
  rankID: {
    type: String,
    required: false
  },
  unitID: {
    type: String,
    required: false
  },
  yrIN: {
    type: String,
    required: false
  },
  servNo: {
    type: String,
    required: false
  },
  postCode: {
    type: String,
    required: false
  },
  deceased: {
    type: String,
    required: false
  }
});

// Create the model and specify the collection name
const BritishSoldier = mongoose.model('BritishSoldier', BritishSoldierSchema, 'Britishsoldiers');

module.exports = BritishSoldier;

