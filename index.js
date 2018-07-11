// Get the project xml
if (process.argv.length < 4) {
    console.error(`usage: ${process.argv[1]} <filename> <outfile>`);
    process.exit(1);
}
const filename = process.argv[2];
const outfile = process.argv[3];

const fs = require('fs');
const projectString = fs.readFileSync(filename, 'utf8');

// Get the replay from the xml
const Project = require('./src/project')
const project = new Project(projectString);

project.repair()
    .then(() => {
        fs.writeFileSync(outfile, project.toString());
        console.log('modified project written to ' + outfile);
    });
