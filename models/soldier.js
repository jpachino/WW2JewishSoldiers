// models/Soldier.js
const mongoose = require('mongoose');

const soldierSchema = new mongoose.Schema({
  
  firstname: {
    type: String,
    required: true
  },
  lastname: {
    type: String,
    required: true
  },
  countrycode: {
    type: Number,
    required: true
  },
  servicebranch: {
    type: String,
    required: false
  },
  date_of_birth: {
    type: Date,
    required: false
  },
  rank: {
    type: String,
    required: false
  },
  date_of_death: {
    type: Date,
    required: false
  },
});

const Soldier = mongoose.model('soldiers', soldierSchema);

module.exports = Soldier;
