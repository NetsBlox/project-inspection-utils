class Project {
    constructor(text) {
        const XML_Element = require('./lib/snap/xml');
        this.element = new XML_Element();
        this.element.parseString(projectString);

        if (this.element.tag === 'room') {
            this.element = element.children.forEach(child => checkProjectReplay(child.childNamed('project')));
        }

    }
}

module.exports = Project;
