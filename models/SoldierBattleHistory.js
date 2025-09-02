const Sequelize = require('sequelize');
const db = require('../config/database');

const SoldierBattleHistory = db.define('soldierbattlehistory', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  soldier_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
    references: {
      model: 'soldierdetails', // Table name
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  year: { type: Sequelize.INTEGER },
  front: { type: Sequelize.TEXT },
  fronten: { type: Sequelize.TEXT },
  frontru: { type: Sequelize.TEXT },
  battle: { type: Sequelize.TEXT },
  battleen: { type: Sequelize.TEXT },
  battleru: { type: Sequelize.TEXT },
  details: { type: Sequelize.TEXT },
  detailsen: { type: Sequelize.TEXT },
  detailsru: { type: Sequelize.TEXT },
  job: { type: Sequelize.TEXT },
  joben: { type: Sequelize.TEXT },
  jobru: { type: Sequelize.TEXT },
  degreerank: { type: Sequelize.TEXT },
  degreeranken: { type: Sequelize.TEXT },
  degreerankru: { type: Sequelize.TEXT }
}, {
  timestamps: false
});

// Association
SoldierBattleHistory.associate = (models) => {
  SoldierBattleHistory.belongsTo(models.SoldierDetails, {
    foreignKey: 'soldier_id',
    as: 'soldier'
  });
};

module.exports = SoldierBattleHistory;
