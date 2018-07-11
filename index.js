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

const inquirer = require('inquirer');
project.selectOption = (ids, info) => {
        const {baseIds, xmls, paths, event} = info;
        const choices = xmls.map((xml, i) => {
            return {
                name: xml,
                value: i
            };
        }).reverse();
        const question = {
            type: 'list',
            name: 'selectedIndex',
            choices,
            message: `Which item should be used for arg ${baseIds[0]} (${paths[0].join('.')})?`
        };

        console.log();
        console.log('Found event with ambiguous argument:');
        const prettyEvent = event.pretty();
        console.log(prettyEvent);
        console.log();
        console.log(ids);
        return inquirer.prompt([question])
            .then(answers => ids[answers.selectedIndex]);
};

project.repair()
    .then(() => {
        fs.writeFileSync(outfile, project.toString());
        console.log('modified project written to ' + outfile);
    });

