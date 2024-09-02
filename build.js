const ejs = require('ejs');
const fs = require('fs-extra');
const path = require('path');

// Path to your EJS templates
const templatesDir = path.join(__dirname, 'views');
const outputDir = path.join(__dirname, 'public');

// Render EJS to HTML
async function renderEjsToHtml() {
  try {
    // Render index.ejs to index.html
    const html = await ejs.renderFile(path.join(templatesDir, 'index.ejs'), { /* your data */ });
    await fs.ensureDir(outputDir);
    await fs.writeFile(path.join(outputDir, 'index.html'), html);
    console.log('EJS templates rendered to static HTML.');
  } catch (err) {
    console.error('Error rendering EJS templates:', err);
  }
}

renderEjsToHtml();
