

const Sequelize = require('sequelize');
const db = require('../config/database');

const SoldierDetails = db.define('map_soldierdetails', {
  // Basic Information
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  fname: {
    type: Sequelize.TEXT
  },
  fnameen: {
    type: Sequelize.TEXT
  },
  fnameru: {
    type: Sequelize.TEXT
  },
  lname: {
    type: Sequelize.TEXT
  },
  lnameen: {
    type: Sequelize.TEXT
  },
  lnameru: {
    type: Sequelize.TEXT
  },
  previouslname: {
    type: Sequelize.TEXT
  },
  previouslnameen: {
    type: Sequelize.TEXT
  },
  previouslnameru: {
    type: Sequelize.TEXT
  },
  
  // Family
  fathername: {
    type: Sequelize.TEXT
  },
  fathernameen: {
    type: Sequelize.TEXT
  },
  fathernameru: {
    type: Sequelize.TEXT
  },
  mothername: {
    type: Sequelize.TEXT
  },
  mothernameen: {
    type: Sequelize.TEXT
  },
  mothernameru: {
    type: Sequelize.TEXT
  },
  calledby: {
    type: Sequelize.TEXT
  },
  calledbyen: {
    type: Sequelize.TEXT
  },
  calledbyru: {
    type: Sequelize.TEXT
  },
  
  // Birth & Death
  birthcountry: {
    type: Sequelize.TEXT
  },
  otherbirthcountry: {
    type: Sequelize.TEXT
  },
  birthcity: {
    type: Sequelize.TEXT
  },
  birthcityen: {
    type: Sequelize.TEXT
  },
  birthcityru: {
    type: Sequelize.TEXT
  },
  gender: {
    type: Sequelize.TEXT
  },
  placeofdeath: {
    type: Sequelize.TEXT
  },
  placeofdeathen: {
    type: Sequelize.TEXT
  },
  placeofdeathru: {
    type: Sequelize.TEXT
  },
  deathdetails: {
    type: Sequelize.TEXT
  },
  deathdetailsen: {
    type: Sequelize.TEXT
  },
  deathdetailsru: {
    type: Sequelize.TEXT
  },
  
  // Biography & Participation
  biography: {
    type: Sequelize.TEXT
  },
  biographyen: {
    type: Sequelize.TEXT
  },
  biographyru: {
    type: Sequelize.TEXT
  },
  otherparticipation: {
    type: Sequelize.TEXT
  },
  otherdecoration: {
    type: Sequelize.TEXT
  },
  otherdecorationen: {
    type: Sequelize.TEXT
  },
  otherdecorationru: {
    type: Sequelize.TEXT
  },
  
  // IDF & Army Service
  fightingdesc: {
    type: Sequelize.TEXT
  },
  fightingdescen: {
    type: Sequelize.TEXT
  },
  fightingdescru: {
    type: Sequelize.TEXT
  },
  idf_otherforce: {
    type: Sequelize.TEXT
  },
  idf_otherrank: {
    type: Sequelize.TEXT
  },
  idf_desc: {
    type: Sequelize.TEXT
  },
  idf_descen: {
    type: Sequelize.TEXT
  },
  idf_descru: {
    type: Sequelize.TEXT
  },
  idf_serviceplace: {
    type: Sequelize.TEXT
  },
  idf_platoonname: {
    type: Sequelize.TEXT
  },
  shortdesc: {
    type: Sequelize.TEXT
  },
  armyrole: {
    type: Sequelize.TEXT
  },
  armyroleen: {
    type: Sequelize.TEXT
  },
  armyroleru: {
    type: Sequelize.TEXT
  },
  releasereason: {
    type: Sequelize.TEXT
  },
  releasereasonen: {
    type: Sequelize.TEXT
  },
  releasereasonru: {
    type: Sequelize.TEXT
  },
  enlistreason: {
    type: Sequelize.TEXT
  },
  platoonname: {
    type: Sequelize.TEXT
  },
  platoonnameen: {
    type: Sequelize.TEXT
  },
  platoonnameru: {
    type: Sequelize.TEXT
  },
  wounddetails: {
    type: Sequelize.TEXT
  },
  wounddetailsen: {
    type: Sequelize.TEXT
  },
  wounddetailsru: {
    type: Sequelize.TEXT
  },
  gettodesc: {
    type: Sequelize.TEXT
  },
  gettodescen: {
    type: Sequelize.TEXT
  },
  gettodescru: {
    type: Sequelize.TEXT
  },
  otherfightingcontext: {
    type: Sequelize.TEXT
  },
  armyid: {
    type: Sequelize.INTEGER
  },
  
  // Date fields
  datebreaker: {
    type: Sequelize.TEXT
  },
  dob: {
    type: Sequelize.DATE
  },
  dod: {
    type: Sequelize.DATE
  },
  aliyadate: {
    type: Sequelize.DATE
  },
  idf_enlistdate: {
    type: Sequelize.DATE
  },
  idf_releasedate: {
    type: Sequelize.DATE
  },
  
  // Medals and battles
  tablebreaker: {
    type: Sequelize.TEXT
  },
  medal: {
    type: Sequelize.TEXT
  },
  medalen: {
    type: Sequelize.TEXT
  },
  medalru: {
    type: Sequelize.TEXT
  },
  degree: {
    type: Sequelize.TEXT
  },
  degreeen: {
    type: Sequelize.TEXT
  },
  degreeru: {
    type: Sequelize.TEXT
  },
  front: {
    type: Sequelize.TEXT
  },
  fronten: {
    type: Sequelize.TEXT
  },
  frontru: {
    type: Sequelize.TEXT
  },
  battle: {
    type: Sequelize.TEXT
  },
  battleen: {
    type: Sequelize.TEXT
  },
  battleru: {
    type: Sequelize.TEXT
  },
  battleyear: {
    type: Sequelize.INTEGER
  },
  
  // Additional battles
  tablebreaker2: {
    type: Sequelize.TEXT
  },
  battleyear2: {
    type: Sequelize.INTEGER
  },
  front2: {
    type: Sequelize.TEXT
  },
  fronten2: {
    type: Sequelize.TEXT
  },
  frontru2: {
    type: Sequelize.TEXT
  },
  battle2: {
    type: Sequelize.TEXT
  },
  battleen2: {
    type: Sequelize.TEXT
  },
  battleru2: {
    type: Sequelize.TEXT
  },
  medal2: {
    type: Sequelize.TEXT
  },
  medalen2: {
    type: Sequelize.TEXT
  },
  medalru2: {
    type: Sequelize.TEXT
  },
  
  // Remarks and additional info
  remarks: {
    type: Sequelize.TEXT
  },
  remarksen: {
    type: Sequelize.TEXT
  },
  remarksru: {
    type: Sequelize.TEXT
  },
  tablebreaker3: {
    type: Sequelize.TEXT
  },
  title: {
    type: Sequelize.TEXT
  },
  titleen: {
    type: Sequelize.TEXT
  },
  titleru: {
    type: Sequelize.TEXT
  },
  remarks2: {
    type: Sequelize.TEXT
  },
  remarksen2: {
    type: Sequelize.TEXT
  },
  remarksru2: {
    type: Sequelize.TEXT
  },
  linkurl: {
    type: Sequelize.TEXT
  },
  useremail:{
    email:Sequelize.TEXT
  },
  recordcomplete: {
  type: Sequelize.BOOLEAN,
  defaultValue: false
  },
  record_complete_date: {
    type: Sequelize.DATE,
    allowNull: true
  },
  admin_ready_for_download: {
    type: Sequelize.BOOLEAN,
    defaultValue: false
  },
  admin_approved_date: {
    type: Sequelize.DATE,
    allowNull: true
  },
  downloaded_date: {
    type: Sequelize.DATE,
    allowNull: true
  },
  other_medal:{
    type: Sequelize.TEXT
  },
  other_medalen:{
    type: Sequelize.TEXT
  },
  other_medalru:{
    type: Sequelize.TEXT
  },
}, {
  timestamps: false
});

module.exports = SoldierDetails;