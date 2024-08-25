const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const data = {
    title: 'My EJS Page',
    message: 'Hello, EJS!'
};

const templatePath = path.join(__dirname, 'views', 'index.ejs');
const outputPath = path.join(__dirname, 'public', 'index.html');

ejs.renderFile(templatePath, data, (err, str) => {
    if (err) {
        console.error(err);
        return;
    }
    fs.writeFileSync(outputPath, str);
});
