// /pages.config.js

// Add pages to convert here:
module.exports = [
    { template: '/index.ejs', output: 'index.html', data: { title: "Home" } },
    { template: '/search.ejs', output: 'search/index.html', data: { title: "Search"} },
    { template: '/addFULL.ejs', output: 'addFULL/index.html', data: { title: "Add Soldier" } },
    { template: '/updateSoldier.ejs', output: 'updateSoldier/index.html', data: { title: "Update Soldier"} }, 
    { template: '/searchResults.ejs', output: 'searchResults/index.html', data: { title: "Search Results" } },
    { template: '/soldierlistFULL.ejs', output: 'soldierlistFULL/index.html', data: { title: "Soldier List" } }
      
   
  ];